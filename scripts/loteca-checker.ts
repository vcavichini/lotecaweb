#!/usr/bin/env tsx
/**
 * loteca-checker.ts — Conferidor de Mega-Sena com notificação centralizada
 * 
 * Migrated from Python to TypeScript. Reuses lottery.ts and db.ts from the Next.js app.
 * Notifies via Discord using ops/config/send_notification.
 * 
 * Usage: tsx scripts/loteca-checker.ts
 * systemd: WorkingDirectory=/home/ubuntu/projects/web/loteca
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import process from "process";

import { getCheckerDefaultBetsFilePath, loadCheckerBets } from "../src/lib/checker-bets";

// Re-export types from src/lib/types
type PrizeTier = {
  descricaoFaixa: string;
  numeroDeGanhadores: number;
  valorPremio: number;
};

type ContestData = {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
  listaRateioPremio: PrizeTier[];
  acumulado: boolean;
  dataProximoConcurso: string | null;
  valorEstimadoProximoConcurso: number;
};

// Paths
const PROJECT_ROOT = "/home/ubuntu/projects/web/loteca";
const BETS_FILE = getCheckerDefaultBetsFilePath(PROJECT_ROOT, process.env);
const STATE_DIR = `${PROJECT_ROOT}/state`;
const STATE_FILE = process.env.LOTECA_STATE_FILE || `${STATE_DIR}/ultimo_concurso.txt`;
const DB_PATH = process.env.LOTECA_DB_PATH || `${PROJECT_ROOT}/data/loteca.db`;
const SEND_NOTIFICATION_CMD = process.env.SEND_NOTIFICATION_CMD || "/home/ubuntu/projects/ops/config/send_notification";
const NOTIFY_CHANNEL = (process.env.NOTIFY_CHANNEL || "discord").toLowerCase();

// Import db module dynamically to reuse existing code
// We'll use inline SQLite operations for simplicity

function normalizeProxyApiData(data: Record<string, unknown>): ContestData {
  return {
    numero: (data.concurso as number) || 0,
    dataApuracao: (data.data as string) || "",
    listaDezenas: ((data.dezenas as string[]) || []),
    listaRateioPremio: ((data.premiacoes as Array<{ descricao: string; ganhadores: number; valorPremio: number }>) || []).map(p => ({
      descricaoFaixa: p.descricao,
      numeroDeGanhadores: p.ganhadores,
      valorPremio: p.valorPremio,
    })),
    acumulado: (data.acumulou as boolean) || false,
    dataProximoConcurso: (data.dataProximoConcurso as string) || null,
    valorEstimadoProximoConcurso: (data.valorEstimadoProximoConcurso as number) || 0,
  };
}

function normalizeContestData(data: Record<string, unknown>): ContestData {
  return {
    numero: (data.numero as number) || 0,
    dataApuracao: (data.dataApuracao as string) || "",
    listaDezenas: ((data.listaDezenas as string[]) || []),
    listaRateioPremio: ((data.listaRateioPremio as PrizeTier[]) || []),
    acumulado: (data.acumulado as boolean) || false,
    dataProximoConcurso: (data.dataProximoConcurso as string) || null,
    valorEstimadoProximoConcurso: (data.valorEstimadoProximoConcurso as number) || 0,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchLatestResult(): Promise<ContestData | null> {
  const PRIMARY_API = "https://api.guidi.dev.br/loteria/megasena/ultimo";
  const FALLBACK_API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/";
  const PROXY_API = "https://loteriascaixa-api.herokuapp.com/api/megasena/latest";

  // Try primary API
  try {
    const data = normalizeContestData(await fetchJson<Record<string, unknown>>(PRIMARY_API));
    if (data.numero !==0) return data;
  } catch {
    // Continue to fallback
  }

  // Try Caixa fallback
  try {
    const data = normalizeContestData(await fetchJson<Record<string, unknown>>(FALLBACK_API));
    if (data.numero !== 0) return data;
  } catch {
    // Continue to proxy
  }

  // Try proxy API
  try {
    const data = normalizeProxyApiData(await fetchJson<Record<string, unknown>>(PROXY_API));
    if (data.numero !== 0) return data;
  } catch {
    // All failed
  }

  return null;
}

function saveContestToDb(data: ContestData): boolean {
  try {
    // Ensure state directory exists for DB
    const dbDir = dirname(DB_PATH);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Use better-sqlite3 via dynamic require (it's a dev dependency)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);

    db.exec(`
      CREATE TABLE IF NOT EXISTS contests (
        numero INTEGER PRIMARY KEY,
        dataApuracao TEXT NOT NULL,
        listaDezenas TEXT NOT NULL,
        listaRateioPremio TEXT NOT NULL,
        acumulado INTEGER NOT NULL,
        dataProximoConcurso TEXT,
        valorEstimadoProximoConcurso REAL NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const stmt = db.prepare(`
      INSERT INTO contests (
        numero, dataApuracao, listaDezenas, listaRateioPremio,
        acumulado, dataProximoConcurso, valorEstimadoProximoConcurso, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(numero) DO UPDATE SET
        dataApuracao = excluded.dataApuracao,
        listaDezenas = excluded.listaDezenas,
        listaRateioPremio = excluded.listaRateioPremio,
        acumulado = excluded.acumulado,
        dataProximoConcurso = excluded.dataProximoConcurso,
        valorEstimadoProximoConcurso = excluded.valorEstimadoProximoConcurso,
        updated_at = datetime('now')
    `);

    stmt.run(
      data.numero,
      data.dataApuracao,
      JSON.stringify(data.listaDezenas),
      JSON.stringify(data.listaRateioPremio),
      data.acumulado ? 1 : 0,
      data.dataProximoConcurso,
      data.valorEstimadoProximoConcurso
    );

    db.close();
    console.log(`[db] Saved contest ${data.numero} to cache`);
    return true;
  } catch (error) {
    console.error(`[db] Error saving contest ${data.numero}:`, error);
    return false;
  }
}

function loadBets(contestNumber: number): string[][] {
  return loadCheckerBets(contestNumber, BETS_FILE);
}

function getLastNotifiedContest(): number | null {
  if (existsSync(STATE_FILE)) {
    const raw = readFileSync(STATE_FILE, "utf-8").trim();
    return raw ? parseInt(raw, 10) : null;
  }
  return null;
}

function saveLastNotifiedContest(numero: number): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(STATE_FILE, String(numero));
}

function countMatches(drawNumbers: string[], bet: string[]): number {
  const drawSet = new Set(drawNumbers);
  return bet.filter(n => drawSet.has(n)).length;
}

function emojiByMatches(matches: number): string {
  if (matches >= 6) return " 🏆🔥";
  if (matches === 5) return " 🎉";
  if (matches === 4) return " ✅";
  return "";
}

function animatedSummary(matches: number, gameCount: number, game?: string): string {
  if (matches >= 6) {
    if (gameCount === 1 && game) {
      return `Resumo: 🏆🔥 SENA, CARALHO! Bateu em cheio no jogo ${game}!`;
    }
    return `Resumo: 🏆🔥 SENA, CARALHO! ${gameCount} jogos cravaram geral!`;
  }
  if (matches === 5) {
    if (gameCount === 1 && game) {
      return `Resumo: 🎉💰 QUINA na área! O jogo ${game} veio forte!`;
    }
    return `Resumo: 🎉💰 QUINA em ${gameCount} jogos! Que rodada braba!`;
  }
  if (gameCount === 1 && game) {
    return `Resumo: ✅🍀 QUADRA! O jogo ${game} beliscou bonito!`;
  }
  return `Resumo: ✅🍀 QUADRA em ${gameCount} jogos! Já dá pra comemorar!`;
}

function formatHighlightedBet(bet: string[], drawNumbers: string[]): string {
  const drawSet = new Set(drawNumbers);
  return bet.map(n => drawSet.has(n) ? `[${n}]` : n).join(" ");
}

function formatCurrency(value: number): string {
  const num = typeof value === "number" ? value : 0;
  const formatted = num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `R$ ${formatted}`;
}

function renamePrizeTier(tier: string): string {
  const map: Record<string, string> = {
    "6 acertos": "Sena",
    "5 acertos": "Quina","4 acerts": "Quadra",
  };
  return map[tier] || tier;
}

function buildMessage(
  contestNumber: number,
  date: string,
  drawNumbers: string[],
  results: Array<[string[], number]>,
  contestData: ContestData
): string {
  const lines: string[] = [
    `🎰 Mega-Sena — Concurso ${contestNumber}`,
    `Data: ${date}`,
    `Sorteio: ${drawNumbers.join(" • ")}`,
    "",
    "Seus jogos:",
  ];

  let bestMatches = 0;
  const bestGames: string[] = [];

  for (const [bet, matches] of results) {
    const formattedBet = formatHighlightedBet(bet, drawNumbers);
    lines.push(`• ${formattedBet}${emojiByMatches(matches)}`);

    if (matches > bestMatches) {
      bestMatches = matches;
      bestGames.length = 0;
      bestGames.push(formattedBet);
    } else if (matches === bestMatches && matches >= 4) {
      bestGames.push(formattedBet);
    }
  }

  if (bestMatches >= 4) {
    lines.push("");
    if (bestGames.length === 1) {
      lines.push(animatedSummary(bestMatches, 1, bestGames[0]));
    } else {
      lines.push(animatedSummary(bestMatches, bestGames.length));
    }
  }

  const prizeList = contestData.listaRateioPremio || [];
  if (prizeList.length > 0) {
    lines.push("");
    lines.push("Premiação:");
    for (const tier of prizeList) {
      const name = renamePrizeTier(tier.descricaoFaixa);
      const winners = tier.numeroDeGanhadores;
      const prize = formatCurrency(tier.valorPremio);
      lines.push(`• ${name}: ${winners} ganhador(es) — ${prize}`);
    }
  }

  lines.push("");
  lines.push("Próximo concurso:");
  lines.push(`• Data: ${contestData.dataProximoConcurso || "A definir"}`);
  lines.push(`• Estimativa: ${formatCurrency(contestData.valorEstimadoProximoConcurso)}`);
  lines.push(`• Status: ${contestData.acumulado ? "Acumulado" : "Não acumulado"}`);

  return lines.join("\n");
}

function resolveSenders(): Map<string, string> {
  const senders = new Map<string, string>();

  if (NOTIFY_CHANNEL === "discord") {
    senders.set("discord", `${SEND_NOTIFICATION_CMD} --force-notification-to=discord`);
  } else if (NOTIFY_CHANNEL === "telegram") {
    senders.set("telegram", `${SEND_NOTIFICATION_CMD} --force-notification-to=telegram`);
  } else if (NOTIFY_CHANNEL === "both") {
    senders.set("discord", `${SEND_NOTIFICATION_CMD} --force-notification-to=discord`);
    senders.set("telegram", `${SEND_NOTIFICATION_CMD} --force-notification-to=telegram`);
  } else {
    throw new Error("NOTIFY_CHANNEL inválido. Use discord|telegram|both");
  }

  return senders;
}

function runSender(command: string, message: string): [boolean, string] {
  try {
    const output = execSync(command, {
      input: message,
      encoding: "utf-8",
      timeout: 30000,
      cwd: PROJECT_ROOT,
    });
    return [true, output.trim() || "ok"];
  } catch (error) {
    const err = error as { status?: number; stderr?: string; stdout?: string };
    const errMsg = (err.stderr || err.stdout || "no output").trim();
    return [false, `sender failed (exit=${err.status}): ${errMsg}`];
  }
}

async function main(): Promise<number> {
  if (!existsSync(BETS_FILE)) {
    console.error(`Error: bets file not found: ${BETS_FILE}`);
    return 2;
  }

  const contestData = await fetchLatestResult();
  if (!contestData) {
    console.error("Error: could not fetch Mega-Sena result.");
    return 1;
  }

  const { numero, listaDezenas, dataApuracao } = contestData;

  // Save to database before dedup check — DB must always reflect latest API data
  saveContestToDb(contestData);

  // Check if already notified
  if (getLastNotifiedContest() === numero) {
    console.log(`Contest ${numero} already notified, skipping.`);
    return 0;
  }

  // Load bets and calculate results
  let bets: string[][];
  try {
    bets = loadBets(numero);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    return 2;
  }

  const results: Array<[string[], number]> = bets.map(bet => [bet, countMatches(listaDezenas, bet)]);

  // Build message
  const message = buildMessage(numero, dataApuracao, listaDezenas, results, contestData);

  // Send notifications
  let senders: Map<string, string>;
  try {
    senders = resolveSenders();
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  let allOk = true;
  for (const [channel, command] of senders) {
    const [ok, details] = runSender(command, message);
    if (ok) {
      console.log(`[${channel}] ${details}`);
    } else {
      allOk = false;
      console.error(`[${channel}] ${details}`);
    }
  }

  if (!allOk) {
    return 1;
  }

  // Mark as notified only after successful notification
  saveLastNotifiedContest(numero);
  return 0;
}

main().then(exitCode => {
  process.exit(exitCode);
});