# NewLoteca (Bun/Hono)

Aplicação para conferência de resultados da Mega-Sena e gestão de apostas, migrada para um modelo Zero-Build com Bun e Hono.

## Stack

- **Bun** (runtime, execução de TypeScript e test runner)
- **Hono** (server framework)
- **SQLite** (`data/loteca.db`)
- **TypeScript** em modo strict

## Interface

- A página principal renderiza o resultado do concurso, apostas cadastradas, premiação e informações do próximo concurso.
- O tema visual usa tokens CSS centralizados em `src/components/Layout.tsx`.
- Há suporte a tema claro/escuro com botão minimalista de dia/noite (`☾` / `☀︎`).
- A preferência de tema é salva no `localStorage` e, no primeiro acesso, segue `prefers-color-scheme` do sistema.

## Execução Operacional

O serviço principal é gerenciado via systemd de usuário:

```bash
systemctl --user status newloteca.service
systemctl --user restart newloteca.service
```

URLs principais:

- **Local:** http://localhost:8126
- **Tailscale:** https://homelab.tail95c76f.ts.net/loteca

O app monta rotas em `/` e `/loteca` para funcionar localmente e atrás do proxy.

## Desenvolvimento

Comandos principais:

```bash
bun run dev       # servidor de desenvolvimento com hot reload
bun run start     # servidor de produção
bun run build     # typecheck: tsc --noEmit
bun test          # suíte de testes Bun
bun run checker   # execução manual do conferidor
```

Validação recomendada antes de commit/deploy:

```bash
bun run build
bun test
```

Após alterações no serviço em produção:

```bash
systemctl --user restart newloteca.service
```

## Banco de Dados

- Banco principal: `data/loteca.db`.
- `LOTECA_DB_PATH` pode sobrescrever o caminho em testes ou execuções isoladas.
- A camada `src/lib/db.ts` centraliza cache de concursos, apostas e estado da aplicação.

## Documentação para agentes

Siga as diretrizes operacionais no [AGENTS.md](./AGENTS.md).
