import { existsSync, readFileSync } from "node:fs";

import { getBetsForContest } from "./bets";
import { resolveBetsFilePath } from "./bets-path";
import type { BetsConfig } from "./types";
import { validateBetsConfig } from "./validation";

export function getCheckerDefaultBetsFilePath(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  return resolveBetsFilePath({ cwd: projectRoot, env });
}

export function loadCheckerBets(contestNumber: number, betsFilePath: string): string[][] {
  if (!existsSync(betsFilePath)) {
    throw new Error(`bets file not found: ${betsFilePath}`);
  }

  let parsed: BetsConfig;
  try {
    parsed = JSON.parse(readFileSync(betsFilePath, "utf-8")) as BetsConfig;
  } catch (error) {
    throw new Error(`invalid bets file (${betsFilePath}): ${(error as Error).message}`);
  }

  validateBetsConfig(parsed);

  return getBetsForContest(parsed, contestNumber);
}
