# AGENTS.md — web/loteca

Instruções para agentes que operam no projeto Loteca (Hono/Bun).

## Stack Técnica
- **Runtime:** Bun (Zero-Build).
- **Framework:** Hono.
- **Banco de Dados:** SQLite (`data/loteca.db`).
- **Scripts:** TypeScript executados diretamente via `bun run`.

## Comandos Principais
- `bun run dev` — Servidor de desenvolvimento.
- `bun run start` — Servidor de produção.
- `bun run build` — Typecheck (`tsc --noEmit`).
- `bun test` — Suíte de testes Bun.
- `bun run checker` — Executa o conferidor (`scripts/loteca-checker.ts`).
- `systemctl --user restart newloteca.service` — Reinicia o app.

## Regras de Roteamento (Proxy)
O app roda na porta `8126` e é acessado via Tailscale em `/loteca`.
Para garantir que o roteamento funcione tanto localmente quanto via proxy, as rotas devem ser montadas em `/` e `/loteca` ou usar `basePath` dinâmico. Atualmente, o `src/server.ts` roteia ambas.

## Interface e Tema
- O shell HTML, CSS global e tokens de tema ficam em `src/components/Layout.tsx`.
- O tema claro/escuro usa `html[data-theme="dark"]`, `localStorage` e fallback por `prefers-color-scheme`.
- O toggle visual deve permanecer minimalista e acessível, usando ícones de dia/noite (`☾` / `☀︎`).

## Notificações
- Canal oficial: Discord via `/home/ubuntu/projects/ops/config/send_notification`.
- Para o conferidor, usar `--service loteca-checker`; o TOML central resolve a thread correta.
- Não hardcodar IDs de canal/thread.
- Não usar Webhooks.
- Telegram desativado.

## Histórico de Infra
- Migrado de Node/Nextjs para Bun/Hono em 2026-05-11.
- O serviço `loteca.service` foi substituído por `newloteca.service`.
