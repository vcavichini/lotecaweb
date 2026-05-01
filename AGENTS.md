# AGENTS.md — loteca

## Overview

Hono app (Zero Build) for Mega-Sena tracking and personal bets. 
Runs directly from source using `tsx` to eliminate build steps.

Key parts:
- Web server: `src/server.ts` (Hono)
- UI Components: `src/components/` (JSX SSR)
- Core logic: `src/lib/`
- Checker script: `scripts/loteca-checker.ts`
- Single data store: `data/loteca.db` (SQLite)

## Lottery API strategy

- Default: **Cloudflare Worker** (Caixa API via edge): `https://caixa-lottery-proxy.vcavichini.workers.dev/megasena/` (`caixa-worker`, requires `CAIXA_WORKER_URL` env var).
- Fallback: DB (SQLite) only if Worker fails.
- All other external proxies (Guidi, Lotorama, Heroku) removed for performance/reliability.

## Cache policy (source of truth for behavior)

Implemented in `src/lib/lottery.ts`:
- `fetchContestData("")` (latest): **API-first**, save to SQLite, fallback to DB only if APIs fail.
- `fetchContestData("N")` (specific contest): **DB-first**, call API only on cache miss, then persist.

Traceability logs (from `src/lib/lottery.ts`):
- `source=db|api`
- `strategy=db-first|api-first`

## SQLite schema (`data/loteca.db`)

Two tables, managed by `src/lib/db.ts`:

**contests** — contest result cache
```
numero INTEGER PRIMARY KEY
dataApuracao TEXT
listaDezenas TEXT    (JSON array)
listaRateioPremio TEXT  (JSON array)
acumulado INTEGER
dataProximoConcurso TEXT
valorEstimadoProximoConcurso REAL
updated_at TEXT
```

**app_state** — small key/value metadata cache
```
key TEXT PRIMARY KEY
value TEXT
updated_at TEXT
```

Used by source priority persistence:
- `lottery.last_successful_source` → `caixa-worker` (legacy values such as `proxy|lotorama|guidi|caixa` may exist from older runs but are no longer written)

**bets** — one row per bet (normalized, human-readable)
```
id         INTEGER PRIMARY KEY AUTOINCREMENT
numbers    TEXT    (space-separated, e.g. "03 15 18 23 40 54")
type       TEXT    CHECK (type IN ('permanent', 'one_off'))
contest    INTEGER (NULL for permanent bets)
created_at TEXT
```

`getBets()` reconstructs `BetsConfig` from rows. `saveBets()` does DELETE + INSERT in a transaction.

## Bets architecture

`src/lib/bets.ts` is the public facade: `loadBets()` / `saveBets()` / `getBetsForContest()`.

**Auto-migration**: on the first `loadBets()` after deploy, if the `bets` table is empty and a `bets.json` exists at `<cwd>/bets.json`, it is read and written to SQLite automatically.

**DB schema migration**: on first `getDb()` call, if the old single-row blob schema is detected (column `permanent` exists), it is migrated to the normalized schema automatically. Logged as `[db] migrated bets to normalized schema`.

Bets are managed directly in SQLite — there is no admin UI.

## Checker script

`scripts/loteca-checker.ts` shares all logic with the web app via `src/lib/`:
- Imports `loadBets`, `getBetsForContest` from `src/lib/bets`
- Imports `saveContest`, `closeDb` from `src/lib/db`
- Imports `fetchContestFromApi` from `src/lib/lottery` (API-only, no DB fallback for checking — must fail if Worker is down to avoid false negatives)

Runs via `tsx` on a systemd timer: **Tue/Thu/Sat at 22:00 and 23:00 (America/Sao_Paulo)**.
Note: When running manually (e.g., `npm run checker`), environment variables are not automatically loaded. `dotenv` must be used in the script to load `.env` files, or variables must be exported in the shell, as systemd normally handles this injection in production.

## Cloudflare Worker (`caixa-lottery-proxy`)

Transparent proxy for the Caixa API to avoid direct IP blocks. Deployed to `https://caixa-lottery-proxy.vcavichini.workers.dev/megasena/`.

Configuration:
- Worker code: `workers/caixa-proxy/index.ts`
- Wrangler config: `workers/caixa-proxy/wrangler.toml`
- URL env var: `CAIXA_WORKER_URL` (set in `.env.production`, `newloteca.service`, and `loteca-checker.service`)

The worker is the only source used. If the env var is not set, the app fails. On successful fetch, it persists as the database source.

## Node.js version

Pinned to **v22 LTS** via nvm. `.nvmrc` contains `22`.

Run `nvm use` (or open a fresh terminal) before `npm install` or `npm test`. `better-sqlite3` is a native module — ABI must match the active Node version.

Both systemd services (`newloteca.service`, `loteca-checker.service`) use `/home/ubuntu/.nvm/versions/node/v22.22.2/bin/node`.

To realign everything after a drift: `bash scripts/setup-node.sh`

## Development commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Start production: `npm run start`
- Tests: `npm test`
- Focused bets tests: `npm test -- src/lib/bets.test.ts`
- Checker manual run: `npm run checker`
- Runtime guard: `npm run verify:runtime`

## Testing conventions

- Vitest (`vitest.config.ts`, Node env)
- Tests colocated as `*.test.ts` in `src/lib/`
- Use `LOTECA_DB_PATH` env var to point tests at a temp DB; call `closeDb()` in `afterEach` to reset the singleton
- Always run tests before shipping cache, API, or bets behavior changes

## Deploy (critical)

This app runs with systemd user service (`newloteca.service`).

For production changes, use atomic deploy:
1. `npm run build`
2. `systemctl --user restart newloteca.service`
3. Validate health and logs

Never do build without restart.

## Runtime notes

- Service: `newloteca.service`
- Local bind: `127.0.0.1:8126`
- Public URL: `https://newloteca.botlab.dev.br/` (via Cloudflare Tunnel)

Useful checks:
- `systemctl --user status newloteca.service --no-pager`
- `journalctl --user -u newloteca.service -n 100 --no-pager`
- `systemctl --user status loteca-checker.timer --no-pager`
- `journalctl --user -u loteca-checker.service -n 20 --no-pager`

## Known pitfall: better-sqlite3 ABI mismatch

Symptom in logs:
- `ERR_DLOPEN_FAILED`
- `Module did not self-register`

Impact:
- SQLite fails to load
- App falls back to API on every request
- Navigation between contests becomes slow

Fix:
1. `source ~/.nvm/nvm.sh && nvm use 22`
2. `npm rebuild`
3. `npm run verify:runtime`
4. `npm run build`
5. `systemctl --user restart newloteca.service`
6. Confirm log: `[db] SQLite database initialized ...`

If services are still pointing at the wrong node binary, run `bash scripts/setup-node.sh` to realign everything.

## Commit guidance

Keep commits scoped.
- Behavior/code changes separate from docs-only changes.
- Do not commit generated files (`.next/`, `node_modules/`).
