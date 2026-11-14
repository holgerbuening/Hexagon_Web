import { GameCore } from "../src/core/gameCore";
import { AiSystem, type AiProfile } from "../src/core/systems/aiSystem";
import { CombatSystem } from "../src/core/systems/combatSystem";
import { MovementSystem } from "../src/core/systems/movementSystem";
import { createSeededRng } from "../src/core/rng";
import type { CombatPreviewEntry, GameState, HexTile, PlayerId } from "../src/core/types";

const NEIGHBOR_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;

const MAX_MAP_ATTEMPTS = 20;
// Keeps the seeds of retried maps away from the seeds of neighbouring games.
const RETRY_SEED_STEP = 1_000_003;

/** Lets an AI take the current player's turn on the given game and returns its planned attacks. */
export function runAiTurn(game: GameCore, ai: AiSystem): CombatPreviewEntry[] {
  const getNeighbors = (q: number, r: number): HexTile[] => {
    const result: HexTile[] = [];
    for (const [dq, dr] of NEIGHBOR_DIRECTIONS) {
      const tile = game.getTile({ q: q + dq, r: r + dr });
      if (tile) result.push(tile);
    }
    return result;
  };

  return ai.runTurn(
    game.getState() as GameState,
    (pos) => game.getTile(pos),
    getNeighbors,
    (pos) => game.getUnitAt(pos),
    (p, cost) => game.canAfford(p, cost),
    (p, cost) => game.spend(p, cost)
  );
}

export interface GameConfig {
  seed: number;
  width: number;
  height: number;
  /** Counted per player move, so one full round is two turns. */
  maxTurns: number;
  /** AI profile per player. */
  profiles: [AiProfile, AiProfile];
}

export interface GameResult {
  seed: number;
  winner: PlayerId | null;
  turns: number;
  aiMilliseconds: number;
  hqUpgrades: [number, number];
  firstHqUpgradeTurn: [number | null, number | null];
}

/** Plays one game with an AI controlling both players. Same config gives the same result. */
export function playGame(config: GameConfig): GameResult {
  // Some generated maps have no room for the start units; the game asks for a new map then.
  let game: GameCore | null = null;
  let rng = createSeededRng(config.seed);
  for (let attempt = 1; game === null; attempt++) {
    try {
      game = new GameCore(config.width, config.height, rng);
    } catch (error) {
      if (attempt >= MAX_MAP_ATTEMPTS) throw error;
      rng = createSeededRng(config.seed + attempt * RETRY_SEED_STEP);
    }
  }
  // Both AIs are driven from here, so the built-in AI of the game core stays off.
  game.configureAi(null);

  const movementSystem = new MovementSystem();
  const combatSystem = new CombatSystem(rng);
  const ais = [0, 1].map((player) => {
    const ai = new AiSystem(movementSystem, combatSystem, rng);
    ai.configure(player as PlayerId, config.profiles[player]);
    game.setIncomeMultiplier(player as PlayerId, ai.getIncomeMultiplier(player as PlayerId));
    return ai;
  });

  const state = game.getState();

  let aiMilliseconds = 0;
  const hqUpgrades: [number, number] = [0, 0];
  const firstHqUpgradeTurn: [number | null, number | null] = [null, null];
  while (!state.gameOver && state.turn < config.maxTurns) {
    const player = state.currentPlayer;
    const started = performance.now();
    const previews = runAiTurn(game, ais[player]!);
    aiMilliseconds += performance.now() - started;
    const upgraded = ais[player]!.upgradedHeadquarters.length;
    hqUpgrades[player] += upgraded;
    if (upgraded && firstHqUpgradeTurn[player] === null) firstHqUpgradeTurn[player] = state.turn;

    for (const entry of previews) {
      game.applyCombat(entry.preview);
      if (state.gameOver) break;
    }
    if (state.gameOver) break;

    // Animations only matter for rendering.
    for (const unit of state.units) unit.animationPath = [];
    game.endTurn();
  }

  return {
    seed: config.seed,
    winner: state.gameOver ? state.winner : null,
    turns: state.turn,
    aiMilliseconds, hqUpgrades, firstHqUpgradeTurn,
  };
}

export interface BatchConfig {
  games: number;
  seed: number;
  width: number;
  height: number;
  maxTurns: number;
  /** AI profile of side A and side B. */
  profileA: AiProfile;
  profileB: AiProfile;
  paired?: boolean;
}

export interface BatchResult {
  games: number;
  winsA: number;
  winsB: number;
  draws: number;
  averageTurns: number;
  averageAiMilliseconds: number;
  upgradesA: number;
  upgradesB: number;
  gamesWithUpgradeA: number;
  gamesWithUpgradeB: number;
  averageFirstUpgradeTurnA: number | null;
  averageFirstUpgradeTurnB: number | null;
}

/**
 * Side A alternates starting sides. With paired=true, each seed is replayed
 * with sides swapped so map and starting-side advantages are balanced.
 */
export function runBatch(
  config: BatchConfig,
  onGame?: (index: number, result: GameResult, aIsPlayer0: boolean) => void
): BatchResult {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let turns = 0;
  let aiMilliseconds = 0;
  const upgrades = [0, 0]; const gamesWithUpgrade = [0, 0]; const firstUpgradeTurns = [0, 0];

  for (let i = 0; i < config.games; i++) {
    const aIsPlayer0 = i % 2 === 0;
    const result = playGame({
      seed: config.seed + (config.paired ? Math.floor(i / 2) : i),
      width: config.width,
      height: config.height,
      maxTurns: config.maxTurns,
      profiles: aIsPlayer0 ? [config.profileA, config.profileB] : [config.profileB, config.profileA],
    });

    if (result.winner === null) {
      draws++;
    } else if ((result.winner === 0) === aIsPlayer0) {
      winsA++;
    } else {
      winsB++;
    }
    for (const side of [0, 1] as const) {
      const player = (aIsPlayer0 ? side : 1 - side) as PlayerId;
      upgrades[side]! += result.hqUpgrades[player];
      const first = result.firstHqUpgradeTurn[player];
      if (first !== null) { gamesWithUpgrade[side]!++; firstUpgradeTurns[side]! += first; }
    }
    turns += result.turns;
    aiMilliseconds += result.aiMilliseconds;
    onGame?.(i, result, aIsPlayer0);
  }

  return {
    games: config.games,
    winsA,
    winsB,
    draws,
    averageTurns: turns / config.games,
    averageAiMilliseconds: aiMilliseconds / config.games,
    upgradesA: upgrades[0]!, upgradesB: upgrades[1]!, gamesWithUpgradeA: gamesWithUpgrade[0]!, gamesWithUpgradeB: gamesWithUpgrade[1]!,
    averageFirstUpgradeTurnA: gamesWithUpgrade[0] ? firstUpgradeTurns[0]! / gamesWithUpgrade[0] : null,
    averageFirstUpgradeTurnB: gamesWithUpgrade[1] ? firstUpgradeTurns[1]! / gamesWithUpgrade[1] : null,
  };
}
