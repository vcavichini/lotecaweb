import { promises as fs } from "node:fs";
import path from "node:path";

import type { BetsConfig } from "./types";
import { validateBetsConfig } from "./validation";

const EMPTY_BETS_CONFIG: BetsConfig = { permanent: [], one_off: {} };

export type BetsRepository = {
  load(): Promise<BetsConfig>;
  save(config: BetsConfig): Promise<void>;
  close?(): void;
};

export function createJsonBetsRepository(
  filePath: string,
  defaults: BetsConfig = EMPTY_BETS_CONFIG,
): BetsRepository {
  return {
    async load(): Promise<BetsConfig> {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw) as BetsConfig;
        validateBetsConfig(parsed);
        return parsed;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return defaults;
        }
        throw error;
      }
    },

    async save(config: BetsConfig): Promise<void> {
      validateBetsConfig(config);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    },
  };
}
