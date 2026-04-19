import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getBetsFilePath, saveBets } from "@/lib/bets";
import { getCheckerDefaultBetsFilePath, loadCheckerBets } from "@/lib/checker-bets";
import type { BetsConfig } from "@/lib/types";

const originalCwd = process.cwd();

const config: BetsConfig = {
  permanent: [["01", "02", "03", "04", "05", "06"]],
  one_off: {
    "3000": [["10", "20", "30", "40", "50", "60"]],
  },
};

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.LOTECA_BETS_FILE;
});

describe("web + checker shared bets source", () => {
  it("web and checker default to the same canonical bets.json", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "loteca-shared-bets-"));
    process.chdir(tempDir);

    await saveBets(config);

    const webPath = getBetsFilePath();
    const checkerPath = getCheckerDefaultBetsFilePath(tempDir, {});
    const checkerBets = loadCheckerBets(3000, checkerPath);

    expect(webPath).toBe(path.join(tempDir, "bets.json"));
    expect(checkerPath).toBe(webPath);
    expect(checkerBets).toEqual([
      ["01", "02", "03", "04", "05", "06"],
      ["10", "20", "30", "40", "50", "60"],
    ]);
  });
});
