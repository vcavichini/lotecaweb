import { promises as fs } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { BetsConfig } from "./types";
import { validateBetsConfig } from "./validation";

const EMPTY_BETS_CONFIG: BetsConfig = { permanent: [], one_off: {} };

type BetsRow = {
  permanent: string;
  one_off: string;
};

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

export function createDbBetsRepository(dbPath: string): BetsRepository {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      permanent TEXT NOT NULL,
      one_off TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return {
    async load(): Promise<BetsConfig> {
      const row = db
        .prepare("SELECT permanent, one_off FROM bets WHERE id = 1")
        .get() as BetsRow | undefined;

      if (!row) {
        return EMPTY_BETS_CONFIG;
      }

      let config: BetsConfig;
      try {
        config = {
          permanent: JSON.parse(row.permanent) as string[][],
          one_off: JSON.parse(row.one_off) as Record<string, string[][]>,
        };
      } catch (error) {
        throw new Error(`invalid bets data in database: ${(error as Error).message}`);
      }

      validateBetsConfig(config);
      return config;
    },

    async save(config: BetsConfig): Promise<void> {
      validateBetsConfig(config);

      db.prepare(`
        INSERT INTO bets (id, permanent, one_off, version, created_at, updated_at)
        VALUES (1, ?, ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          permanent = excluded.permanent,
          one_off = excluded.one_off,
          updated_at = datetime('now')
      `).run(JSON.stringify(config.permanent), JSON.stringify(config.one_off));
    },

    close(): void {
      db.close();
    },
  };
}
