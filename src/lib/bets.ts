import { existsSync } from "node:fs";

import { getBets as dbGetBets, saveBets as dbSaveBets } from "./db";
import { resolveBetsFilePath } from "./bets-path";
import { createJsonBetsRepository } from "./bets-repository";
import type { BetsConfig } from "./types";
import { validateBetsConfig } from "./validation";

const defaultConfig: BetsConfig = {
  permanent: [],
  one_off: {},
};

export async function loadBets(): Promise<BetsConfig> {
  // DB is the canonical source
  const stored = dbGetBets();
  if (stored !== null) return stored;

  // DB row doesn't exist yet — check for bets.json to auto-migrate
  const filePath = resolveBetsFilePath();
  if (existsSync(filePath)) {
    const config = await createJsonBetsRepository(filePath, defaultConfig).load();
    const ok = dbSaveBets(config);
    if (ok) {
      console.log("[bets] migrated bets.json → SQLite");
    }
    return config;
  }

  return defaultConfig;
}

export async function saveBets(config: BetsConfig): Promise<void> {
  validateBetsConfig(config);
  const ok = dbSaveBets(config);
  if (!ok) throw new Error("failed to save bets to database");
}

export function getBetsForContest(config: BetsConfig, contestNumber: number): string[][] {
  return [...config.permanent, ...(config.one_off[String(contestNumber)] ?? [])];
}
