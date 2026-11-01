import { runBatch } from "./simulation";

const USAGE = `Headless AI-vs-AI simulation.

Usage: npm run simulate -- [options]

  --games <n>       number of games (default 50)
  --seed <n>        first seed; game i uses seed + i (default 1)
  --width <n>       map width (default 20)
  --height <n>      map height (default 20)
  --max-turns <n>   turn limit per game, counted per player move (default 300)
  --a <x>           income multiplier of side A (default 1)
  --b <x>           income multiplier of side B (default 1)
  --verbose         print every game
  --help            show this text

Side A plays as player 0 in even games and as player 1 in odd games.`;

function readOptions(argv: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (name === "verbose" || name === "help") {
      options.set(name, "true");
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for --${name}`);
    options.set(name, value);
    i++;
  }
  return options;
}

function numberOption(options: Map<string, string>, name: string, fallback: number): number {
  const raw = options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

function main(): void {
  const options = readOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(USAGE);
    return;
  }

  const games = numberOption(options, "games", 50);
  if (games < 1) throw new Error("--games must be at least 1");
  const config = {
    games,
    seed: numberOption(options, "seed", 1),
    width: numberOption(options, "width", 20),
    height: numberOption(options, "height", 20),
    maxTurns: numberOption(options, "max-turns", 300),
    multiplierA: numberOption(options, "a", 1),
    multiplierB: numberOption(options, "b", 1),
  };

  const verbose = options.has("verbose");
  const result = runBatch(config, (index, game, aIsPlayer0) => {
    if (!verbose) return;
    const winner = game.winner === null ? "draw" : (game.winner === 0) === aIsPlayer0 ? "A" : "B";
    console.log(`game ${index + 1} seed ${game.seed}: ${winner} after ${game.turns} turns`);
  });

  const percent = (count: number) => ((count / result.games) * 100).toFixed(1);
  console.log(
    `Games: ${result.games} (seed ${config.seed}, ${config.width}x${config.height}, income A x${config.multiplierA} / B x${config.multiplierB})`
  );
  console.log(`A wins: ${result.winsA} (${percent(result.winsA)}%)`);
  console.log(`B wins: ${result.winsB} (${percent(result.winsB)}%)`);
  console.log(`Draws:  ${result.draws} (${percent(result.draws)}%)`);
  console.log(`Average turns: ${result.averageTurns.toFixed(1)}`);
  console.log(`Average AI time per game: ${result.averageAiMilliseconds.toFixed(1)} ms`);
}

main();
