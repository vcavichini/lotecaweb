# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build
npm start          # Serve production build
npm test           # Run Vitest suite (Node environment)
npm test -- src/lib/bets.test.ts  # Run a single test file
npm run checker    # Run the loteca-checker script manually
npm run verify:runtime  # Verify Node.js runtime matches .nvmrc / service expectation
```

Node.js version is pinned in `.nvmrc`. Run `nvm use` before `npm install` or `npm test` — `better-sqlite3` is a native module and must be compiled for the active Node version. Mismatches cause test failures.

Run `npm test` before commits and `npm run build` before opening a pull request.

## Architecture

Next.js 16 App Router app for checking Brazilian Mega-Sena lottery results. All source code is in `src/`:

- `src/app/` — routes, layouts, and API handlers (Next.js App Router conventions)
- `src/lib/` — domain logic: `lottery.ts` (API fetch with 3-endpoint fallback), `db.ts` (SQLite — contests + bets), `bets.ts` (bets facade with auto-migration), `validation.ts`, `utils.ts`
- `src/components/` — shared UI components
- `scripts/loteca-checker.ts` — standalone notification script; shares `src/lib/` with the web app

Tests are colocated with library code as `*.test.ts` (e.g., `src/lib/bets.test.ts`). Vitest runs in Node mode.

### Data flow

1. Homepage (`src/app/page.tsx`, server component) calls `fetchContestData()` → checks SQLite → falls back to external APIs → renders results with bets overlay
2. Bets are read/written to the `bets` table in `data/loteca.db` via `loadBets()`/`saveBets()` in `bets.ts`
3. API routes under `src/app/api/` are thin wrappers around `src/lib/` functions
4. `scripts/loteca-checker.ts` runs on a systemd timer (Tue/Thu/Sat 22:00 and 23:00 São Paulo time), saves to SQLite, and sends Discord notifications for new contests

### SQLite (`data/loteca.db`)

Single database file for all persistent state. Created automatically. `src/lib/db.ts` manages one shared connection and exports:
- `getContest()`, `getLatestContest()`, `saveContest()`, `getContestCacheAge()` — contest cache
- `getBets()`, `saveBets()` — bets storage (one row per bet: `numbers TEXT`, `type TEXT`, `contest INTEGER`)

DB errors are logged but never break requests. The checker saves to DB *before* the dedup check so the DB always reflects the latest API data.

Set `LOTECA_DB_PATH` env var to override the database path (used by tests to point at a temp file). Call `closeDb()` between tests to reset the singleton so the new path is picked up.

### Bets architecture

`bets.ts` is the public facade for bets — call `loadBets()` / `saveBets()` / `getBetsForContest()`. Internally it uses `getBets()`/`saveBets()` from `db.ts`.

**Auto-migration**: on the first `loadBets()` call after deploy, if the `bets` table is empty and a `bets.json` file exists at `<cwd>/bets.json`, the file is read and written to SQLite automatically. No manual migration step needed.

`bets-repository.ts` defines a `BetsRepository` interface with a JSON-file backend — used by contract tests and auto-migration, not by runtime code.

`bets-path.ts` resolves the bets file path for migration only: respects `LOTECA_BETS_FILE` env var, otherwise `<cwd>/bets.json`.

### Checker state

- `data/loteca.db` — single source of truth for both contest cache and bets
- `state/ultimo_concurso.txt` — last notified contest number (deduplication)

## Coding Style

TypeScript `strict` mode; `@/*` alias maps to `src/*`. Follow existing style: 2-space indentation, double quotes, semicolons, `PascalCase` components, `camelCase` functions. No ESLint/Prettier config is committed — match surrounding files.

## Deploy (Critical)

Next.js loads the build into memory at startup and does **not** hot-reload. After any `npm run build`:

```bash
npm run build && systemctl --user restart newloteca.service
```

Skipping the restart causes the old build to keep serving, breaking client-side navigation in ways masked by CDN cache.

### Homelab ops

- Service: `~/.config/systemd/user/newloteca.service` (binds `127.0.0.1:8126`)
- Public URL via Cloudflare Tunnel: `https://newloteca.botlab.dev.br/`
- Useful commands:
  - `systemctl --user status newloteca.service --no-pager`
  - `journalctl --user -u newloteca.service -n 100 --no-pager`
  - `systemctl --user status loteca-checker.timer --no-pager`
  - `journalctl --user -u loteca-checker.service -n 20 --no-pager`
