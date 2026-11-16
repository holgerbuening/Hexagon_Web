import { browserDatabase, migrateLegacyValue } from "../storage/browserDatabase";
import { createMissionRuntime, DEFAULT_OBJECTIVE } from "../core/campaigns/objectives";
import { parseMission, missionIssues } from "./documents";
import { prepareGameLaunch } from "../gameLaunch";

async function launch(): Promise<void> {
  try {
    const testId = sessionStorage.getItem("hexagon-author-test-id");
    const raw = testId ? await browserDatabase.get("tests", testId) : await migrateLegacyValue(browserDatabase, sessionStorage, "hexagon-author-test", "tests", "mission", parseMission);
    if (!raw) throw new Error("No test mission selected. Start a test from the mission editor.");
    const mission = parseMission(raw);
    const issues = missionIssues(mission);
    if (issues.length) throw new Error(issues.join("\n"));
    prepareGameLaunch({ state: { ...mission.state, mission: createMissionRuntime(mission.objective ?? DEFAULT_OBJECTIVE) }, difficulty: mission.difficulty });
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
