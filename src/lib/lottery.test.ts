import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContestData } from "@/lib/types";

const dbMocks = vi.hoisted(() => ({
  getContest: vi.fn(),
  getLatestContest: vi.fn(),
  saveContest: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import { fetchContestData } from "@/lib/lottery";

function makeContest(numero: number): ContestData {
  return {
    numero,
    dataApuracao: "2026-04-19",
    listaDezenas: ["01", "02", "03", "04", "05", "06"],
    listaRateioPremio: [
      {
        descricaoFaixa: "6 acertos",
        numeroDeGanhadores: 1,
        valorPremio: 1000000,
      },
    ],
    acumulado: false,
    dataProximoConcurso: "2026-04-22",
    valorEstimadoProximoConcurso: 3500000,
  };
}

describe("fetchContestData cache policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    dbMocks.getContest.mockReset();
    dbMocks.getLatestContest.mockReset();
    dbMocks.saveContest.mockReset();
    dbMocks.saveContest.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchContestData('') chama API e salva no cache", async () => {
    const apiData = makeContest(3001);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(apiData),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result).toEqual(apiData);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.guidi.dev.br/loteria/megasena/ultimo", expect.any(Object));
    expect(dbMocks.saveContest).toHaveBeenCalledWith(apiData);
    expect(dbMocks.getLatestContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=api"));
  });

  it("fetchContestData('') com API indisponível e cache disponível retorna fallback do DB", async () => {
    const cachedData = makeContest(3000);
    dbMocks.getLatestContest.mockReturnValue(cachedData);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockRejectedValue(new Error("API offline"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result).toEqual(cachedData);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(dbMocks.getLatestContest).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=db"));
  });

  it("fetchContestData('') com API indisponível e sem cache lança erro", async () => {
    dbMocks.getLatestContest.mockReturnValue(null);

    const fetchMock = vi.fn().mockRejectedValue(new Error("API offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestData(""))
      .rejects
      .toThrow("Todas as APIs de loteria estão indisponíveis. Tente novamente mais tarde.");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(dbMocks.getLatestContest).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContest).not.toHaveBeenCalled();
  });

  it("fetchContestData('N') retorna cache sem chamar API quando existe no DB", async () => {
    const cachedData = makeContest(2999);
    dbMocks.getContest.mockReturnValue(cachedData);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("2999");

    expect(result).toEqual(cachedData);
    expect(dbMocks.getContest).toHaveBeenCalledWith(2999);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbMocks.saveContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=db"));
  });

  it("fetchContestData('N') chama API e salva quando não existe no DB", async () => {
    dbMocks.getContest.mockReturnValue(null);
    const apiData = makeContest(2998);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(apiData),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("2998");

    expect(result).toEqual(apiData);
    expect(dbMocks.getContest).toHaveBeenCalledWith(2998);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.guidi.dev.br/loteria/megasena/2998", expect.any(Object));
    expect(dbMocks.saveContest).toHaveBeenCalledWith(apiData);

    const logMessages = logSpy.mock.calls.map(([message]) => String(message));
    expect(logMessages.some((message) => message.includes("source=db"))).toBe(true);
    expect(logMessages.some((message) => message.includes("source=api"))).toBe(true);
  });
});
