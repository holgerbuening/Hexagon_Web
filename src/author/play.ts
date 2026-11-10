import { parseMission, missionIssues } from "./documents";
import { prepareGameLaunch } from "../gameLaunch";

async function launch(): Promise<void> {
  try {
    const raw = sessionStorage.getItem("hexagon-author-test");
    if (!raw) throw new Error("No test mission selected. Start a test from the mission editor.");
    const mission = parseMission(JSON.parse(raw));
    const issues = missionIssues(mission);
    if (issues.length) throw new Error(issues.join("\n"));
    prepareGameLaunch({ state: mission.state, difficulty: mission.difficulty });
    await import("../main");
  } catch (error) {
    const app = document.getElementById("app")!;
    app.replaceChildren();
    const notice = document.createElement("p");
    notice.textContent = error instanceof Error ? error.message : String(error);
    app.append(notice);
  }


}
void launch();
