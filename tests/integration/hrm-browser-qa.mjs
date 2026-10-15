// Optional real-Chrome smoke and responsive QA for the isolated HRM Worker.
// Use HRM_BROWSER_BINARY to opt in; the default integration suite has no browser dependency.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function connect(url) {
  const socket = new WebSocket(url);
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`CDP ${request.method}: ${message.error.message}`));
    else request.resolve(message.result ?? {});
  });
  return {
    opened,
    send(method, params = {}, sessionId) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timed out: ${method}`));
        }, 10000);
        pending.set(id, { method, resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() { socket.close(); },
  };
}

export async function startHrmBrowserQa({ baseUrl, binary, artifactDir = join(tmpdir(), `runlumi-hrm-browser-${process.pid}`) }) {
  const profile = await mkdtemp(join(tmpdir(), "runlumi-chrome-"));
  await mkdir(artifactDir, { recursive: true });
  const chrome = spawn(binary, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--disable-default-apps", "--window-size=1280,900",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let cdp;
  let sessionId;
  try {
    let activePort = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      if (chrome.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready (code ${chrome.exitCode}).`);
      try { activePort = await readFile(join(profile, "DevToolsActivePort"), "utf8"); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const [port, browserPath] = activePort.trim().split(/\r?\n/);
    if (!port || !browserPath) throw new Error("Chrome DevTools did not become ready within 10 seconds.");
    cdp = connect(`ws://127.0.0.1:${port}${browserPath}`);
    await cdp.opened;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    ({ sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true }));
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
  } catch (error) {
    cdp?.close();
    chrome.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    throw error;
  }

  async function evaluate(expression) {
    const response = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${response.exceptionDetails.text}`);
    return response.result?.value;
  }

  async function navigate(path, cookies) {
    for (const [name, value] of cookies) {
      const result = await cdp.send("Network.setCookie", { name, value, url: baseUrl, sameSite: "Lax" }, sessionId);
      assert.equal(result.success, true, "synthetic EmDash session cookie is installed in the isolated browser");
    }
    const expectedUrl = new URL(path, baseUrl).href;
    await cdp.send("Page.navigate", { url: expectedUrl }, sessionId);
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await evaluate("({ ready: document.readyState, url: location.href })");
      if (state.ready === "complete" && state.url === expectedUrl) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Browser navigation did not finish: ${path}`);
  }

  return {
    async auditPage(userSession, path, { expectedText, artifactName }) {
      const cookies = [...userSession.cookies.entries()];
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
      await cdp.send("Emulation.setScriptExecutionDisabled", { value: true }, sessionId);
      for (const width of [320, 430, 1280]) {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, screenWidth: width, screenHeight: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
        await navigate(path, cookies);
        const state = await evaluate(`(() => ({ width: innerWidth, outer: outerWidth, screen: screen.width, visual: visualViewport.width, client: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, text: document.body.innerText, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, forms: [...document.forms].map(form => form.method) }))()`);
        const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
        await writeFile(join(artifactDir, `${artifactName}-${width}.png`), Buffer.from(screenshot.data, "base64"));
        console.log("HRM browser viewport:",JSON.stringify({requested:width,width:state.width,outer:state.outer,screen:state.screen,visual:state.visual,client:state.client,documentWidth:state.documentWidth,bodyWidth:state.bodyWidth,reduce:state.reduce,formCount:state.forms.length}));
        assert.equal(state.width, width, `Chrome uses ${width}px viewport`);
        assert.ok(state.documentWidth <= width && state.bodyWidth <= width, `no horizontal page overflow at ${width}px (document=${state.documentWidth}, body=${state.bodyWidth})`);
        assert.ok(state.text.includes(expectedText), `server-rendered content remains available with page JavaScript disabled at ${width}px`);
        assert.equal(state.reduce, true, "reduced-motion preference is emulated");
        if (width === 320) assert.ok(state.forms.length > 0, "native forms are present without client JavaScript");
      }

      await cdp.send("Emulation.setScriptExecutionDisabled", { value: false }, sessionId);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, screenWidth: 1280, screenHeight: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await navigate(path, cookies);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
      const focus = await evaluate("(() => { const e = document.activeElement; const s = getComputedStyle(e); return { tag: e?.tagName, visible: e?.matches(':focus-visible'), outline: s.outlineStyle, outlineWidth: s.outlineWidth }; })()");
      assert.ok(focus.tag && focus.tag !== "BODY", "Tab reaches an interactive control");
      assert.equal(focus.visible, true, "keyboard focus is visibly identified");
      assert.notEqual(focus.outlineWidth, "0px", "keyboard focus has a non-zero outline");
      const accessibility = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
      assert.ok(accessibility.nodes.some(node => node.role?.value === "RootWebArea"), "Chrome exposes an accessibility document tree");
      return { widths: [320, 430, 1280], noJavaScript: true, reducedMotion: true, keyboardFocus: focus.tag, screenshots: artifactDir };
    },
    async close() {
      cdp?.close();
      if (chrome.exitCode === null) chrome.kill("SIGTERM");
      await new Promise(resolve => {
        if (chrome.exitCode !== null) return resolve();
        const timer = setTimeout(() => { chrome.kill("SIGKILL"); resolve(); }, 3000);
        chrome.once("exit", () => { clearTimeout(timer); resolve(); });
      });
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}
