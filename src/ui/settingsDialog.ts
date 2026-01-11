import type { AiDifficulty } from "../core/systems/aiSystem";

export type SettingsState = {
  fullscreen: boolean;
  aiDifficulty: AiDifficulty;
};

type SettingsDialogOptions = {
  initialState: SettingsState;
  onApply: (state: SettingsState) => void;
  onCancel: () => void;
};

export function showSettingsDialog(appRoot: HTMLElement, options: SettingsDialogOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog settings-dialog";
  dialog.style.backgroundImage = 'url("/background/settingsbackground.png")';

  const content = document.createElement("div");
  content.className = "dialog-content settings-dialog-content";

  const title = document.createElement("h2");
  title.className = "settings-dialog-title";
  title.textContent = "Settings";

  const form = document.createElement("div");
  form.className = "settings-form";

  const fullscreenRow = document.createElement("div");
  fullscreenRow.className = "settings-row";

  const fullscreenLabel = document.createElement("label");
  fullscreenLabel.className = "settings-label";
  fullscreenLabel.textContent = "Fullscreen";

  const fullscreenToggle = document.createElement("input");
  fullscreenToggle.type = "checkbox";
  fullscreenToggle.checked = options.initialState.fullscreen;
  fullscreenToggle.className = "settings-checkbox";

  fullscreenLabel.htmlFor = "fullscreen-toggle";
  fullscreenToggle.id = "fullscreen-toggle";

  fullscreenRow.append(fullscreenLabel, fullscreenToggle);

  const difficultyRow = document.createElement("div");
  difficultyRow.className = "settings-row";

  const difficultyLabel = document.createElement("label");
  difficultyLabel.className = "settings-label";
  difficultyLabel.textContent = "AI Difficulty";
  difficultyLabel.htmlFor = "ai-difficulty-select";

  const difficultySelect = document.createElement("select");
  difficultySelect.className = "settings-select";
  difficultySelect.id = "ai-difficulty-select";

  const difficulties: Array<{ label: string; value: AiDifficulty }> = [
    { label: "Easy", value: "easy" },
    { label: "Normal", value: "normal" },
    { label: "Hard", value: "hard" },
  ];

  for (const difficulty of difficulties) {
    const option = document.createElement("option");
    option.value = difficulty.value;
    option.textContent = difficulty.label;
    if (difficulty.value === options.initialState.aiDifficulty) {
      option.selected = true;
    }
    difficultySelect.appendChild(option);
  }

  difficultyRow.append(difficultyLabel, difficultySelect);

  const footer = document.createElement("div");
  footer.className = "dialog-footer settings-dialog-footer";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "dialog-button dialog-button--secondary";
  cancelButton.textContent = "Cancel";

  cancelButton.addEventListener("click", () => {
    overlay.remove();
    options.onCancel();
  });

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "dialog-button";
  applyButton.textContent = "Apply";

  applyButton.addEventListener("click", () => {
    overlay.remove();
    options.onApply({
      fullscreen: fullscreenToggle.checked,
      aiDifficulty: difficultySelect.value as AiDifficulty,
    });
  });

  form.append(fullscreenRow, difficultyRow);
  footer.append(cancelButton, applyButton);
  content.append(title, form, footer);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}