# Handoff

## Estado atual

NewLoteca está migrado para Bun/Hono em modelo Zero-Build.

- Runtime: Bun
- Framework: Hono
- Porta local: `8126`
- Serviço systemd: `newloteca.service`
- Banco: SQLite em `data/loteca.db`
- Rotas montadas em `/` e `/loteca`

## Funcionalidades principais

- Consulta e cache de concursos da Mega-Sena.
- Conferência de apostas permanentes e apostas por concurso.
- Persistência em SQLite.
- Checker operacional em `scripts/loteca-checker.ts`.
- Tema claro/escuro com toggle minimalista de dia/noite em `src/components/Layout.tsx`.

## Validação atual

Comandos esperados antes de deploy/commit:

```bash
bun run build
bun test
```

Última validação conhecida após ajuste de tema e setup Bun:

- `bun run build` sem erros.
- `bun test` com 32 testes passando.

## Operação

Status/restart do serviço:

```bash
systemctl --user status newloteca.service --no-pager
systemctl --user restart newloteca.service
```

URLs:

- Local: http://localhost:8126
- Tailscale/proxy: https://homelab.tail95c76f.ts.net/loteca

## Observações para próximos agentes

- Não usar fluxos antigos de Next.js/npm neste projeto.
- Preferir `bun` para scripts, testes e execução.
- Não versionar segredos nem arquivos `.env*`.
- Notificações operacionais devem seguir a política Bot API only para Discord.
