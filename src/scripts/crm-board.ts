// Kanban drag for CRM boards. Progressive enhancement only: every card carries
// a "Move to" form that works with the keyboard and without JavaScript. This
// script lets a pointer drag a card onto a column (it fills that form and
// submits it, so the server still checks stage requirements and versions) or
// onto a closing zone that appears only while dragging (it opens the record's
// close, convert or disqualify step). Escape cancels a drag.
function setup(wrap: HTMLElement): void {
  const status = wrap.querySelector<HTMLElement>("[data-drag-status]");
  let dragged: HTMLElement | null = null;
  const say = (text: string) => { if (status) status.textContent = text; };
  const clear = () => {
    wrap.classList.remove("is-dragging");
    wrap.querySelectorAll(".drop-target").forEach((element) => element.classList.remove("drop-target"));
    dragged?.classList.remove("dragging");
    dragged = null;
  };
  wrap.querySelectorAll<HTMLElement>("[data-card]").forEach((card) => {
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      dragged = card;
      card.classList.add("dragging");
      wrap.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", card.dataset.card ?? "");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      say(wrap.dataset.dragHint?.replace("{name}", card.dataset.name ?? "") ?? "");
    });
    card.addEventListener("dragend", () => { clear(); });
  });
  const targets = wrap.querySelectorAll<HTMLElement>("[data-column], [data-zone]");
  targets.forEach((target) => {
    target.addEventListener("dragover", (event) => {
      if (!dragged) return;
      event.preventDefault();
      target.classList.add("drop-target");
    });
    target.addEventListener("dragleave", () => target.classList.remove("drop-target"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      const card = dragged;
      clear();
      if (!card) return;
      const zone = target.dataset.zone;
      if (zone) {
        const href = card.dataset[`zone${zone.charAt(0).toUpperCase()}${zone.slice(1)}`];
        if (href) window.location.assign(href);
        return;
      }
      const value = target.dataset.column ?? "";
      if (!value || value === card.dataset.current) return;
      const form = card.querySelector<HTMLFormElement>("form[data-move]");
      // Typed structurally: the Worker type set in this project lacks some DOM element types.
      const select = form?.querySelector("select[data-move-to]") as unknown as { value: string; options: ArrayLike<{ value: string }> } | null;
      if (!form || !select || !Array.from(select.options).some((option) => option.value === value)) return;
      select.value = value;
      say(wrap.dataset.movingHint?.replace("{name}", card.dataset.name ?? "") ?? "");
      form.requestSubmit();
    });
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && dragged) { clear(); say(wrap.dataset.cancelHint ?? ""); } });
}

document.querySelectorAll<HTMLElement>("[data-board-wrap]").forEach(setup);
