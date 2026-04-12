import Database from "better-sqlite3";
import type { ContestData } from "./types";
import path from "path";

// Database path - in production use /home/ubuntu/projects/web/loteca/data/loteca.db
// In development, use relative path from project root
const DB_PATH =
  process.env.NODE_ENV === "production"
    ? "/home/ubuntu/projects/web/loteca/data/loteca.db"
    : path.join(process.cwd(), "data", "loteca.db");

let db: Database.Database | null = null;

function getDb(): Database.Database | null {
  if (db) return db;

  try {
    // Ensure data directory exists
    const fs = require("fs");
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Create table if not exists
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

    console.log(`[db] SQLite database initialized at ${DB_PATH}`);
    return db;
  } catch (error) {
    console.error("[db] Failed to initialize SQLite database:", error);
    return null;
  }
}

/**
 * Get a contest from the local database cache
 * @param contestNumber - The contest number to look up
 * @returns The contest data if found in cache, null otherwise
 */
export function getContest(contestNumber: number): ContestData | null {
  const database = getDb();
  if (!database) return null;

  try {
    const stmt = database.prepare(`
      SELECT numero, dataApuracao, listaDezenas, listaRateioPremio, 
             acumulado, dataProximoConcurso, valorEstimadoProximoConcurso
      FROM contests WHERE numero = ?
    `);

    const row = stmt.get(contestNumber) as {
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

/**
 * Save a contest to the local database cache
 * Uses UPSERT to handle both insert and update
 * @param data - The contest data to save
 * @returns true if saved successfully, false otherwise
 */
export function saveContest(data: ContestData): boolean {
  const database = getDb();
  if (!database) return false;

  try {
    const stmt = database.prepare(`
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

    console.log(`[db] Saved contest ${data.numero} to cache`);
    return true;
  } catch (error) {
    console.error(`[db] Error saving contest ${data.numero}:`, error);
    return false;
  }
}

/**
 * Get the latest (highest) contest number from the local cache
 * @returns The latest contest data if any contest exists in cache, null otherwise
 */
export function getLatestContest(): ContestData | null {
  const database = getDb();
  if (!database) return null;

  try {
    const row = database.prepare(`
      SELECT numero, dataApuracao, listaDezenas, listaRateioPremio,
             acumulado, dataProximoConcurso, valorEstimadoProximoConcurso, updated_at
      FROM contests ORDER BY numero DESC LIMIT 1
    `).get() as {
      numero: number;
      dataApuracao: string;
      listaDezenas: string;
      listaRateioPremio: string;
      acumulado: number;
      dataProximoConcurso: string | null;
      valorEstimadoProximoConcurso: number;
      updated_at: string;
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

/**
 * Get the timestamp of when a contest was last updated in cache
 * @param contestNumber - The contest number
 * @returns ISO timestamp string or null if not found
 */
export function getContestCacheAge(contestNumber: number): string | null {
  const database = getDb();
  if (!database) return null;

  try {
    const row = database.prepare(
      "SELECT updated_at FROM contests WHERE numero = ?"
    ).get(contestNumber) as { updated_at: string } | undefined;
    return row?.updated_at ?? null;
  } catch {
    return null;
  }
}

/**
 * Close the database connection (for cleanup)
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log("[db] Database connection closed");
  }
}