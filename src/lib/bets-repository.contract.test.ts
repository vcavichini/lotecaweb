import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type BetsRepository,
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
