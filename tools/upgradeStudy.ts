import { UNIT_TYPES, UnitType } from "../src/core/units/unitType";
import { writeFileSync } from "node:fs";
import { aiProfiles, type AiProfile, type AiDifficulty } from "../src/core/systems/aiSystem";
import { runBatch, type BatchResult } from "./simulation";

export const UPGRADE_STRATEGIES = {
  immediate: { hqUpgradeMinArmy: 0, hqUpgradeReserve: 0, hqUpgradeThreatDistance: 100, hqUpgradeSavingTurns: 2 },
  reserve: { hqUpgradeMinArmy: 3, hqUpgradeReserve: 150, hqUpgradeThreatDistance: 100, hqUpgradeSavingTurns: 1 },
  threatened: { hqUpgradeMinArmy: 3, hqUpgradeReserve: 150, hqUpgradeThreatDistance: 8, hqUpgradeSavingTurns: 1 },
  late: { hqUpgradeMinArmy: 6, hqUpgradeReserve: 400, hqUpgradeThreatDistance: 100, hqUpgradeSavingTurns: 0 },
} satisfies Record<string, Partial<AiProfile>>;
type Strategy = keyof typeof UPGRADE_STRATEGIES;
export interface UpgradeStudyRow {
  phase: string; strategy: string; opponent: string; difficulty: AiDifficulty;
  width: number; height: number; seed: number; result: BatchResult;
}

/** Screening uses separate seeds from validation. Each map is played from both sides. */
export function runUpgradeStudy(games: number, seed: number, maxTurns: number, report: string): void {
  const rows: UpgradeStudyRow[] = [];
  const strategies = Object.keys(UPGRADE_STRATEGIES) as Strategy[];
  const sizes = [[12, 10], [20, 20]] as const;
  const run = (phase: string, strategy: Strategy, opponent: Strategy | "never", difficulty: AiDifficulty, width: number, height: number, firstSeed: number) => {
    const base = aiProfiles[difficulty];
    const profileA = { ...base, hqUpgradeEnabled: true, ...UPGRADE_STRATEGIES[strategy] };
    const profileB = opponent === "never" ? { ...base, hqUpgradeEnabled: false } : { ...base, hqUpgradeEnabled: true, ...UPGRADE_STRATEGIES[opponent] };
    const result = runBatch({ games, seed: firstSeed, width, height, maxTurns, paired: true, profileA, profileB });
    rows.push({ phase, strategy, opponent, difficulty, width, height, seed: firstSeed, result });
    writeFileSync(report, JSON.stringify({ upgradePrice: UNIT_TYPES[UnitType.MilitaryBaseFortified].price, gamesPerBatch: games, maxTurns, strategies: UPGRADE_STRATEGIES, rows }, null, 2));
    console.log(`${phase}: ${strategy} vs ${opponent}, ${difficulty} ${width}x${height}: ${result.winsA}/${result.winsB}/${result.draws} W/L/D; upgrades ${result.upgradesA}, first turn ${result.averageFirstUpgradeTurnA?.toFixed(1) ?? "none"}`);
  };
  for (const strategy of strategies) for (const [width, height] of sizes) run("screening", strategy, "never", "normal", width, height, seed);
  const score = (strategy: Strategy) => rows.filter(row => row.strategy === strategy).reduce((total, row) => total + row.result.winsA + row.result.draws * 0.5, 0);
  const finalists = [...strategies].sort((a, b) => score(b) - score(a)).slice(0, 2);
  console.log(`Finalists on fresh seeds: ${finalists.join(", ")}`);
  for (const strategy of finalists) for (const difficulty of ["normal", "hard"] as const) for (const [width, height] of sizes) {
    run("validation", strategy, "never", difficulty, width, height, seed + 10000);
  }
  for (const difficulty of ["normal", "hard"] as const) for (const [width, height] of sizes) {
    run("head-to-head", finalists[0]!, finalists[1]!, difficulty, width, height, seed + 20000);
  }
  console.log(`Study complete: ${rows.length * games} games. Full results: ${report}`);
}
