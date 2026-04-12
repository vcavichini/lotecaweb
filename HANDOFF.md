# Handoff

Este projeto foi migrado de:

- `/Users/vcavichini/dev/go/newloteca/newloteca-node`

para:

- `/Users/vcavichini/dev/node/newloteca-node`

## Estado atual

- O app Node/Next.js já roda
- O projeto está em `Next.js 16.2.1` com `React 19.2.4`
- Home e admin já foram redesenhados
- O login local está configurado via `.env.local`
- Documentação de migração disponível em `docs/PLAN_NODE_MIGRACAO.md`
- O app lê e grava `bets.json` na raiz desta pasta

## Ajustes já concluídos

- O path de `src/lib/bets.ts` foi corrigido para usar `path.resolve(process.cwd(), "bets.json")`
- O repositório Git local foi inicializado com `.gitignore` para `node_modules`, `.next`, `.env.local` e artefatos locais

## Fluxos já validados

- Página inicial `/`
- Login em `/admin/login`
- Abertura inicial do admin
- `npm test`
- `npm run build`

## Próximos passos recomendados

1. Validar inclusão, exclusão e salvamento na tela de admin usando o `bets.json` da raiz
2. Fazer o primeiro commit local agora que o Git e o `.gitignore` já estão preparados
3. Se necessário, adicionar testes para fluxos de persistência de `bets.json` e rotas admin
