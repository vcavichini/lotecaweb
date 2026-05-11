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
- `bun run checker` — Executa o conferidor (`scripts/loteca-checker.ts`).
- `systemctl --user restart newloteca.service` — Reinicia o app.

## Regras de Roteamento (Proxy)
O app roda na porta `8126` e é acessado via Tailscale em `/loteca`.
Para garantir que o roteamento funcione tanto localmente quanto via proxy, as rotas devem ser montadas em `/` e `/loteca` ou usar `basePath` dinâmico. Atualmente, o `src/server.ts` roteia ambas.

## Notificações
- Canal oficial: Discord (API Bot).
- Não usar Webhooks.
- Telegram desativado.

## Histórico de Infra
- Migrado de Node/Nextjs para Bun/Hono em 2026-05-11.
- O serviço `loteca.service` foi substituído por `newloteca.service`.
