import type { AiDifficulty } from "../core/systems/aiSystem";

export type SettingsState = {
  fullscreen: boolean;
  aiDifficulty: AiDifficulty;
  animationsEnabled: boolean;
  animationSpeed: number;
  soundEffectsEnabled: boolean;
  soundEffectsVolume: number;
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
  dialog.style.backgroundImage = 'url("/images/background/settingsbackground.png")';

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

  const animationToggleRow = document.createElement("div");
  animationToggleRow.className = "settings-row";

  const animationToggleLabel = document.createElement("label");
  animationToggleLabel.className = "settings-label";
  animationToggleLabel.textContent = "Show Animations";
  animationToggleLabel.htmlFor = "animations-toggle";

  const animationToggle = document.createElement("input");
  animationToggle.type = "checkbox";
  animationToggle.checked = options.initialState.animationsEnabled;
  animationToggle.className = "settings-checkbox";
  animationToggle.id = "animations-toggle";

  animationToggleRow.append(animationToggleLabel, animationToggle);

  const animationSpeedRow = document.createElement("div");
  animationSpeedRow.className = "settings-row";

  const animationSpeedLabel = document.createElement("label");
  animationSpeedLabel.className = "settings-label";
  animationSpeedLabel.textContent = "Animation Speed";
  animationSpeedLabel.htmlFor = "animation-speed-range";

  const animationSpeedControl = document.createElement("div");
  animationSpeedControl.className = "settings-range";

  const animationSpeedRange = document.createElement("input");
  animationSpeedRange.type = "range";
  animationSpeedRange.id = "animation-speed-range";
  animationSpeedRange.min = "2";
  animationSpeedRange.max = "12";
  animationSpeedRange.step = "1";
  animationSpeedRange.value = String(options.initialState.animationSpeed);

  const animationSpeedValue = document.createElement("span");
  animationSpeedValue.className = "settings-range-value";
  animationSpeedValue.textContent = animationSpeedRange.value;

  animationSpeedRange.addEventListener("input", () => {
    animationSpeedValue.textContent = animationSpeedRange.value;
  });

  animationToggle.addEventListener("change", () => {
    animationSpeedRange.disabled = !animationToggle.checked;
    animationSpeedValue.classList.toggle("is-disabled", animationSpeedRange.disabled);
  });

  animationSpeedRange.disabled = !animationToggle.checked;
  animationSpeedValue.classList.toggle("is-disabled", animationSpeedRange.disabled);

  animationSpeedControl.append(animationSpeedRange, animationSpeedValue);
  animationSpeedRow.append(animationSpeedLabel, animationSpeedControl);

  const soundToggleRow = document.createElement("div");
  soundToggleRow.className = "settings-row";

  const soundToggleLabel = document.createElement("label");
  soundToggleLabel.className = "settings-label";
  soundToggleLabel.textContent = "Sound Effects";
  soundToggleLabel.htmlFor = "sound-effects-toggle";

  const soundToggle = document.createElement("input");
  soundToggle.type = "checkbox";
  soundToggle.checked = options.initialState.soundEffectsEnabled;
  soundToggle.className = "settings-checkbox";
  soundToggle.id = "sound-effects-toggle";

  soundToggleRow.append(soundToggleLabel, soundToggle);

  const soundVolumeRow = document.createElement("div");
  soundVolumeRow.className = "settings-row";

  const soundVolumeLabel = document.createElement("label");
  soundVolumeLabel.className = "settings-label";
  soundVolumeLabel.textContent = "Sound Volume";
  soundVolumeLabel.htmlFor = "sound-effects-volume";

  const soundVolumeControl = document.createElement("div");
  soundVolumeControl.className = "settings-range";

  const soundVolumeRange = document.createElement("input");
  soundVolumeRange.type = "range";
  soundVolumeRange.id = "sound-effects-volume";
  soundVolumeRange.min = "0";
  soundVolumeRange.max = "100";
  soundVolumeRange.step = "5";
  soundVolumeRange.value = String(Math.round(options.initialState.soundEffectsVolume * 100));

  const soundVolumeValue = document.createElement("span");
  soundVolumeValue.className = "settings-range-value";
  soundVolumeValue.textContent = soundVolumeRange.value;

  soundVolumeRange.addEventListener("input", () => {
    soundVolumeValue.textContent = soundVolumeRange.value;
  });

  soundToggle.addEventListener("change", () => {
    soundVolumeRange.disabled = !soundToggle.checked;
    soundVolumeValue.classList.toggle("is-disabled", soundVolumeRange.disabled);
  });

  soundVolumeRange.disabled = !soundToggle.checked;
  soundVolumeValue.classList.toggle("is-disabled", soundVolumeRange.disabled);

  soundVolumeControl.append(soundVolumeRange, soundVolumeValue);
  soundVolumeRow.append(soundVolumeLabel, soundVolumeControl);
  
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
      animationsEnabled: animationToggle.checked,
      animationSpeed: Number(animationSpeedRange.value),
      soundEffectsEnabled: soundToggle.checked,
      soundEffectsVolume: Number(soundVolumeRange.value) / 100,
    });
  });

  form.append(
    fullscreenRow,
    difficultyRow,
    animationToggleRow,
    animationSpeedRow,
    soundToggleRow,
    soundVolumeRow,
  );
  footer.append(cancelButton, applyButton);
  content.append(title, form, footer);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}