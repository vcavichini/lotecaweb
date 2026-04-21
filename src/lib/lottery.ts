import type { ContestData } from "@/lib/types";
import { validateContestNumber } from "@/lib/validation";
import { getContest, getLatestContest, saveContest } from "@/lib/db";

const PRIMARY_API = "https://api.guidi.dev.br/loteria/megasena/";
const FALLBACK_API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/";
// Third-party proxy that works from servers/cloud (bypasses Caixa 403 block)
const PROXY_API = "https://loteriascaixa-api.herokuapp.com/api/megasena/";
const API_TIMEOUT_MS = 10000;

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeContestData(data: ContestData): ContestData {
  return {
    ...data,
    dataProximoConcurso: data.dataProximoConcurso ?? null,
    valorEstimadoProximoConcurso: data.valorEstimadoProximoConcurso ?? 0,
    listaRateioPremio: data.listaRateioPremio ?? [],
    listaDezenas: data.listaDezenas ?? [],
  };
}

// Normalize data from loteriascaixa-api.herokuapp.com (different field names)
interface ProxyApiData {
  concurso: number;
  data: string;
  dezenas: string[];
  premiacoes: Array<{
    descricao: string;
    faixa: number;
    ganhadores: number;
    valorPremio: number;
  }>;
  acumulou: boolean;
  dataProximoConcurso: string;
  valorEstimadoProximoConcurso: number;
}

function normalizeProxyApiData(data: ProxyApiData): ContestData {
  return {
    numero: data.concurso,
    dataApuracao: data.data,
    listaDezenas: data.dezenas,
    listaRateioPremio: data.premiacoes?.map((p) => ({
      descricaoFaixa: p.descricao,
      numeroDeGanhadores: p.ganhadores,
      valorPremio: p.valorPremio,
    })) ?? [],
    acumulado: data.acumulou,
    dataProximoConcurso: data.dataProximoConcurso ?? null,
    valorEstimadoProximoConcurso: data.valorEstimadoProximoConcurso ?? 0,
  };
}

function logContestSource(strategy: "api-first" | "db-first", source: "api" | "db", contestNumber: string, context: string): void {
  const label = contestNumber === "" ? "latest" : contestNumber;
  console.log(`[lottery] source=${source} strategy=${strategy} contest=${label} ${context}`);
}

/**
 * Fetch contest data directly from external APIs (no DB caching, no fallback to DB).
 * Tries three endpoints in order; throws if all fail.
 * Used internally by fetchContestData and by the checker script.
 */
export async function fetchContestFromApi(contestNumber = ""): Promise<ContestData> {
  const primaryUrl = contestNumber === "" ? `${PRIMARY_API}ultimo` : `${PRIMARY_API}${contestNumber}`;
  const fallbackUrl = contestNumber === "" ? FALLBACK_API : `${FALLBACK_API}${contestNumber}`;
  const proxyUrl = contestNumber === "" ? `${PROXY_API}latest` : `${PROXY_API}${contestNumber}`;

  // Try primary API first
  try {
    const primaryData = normalizeContestData(await fetchJson<ContestData>(primaryUrl));
    if (primaryData.numero !== 0) {
      return primaryData;
    }
  } catch {
    // Primary API failed, try fallback
  }

  // Try Caixa fallback API
  try {
    const fallbackData = normalizeContestData(await fetchJson<ContestData>(fallbackUrl));
    if (fallbackData.numero !== 0) {
      return fallbackData;
    }
  } catch {
    // Caixa API also failed (often 403 from cloud), try proxy
  }

  // Try proxy API (third-party that bypasses Caixa 403 block)
  try {
    const proxyData = normalizeProxyApiData(await fetchJson<ProxyApiData>(proxyUrl));
    if (proxyData.numero !== 0) {
      return proxyData;
    }
  } catch {
    // All APIs failed
  }

  throw new Error("Todas as APIs de loteria estão indisponíveis. Tente novamente mais tarde.");
}

/**
 * Fetch contest data with SQLite caching
 * - For latest contest (empty string): always try API first, fall back to cached data if APIs fail
 * - For specific contest number: check DB first, if not found, fetch from API and save
 */
export async function fetchContestData(contestNumber = ""): Promise<ContestData> {
  validateContestNumber(contestNumber);

  // For specific contest number: check cache first (static data, never changes)
  if (contestNumber !== "") {
    const num = parseInt(contestNumber, 10);
    const cached = getContest(num);
    if (cached) {
      logContestSource("db-first", "db", contestNumber, "cache=hit");
      return cached;
    }
    logContestSource("db-first", "db", contestNumber, "cache=miss");
  }

  // For latest contest: try API first to always get the newest contest
  // This prevents serving stale data forever if the checker timer fails
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
      // All APIs failed — fall back to cached data if available
      const cached = getLatestContest();
      if (cached) {
        logContestSource("api-first", "db", contestNumber, `fallback=api-unavailable numero=${cached.numero}`);
        return cached;
      }
      // No cache either — re-throw the API error
      throw new Error("Todas as APIs de loteria estão indisponíveis. Tente novamente mais tarde.");
    }
  }

  // Fetch specific contest from API (cache miss above)
  const data = await fetchContestFromApi(contestNumber);
  logContestSource("db-first", "api", contestNumber, `cache=miss numero=${data.numero}`);

  // Save to database (non-blocking error handling)
  try {
    saveContest(data);
  } catch (error) {
    console.error(`[lottery] Failed to cache contest ${data.numero}:`, error);
  }

  return data;
}

/**
 * Get the latest contest number — prefer DB over API call.
 * Only hits the API if the DB is completely empty.
 */
export async function getLatestContestNumber(): Promise<number> {
  const cached = getLatestContest();
  if (cached) {
    return cached.numero;
  }
  // DB empty — must fetch from API
  const data = await fetchContestFromApi("");
  try { saveContest(data); } catch { /* ignore */ }
  return data.numero;
}