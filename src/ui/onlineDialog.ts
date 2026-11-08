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
  onSinglePlayer: () => void;
  onOnline: () => void;
  onBack: () => void;
};

/** Asks whether to play against the AI or against another person online. */
export function showGameModeDialog(appRoot: HTMLElement, options: GameModeOptions): void {
  const { overlay, dialog } = createDialog(appRoot, "New Game");
  const choose = (action: () => void) => () => {
    overlay.remove();
    action();
  };

  dialog.append(
    createButton("1 Player vs AI", choose(options.onSinglePlayer)),
    createButton("2 Players Online", choose(options.onOnline)),
    createButton("Back", choose(options.onBack))
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
