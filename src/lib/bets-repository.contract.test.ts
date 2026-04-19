import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  type BetsRepository,
  createDbBetsRepository,
  createJsonBetsRepository,
} from "@/lib/bets-repository";
import type { BetsConfig } from "@/lib/types";

const sampleConfig: BetsConfig = {
  permanent: [["01", "02", "03", "04", "05", "06"]],
  one_off: {
    "2999": [["10", "20", "30", "40", "50", "60"]],
  },
};

const repositoriesToCleanup: BetsRepository[] = [];

afterEach(() => {
  while (repositoriesToCleanup.length > 0) {
    repositoriesToCleanup.pop()?.close?.();
  }
});

function runRepositoryContract(
  name: string,
  createRepository: () => { repository: BetsRepository; mutateToInvalid: () => void },
): void {
  describe(name, () => {
    it("returns empty defaults when no data exists", async () => {
      const { repository } = createRepository();
      repositoriesToCleanup.push(repository);

      await expect(repository.load()).resolves.toEqual({ permanent: [], one_off: {} });
    });

    it("persists and loads bets roundtrip", async () => {
      const { repository } = createRepository();
      repositoriesToCleanup.push(repository);

      await repository.save(sampleConfig);
      await expect(repository.load()).resolves.toEqual(sampleConfig);
    });

    it("throws for invalid underlying stored data", async () => {
      const { repository, mutateToInvalid } = createRepository();
      repositoriesToCleanup.push(repository);

      mutateToInvalid();

      await expect(repository.load()).rejects.toThrow();
    });
  });
}

runRepositoryContract("json repository contract", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-json-repo-"));
  const filePath = path.join(tempDir, "bets.json");

  return {
    repository: createJsonBetsRepository(filePath),
    mutateToInvalid: () => {
      writeFileSync(filePath, "{oops", "utf-8");
    },
  };
});

runRepositoryContract("db repository contract", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-db-repo-"));
  const dbPath = path.join(tempDir, "loteca.db");
  const repository = createDbBetsRepository(dbPath);

  return {
    repository,
    mutateToInvalid: () => {
      const db = new Database(dbPath);
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
      db.prepare(`
        INSERT INTO bets (id, permanent, one_off, version, created_at, updated_at)
        VALUES (1, ?, ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          permanent = excluded.permanent,
          one_off = excluded.one_off,
          updated_at = datetime('now')
      `).run("not-json", "{}");
      db.close();
    },
  };
});
