import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      {
        descricaoFaixa: "Sena",
        numeroDeGanhadores: 0,
        valorPremio: 0,
      },
      {
        descricaoFaixa: "Quina",
        numeroDeGanhadores: 65,
        valorPremio: 64627.76,
      },
      {
        descricaoFaixa: "Quadra",
        numeroDeGanhadores: 5255,
        valorPremio: 1317.67,
      },
    ],
    acumulado: true,
    dataProximoConcurso: "28/04/2026",
    valorEstimadoProximoConcurso: 115000000,
  };
}

function makeJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn(),
  };
}

function makeHtmlResponse(html: string) {
  return {
    ok: true,
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(html),
  };
}

function makeStatusResponse(status: number) {
  return {
    ok: false,
    status,
    json: vi.fn(),
    text: vi.fn(),
  };
}

function makeLotoramaHtml(overrides?: Partial<ContestData>): string {
  const contest = { ...makeContest(3000), ...overrides };
  const dezenas = contest.listaDezenas.join("  ");

  return `
    <html>
      <body>
        <main>
          <h1>Resultado da MEGA-SENA concurso ${contest.numero} dia ${contest.dataApuracao}</h1>
          <h2>Números Sorteados</h2>
          <p>${dezenas}</p>
          <p>${contest.acumulado ? "ACUMULOU!" : "Não acumulou"}</p>
          <p>Estimativa de prêmio do próximo concurso</p>
          <p>R$ 115.000.000,00</p>
          <p>Próximo sorteio: ${contest.dataProximoConcurso}</p>
          <h2>Premiação</h2>
          <table>
            <thead>
              <tr>
                <th>Faixa de premiação</th>
                <th>Nº de ganhadores</th>
                <th>Valor do prêmio</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Sena</td><td>0</td><td>R$ 0,00</td></tr>
              <tr><td>Quina</td><td>65</td><td>R$ 64.627,76</td></tr>
              <tr><td>Quadra</td><td>5.255</td><td>R$ 1.317,67</td></tr>
            </tbody>
          </table>
          <p>Sorteio realizado no dia <strong>${contest.dataApuracao}</strong> em SÃO PAULO, SP</p>
        </main>
      </body>
    </html>
  `;
}

function makeLotoramaHtmlWithNoisyNumbers(): string {
  return makeLotoramaHtml().replace(
    "<p>22  23  36  40  52  60</p>",
    "<p>22  23  36  40  52  60</p><p>Bolão 01 02 03 04 05 06</p>",
  );
}

function makeLotoramaHtmlWithoutDrawDate(): string {
  return makeLotoramaHtml()
    .replace("Resultado da MEGA-SENA concurso 3000 dia 25/04/2026", "Resultado da MEGA-SENA concurso 3000")
    .replace("<p>Sorteio realizado no dia <strong>25/04/2026</strong> em SÃO PAULO, SP</p>", "");
}

function makeLotoramaMarkdownText(overrides?: Partial<ContestData>): string {
  const contest = {
    ...makeContest(3001),
    numero: 3001,
    dataApuracao: "28/04/2026",
    listaDezenas: ["01", "13", "32", "36", "43", "60"],
    listaRateioPremio: [
      { descricaoFaixa: "Sena", numeroDeGanhadores: 0, valorPremio: 0 },
      { descricaoFaixa: "Quina", numeroDeGanhadores: 92, valorPremio: 41209.18 },
      { descricaoFaixa: "Quadra", numeroDeGanhadores: 5877, valorPremio: 1063.34 },
    ],
    acumulado: true,
    dataProximoConcurso: "30/04/2026",
    valorEstimadoProximoConcurso: 130000000,
    ...overrides,
  };

  return [
    `# Resultado da MEGA-SENA concurso ${contest.numero} dia ${contest.dataApuracao}`,
    "## Números Sorteados",
    contest.listaDezenas.join("  "),
    contest.acumulado ? "**ACUMULOU!**" : "**NÃO ACUMULOU!**",
    "Estimativa de prêmio do próximo concurso",
    `R$ ${contest.valorEstimadoProximoConcurso.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Próximo sorteio: ${contest.dataProximoConcurso}`,
    "## Premiação",
    "| Sena | 0 | R$ 0,00 |",
    "| Quina | 92 | R$ 41.209,18 |",
    "| Quadra | 5877 | R$ 1.063,34 |",
    `Sorteio realizado no dia **${contest.dataApuracao}** em SÃO PAULO, SP`,
  ].join("\n");
}

describe("Mega-Sena source priority", () => {
  beforeEach(() => {
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

    vi.stubGlobal("setTimeout", ((callback: TimerHandler) => {
      if (typeof callback === "function") callback();
      return 0;
    }) as typeof setTimeout);
    vi.stubGlobal("clearTimeout", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the planned default order when there is no history", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeHtmlResponse(makeLotoramaHtml({ numero: 3000 })));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestFromApi("");

    expect(result.numero).toBe(3000);
    expect(getOrderedSources()).toEqual(["proxy", "lotorama", "guidi", "caixa"]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://loteriascaixa-api.herokuapp.com/api/megasena/latest",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://lotorama.com.br/mega-sena/",
      expect.any(Object),
    );
  });

  it("moves the last successful source to the front on the next run", async () => {
    dbMocks.getAppState.mockReturnValue("guidi");
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse(makeContest(3002)));

    vi.stubGlobal("fetch", fetchMock);

    await fetchContestFromApi("");

    expect(getOrderedSources()).toEqual(["guidi", "proxy", "lotorama", "caixa"]);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.guidi.dev.br/loteria/megasena/ultimo",
      expect.any(Object),
    );
  });

  it("maps the legacy scrape source id to lotorama ordering", () => {
    dbMocks.getAppState.mockReturnValue("scrape");

    expect(getOrderedSources()).toEqual(["lotorama", "proxy", "guidi", "caixa"]);
  });

  it("falls through to the next sources in order when the preferred source fails", async () => {
    dbMocks.getAppState.mockReturnValue("proxy");
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("proxy offline"))
      .mockRejectedValueOnce(new Error("proxy offline"))
      .mockRejectedValueOnce(new Error("proxy offline"))
      .mockResolvedValueOnce(makeHtmlResponse(makeLotoramaHtml({ numero: 3003 })));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestFromApi("");

    expect(result.numero).toBe(3003);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://loteriascaixa-api.herokuapp.com/api/megasena/latest",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://lotorama.com.br/mega-sena/",
      expect.any(Object),
    );
    expect(dbMocks.setAppState).toHaveBeenCalledWith(LAST_SUCCESSFUL_SOURCE_KEY, "lotorama");
  });

  it("keeps checking later sources on latest fetch when the preferred source is stale", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse(makeContest(3000)))
      .mockResolvedValueOnce(makeHtmlResponse(makeLotoramaMarkdownText({ numero: 3001 })))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestFromApi("");

    expect(result.numero).toBe(3001);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://loteriascaixa-api.herokuapp.com/api/megasena/latest",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://lotorama.com.br/mega-sena/",
      expect.any(Object),
    );
    expect(dbMocks.setAppState).toHaveBeenCalledWith(LAST_SUCCESSFUL_SOURCE_KEY, "lotorama");
  });

  it("persists the winning source after a validated success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({
      concurso: 3004,
      data: "25/04/2026",
      dezenas: ["22", "23", "36", "40", "52", "60"],
      premiacoes: [],
      acumulou: true,
      dataProximoConcurso: "28/04/2026",
      valorEstimadoProximoConcurso: 115000000,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchContestFromApi("");

    expect(dbMocks.setAppState).toHaveBeenCalledWith(LAST_SUCCESSFUL_SOURCE_KEY, "proxy");
  });

  it("does not persist a source when the payload is invalid", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({
        concurso: 3005,
        data: "25/04/2026",
        dezenas: ["22", "23", "36"],
        premiacoes: [],
        acumulou: false,
        dataProximoConcurso: "28/04/2026",
        valorEstimadoProximoConcurso: 115000000,
      }))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi(""))
      .rejects
      .toThrow(/status 503/);

    expect(dbMocks.setAppState).not.toHaveBeenCalled();
  });

  it("fails closed when the Lotorama numbers section contains extra numeric content", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    dbMocks.getAppState.mockReturnValue("lotorama");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeHtmlResponse(makeLotoramaHtmlWithNoisyNumbers()))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi(""))
      .rejects
      .toThrow(/status 503/);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail source=lotorama contest=latest reason=invalid payload: listaDezenas=0"));
    expect(dbMocks.setAppState).not.toHaveBeenCalledWith(LAST_SUCCESSFUL_SOURCE_KEY, "lotorama");
  });

  it("fails when the Lotorama draw date is missing instead of using the next-draw date", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    dbMocks.getAppState.mockReturnValue("lotorama");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeHtmlResponse(makeLotoramaHtmlWithoutDrawDate()))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi(""))
      .rejects
      .toThrow(/status 503/);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail source=lotorama contest=latest reason=invalid payload: dataApuracao missing"));
    expect(dbMocks.setAppState).not.toHaveBeenCalledWith(LAST_SUCCESSFUL_SOURCE_KEY, "lotorama");
  });
});

describe("contest mismatch and resilience", () => {
  beforeEach(() => {
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

    vi.stubGlobal("setTimeout", ((callback: TimerHandler) => {
      if (typeof callback === "function") callback();
      return 0;
    }) as typeof setTimeout);
    vi.stubGlobal("clearTimeout", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects proxy API data when contest number does not match request", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    dbMocks.getAppState.mockReturnValue("proxy");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse({
        concurso: 3000,
        data: "25/04/2026",
        dezenas: ["22", "23", "36", "40", "52", "60"],
        premiacoes: [],
        acumulou: true,
      }))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi("3001")).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail source=proxy contest=3001 reason=contest mismatch expected=3001 got=3000"));
  });

  it("detects Cloudflare challenge HTML and fails fast", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    dbMocks.getAppState.mockReturnValue("lotorama");
    const challengeHtml = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt = {};</script></body></html>';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeHtmlResponse(challengeHtml))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503))
      .mockResolvedValueOnce(makeStatusResponse(503));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContestFromApi(""))
      .rejects
      .toThrow(/status 503/);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Cloudflare challenge detected"));
  });

  it("prefers cached data when API returns older contest number", async () => {
    const cachedData = makeContest(3001);
    dbMocks.getLatestContest.mockReturnValue(cachedData);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({
      concurso: 3000,
      data: "25/04/2026",
      dezenas: ["22", "23", "36", "40", "52", "60"],
      premiacoes: [],
      acumulou: true,
      dataProximoConcurso: "28/04/2026",
      valorEstimadoProximoConcurso: 115000000,
    }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result.numero).toBe(3001);
    expect(dbMocks.getLatestContest).toHaveBeenCalled();
  });
});

describe("fetchContestData cache policy", () => {
  beforeEach(() => {
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

    vi.stubGlobal("setTimeout", ((callback: TimerHandler) => {
      if (typeof callback === "function") callback();
      return 0;
    }) as typeof setTimeout);
    vi.stubGlobal("clearTimeout", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchContestData('') calls the shared API pipeline and saves to cache", async () => {
    const apiData = makeContest(3001);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({
      concurso: 3001,
      data: "25/04/2026",
      dezenas: ["22", "23", "36", "40", "52", "60"],
      premiacoes: [
        { descricao: "Sena", faixa: 1, ganhadores: 0, valorPremio: 0 },
      ],
      acumulou: true,
      dataProximoConcurso: "28/04/2026",
      valorEstimadoProximoConcurso: 115000000,
    }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result).toEqual({
      ...apiData,
      listaRateioPremio: [
        { descricaoFaixa: "Sena", numeroDeGanhadores: 0, valorPremio: 0 },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith("https://loteriascaixa-api.herokuapp.com/api/megasena/latest", expect.any(Object));
    expect(dbMocks.saveContest).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=api"));
  });

  it("latest contest still falls back to cached DB result if all sources fail", async () => {
    const cachedData = makeContest(3000);
    dbMocks.getLatestContest.mockReturnValue(cachedData);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockRejectedValue(new Error("API offline"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("");

    expect(result).toEqual(cachedData);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(dbMocks.getLatestContest).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("source=db"));
  });

  it("specific contest path remains DB-first and API second", async () => {
    dbMocks.getContest.mockReturnValue(null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue(makeHtmlResponse(makeLotoramaHtml({ numero: 2998 })));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestData("2998");

    expect(result.numero).toBe(2998);
    expect(result.listaRateioPremio).toEqual([
      { descricaoFaixa: "Sena", numeroDeGanhadores: 0, valorPremio: 0 },
      { descricaoFaixa: "Quina", numeroDeGanhadores: 65, valorPremio: 64627.76 },
      { descricaoFaixa: "Quadra", numeroDeGanhadores: 5255, valorPremio: 1317.67 },
    ]);
    expect(dbMocks.getContest).toHaveBeenCalledWith(2998);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://lotorama.com.br/resultado-megasena/2998/",
      expect.any(Object),
    );
    expect(dbMocks.saveContest).toHaveBeenCalled();

    const logMessages = logSpy.mock.calls.map(([message]) => String(message));
    expect(logMessages.some((message) => message.includes("source=db"))).toBe(true);
    expect(logMessages.some((message) => message.includes("source=api"))).toBe(true);
  });

  it("specific contest path returns cache without calling the API when present", async () => {
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

  it("parses markdown-like Lotorama contest pages for specific contests", async () => {
    dbMocks.getAppState.mockReturnValue("lotorama");
    const fetchMock = vi.fn().mockResolvedValueOnce(makeHtmlResponse(makeLotoramaMarkdownText()));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContestFromApi("3001");

    expect(result).toEqual({
      numero: 3001,
      dataApuracao: "28/04/2026",
      listaDezenas: ["01", "13", "32", "36", "43", "60"],
      listaRateioPremio: [
        { descricaoFaixa: "Sena", numeroDeGanhadores: 0, valorPremio: 0 },
        { descricaoFaixa: "Quina", numeroDeGanhadores: 92, valorPremio: 41209.18 },
        { descricaoFaixa: "Quadra", numeroDeGanhadores: 5877, valorPremio: 1063.34 },
      ],
      acumulado: true,
      dataProximoConcurso: "30/04/2026",
      valorEstimadoProximoConcurso: 130000000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://lotorama.com.br/resultado-megasena/3001/",
      expect.any(Object),
    );
  });
});

describe("checker integration", () => {
  it("uses the shared lottery fetch pipeline from src/lib/lottery", () => {
    const checkerSource = readFileSync(resolve(__dirname, "../../scripts/loteca-checker.ts"), "utf-8");

    expect(checkerSource).toContain('import { fetchContestFromApi } from "../src/lib/lottery";');
    expect(checkerSource).toContain("contestData = await fetchContestFromApi();");
  });
});
