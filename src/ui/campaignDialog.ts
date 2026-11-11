import type { CampaignDocument } from "../core/campaigns/documents";
import { playableCampaign, parseCampaignIndex, readSavedCampaigns, readCampaignProgress, unlockedMissionIndex, type CampaignSave, type CampaignStorage } from "../core/campaigns/runtime";

interface StoryOptions {
  title: string;
  text: string;
  image: string;
  subtitle?: string;
  actions: { label: string; onClick: () => void }[];
}
export function showCampaignStory(root: HTMLElement, options: StoryOptions): void {
  const overlay = document.createElement("div"); overlay.className = "dialog-overlay campaign-overlay";
  const dialog = document.createElement("section"); dialog.className = "campaign-dialog";
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", options.title);
  if (options.image) { const image = document.createElement("img"); image.src = options.image; image.alt = options.title; image.className = "campaign-image"; dialog.append(image); }
  const content = document.createElement("div"); content.className = "campaign-content";
  if (options.subtitle) { const subtitle = document.createElement("p"); subtitle.className = "campaign-subtitle"; subtitle.textContent = options.subtitle; content.append(subtitle); }
  const title = document.createElement("h2"); title.textContent = options.title;
  const text = document.createElement("p"); text.className = "campaign-story"; text.textContent = options.text;
  const footer = document.createElement("div"); footer.className = "campaign-actions";
  for (const action of options.actions) {
    const button = document.createElement("button"); button.type = "button"; button.className = "dialog-button"; button.textContent = action.label;
    button.addEventListener("click", () => { overlay.remove(); action.onClick(); }); footer.append(button);
  }
  content.append(title, text, footer); dialog.append(content); overlay.append(dialog); root.append(overlay);
  footer.querySelector("button")?.focus();
}

interface LibraryOptions {
  storage: CampaignStorage;
  warning: string;
  onStart: (campaign: CampaignDocument, index: number) => void;
  onResume: (save: CampaignSave) => void;
  onBack: () => void;
}
export function showCampaignLibrary(root: HTMLElement, options: LibraryOptions): void {
  const overlay = document.createElement("div"); overlay.className = "dialog-overlay campaign-overlay";
  const dialog = document.createElement("section"); dialog.className = "campaign-dialog campaign-library";
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "Campaigns");
  const content = document.createElement("div"); content.className = "campaign-content";
  const title = document.createElement("h2"); title.textContent = "Campaigns";
  const status = document.createElement("p"); status.setAttribute("role", "status"); status.className = "campaign-story"; status.textContent = "Loading campaigns…";
  const list = document.createElement("div"); list.className = "campaign-list";
  const campaigns: CampaignDocument[] = [];
  function add(campaign: CampaignDocument): void {
    if (campaigns.some(c => c.id === campaign.id)) return;
    campaigns.push(campaign);
    const progress = readCampaignProgress(campaign, options.storage);
    const card = document.createElement("article"); card.className = "campaign-card";
    if (campaign.image) { const image = document.createElement("img"); image.src = campaign.image; image.alt = campaign.title; card.append(image); }
    const heading = document.createElement("h3"); heading.textContent = campaign.title;
    const description = document.createElement("p"); description.textContent = campaign.description;
    const count = document.createElement("p"); count.textContent = `${progress.completedMissionIds.length} / ${campaign.missions.length} missions completed`;
    card.append(heading, description, count);
    if (progress.save) {
      const resume = document.createElement("button"); resume.className = "dialog-button"; resume.textContent = "Continue campaign";
      resume.addEventListener("click", () => { overlay.remove(); options.onResume(progress.save!); }); card.append(resume);
    }
    const unlocked = unlockedMissionIndex(campaign, progress.completedMissionIds);
    campaign.missions.forEach((mission, index) => {
      const button = document.createElement("button"); button.className = "campaign-mission"; button.type = "button";
      button.textContent = `${index + 1}. ${mission.title} · ${{ easy: "Easy", normal: "Normal", hard: "Hard" }[mission.difficulty]}${progress.completedMissionIds.includes(mission.id) ? " · Completed" : ""}`;
      button.disabled = index > unlocked;
      button.addEventListener("click", () => { overlay.remove(); options.onStart(campaign, index); }); card.append(button);
    });
    list.append(card);
  }
  const footer = document.createElement("div"); footer.className = "campaign-actions";
  const load = document.createElement("button"); load.className = "dialog-button"; load.textContent = "Load campaign file";
  load.addEventListener("click", () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      try {
        const file = input.files?.[0]; if (!file) return;
        if (file.size > 100_000_000) throw new Error("Campaign file is too large (maximum 100 MB).");
        const campaign = playableCampaign(JSON.parse(await file.text())); add(campaign);
        status.textContent = "Campaign loaded. Select a mission to begin.";
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    }); input.click();
  });
  const back = document.createElement("button"); back.className = "dialog-button"; back.textContent = "Back";
  back.addEventListener("click", () => { overlay.remove(); options.onBack(); });
  footer.append(load, back); content.append(title, status, list, footer); dialog.append(content); overlay.append(dialog); root.append(overlay);
  void (async () => {
    const errors: string[] = [];
    try {
      const response = await fetch("/campaigns/index.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Could not load /campaigns/index.json. You can load a campaign file below.");
      const paths = parseCampaignIndex(await response.json());
      const results = await Promise.allSettled(paths.map(async path => {
        const file = await fetch(`/campaigns/${path}`, { cache: "no-cache" });
        if (!file.ok) throw new Error(`Could not load campaign: ${path}`);
        return playableCampaign(await file.json());
      }));
      if (!overlay.isConnected) return;
      for (const result of results) {
        if (result.status === "fulfilled") add(result.value);
        else errors.push(String(result.reason));
      }
    } catch (error) { errors.push(String(error)); }
    if (!overlay.isConnected) return;
    for (const saved of readSavedCampaigns(options.storage)) add(saved);
    status.textContent = [options.warning, campaigns.length ? "Choose a mission or continue your saved campaign." : "No published campaigns yet. Load your exported campaign file below.", ...errors].filter(Boolean).join("\n");
  })();
}
