# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build
npm start          # Serve production build
npm test           # Run Vitest suite (Node environment)
npm run checker    # Run the loteca-checker script manually
```

Before local development, copy `.env.example` to `.env.local` and set `ADMIN_PASSWORD` and `SESSION_SECRET`.

Run `npm test` before commits and `npm run build` before opening a pull request.

## Architecture

Next.js 16 App Router app for checking Brazilian Mega-Sena lottery results. All source code is in `src/`:

- `src/app/` — routes, layouts, and API handlers (Next.js App Router conventions)
- `src/app/admin/` — admin pages and UI components
- `src/lib/` — domain logic: `lottery.ts` (API fetch with 3-endpoint fallback), `db.ts` (SQLite cache), `bets.ts` (file-backed config), `auth.ts` (HMAC-SHA256 session tokens), `validation.ts`, `utils.ts`
- `src/components/` — shared UI components
- `scripts/loteca-checker.ts` — standalone notification script; shares `src/lib/` with the web app

Tests are colocated with library code as `*.test.ts` (e.g., `src/lib/auth.test.ts`). Vitest runs in Node mode.

### Data flow

1. Homepage (`src/app/page.tsx`, server component) calls `fetchContestData()` → checks SQLite → falls back to external APIs → renders results with bets overlay
2. Admin pages authenticate via HMAC-signed session cookie; bets are read/written to `bets.json` at the project root
3. API routes under `src/app/api/` are thin wrappers around `src/lib/` functions
4. `scripts/loteca-checker.ts` runs on a systemd timer (Tue/Thu/Sat 22:00 and 23:00 São Paulo time), saves to SQLite, and sends Discord notifications for new contests

### SQLite cache (`data/loteca.db`)

Created automatically. `src/lib/db.ts` exports `getContest()`, `getLatestContest()`, `saveContest()`, `getContestCacheAge()`. DB errors are logged but never break the request. The checker script saves to DB *before* dedup check so the DB always reflects latest API data.

### Checker state

- `config/bets.json` — symlink to root `bets.json`; bets used by the checker
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
