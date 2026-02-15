import { APP_INFO, type AppLink, type CreditItem } from "../config/appInfo";

type AboutDialogOptions = {
  onClose: () => void;
};


function appendTextWithLinks(target: HTMLElement, text: string): void {
  const urlPattern = /https?:\/\/[^\s)]+/g;
  let searchIndex = 0;
  let match = urlPattern.exec(text);

  while (match !== null) {
    const url = match[0];
    const matchStart = match.index;

    if (matchStart > searchIndex) {
      const plainText = text.slice(searchIndex, matchStart);
      target.appendChild(document.createTextNode(plainText));
    }

    const anchor = document.createElement("a");
    anchor.className = "about-link";
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = url;
    target.appendChild(anchor);

    searchIndex = matchStart + url.length;
    match = urlPattern.exec(text);
  }
  if (searchIndex < text.length) {
    const remainingText = text.slice(searchIndex);
    target.appendChild(document.createTextNode(remainingText));
  }
}


function createCreditList(title: string, items: CreditItem[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "about-section";

  const heading = document.createElement("h3");
  heading.className = "about-section-title";
  heading.textContent = title;

  const list = document.createElement("ul");
  list.className = "about-list";

   for (const item of items) {
    const row = document.createElement("li");
    row.className = "about-list-item";

    const name = document.createElement("strong");
    name.textContent = `${item.name}: `;

    const sourceText = document.createElement("span");
    sourceText.className = "about-credit-source";
    appendTextWithLinks(sourceText, item.source);

    const licenseText = document.createElement("span");
    licenseText.textContent = ` (${item.license})`;

    row.append(name, sourceText, licenseText);
    list.appendChild(row);
  }

  section.append(heading, list);
  return section;
}

function createLinkRow(link: AppLink): HTMLElement {
  const row = document.createElement("div");
  row.className = "about-link-row";

  const label = document.createElement("span");
  label.className = "about-link-label";
  label.textContent = `${link.label}:`;

  const anchor = document.createElement("a");
  anchor.className = "about-link";
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = link.url;

  row.append(label, anchor);
  return row;
}

export function showAboutDialog(appRoot: HTMLElement, options: AboutDialogOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog about-dialog";
  dialog.style.backgroundImage = 'url("/images/background/aboutbackground.png")';

  const content = document.createElement("div");
  content.className = "dialog-content about-dialog-content";

  const title = document.createElement("h2");
  title.className = "about-title";
  title.textContent = APP_INFO.name;

  const subtitle = document.createElement("p");
  subtitle.className = "about-subtitle";
  subtitle.textContent = APP_INFO.tagline;

  const version = document.createElement("p");
  version.className = "about-meta";
  version.textContent = `Version: ${APP_INFO.version}`;

  const build = document.createElement("p");
  build.className = "about-meta";
  build.textContent = `Build: ${APP_INFO.build}`;

  const descriptionSection = document.createElement("section");
  descriptionSection.className = "about-section";

  const descriptionTitle = document.createElement("h3");
  descriptionTitle.className = "about-section-title";
  descriptionTitle.textContent = "Description";

  const descriptionText = document.createElement("p");
  descriptionText.className = "about-text";
  descriptionText.textContent = APP_INFO.shortDescription;

  descriptionSection.append(descriptionTitle, descriptionText);

  const developerSection = document.createElement("section");
  developerSection.className = "about-section";

  const developerTitle = document.createElement("h3");
  developerTitle.className = "about-section-title";
  developerTitle.textContent = "Author";

  const developerText = document.createElement("p");
  developerText.className = "about-text";
  developerText.textContent = APP_INFO.developer;

  const copyrightText = document.createElement("p");
  copyrightText.className = "about-text";
  copyrightText.textContent = APP_INFO.copyright;

  developerSection.append(developerTitle, developerText, copyrightText);

  const linksSection = document.createElement("section");
  linksSection.className = "about-section";

  const linksTitle = document.createElement("h3");
  linksTitle.className = "about-section-title";
  linksTitle.textContent = "Links";

  linksSection.appendChild(linksTitle);
  for (const link of APP_INFO.links) {
    linksSection.appendChild(createLinkRow(link));
  }

  const creditsSection = document.createElement("section");
  creditsSection.className = "about-section";

  const creditsTitle = document.createElement("h3");
  creditsTitle.className = "about-section-title";
  creditsTitle.textContent = "Credits";

  const soundList = createCreditList("Sound Effects", APP_INFO.soundEffectsCredits);
  const graphicsList = createCreditList("Graphics & UI", APP_INFO.graphicsCredits);

  creditsSection.append(creditsTitle, soundList, graphicsList);

  const licenseSection = document.createElement("section");
  licenseSection.className = "about-section";

  const licenseTitle = document.createElement("h3");
  licenseTitle.className = "about-section-title";
  licenseTitle.textContent = "License";

  const licenseHeading = document.createElement("p");
  licenseHeading.className = "about-text";
  licenseHeading.textContent = APP_INFO.licenseHeading;

  const licenseNote = document.createElement("p");
  licenseNote.className = "about-text";
  licenseNote.textContent = APP_INFO.licenseNote;

  licenseSection.append(licenseTitle, licenseHeading, licenseNote);

  const footer = document.createElement("div");
  footer.className = "dialog-footer";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dialog-button";
  closeButton.textContent = "Back";

  closeButton.addEventListener("click", () => {
    overlay.remove();
    options.onClose();
  });

  footer.appendChild(closeButton);

  content.append(
    title,
    subtitle,
    version,
    build,
    descriptionSection,
    developerSection,
    linksSection,
    creditsSection,
    licenseSection,
    footer,
  );

  dialog.appendChild(content);
  overlay.appendChild(dialog);
  appRoot.appendChild(overlay);
}