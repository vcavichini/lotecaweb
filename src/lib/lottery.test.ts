import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContestData } from "@/lib/types";

const dbMocks = vi.hoisted(() => ({
  getAppState: vi.fn(),
  setAppState: vi.fn(),
  getContest: vi.fn(),
  getLatestContest: vi.fn(),
  saveContest: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  LAST_SUCCESSFUL_SOURCE_KEY,
  fetchContestData,
  fetchContestFromApi,
  getOrderedSources,
} from "@/lib/lottery";

function makeContest(numero: number): ContestData {
  return {
    numero,
    dataApuracao: "25/04/2026",
    listaDezenas: ["22", "23", "36", "40", "52", "60"],
    listaRateioPremio: [
      { descricaoFaixa: "Sena", numeroDeGanhadores: 0, valorPremio: 0 },
      { descricaoFaixa: "Quina", numeroDeGanhadores: 65, valorPremio: 64627.76 },
      { descricaoFaixa: "Quadra", numeroDeGanhadores: 5255, valorPremio: 1317.67 },
    ],
    acumulado: true,
    dataProximoConcurso: "28/04/2026",
    valorEstimadoProximoConcurso: 115000000,
  };
}

function makeJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn(),
    headers: new Headers(),
  };
}

function makeStatusResponse(status: number) {
  return {
    ok: false,
    status,
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(""),
    headers: new Headers(),
  };
}

describe("source ordering", () => {
  it("returns only caixa-worker as available source", () => {
    expect(getOrderedSources()).toEqual(["caixa-worker"]);
  });
});

describe("fetchContestFromApi", () => {
  beforeEach(() => {
    process.env.CAIXA_WORKER_URL = "https://caixa-lottery-proxy.workers.dev";
    vi.restoreAllMocks();
    vi.clearAllMocks();
    dbMocks.getAppState.mockReset();
    dbMocks.setAppState.mockReset();
    dbMocks.saveContest.mockReset();
    dbMocks.getAppState.mockReturnValue(null);
    dbMocks.setAppState.mockReturnValue(true);
    dbMocks.saveContest.mockReturnValue(true);
    vi.stubGlobal(
      "setTimeout",
      ((callback: TimerHandler) => {
        if (typeof callback === "function") callback();
        return 0;
      }) as typeof setTimeout
    );
    vi.stubGlobal("clearTimeout", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches latest contest from caixa-worker and persists source", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse(makeContest(3000)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestFromApi("");

    expect(result.numero).toBe(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://caixa-lottery-proxy.workers.dev/megasena",
      expect.any(Object)
    );
    expect(dbMocks.setAppState).toHaveBeenCalledWith(LAST_SUCCESSFUL_SOURCE_KEY, "caixa-worker");
  });

  it("fetches specific contest from caixa-worker", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse(makeContest(3001)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestFromApi("3001");

    expect(result.numero).toBe(3001);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://caixa-lottery-proxy.workers.dev/megasena/3001",
      expect.any(Object)
    );
  });

  it("rejects when contest number does not match request", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse(makeContest(3000)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi("3001")).rejects.toThrow(/contest mismatch/);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail source=caixa-worker contest=3001"));
  });

  it("retries on transient failure then throws", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi("")).rejects.toThrow(/status 503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchContestData cache policy", () => {
  beforeEach(() => {
    process.env.CAIXA_WORKER_URL = "https://caixa-lottery-proxy.workers.dev";
    vi.restoreAllMocks();
    vi.clearAllMocks();
    dbMocks.getAppState.mockReset();
    dbMocks.setAppState.mockReset();
    dbMocks.getContest.mockReset();
    dbMocks.getLatestContest.mockReset();
    dbMocks.saveContest.mockReset();
    dbMocks.getAppState.mockReturnValue(null);
    dbMocks.setAppState.mockReturnValue(true);
    dbMocks.saveContest.mockReturnValue(true);
    vi.stubGlobal(
      "setTimeout",
      ((callback: TimerHandler) => {
        if (typeof callback === "function") callback();
        return 0;
      }) as typeof setTimeout
    );
    vi.stubGlobal("clearTimeout", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("latest path is API-first, saves to DB, logs source=api", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse(makeContest(3001)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result.numero).toBe(3001);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContest).toHaveBeenCalled();
    expect(dbMocks.getLatestContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=api"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("strategy=api-first"));
  });

  it("latest path falls back to DB when API fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const cachedData = makeContest(3000);
    dbMocks.getLatestContest.mockReturnValue(cachedData);

    const fetchMock = vi.fn().mockRejectedValue(new Error("API offline"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result.numero).toBe(3000);
    expect(dbMocks.getLatestContest).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=db"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("strategy=api-first"));
  });

  it("latest path throws when API and DB both fail", async () => {
    dbMocks.getLatestContest.mockReturnValue(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("API offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestData("")).rejects.toThrow("API offline");
  });

  it("specific contest path returns cache without API when present", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const cachedData = makeContest(2999);
    dbMocks.getContest.mockReturnValue(cachedData);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("2999");

    expect(result).toEqual(cachedData);
    expect(dbMocks.getContest).toHaveBeenCalledWith(2999);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbMocks.saveContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=db"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("strategy=db-first"));
  });

  it("specific contest path calls API on DB miss, saves, logs source=api", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    dbMocks.getContest.mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse(makeContest(2998)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("2998");

    expect(result.numero).toBe(2998);
    expect(dbMocks.getContest).toHaveBeenCalledWith(2998);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContest).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=api"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("strategy=db-first"));
  });

  it("specific contest path throws on API failure when no DB cache exists", async () => {
    dbMocks.getContest.mockReturnValue(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestData("2997")).rejects.toThrow("network error");
  });
});
