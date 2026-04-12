# Repository Guidelines

## Project Structure & Module Organization

This repository is a small `Next.js 16` app with the App Router. Application code lives in `src/`:

- `src/app/`: routes, layouts, global styles, and API handlers such as `src/app/api/contest/latest/route.ts`
- `src/app/admin/`: admin pages and UI
- `src/components/`: shared UI components
- `src/lib/`: domain logic, auth, validation, and file access helpers

Tests are colocated with library code as `*.test.ts`, for example `src/lib/auth.test.ts`. Supporting notes live in `docs/`, and local handoff context is in `HANDOFF.md`.

## Build, Test, and Development Commands

- `npm install`: install dependencies
- `npm run dev`: start the local dev server at `http://localhost:3000`
- `npm run build`: create a production build
- `npm run start`: run the built app
- `npm test`: run the Vitest suite once in Node mode

Before local development, define `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env.local`. Use `.env.example` as the starting point.

## Coding Style & Naming Conventions

The codebase uses TypeScript with `strict` mode enabled and the `@/*` import alias mapped to `src/*`. Follow the existing style:

- 2-space indentation
- double quotes
- semicolons
- `PascalCase` for React components
- `camelCase` for functions and variables
- descriptive route and module names, e.g. `src/lib/validation.ts`

No ESLint or Prettier config is currently committed, so keep changes consistent with surrounding files.

## Testing Guidelines

Vitest is configured in `vitest.config.ts` with a Node environment. Add tests beside the code they cover and use the `*.test.ts` naming pattern. Prioritize tests for `src/lib/` logic, especially validation, auth, and file-backed state changes. Run `npm test` before commits and `npm run build` before opening a pull request.

## Security & Configuration Notes

Do not commit real secrets in `.env.local`/`.env.production`. The application reads and writes `bets.json` from the repository root, so review file-backed changes carefully before testing admin edits or data migrations.

## SQLite Cache

The app uses a local SQLite database (`data/loteca.db`) for caching contest data:

- **Database path**: `data/loteca.db` (created automatically)
- **Table**: `contests` with fields:
  - `numero` (INTEGER PRIMARY KEY)
  - `dataApuracao` (TEXT)
  - `listaDezenas` (TEXT, JSON)
  - `listaRateioPremio` (TEXT, JSON)
  - `acumulado` (INTEGER/BOOLEAN)
  - `dataProximoConcurso` (TEXT, nullable)
  - `valorEstimadoProximoConcurso` (REAL)
  - `updated_at` (TEXT, timestamp)

**Library**: `src/lib/db.ts` provides `getContest()`, `getLatestContest()`, `getContestCacheAge()`, and `saveContest()` functions.

**Caching behavior**:
- Latest contest: Check DB first (highest contest number). The loteca-checker timer refreshes data on draw nights, so DB stays current. API is only called if DB is empty.
- Specific contest: Check DB first, fallback to API if not cached
- `getLatestContestNumber()`: reads from DB (`SELECT MAX`), no API call unless DB empty

**Error handling**: Database failures are logged but don't break the request flow.

## Loading State

`src/app/loading.tsx` provides a Suspense boundary fallback — shows "Carregando..." with placeholder balls while the server component renders. This gives immediate visual feedback on navigation.

**Shared with checker**: The TypeScript checker (`scripts/loteca-checker.ts`) saves to this DB on every run — `saveContestToDb()` runs *before* the dedup check so the DB always reflects the latest API data, even on repeat notifications.

## Loteca Checker (notificador)

O projeto inclui um script TypeScript para conferência da Mega-Sena com notificação via Discord:

- **Script**: `scripts/loteca-checker.ts`
- **Config de apostas**: `config/bets.json`
- **Estado**: `state/ultimo_concurso.txt` (deduplicação)
- **Timer systemd**: `~/.config/systemd/user/loteca-checker.timer`

### Comandos do checker

```bash
# Execução manual
npm run checker

# Verificar status do timer
systemctl --user status loteca-checker.timer --no-pager

# Logs do serviço
journalctl --user -u loteca-checker.service -n 20 --no-pager
```

### Variáveis de ambiente (opcionais)

- `LOTECA_BETS_FILE`: caminho alternativo para bets.json
- `LOTECA_STATE_FILE`: caminho alternativo para arquivo de estado
- `LOTECA_DB_PATH`: caminho alternativo para banco SQLite
- `NOTIFY_CHANNEL`: canal de notificação (`discord`|`telegram`|`both`, padrão: `discord`)
- `SEND_NOTIFICATION_CMD`: comando alternativo para notificação

### Formato da notificação

O script mantém paridade com a versão Python:

- Cabeçalho: número do concurso, data, dezenas sorteadas
- Jogos: cada aposta com destaques `[dezena]` para acertos
- Resumo animado: emojis para quadra/quina/sena
- Premiação: faixas, ganhadores e valores
- Próximo concurso: data, estimativa, status

### Timer systemd

O timer executa automaticamente em dias de sorteio (Terça/Quinta/Sábado) às 22:00 e 23:00 (America/Sao_Paulo). O serviço usa caminhos absolutos para `tsx` e `node` devido ao ambiente do systemd user scope.

## Deploy (CRITICAL)

Next.js production loads the build into memory at startup. After `npm run build`, **always restart the service** — the process does NOT hot-reload:

```bash
npm run build && systemctl --user restart newloteca.service
```

Skipping the restart means the server keeps serving the old build from memory while disk has the new one. This causes client-side navigation breakage masked by CDN cache.

## Runtime/Deploy Notes (homelab)

- App service (user scope): `~/.config/systemd/user/newloteca.service`
- Local bind: `127.0.0.1:8126`
- Public exposure is via Cloudflare Tunnel service `cloudflared-newloteca.service` (not via direct public bind)
- Public URL: `https://newloteca.botlab.dev.br/`
- Cloudflare token file: `~/.config/cloudflared/newloteca.token`
- Preferred ops commands:
  - `systemctl --user status newloteca.service --no-pager`
  - `journalctl --user -u newloteca.service -n 100 --no-pager`
  - `systemctl --user status cloudflared-newloteca.service --no-pager`

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so no repository-specific commit convention could be verified. Use short, imperative commit messages such as `fix admin session check` or `add contest validation tests`.

For pull requests, include:

- a concise summary of behavior changes
- linked issue or task reference when applicable
- test evidence (`npm test`, manual route checks)
- screenshots for UI changes in `src/app` or `src/components`

For the first local commit, keep generated directories such as `node_modules/` and `.next/` out of version control; `.gitignore` already covers them.
