import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getBetsFilePath, loadBets, saveBets } from "@/lib/bets";
import { resolveBetsFilePath } from "@/lib/bets-path";
import type { BetsConfig } from "@/lib/types";

const originalCwd = process.cwd();

const sampleConfig: BetsConfig = {
  permanent: [["01", "02", "03", "04", "05", "06"]],
  one_off: {
    "2999": [["10", "20", "30", "40", "50", "60"]],
  },
};

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.LOTECA_BETS_FILE;
});

describe("bets file path + persistence", () => {
  it("resolves canonical bets.json in cwd by default", () => {
    const cwd = "/tmp/loteca-tests";

    const resolved = resolveBetsFilePath({ cwd, env: {} });

    expect(resolved).toBe(path.resolve(cwd, "bets.json"));
  });

  it("saveBets/loadBets roundtrip on canonical file", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-bets-"));
    process.chdir(tempDir);

    await saveBets(sampleConfig);
    const loaded = await loadBets();

    expect(getBetsFilePath()).toBe(path.join(tempDir, "bets.json"));
    expect(loaded).toEqual(sampleConfig);
  });

  it("throws when canonical bets file is invalid", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-bets-invalid-"));
    process.chdir(tempDir);

    writeFileSync(path.join(tempDir, "bets.json"), "{invalid-json", "utf-8");

    await expect(loadBets()).rejects.toThrow();
  });
});
