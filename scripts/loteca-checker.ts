#!/usr/bin/env tsx
/**
 * loteca-checker.ts — Conferidor de Mega-Sena com notificação centralizada
 *
 * Runs on a systemd timer (Tue/Thu/Sat 22:00 and 23:00 São Paulo time).
 * Fetches the latest Mega-Sena result, compares against bets, and sends
 * Discord/Telegram notifications for new contests.
 *
 * Usage: tsx scripts/loteca-checker.ts
 * systemd: WorkingDirectory=/home/ubuntu/projects/web/loteca
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import process from "process";
import * as dotenv from "dotenv";
import * as path from "path";

// Paths
const PROJECT_ROOT = "/home/ubuntu/projects/web/loteca";

// Load environment variables from .env.production
dotenv.config({ path: path.resolve(PROJECT_ROOT, ".env.production") });

import { loadBets, getBetsForContest } from "../src/lib/bets";
import { saveContest, closeDb } from "../src/lib/db";
import { fetchContestFromApi } from "../src/lib/lottery";
import type { ContestData } from "../src/lib/types";

// Paths
const STATE_DIR = `${PROJECT_ROOT}/state`;
const STATE_FILE = process.env.LOTECA_STATE_FILE || `${STATE_DIR}/ultimo_concurso.txt`;
const SEND_NOTIFICATION_CMD = process.env.SEND_NOTIFICATION_CMD || "/home/ubuntu/projects/ops/config/send_notification";
const NOTIFY_CHANNEL = (process.env.NOTIFY_CHANNEL || "discord").toLowerCase();

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
    "5 acertos": "Quina",
    "4 acertos": "Quadra",
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
  const allPlayedNumbers = new Set<string>();
  for (const [bet] of results) {
    for (const n of bet) {
      allPlayedNumbers.add(n);
    }
  }

  const highlightedDraw = drawNumbers.map(n => (allPlayedNumbers.has(n) ? `[${n}]` : n)).join(" • ");

  const lines: string[] = [
    `🎰 Mega-Sena — Concurso ${contestNumber}`,
    `Data: ${date}`,
    `Sorteio: ${highlightedDraw}`,
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
  let contestData: ContestData;
  try {
    contestData = await fetchContestFromApi();
  } catch (error) {
    console.error("Error: could not fetch Mega-Sena result.", (error as Error).message);
    return 1;
  }

  const { numero, listaDezenas, dataApuracao } = contestData;

  // Save to database before dedup check — DB must always reflect latest API data
  saveContest(contestData);

  // Check if already notified
  if (getLastNotifiedContest() === numero) {
    console.log(`Contest ${numero} already notified, skipping.`);
    return 0;
  }

  // Load bets from DB (auto-migrates from bets.json on first run if present)
  const betsConfig = await loadBets();
  const bets = getBetsForContest(betsConfig, numero);

  if (bets.length === 0) {
    console.error("Error: no bets configured. Add bets to the database before the draw.");
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

main()
  .then(exitCode => {
    closeDb();
    process.exit(exitCode);
  })
  .catch(error => {
    console.error("Unexpected error:", error);
    closeDb();
    process.exit(1);
  });
