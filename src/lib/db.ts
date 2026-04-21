import Database from "better-sqlite3";
import path from "path";

import type { BetsConfig } from "./types";
import type { ContestData } from "./types";

// Resolved lazily so LOTECA_DB_PATH can be set by tests after module load.
// Call closeDb() between tests to reset the singleton and pick up a new path.
function resolveDbPath(): string {
  if (process.env.LOTECA_DB_PATH) return process.env.LOTECA_DB_PATH;
  if (process.env.NODE_ENV === "production") {
    return "/home/ubuntu/projects/web/loteca/data/loteca.db";
  }
  return path.join(process.cwd(), "data", "loteca.db");
}

let db: Database.Database | null = null;

function getDb(): Database.Database | null {
  if (db) return db;

  try {
    const dbPath = resolveDbPath();

    // Ensure data directory exists
    const fs = require("fs");
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

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

    // Migrate bets to normalized schema if the old single-row JSON blob schema exists
    const betsExists = (db.prepare(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='bets'"
    ).get() as { cnt: number }).cnt > 0;

    if (betsExists) {
      const cols = db.prepare("PRAGMA table_info(bets)").all() as Array<{ name: string }>;
      if (cols.some(c => c.name === "permanent")) {
        // Old schema: single row with permanent/one_off JSON blobs → normalize to one row per bet
        const oldRow = db.prepare(
          "SELECT permanent, one_off FROM bets WHERE id = 1"
        ).get() as { permanent: string; one_off: string } | undefined;

        db.exec("DROP TABLE bets");
        db.exec(`
          CREATE TABLE bets (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            numbers    TEXT    NOT NULL,
            type       TEXT    NOT NULL CHECK (type IN ('permanent', 'one_off')),
            contest    INTEGER,
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
          )
        `);

        if (oldRow) {
          const permanent = JSON.parse(oldRow.permanent) as string[][];
          const one_off = JSON.parse(oldRow.one_off) as Record<string, string[][]>;
          const insert = db.prepare(
            "INSERT INTO bets (numbers, type, contest) VALUES (?, ?, ?)"
          );
          db.transaction(() => {
            for (const bet of permanent) insert.run(bet.join(" "), "permanent", null);
            for (const [contest, bets] of Object.entries(one_off)) {
              for (const bet of bets) insert.run(bet.join(" "), "one_off", parseInt(contest, 10));
            }
          })();
          console.log("[db] migrated bets to normalized schema");
        }
      }
      // else: already new schema — nothing to do
    } else {
      db.exec(`
        CREATE TABLE bets (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          numbers    TEXT    NOT NULL,
          type       TEXT    NOT NULL CHECK (type IN ('permanent', 'one_off')),
          contest    INTEGER,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        )
      `);
    }

    console.log(`[db] SQLite database initialized at ${dbPath}`);
    return db;
  } catch (error) {
    console.error("[db] Failed to initialize SQLite database:", error);
    return null;
  }
}

// ─── Contests ────────────────────────────────────────────────────────────────

export function getContest(contestNumber: number): ContestData | null {
  const database = getDb();
  if (!database) return null;

  try {
    const row = database.prepare(`
      SELECT numero, dataApuracao, listaDezenas, listaRateioPremio,
             acumulado, dataProximoConcurso, valorEstimadoProximoConcurso
      FROM contests WHERE numero = ?
    `).get(contestNumber) as {
      numero: number;
      dataApuracao: string;
      listaDezenas: string;
      listaRateioPremio: string;
      acumulado: number;
      dataProximoConcurso: string | null;
      valorEstimadoProximoConcurso: number;
    } | undefined;

    if (!row) return null;

    return {
      numero: row.numero,
      dataApuracao: row.dataApuracao,
      listaDezenas: JSON.parse(row.listaDezenas),
      listaRateioPremio: JSON.parse(row.listaRateioPremio),
      acumulado: row.acumulado === 1,
      dataProximoConcurso: row.dataProximoConcurso,
      valorEstimadoProximoConcurso: row.valorEstimadoProximoConcurso,
    };
  } catch (error) {
    console.error(`[db] Error getting contest ${contestNumber}:`, error);
    return null;
  }
}

export function saveContest(data: ContestData): boolean {
  const database = getDb();
  if (!database) return false;

  try {
    database.prepare(`
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
    `).run(
      data.numero,
      data.dataApuracao,
      JSON.stringify(data.listaDezenas),
      JSON.stringify(data.listaRateioPremio),
      data.acumulado ? 1 : 0,
      data.dataProximoConcurso,
      data.valorEstimadoProximoConcurso,
    );

    console.log(`[db] Saved contest ${data.numero} to cache`);
    return true;
  } catch (error) {
    console.error(`[db] Error saving contest ${data.numero}:`, error);
    return false;
  }
}

export function getLatestContest(): ContestData | null {
  const database = getDb();
  if (!database) return null;

  try {
    const row = database.prepare(`
      SELECT numero, dataApuracao, listaDezenas, listaRateioPremio,
             acumulado, dataProximoConcurso, valorEstimadoProximoConcurso
      FROM contests ORDER BY numero DESC LIMIT 1
    `).get() as {
      numero: number;
      dataApuracao: string;
      listaDezenas: string;
      listaRateioPremio: string;
      acumulado: number;
      dataProximoConcurso: string | null;
      valorEstimadoProximoConcurso: number;
    } | undefined;

    if (!row) return null;

    return {
      numero: row.numero,
      dataApuracao: row.dataApuracao,
      listaDezenas: JSON.parse(row.listaDezenas),
      listaRateioPremio: JSON.parse(row.listaRateioPremio),
      acumulado: row.acumulado === 1,
      dataProximoConcurso: row.dataProximoConcurso,
      valorEstimadoProximoConcurso: row.valorEstimadoProximoConcurso,
    };
  } catch (error) {
    console.error("[db] Error getting latest contest:", error);
    return null;
  }
}

export function getContestCacheAge(contestNumber: number): string | null {
  const database = getDb();
  if (!database) return null;

  try {
    const row = database.prepare(
      "SELECT updated_at FROM contests WHERE numero = ?",
    ).get(contestNumber) as { updated_at: string } | undefined;
    return row?.updated_at ?? null;
  } catch {
    return null;
  }
}

// ─── Bets ─────────────────────────────────────────────────────────────────────

export function getBets(): BetsConfig | null {
  const database = getDb();
  if (!database) return null;

  try {
    const rows = database.prepare(
      "SELECT numbers, type, contest FROM bets ORDER BY id"
    ).all() as Array<{ numbers: string; type: string; contest: number | null }>;

    if (rows.length === 0) return null;

    const config: BetsConfig = { permanent: [], one_off: {} };
    for (const row of rows) {
      const bet = row.numbers.split(" ");
      if (row.type === "permanent") {
        config.permanent.push(bet);
      } else {
        const key = String(row.contest);
        if (!config.one_off[key]) config.one_off[key] = [];
        config.one_off[key].push(bet);
      }
    }
    return config;
  } catch (error) {
    console.error("[db] Error getting bets:", error);
    return null;
  }
}

export function saveBets(config: BetsConfig): boolean {
  const database = getDb();
  if (!database) return false;

  try {
    const deleteAll = database.prepare("DELETE FROM bets");
    const insert = database.prepare(
      "INSERT INTO bets (numbers, type, contest) VALUES (?, ?, ?)"
    );

    database.transaction(() => {
      deleteAll.run();
      for (const bet of config.permanent) {
        insert.run(bet.join(" "), "permanent", null);
      }
      for (const [contest, bets] of Object.entries(config.one_off)) {
        for (const bet of bets) {
          insert.run(bet.join(" "), "one_off", parseInt(contest, 10));
        }
      }
    })();

    return true;
  } catch (error) {
    console.error("[db] Error saving bets:", error);
    return false;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log("[db] Database connection closed");
  }
}
