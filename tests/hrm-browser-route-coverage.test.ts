import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const englishPages=resolve(repoRoot,"src/pages/hrm"),vietnamesePages=resolve(repoRoot,"src/pages/vi/hrm");
const integrationPath=resolve(repoRoot,"tests/integration/hrm.integration.test.mjs");

function walk(directory:string,root=directory):string[]{
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=resolve(directory,entry.name);
    return entry.isDirectory()?walk(path,root):[relative(root,path).replaceAll("\\","/")];
  });
}

function routeFor(relativeFile:string):string{
  const normalized=relativeFile.replaceAll("\\","/");
  const page=normalized==="index.astro"?"":normalized.endsWith("/index.astro")?normalized.slice(0,-"/index.astro".length):normalized.replace(/\.astro$/,"");
  return `/hrm${page?`/${page}`:""}`.replace(/\[[^\]]+\]/g,":id");
}

function auditedRoutes(source:string):Map<string,Set<"en"|"vi">>{
  const routes=new Map<string,Set<"en"|"vi">>();
  for(const line of source.split(/\r?\n/)){
    if(!["auditPage(","auditPair(","auditP3Pair("].some(call=>line.includes(call)))continue;
    const literals=/(["`])((?:\/vi)?\/hrm[^"`]*)\1/g;
    for(const match of line.matchAll(literals)){
      const raw=match[2],locale=raw.startsWith("/vi/hrm")?"vi":"en";
      const path=raw
        .replace(/\$\{([^}]+)\}/g,(_expression,name:string)=>/query$/i.test(name)?"":":id")
        .split(/[?#]/,1)[0]
        .replace(/^\/vi(?=\/hrm)/,"")
        .replace(/:[A-Za-z][A-Za-z0-9_]*/g,":id")
        .replace(/\/$/,"")||"/hrm";
      const locales=routes.get(path)??new Set<"en"|"vi">();locales.add(locale);routes.set(path,locales);
    }
  }
  return routes;
}

test("every bilingual HRM page route has an EN and VI browser-audit call",()=>{
  const pageFiles=walk(englishPages).filter(path=>path.endsWith(".astro"));
  assert.ok(pageFiles.length>0,"HRM page routes must be discoverable");
  const missingLocalePeers=pageFiles.filter(path=>!walk(vietnamesePages).includes(path));
  assert.deepEqual(missingLocalePeers,[],"every English HRM page must have a Vietnamese peer");

  const routes=auditedRoutes(readFileSync(integrationPath,"utf8"));
  const missing=pageFiles.flatMap(file=>{
    const route=routeFor(file),locales=routes.get(route)??new Set<"en"|"vi">();
    return (["en","vi"] as const).filter(locale=>!locales.has(locale)).map(locale=>`${locale.toUpperCase()} ${route}`);
  });
  assert.deepEqual(missing,[],`Each HRM route needs a browser-audit call in both locales; missing: ${missing.join(", ")}`);
});
