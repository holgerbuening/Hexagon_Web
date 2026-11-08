import { parseMapDocument, type MapDocument } from "../core/map/mapSerializer";
import { PLAYER_NAMES, type PlayerId } from "../core/types";

const BACKGROUND = 'url("/images/background/startbackground.png")';

function createDialog(appRoot: HTMLElement, titleText: string): { overlay: HTMLDivElement; dialog: HTMLDivElement } {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay start-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "start-dialog start-dialog--compact";
  dialog.style.backgroundImage = BACKGROUND;

  const title = document.createElement("h1");
  title.className = "start-dialog-heading";
  title.textContent = titleText;
  dialog.appendChild(title);

  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
  return { overlay, dialog };
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "start-dialog-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createText(text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "start-dialog-text";
  paragraph.textContent = text;
  return paragraph;
}

type GameModeOptions = {
  onSinglePlayer: (map?: MapDocument) => void;
  onOnline: (map?: MapDocument) => void;
  onBack: () => void;
};

/** Asks whether to play against the AI or against another person online. */
export function showGameModeDialog(appRoot: HTMLElement, options: GameModeOptions): void {
  const { overlay, dialog } = createDialog(appRoot, "New Game");
  dialog.classList.add("new-game-dialog");
  let selectedMap: MapDocument | undefined;
  const mapLabel = createText("Map: Random map (20 × 20)");
  mapLabel.setAttribute("aria-live", "polite");
  const error = createText("");
  error.setAttribute("role", "alert");
  const chooseFile = createButton("Load Map…", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      single.disabled = online.disabled = chooseFile.disabled = random.disabled = true;
      void file.text().then(text => {
        const map = parseMapDocument(JSON.parse(text));
        if (!overlay.isConnected) return;
        selectedMap = map;
        mapLabel.textContent = `Map: ${map.name || file.name} (${map.width} × ${map.height})`;
        error.textContent = "";
      }).catch(() => {
        if (overlay.isConnected) error.textContent = "Could not load this map. Please select a valid Hexagon map file.";
      }).finally(() => { single.disabled = online.disabled = chooseFile.disabled = random.disabled = false; });
    });
    input.click();
  });
  const choose = (action: (map?: MapDocument) => void) => () => {
    try {
      action(selectedMap);
      overlay.remove();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : "Could not start this game.";
    }
  };
  const single = createButton("1 Player vs AI", choose(options.onSinglePlayer));
  const online = createButton("2 Players Online", choose(options.onOnline));
  const random = createButton("Random Map", () => {
    selectedMap = undefined;
    mapLabel.textContent = "Map: Random map (20 × 20)";
    error.textContent = "";
  });
  dialog.append(
    mapLabel,
    random,
    chooseFile,
    error,
    single,
    online,
    createButton("Back", () => { overlay.remove(); options.onBack(); })
  );
}

type InviteDialogOptions = {
  link: string;
  onCancel: () => void;
};

export interface InviteDialogHandle {
  close: () => void;
}

/** Shows the invite link for the second player while the game waits for them. */
export function showInviteDialog(appRoot: HTMLElement, options: InviteDialogOptions): InviteDialogHandle {
  const { overlay, dialog } = createDialog(appRoot, "Invite a Player");

  const input = document.createElement("input");
  input.className = "start-dialog-input";
  input.type = "text";
  input.readOnly = true;
  input.value = options.link;
  input.setAttribute("aria-label", "Invite link");
  input.addEventListener("focus", () => input.select());

  const copyButton = createButton("Copy Link", () => {
    const done = () => {
      copyButton.textContent = "Copied!";
      window.setTimeout(() => {
        copyButton.textContent = "Copy Link";
      }, 1500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(options.link).then(done, () => input.select());
    } else {
      input.select();
    }
  });

  const cancelButton = createButton("Cancel", () => {
    overlay.remove();
    options.onCancel();
  });

  dialog.append(
    createText("Send this link to your opponent. The game starts as soon as they open it."),
    input,
    copyButton,
    createText("Waiting for the second player…"),
    cancelButton
  );

  return { close: () => overlay.remove() };
}

type NoticeOptions = {
  title: string;
  text: string;
  buttonLabel?: string;
  onOk: () => void;
};

/** A simple message with one button. */
export function showNoticeDialog(appRoot: HTMLElement, options: NoticeOptions): { close: () => void } {
  const { overlay, dialog } = createDialog(appRoot, options.title);
  dialog.append(
    createText(options.text),
    createButton(options.buttonLabel ?? "OK", () => {
      overlay.remove();
      options.onOk();
    })
  );
  return { close: () => overlay.remove() };
}

export function describeSeat(player: PlayerId, myPlayer: PlayerId): string {
  return player === myPlayer ? `${PLAYER_NAMES[player]} (you)` : `${PLAYER_NAMES[player]} (opponent)`;
}

/** Confirms discarding unsaved map edits using the shared menu appearance. */
export function showDiscardMapDialog(appRoot: HTMLElement, onDiscard: () => void): void {
  const previousFocus = document.activeElement;
  const { overlay, dialog } = createDialog(appRoot, "Discard unsaved changes?");
  const title = dialog.querySelector("h1")!;
  title.id = "discard-map-title";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", title.id);
  const text = createText("Your map has unsaved changes. Discard them and continue?");
  text.id = "discard-map-description";
  dialog.setAttribute("aria-describedby", text.id);
  const close = () => {
    overlay.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  };
  const cancel = createButton("Keep Editing", close);
  const discard = createButton("Discard Changes", () => {
    close();
    onDiscard();
  });
  dialog.append(text, cancel, discard);
  overlay.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      event.preventDefault();
      (document.activeElement === cancel ? discard : cancel).focus();
    }
  });
  cancel.focus();
}
