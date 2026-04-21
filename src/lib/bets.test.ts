import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadBets, saveBets, getBetsForContest } from "@/lib/bets";
import { closeDb } from "@/lib/db";
import type { BetsConfig } from "@/lib/types";

const sampleConfig: BetsConfig = {
  permanent: [["01", "02", "03", "04", "05", "06"]],
  one_off: {
    "2999": [["10", "20", "30", "40", "50", "60"]],
  },
};

function useTempDb(): void {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-bets-test-"));
  process.env.LOTECA_DB_PATH = path.join(tempDir, "loteca.db");
  // Point at a non-existent file so auto-migration never picks up the real bets.json
  process.env.LOTECA_BETS_FILE = path.join(tempDir, "bets.json");
}

afterEach(() => {
  closeDb();
  delete process.env.LOTECA_DB_PATH;
  delete process.env.LOTECA_BETS_FILE;
});

describe("bets DB persistence", () => {
  it("returns empty defaults when no bets are stored", async () => {
    useTempDb();

    const loaded = await loadBets();

    expect(loaded).toEqual({ permanent: [], one_off: {} });
  });

  it("saveBets/loadBets roundtrip", async () => {
    useTempDb();

    await saveBets(sampleConfig);
    const loaded = await loadBets();

    expect(loaded).toEqual(sampleConfig);
  });

  it("saveBets overwrites previous bets", async () => {
    useTempDb();

    await saveBets(sampleConfig);
    const updated: BetsConfig = { permanent: [["07", "08", "09", "10", "11", "12"]], one_off: {} };
    await saveBets(updated);

    expect(await loadBets()).toEqual(updated);
  });

  it("saveBets throws for invalid config", async () => {
    useTempDb();

    await expect(saveBets({ permanent: [["not", "six", "numbers"]], one_off: {} })).rejects.toThrow();
  });
});

describe("getBetsForContest", () => {
  it("merges permanent and one-off bets for the given contest", () => {
    const result = getBetsForContest(sampleConfig, 2999);

    expect(result).toEqual([
      ["01", "02", "03", "04", "05", "06"],
      ["10", "20", "30", "40", "50", "60"],
    ]);
  });

  it("returns only permanent bets when no one-off for that contest", () => {
    const result = getBetsForContest(sampleConfig, 9999);

    expect(result).toEqual([["01", "02", "03", "04", "05", "06"]]);
  });
});

describe("auto-migration from bets.json", () => {
  it("reads bets.json into DB on first loadBets when DB is empty", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-migrate-test-"));
    process.env.LOTECA_DB_PATH = path.join(tempDir, "loteca.db");
    process.env.LOTECA_BETS_FILE = path.join(tempDir, "bets.json");

    writeFileSync(process.env.LOTECA_BETS_FILE, JSON.stringify(sampleConfig), "utf-8");

    const loaded = await loadBets();
    expect(loaded).toEqual(sampleConfig);

    // Second load comes from DB (not file) — same result
    const loadedAgain = await loadBets();
    expect(loadedAgain).toEqual(sampleConfig);

    delete process.env.LOTECA_BETS_FILE;
  });
});
