import path from "node:path";

export type BetsPathOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export function resolveBetsFilePath(options: BetsPathOptions = {}): string {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  if (env.LOTECA_BETS_FILE) {
    return path.resolve(env.LOTECA_BETS_FILE);
  }

  return path.resolve(cwd, "bets.json");
}
