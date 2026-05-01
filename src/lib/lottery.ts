import type { ContestData } from "@/lib/types";
import { getErrorMessage, validateContestNumber } from "@/lib/validation";
import { getAppState, getContest, getLatestContest, saveContest, setAppState } from "@/lib/db";

function getCaixaWorkerUrlBase(): string {
  return process.env.CAIXA_WORKER_URL ?? "";
}

const API_TIMEOUT_MS = 5000;
const MAX_RETRIES = 1;
const BASE_DELAY_MS = 1000;
export const LAST_SUCCESSFUL_SOURCE_KEY = "lottery.last_successful_source";

export type LotterySourceId = "caixa-worker";

type RetryMode = "json" | "text";

type SourceDefinition = {
  id: LotterySourceId;
  buildUrl: (contestNumber: string) => string;
  fetchContest: (contestNumber: string) => Promise<ContestData>;
};

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
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; loteca/1.0)",
      },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return (await response.json()) as T;
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
    listaDezenas: Array.isArray(data.listaDezenas) ? data.listaDezenas.map(d => String(d).padStart(2, "0")) : [],
    acumulado: Boolean(data.acumulado),
  };
}

function validateContestDataOrThrow(data: ContestData): ContestData {
  if (!data || typeof data !== "object") throw new Error("invalid payload: empty object");
  if (!Number.isInteger(data.numero) || data.numero <= 0) throw new Error(`invalid payload: numero=${data.numero}`);
  if (!data.dataApuracao) throw new Error("invalid payload: dataApuracao missing");
  if (!Array.isArray(data.listaDezenas) || data.listaDezenas.length !== 6) throw new Error("invalid payload: dezenas missing/invalid");
  return normalizeContestData(data);
}

function buildCaixaWorkerUrl(contestNumber: string): string {
  const base = getCaixaWorkerUrlBase().replace(/\/+$/, "");
  return contestNumber === "" ? `${base}/megasena` : `${base}/megasena/${contestNumber}`;
}

async function fetchFromCaixaWorker(contestNumber: string): Promise<ContestData> {
  const workerUrl = getCaixaWorkerUrlBase();
  if (!workerUrl) throw new Error("CAIXA_WORKER_URL not configured");
  const url = buildCaixaWorkerUrl(contestNumber);
  try {
    const data = validateContestDataOrThrow(await fetchWithRetry<ContestData>(url, "json"));
    if (contestNumber !== "" && data.numero !== Number(contestNumber)) {
      throw new Error(`contest mismatch expected=${contestNumber} got=${data.numero}`);
    }
    return data;
  } catch (error) {
    console.warn(`[lottery] fail source=caixa-worker contest=${contestNumber || "latest"} reason=${getErrorMessage(error)}`);
    throw error;
  }
}

const SOURCE_REGISTRY: SourceDefinition[] = [
  { id: "caixa-worker", buildUrl: buildCaixaWorkerUrl, fetchContest: fetchFromCaixaWorker }
];

export function getOrderedSources(): LotterySourceId[] {
  return ["caixa-worker"];
}

async function fetchLatestContestFromApi(): Promise<ContestData> {
  const data = await fetchFromCaixaWorker("");
  setAppState(LAST_SUCCESSFUL_SOURCE_KEY, "caixa-worker");
  return data;
}

export async function fetchContestFromApi(contestNumber = ""): Promise<ContestData> {
  validateContestNumber(contestNumber);
  if (contestNumber === "") return fetchLatestContestFromApi();
  return fetchFromCaixaWorker(contestNumber);
}

export async function fetchContestData(contestNumber = ""): Promise<ContestData> {
  validateContestNumber(contestNumber);
  if (contestNumber !== "") {
    const cached = getContest(parseInt(contestNumber, 10));
    if (cached) {
      console.log(`[lottery] contest=${contestNumber} source=db strategy=db-first`);
      return cached;
    }
  }

  try {
    const data = await fetchContestFromApi(contestNumber);
    try { saveContest(data); } catch (e) { console.error("[lottery] Save fail:", e); }
    console.log(`[lottery] contest=${contestNumber || "latest"} source=api strategy=${contestNumber !== "" ? "db-first" : "api-first"}`);
    return data;
  } catch (error) {
    if (contestNumber === "") {
        const cached = getLatestContest();
        if (cached) {
          console.log(`[lottery] contest=latest source=db strategy=api-first`);
          return cached;
        }
    }
    throw error;
  }
}

export async function getLatestContestNumber(): Promise<number> {
  const cached = getLatestContest();
  if (cached) return cached.numero;
  const data = await fetchContestFromApi("");
  try { saveContest(data); } catch { }
  return data.numero;
}
