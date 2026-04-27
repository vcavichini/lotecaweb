import type { ContestData, PrizeTier } from "@/lib/types";
import { getErrorMessage, validateContestNumber } from "@/lib/validation";
import { getAppState, getContest, getLatestContest, saveContest, setAppState } from "@/lib/db";

const GUIDI_API = "https://api.guidi.dev.br/loteria/megasena/";
const PROXY_API = "https://loteriascaixa-api.herokuapp.com/api/megasena/";
const LOTORAMA_LATEST_URL = "https://lotorama.com.br/mega-sena/";
const LOTORAMA_CONTEST_URL = "https://lotorama.com.br/resultado-megasena/";
const CAIXA_API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/";
const API_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 2000;
export const LAST_SUCCESSFUL_SOURCE_KEY = "lottery.last_successful_source";

export type LotterySourceId = "proxy" | "lotorama" | "guidi" | "caixa";

type RetryMode = "json" | "text";

type SourceDefinition = {
  id: LotterySourceId;
  buildUrl: (contestNumber: string) => string;
  fetchContest: (contestNumber: string) => Promise<ContestData>;
};

interface ProxyApiData {
  concurso: number;
  data: string;
  dezenas: string[];
  premiacoes?: Array<{
    descricao: string;
    faixa: number;
    ganhadores: number;
    valorPremio: number;
  }>;
  acumulou: boolean;
  dataProximoConcurso?: string;
  valorEstimadoProximoConcurso?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(url: string, mode: RetryMode): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchResource<T>(url, mode);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[lottery] fetch attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${url}, retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function fetchResource<T>(url: string, mode: RetryMode): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: mode === "json" ? "application/json" : "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; loteca/1.0; +https://newloteca.botlab.dev.br/)",
      },
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    if (mode === "json") {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeContestData(data: ContestData): ContestData {
  return {
    ...data,
    numero: Number(data.numero),
    dataApuracao: String(data.dataApuracao ?? "").trim(),
    dataProximoConcurso: data.dataProximoConcurso ?? null,
    valorEstimadoProximoConcurso: Number(data.valorEstimadoProximoConcurso ?? 0),
    listaRateioPremio: Array.isArray(data.listaRateioPremio) ? data.listaRateioPremio : [],
    listaDezenas: Array.isArray(data.listaDezenas) ? data.listaDezenas.map(formatDezena) : [],
    acumulado: Boolean(data.acumulado),
  };
}

function normalizeProxyApiData(data: ProxyApiData): ContestData {
  return normalizeContestData({
    numero: data.concurso,
    dataApuracao: data.data,
    listaDezenas: data.dezenas,
    listaRateioPremio: data.premiacoes?.map((p) => ({
      descricaoFaixa: p.descricao,
      numeroDeGanhadores: Number(p.ganhadores ?? 0),
      valorPremio: Number(p.valorPremio ?? 0),
    })) ?? [],
    acumulado: data.acumulou,
    dataProximoConcurso: data.dataProximoConcurso ?? null,
    valorEstimadoProximoConcurso: data.valorEstimadoProximoConcurso ?? 0,
  });
}

function formatDezena(value: string | number): string {
  return String(value).trim().padStart(2, "0");
}

function parseMoneyValue(raw: string | null | undefined): number {
  if (!raw) return 0;
  const normalized = raw
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "")
    .trim();

  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseIntegerValue(raw: string | null | undefined): number {
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(/[^\d-]/g, "").trim();
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : 0;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&aacute;/gi, "á")
    .replace(/&Aacute;/g, "Á")
    .replace(/&atilde;/gi, "ã")
    .replace(/&Atilde;/g, "Ã")
    .replace(/&acirc;/gi, "â")
    .replace(/&Acirc;/g, "Â")
    .replace(/&eacute;/gi, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&Ecirc;/g, "Ê")
    .replace(/&iacute;/gi, "í")
    .replace(/&Iacute;/g, "Í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&Ocirc;/g, "Ô")
    .replace(/&otilde;/gi, "õ")
    .replace(/&Otilde;/g, "Õ")
    .replace(/&uacute;/gi, "ú")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&ordm;/gi, "º")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVisibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/section>/gi, "\n")
      .replace(/<\/article>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, " ")
      .replace(/<\/th>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\t/g, " ")
      .replace(/ +/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim(),
  );
}

function extractRegexValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function extractLotoramaSectionHtml(html: string, heading: string): string | null {
  const pattern = new RegExp(
    `<h[1-6][^>]*>\\s*${heading}\\s*<\\/h[1-6]>([\\s\\S]*?)(?:<h[1-6]\\b|<table\\b|<section\\b|<article\\b|<main\\b|<footer\\b)`,
    "i",
  );
  return html.match(pattern)?.[1] ?? null;
}

function extractLotoramaPrizeTiers(html: string, text: string): PrizeTier[] {
  const tiers: PrizeTier[] = [];

  for (const row of Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
    const cells = Array.from(row[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)).map((cell) => stripTags(cell[2]));
    if (cells.length < 3) continue;

    const [descricaoFaixa, ganhadoresRaw, premioRaw] = cells;
    if (/faixa|ganhadores|valor/i.test(`${descricaoFaixa} ${ganhadoresRaw} ${premioRaw}`)) continue;
    if (!descricaoFaixa || !/R\$/i.test(premioRaw)) continue;

    tiers.push({
      descricaoFaixa,
      numeroDeGanhadores: parseIntegerValue(ganhadoresRaw),
      valorPremio: parseMoneyValue(premioRaw),
    });
  }

  if (tiers.length > 0) {
    return tiers;
  }

  const markdownRows = Array.from(
    text.matchAll(/\|\s*([^|\n]+?)\s*\|\s*([\d.]+)\s*\|\s*(R\$\s*[\d.,]+)\s*\|/g),
  );

  return markdownRows
    .map((match) => ({
      descricaoFaixa: match[1].trim(),
      numeroDeGanhadores: parseIntegerValue(match[2]),
      valorPremio: parseMoneyValue(match[3]),
    }))
    .filter((tier) => tier.descricaoFaixa.length > 0);
}

function extractLotoramaDezenas(text: string): string[] {
  const dezenas = Array.from(text.matchAll(/\b(\d{1,2})\b/g)).map((match) => formatDezena(match[1]));
  if (dezenas.length !== 6) {
    return [];
  }

  return new Set(dezenas).size === 6 ? dezenas : [];
}

function extractLotoramaDezenasFromHtml(html: string, text: string): string[] {
  const sectionHtml = extractLotoramaSectionHtml(html, "N[úu]meros Sorteados");

  if (sectionHtml) {
    const candidates = Array.from(
      sectionHtml.matchAll(/<(?:p|li|div|span)[^>]*>([\s\S]*?)<\/(?:p|li|div|span)>/gi),
      (match) => extractLotoramaDezenas(stripTags(match[1])),
    ).filter((candidate) => candidate.length === 6);

    const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.join(","), candidate])).values());

    if (uniqueCandidates.length === 1) {
      return uniqueCandidates[0];
    }

    if (uniqueCandidates.length > 1) {
      return [];
    }

    return extractLotoramaDezenas(stripTags(sectionHtml));
  }

  const sectionMatch = text.match(
    /N[úu]meros Sorteados([\s\S]*?)(?:Premia[çc][ãa]o|Estimativa|Pr[óo]ximo sorteio|Sorteio realizado|Resultados anteriores|Como Jogar|O que é a Mega-Sena)/i,
  );
  if (!sectionMatch?.[1]) {
    return [];
  }

  return extractLotoramaDezenas(sectionMatch[1]);
}

function parseLotoramaHtml(html: string, contestNumber: string): ContestData {
  const text = normalizeVisibleText(html);
  const numero = Number(extractRegexValue(text, [
    /Resultado da MEGA-SENA concurso\s*(\d{1,4})/i,
    /Último Resultado:\s*Concurso\s*N[ºo]?\s*(\d{1,4})/i,
    /Concurso\s*(?:N[ºo]\s*)?(\d{1,4})/i,
  ]) ?? 0);
  const dataApuracao = extractRegexValue(text, [
    /Resultado da MEGA-SENA concurso\s*\d{1,4}\s*dia\s*(\d{2}\/\d{2}\/\d{4})/i,
    /Último Resultado:\s*Concurso\s*N[ºo]?\s*\d{1,4}\s*\((\d{2}\/\d{2}\/\d{4})\)/i,
    /Sorteio realizado no dia\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]) ?? "";

  if (contestNumber !== "" && Number(contestNumber) !== numero) {
    throw new Error(`contest mismatch expected=${contestNumber} got=${numero}`);
  }

  const acumulado = /ACUMULOU!?/i.test(text) || /Status:\s*ACUMULOU!?/i.test(text);
  const dataProximoConcurso = extractRegexValue(text, [
    /Pr[óo]ximo sorteio:\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]);

  const valorEstimadoRaw = extractRegexValue(text, [
    /Estimativa(?: para o pr[óo]ximo pr[êe]mio| de pr[êe]mio do pr[óo]ximo concurso)?\s*R\$\s*([\d.,]+)/i,
  ]);

  const normalized = normalizeContestData({
    numero,
    dataApuracao,
    listaDezenas: extractLotoramaDezenasFromHtml(html, text),
    listaRateioPremio: extractLotoramaPrizeTiers(html, text),
    acumulado,
    dataProximoConcurso: dataProximoConcurso ?? null,
    valorEstimadoProximoConcurso: parseMoneyValue(valorEstimadoRaw),
  });

  return validateContestDataOrThrow(normalized);
}

function validateContestDataOrThrow(data: ContestData): ContestData {
  if (!data || typeof data !== "object") {
    throw new Error("invalid payload: empty object");
  }

  if (!Number.isInteger(data.numero) || data.numero <= 0) {
    throw new Error(`invalid payload: numero=${data.numero}`);
  }

  if (!data.dataApuracao) {
    throw new Error("invalid payload: dataApuracao missing");
  }

  if (!Array.isArray(data.listaDezenas) || data.listaDezenas.length !== 6) {
    throw new Error(`invalid payload: listaDezenas=${Array.isArray(data.listaDezenas) ? data.listaDezenas.length : "null"}`);
  }

  if (new Set(data.listaDezenas).size !== 6) {
    throw new Error("invalid payload: duplicate dezenas");
  }

  if (!Array.isArray(data.listaRateioPremio)) {
    throw new Error("invalid payload: listaRateioPremio must be an array");
  }

  return normalizeContestData(data);
}

function buildGuidiUrl(contestNumber: string): string {
  return contestNumber === "" ? `${GUIDI_API}ultimo` : `${GUIDI_API}${contestNumber}`;
}

function buildProxyUrl(contestNumber: string): string {
  return contestNumber === "" ? `${PROXY_API}latest` : `${PROXY_API}${contestNumber}`;
}

function buildLotoramaUrl(contestNumber: string): string {
  return contestNumber === "" ? LOTORAMA_LATEST_URL : `${LOTORAMA_CONTEST_URL}${contestNumber}/`;
}

function buildCaixaUrl(contestNumber: string): string {
  return contestNumber === "" ? CAIXA_API : `${CAIXA_API}${contestNumber}`;
}

async function fetchFromGuidi(contestNumber: string): Promise<ContestData> {
  return validateContestDataOrThrow(normalizeContestData(await fetchWithRetry<ContestData>(buildGuidiUrl(contestNumber), "json")));
}

async function fetchFromProxy(contestNumber: string): Promise<ContestData> {
  return validateContestDataOrThrow(normalizeProxyApiData(await fetchWithRetry<ProxyApiData>(buildProxyUrl(contestNumber), "json")));
}

async function fetchFromLotorama(contestNumber: string): Promise<ContestData> {
  const html = await fetchWithRetry<string>(buildLotoramaUrl(contestNumber), "text");
  return parseLotoramaHtml(html, contestNumber);
}

async function fetchFromCaixa(contestNumber: string): Promise<ContestData> {
  return validateContestDataOrThrow(normalizeContestData(await fetchWithRetry<ContestData>(buildCaixaUrl(contestNumber), "json")));
}

const SOURCE_REGISTRY: SourceDefinition[] = [
  {
    id: "proxy",
    buildUrl: buildProxyUrl,
    fetchContest: fetchFromProxy,
  },
  {
    id: "lotorama",
    buildUrl: buildLotoramaUrl,
    fetchContest: fetchFromLotorama,
  },
  {
    id: "guidi",
    buildUrl: buildGuidiUrl,
    fetchContest: fetchFromGuidi,
  },
  {
    id: "caixa",
    buildUrl: buildCaixaUrl,
    fetchContest: fetchFromCaixa,
  },
];

function normalizeStoredSourceId(rawPreferred: string | null): LotterySourceId | null {
  if (rawPreferred === "scrape") {
    return "lotorama";
  }

  if (rawPreferred === "proxy" || rawPreferred === "lotorama" || rawPreferred === "guidi" || rawPreferred === "caixa") {
    return rawPreferred;
  }

  return null;
}

export function getOrderedSources(): LotterySourceId[] {
  const defaultOrder = SOURCE_REGISTRY.map((source) => source.id);
  const preferred = normalizeStoredSourceId(getAppState(LAST_SUCCESSFUL_SOURCE_KEY));

  if (!preferred) {
    return defaultOrder;
  }

  return [preferred, ...defaultOrder.filter((sourceId) => sourceId !== preferred)];
}

function getOrderedSourceDefinitions(): SourceDefinition[] {
  const order = getOrderedSources();
  return order
    .map((id) => SOURCE_REGISTRY.find((source) => source.id === id))
    .filter((source): source is SourceDefinition => Boolean(source));
}

function logContestSource(strategy: "api-first" | "db-first", source: "api" | "db", contestNumber: string, context: string): void {
  const label = contestNumber === "" ? "latest" : contestNumber;
  console.log(`[lottery] source=${source} strategy=${strategy} contest=${label} ${context}`);
}

export async function fetchContestFromApi(contestNumber = ""): Promise<ContestData> {
  validateContestNumber(contestNumber);

  const contestLabel = contestNumber === "" ? "latest" : contestNumber;
  let lastError: Error | null = null;

  for (const source of getOrderedSourceDefinitions()) {
    console.log(`[lottery] try source=${source.id} contest=${contestLabel} url=${source.buildUrl(contestNumber)}`);

    try {
      const data = await source.fetchContest(contestNumber);
      const persisted = setAppState(LAST_SUCCESSFUL_SOURCE_KEY, source.id);
      console.log(`[lottery] success source=${source.id} contest=${contestLabel} numero=${data.numero} persisted_priority=${persisted}`);
      return data;
    } catch (error) {
      const reason = getErrorMessage(error);
      console.warn(`[lottery] fail source=${source.id} contest=${contestLabel} reason=${reason}`);
      lastError = error instanceof Error ? error : new Error(reason);
    }
  }

  throw lastError ?? new Error("Todas as APIs de loteria estão indisponíveis. Tente novamente mais tarde.");
}

export async function fetchContestData(contestNumber = ""): Promise<ContestData> {
  validateContestNumber(contestNumber);

  if (contestNumber !== "") {
    const num = parseInt(contestNumber, 10);
    const cached = getContest(num);
    if (cached) {
      logContestSource("db-first", "db", contestNumber, "cache=hit");
      return cached;
    }
    logContestSource("db-first", "db", contestNumber, "cache=miss");
  }

  if (contestNumber === "") {
    try {
      const data = await fetchContestFromApi(contestNumber);
      logContestSource("api-first", "api", contestNumber, `numero=${data.numero}`);
      try {
        saveContest(data);
      } catch (error) {
        console.error(`[lottery] Failed to cache contest ${data.numero}:`, error);
      }
      return data;
    } catch {
      const cached = getLatestContest();
      if (cached) {
        logContestSource("api-first", "db", contestNumber, `fallback=api-unavailable numero=${cached.numero}`);
        return cached;
      }
      throw new Error("Todas as APIs de loteria estão indisponíveis. Tente novamente mais tarde.");
    }
  }

  const data = await fetchContestFromApi(contestNumber);
  logContestSource("db-first", "api", contestNumber, `cache=miss numero=${data.numero}`);

  try {
    saveContest(data);
  } catch (error) {
    console.error(`[lottery] Failed to cache contest ${data.numero}:`, error);
  }

  return data;
}

export async function getLatestContestNumber(): Promise<number> {
  const cached = getLatestContest();
  if (cached) {
    return cached.numero;
  }

  const data = await fetchContestFromApi("");
  try {
    saveContest(data);
  } catch {
    // ignore
  }
  return data.numero;
}
