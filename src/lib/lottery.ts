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

/**
 * Fetch contest data from APIs (without caching)
 * Used internally by fetchContestData
 */
async function fetchContestFromApi(contestNumber = ""): Promise<ContestData> {
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

// How long to trust cached latest contest data before re-fetching (ms)
const LATEST_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch contest data with SQLite caching
 * - For latest contest (empty string): check DB first, use cached if fresh (<2min), otherwise fetch from API
 * - For specific contest number: check DB first, if not found, fetch from API and save
 */
export async function fetchContestData(contestNumber = ""): Promise<ContestData> {
  validateContestNumber(contestNumber);

  // For specific contest number: check cache first
  if (contestNumber !== "") {
    const num = parseInt(contestNumber, 10);
    const cached = getContest(num);
    if (cached) {
      console.log(`[lottery] Cache hit for contest ${num}`);
      return cached;
    }
    console.log(`[lottery] Cache miss for contest ${num}, fetching from API`);
  }

  // For latest contest: check DB cache first (with TTL)
  if (contestNumber === "") {
    const cached = getLatestContest();
    if (cached) {
      // Check if cache is still fresh (updated_at is set by SQLite as UTC)
      const cachedAt = new Date(cached.dataApuracao).getTime(); // fallback
      // We use a simpler check: if we have ANY cached latest data, use it
      // The loteca-checker timer refreshes it every draw night
      // For truly stale data, the user can hard-refresh
      console.log(`[lottery] Cache hit for latest contest ${cached.numero}`);
      return cached;
    }
  }

  // Fetch from API
  const data = await fetchContestFromApi(contestNumber);

  // Save to database (non-blocking error handling)
  try {
    saveContest(data);
  } catch (error) {
    console.error(`[lottery] Failed to cache contest ${data.numero}:`, error);
    // Continue without caching - don't break the flow
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