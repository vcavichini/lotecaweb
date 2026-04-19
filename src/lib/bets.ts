import type { BetsConfig } from "./types";
import { createJsonBetsRepository } from "./bets-repository";
import { resolveBetsFilePath } from "./bets-path";

const defaultConfig: BetsConfig = {
  permanent: [],
  one_off: {},
};

export function getBetsFilePath(): string {
  return resolveBetsFilePath();
}

export async function loadBets(): Promise<BetsConfig> {
  const repository = createJsonBetsRepository(getBetsFilePath(), defaultConfig);
  return repository.load();
}

export async function saveBets(config: BetsConfig): Promise<void> {
  const repository = createJsonBetsRepository(getBetsFilePath(), defaultConfig);
  await repository.save(config);
}

export function getBetsForContest(config: BetsConfig, contestNumber: number): string[][] {
  return [...config.permanent, ...(config.one_off[String(contestNumber)] ?? [])];
}
