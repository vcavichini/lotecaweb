# CLAUDE.md

Guidance for coding agents working in this repository.

## Current stack

NewLoteca is a Bun Zero-Build app using Hono and SQLite.

- Runtime/test runner: Bun
- Server framework: Hono
- Database: SQLite (`data/loteca.db`)
- Main server: `src/server.ts`
- UI components: `src/components/`
- Domain logic: `src/lib/`
- Checker script: `scripts/loteca-checker.ts`

## Commands

```bash
bun run dev       # Dev server at http://localhost:8126
bun run start     # Production server
bun run build     # TypeScript typecheck: tsc --noEmit
bun test          # Run Bun test suite
bun run checker   # Run the loteca-checker script manually
bun run verify:runtime  # Print Bun version
```

Run before commits:

```bash
bun run build
bun test
```

## Architecture

The app renders server-side JSX through Hono.

- `src/server.ts` mounts the same route app at `/` and `/loteca` for local and proxied access.
- `src/components/Layout.tsx` owns the global HTML shell, CSS tokens, light/dark theme variables and theme toggle scripts.
- `src/components/Home.tsx` renders contest results, bets, prize table and footer stats.
- `src/lib/lottery.ts` fetches contest data from the Caixa worker and applies cache policy.
- `src/lib/db.ts` manages SQLite persistence for contests, bets and app state.
- `src/lib/bets.ts` is the public facade for loading/saving bets and resolving bets by contest.
- `scripts/loteca-checker.ts` is the standalone operational checker used by automation.

## Theme behavior

The UI supports light and dark themes.

- Theme tokens live in `src/components/Layout.tsx` under `:root` and `html[data-theme="dark"]`.
- A minimal fixed toggle button uses `☾` and `☀︎` to represent night/day.
- The selected theme is stored in `localStorage`.
- First access falls back to `prefers-color-scheme`.
- A small head script sets `document.documentElement.dataset.theme` before paint to avoid theme flash.

## TypeScript/Bun setup

`tsconfig.json` explicitly loads Bun types via `"types": ["bun-types"]`, required for imports such as `bun:sqlite` and `bun:test`.

Production typecheck excludes colocated test files. Tests are still validated through `bun test`.

## SQLite

`data/loteca.db` is the default database file. Set `LOTECA_DB_PATH` to override it, especially in tests.

`src/lib/db.ts` manages a shared connection and exports helpers for contest cache, bets and app state.

## Deploy / operations

Service:

```bash
systemctl --user status newloteca.service --no-pager
systemctl --user restart newloteca.service
journalctl --user -u newloteca.service -n 100 --no-pager
```

After code changes, restart the service so the running Bun process picks up the new source:

```bash
systemctl --user restart newloteca.service
```

## Coding style

TypeScript strict mode. Use the `@/*` alias for `src/*` where already established. Match surrounding style and prefer Bun commands over npm/node-specific workflows.
