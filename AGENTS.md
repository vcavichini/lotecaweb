# AGENTS.md — loteca

## Overview

Next.js 16 app for Mega-Sena tracking and personal bets.

Key parts:
- Web app: `src/app/`
- Core logic: `src/lib/`
- Admin routes: `src/app/admin/` + `src/app/api/admin/*`
- Lottery API routes: `src/app/api/contest/*`
- Checker script: `scripts/loteca-checker.ts`
- Canonical bets file: `bets.json` (project root)
- Legacy bets file (deprecated, no runtime source): `config/bets.json`
- SQLite cache: `data/loteca.db`
- Checker state: `state/ultimo_concurso.txt`

## Lottery API strategy

Fallback order (resilience):
1. `https://api.guidi.dev.br/loteria/megasena/`
2. `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/`
3. `https://loteriascaixa-api.herokuapp.com/api/megasena/`

Use `api-fallback-resilience` skill when changing this behavior.

## Cache policy (source of truth for behavior)

Implemented in `src/lib/lottery.ts`:
- `fetchContestData("")` (latest): **API-first**, save to SQLite, fallback to DB only if APIs fail.
- `fetchContestData("N")` (specific contest): **DB-first**, call API only on cache miss, then persist.

Traceability logs use:
- `source=db|api`
- `strategy=db-first|api-first`

## Development commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Start production: `npm run start`
- Tests: `npm test`
- Focused cache tests: `npm test -- src/lib/lottery.test.ts`
- Checker manual run: `npm run checker`
- Runtime guard: `npm run verify:runtime`

## Testing conventions

- Vitest (`vitest.config.ts`, Node env)
- Keep tests colocated as `*.test.ts` in `src/lib/`
- Always run tests before shipping cache or API behavior changes

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

## Known pitfall: better-sqlite3 ABI mismatch

Symptom in logs:
- `ERR_DLOPEN_FAILED`
- `Module did not self-register`

Impact:
- SQLite cache fails to load
- app falls back to API repeatedly
- navigation between contests becomes slow

Fix:
1. Ensure `newloteca.service` ExecStart uses `/home/ubuntu/.hermes/node/bin/node`
2. `npm rebuild better-sqlite3`
3. `npm run verify:runtime`
4. `npm run build`
5. `systemctl --user restart newloteca.service`
6. Confirm log: `[db] SQLite database initialized ...`

## Commit guidance

Keep commits scoped.
- Behavior/code changes separate from docs-only changes.
- Do not commit generated files (`.next/`, `node_modules/`).
