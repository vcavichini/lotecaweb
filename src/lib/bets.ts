import { promises as fs } from "node:fs";
import path from "node:path";

import type { BetsConfig } from "@/lib/types";
import { validateBetsConfig } from "@/lib/validation";

const defaultConfig: BetsConfig = {
  permanent: [],
  one_off: {},
};

function getBetsFilePath(): string {
  return path.resolve(process.cwd(), "bets.json");
}

export async function loadBets(): Promise<BetsConfig> {
  const filePath = getBetsFilePath();

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BetsConfig;
    validateBetsConfig(parsed);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig;
    }
    throw error;
  }
}

export async function saveBets(config: BetsConfig): Promise<void> {
  validateBetsConfig(config);
  await fs.writeFile(getBetsFilePath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function getBetsForContest(config: BetsConfig, contestNumber: number): string[][] {
  return [...config.permanent, ...(config.one_off[String(contestNumber)] ?? [])];
}
