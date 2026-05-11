# NewLoteca (Bun/Hono)

Aplicação para conferência de resultados da Mega-Sena e gestão de apostas, migrada para um modelo Zero-Build com Bun.

## Stack
- **Bun** (Runtime/Transpiler/Test Runner)
- **Hono** (Server Framework)
- **SQLite** (Database)

## Execução Operacional
O serviço principal é gerenciado via systemd:
```bash
systemctl --user status newloteca.service
```

Para rodar scripts manualmente:
```bash
bun run scripts/loteca-checker.ts
```

## Mapeamento de Infra
- **Local:** http://localhost:8126
- **Tailscale:** https://homelab.tail95c76f.ts.net/loteca
- **Apps Hub:** Link integrado via apps.toml

## Desenvolvimento
Siga as diretrizes no [AGENTS.md](./AGENTS.md).
