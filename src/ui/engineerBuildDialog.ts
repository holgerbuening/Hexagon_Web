import type { EngineerBuildType } from "../core/types";

export function showEngineerBuildDialog(root: HTMLElement, options: {
  available: EngineerBuildType[];
  balance: number;
  onBuild: (type: EngineerBuildType) => void;
  onCancel: () => void;
}): void {
  const overlay = document.createElement("div"); overlay.className = "dialog-overlay";
  const dialog = document.createElement("section"); dialog.className = "campaign-dialog";
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "Engineer construction");
  const content = document.createElement("div"); content.className = "campaign-content";
  const title = document.createElement("h2"); title.textContent = "Engineer construction";
  const hint = document.createElement("p"); hint.textContent = "Choose what to build on this tile. Cost: 20.";
  const actions = document.createElement("div"); actions.className = "campaign-actions";
  let closed = false;
  function close(action: () => void): void {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    action();
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") { event.preventDefault(); close(options.onCancel); }
  }
  for (const [type, label] of [["road", "Road"], ["trench", "Trench"]] as const) {
    const button = document.createElement("button"); button.type = "button"; button.className = "dialog-button";
    button.textContent = label;
    button.disabled = !options.available.includes(type) || options.balance < 20;
    button.addEventListener("click", () => close(() => options.onBuild(type)));
    actions.append(button);
  }
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "dialog-button"; cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => close(options.onCancel)); actions.append(cancel);
  content.append(title, hint, actions); dialog.append(content); overlay.append(dialog); root.append(overlay);
  window.addEventListener("keydown", onKeyDown);
  actions.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}
