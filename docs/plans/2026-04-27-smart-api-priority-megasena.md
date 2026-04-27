# Smart API Priority for Mega-Sena Implementation Plan

> For Hermes: use subagent-driven-development / DevBoy workflow. Do not improvise beyond this scope.

Goal: make result fetching learn from the previous successful source so the next run starts with the source that actually worked last time.

Architecture: keep a single shared fetch pipeline in `src/lib/lottery.ts`, backed by SQLite metadata in the same `data/loteca.db`. Treat providers as ordered sources, not hardcoded nested tries. Persist the last successful source and reorder the next execution accordingly. Add official-page scraping as a fallback source. Keep Caixa raw API as the final fallback only.

Decision:
- Keep Caixa in the list, but dead last.
- Replace the official Caixa scrape fallback with Lotorama scrape.
- Dynamic order applies to all sources, including scraper, based on last successful source.

Target source catalog:
1. `proxy` — `https://loteriascaixa-api.herokuapp.com/api/megasena/`
2. `lotorama` — `https://lotorama.com.br/resultado-megasena/{contest}/`
3. `guidi` — `https://api.guidi.dev.br/loteria/megasena/`
4. `caixa` — `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/`

Default base order when there is no history:
- `proxy -> lotorama -> guidi -> caixa`

Behavior rules:
- If source X succeeds, persist X as `last_successful_source`.
- On the next execution, source X becomes first, and the remaining sources preserve the default relative order behind it.
- Only persist success after full validation of the normalized payload.
- If a source fails, log the reason and continue to the next source.
- Web app and checker must share exactly the same fetch strategy.

Data model:
- Add a small metadata table in SQLite, e.g. `app_state(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`.
- Store at least:
  - `key='lottery.last_successful_source'`
  - `value in ('proxy','lotorama','guidi','caixa')`

Files to modify:
- `src/lib/db.ts`
- `src/lib/lottery.ts`
- `src/lib/lottery.test.ts`
- `AGENTS.md`
- `README.md` if behavior summary changes materially

Potential helper additions:
- In `src/lib/db.ts`:
  - `getAppState(key: string): string | null`
  - `setAppState(key: string, value: string): boolean`
  - create `app_state` table during DB init
- In `src/lib/lottery.ts`:
  - source type definition
  - source registry with builders/parsers
  - `getOrderedSources()`
  - `validateContestDataOrThrow()`
  - `fetchContestFromScrape()` or equivalent integrated source adapter

Validation requirements for a successful source:
- normalized object exists
- `numero > 0`
- `listaDezenas` exists and has 6 items
- `dataApuracao` present
- `listaRateioPremio` is an array (can be empty only if source truly lacks prize details; if scraper cannot provide full prize table, document that and normalize safely)
- payload shape must match `ContestData`

Scraping requirements:
- Use Lotorama as the scraping source.
- URL pattern:
  - latest contest: derive from a stable Mega-Sena result page or latest-result listing if needed
  - specific contest: `https://lotorama.com.br/resultado-megasena/{contest}/`
- Implement scraping with minimal dependency surface. Prefer built-in parsing/string extraction if feasible; if adding a dependency is truly necessary, justify it and keep it tiny.
- Scraper must extract, at minimum:
  - contest number
  - draw date
  - six drawn numbers
  - next contest date when present
  - next estimated prize when present
  - accumulated status when inferable
  - full prize tiers used by `listaRateioPremio`:
    - faixa/descrição
    - número de ganhadores
    - valor do prêmio
- If the page structure does not contain a required field for a given contest, fail validation instead of fabricating data.

Logging/observability:
- For every attempted source, log source name and outcome.
- On success, log chosen source and resulting contest number.
- On failure, log concise reason (`status`, timeout, parse error, invalid payload, etc.).
- Preserve existing `source=db|api` / strategy logs, but enrich API path with source identity.
- Desired examples:
  - `[lottery] try source=proxy contest=latest`
  - `[lottery] fail source=proxy contest=latest reason=status 503`
  - `[lottery] success source=lotorama contest=latest numero=3000 persisted_priority=true`

Tests required:
1. no-history case uses default order `proxy -> lotorama -> guidi -> caixa`
2. if last successful source is `proxy`, next run tries `proxy` first
3. if preferred source fails, pipeline falls through to the next sources in order
4. success persists the winning source to DB state
5. invalid payload does not persist source as successful
6. latest contest still falls back to cached DB result if all sources fail
7. specific contest path (`fetchContestData('N')`) still remains DB-first, API second
8. checker path still uses shared fetch function and benefits from the same ordering

Implementation notes:
- Refactor `fetchContestFromApi()` away from nested hardcoded try/catch blocks into iterable source adapters.
- Keep retries per source as they already exist, unless the refactor exposes a cleaner way to preserve them.
- Avoid scope creep: no health scoring, no moving averages, no cooldown table. Only "last successful source first".

Acceptance criteria:
- The app no longer uses a static API order.
- The default source order is `proxy -> lotorama -> guidi -> caixa`.
- The last successful source is persisted and reused on the next execution.
- Lotorama scraping exists as the structured fallback source and includes prize tiers/ganhadores.
- Caixa raw API remains available only as the final fallback.
- Existing cache policy remains unchanged.
- Tests pass.
- Docs updated to reflect new fetch order and persistence behavior.

Suggested commit message:
- `feat: prioritize last successful megasena source`
