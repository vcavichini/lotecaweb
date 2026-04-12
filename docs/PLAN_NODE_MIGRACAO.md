# Migração para Node.js + Nova UI do NewLoteca

> Documento de planejamento original da migração. Parte do conteúdo abaixo descreve metas e opções já concluídas ou substituídas pelo estado atual do projeto.

## Resumo

Criar uma nova pasta no repositório, recomendadamente `newloteca-node/`, com uma reimplementação em **Next.js full-stack** que preserve as funcionalidades web/admin do projeto atual e mantenha o formato de dados existente em `bets.json`.

A nova versão deve cobrir:

- Consulta do concurso mais recente e de concursos específicos
- Fallback entre APIs externas da Mega-Sena
- Destaque visual dos números apostados e acertos
- Navegação entre concursos anterior/próximo
- Painel admin com autenticação por cookie seguro
- CRUD de apostas permanentes e pontuais
- Validação completa das apostas e dos concursos
- Persistência local em `bets.json`
- Tema visual com alternância claro/escuro

Fora de escopo por decisão atual:

- Recriar a CLI em Node.js

## Opções de UI

### Opção A: Painel Editorial de Resultados

Recomendada.

- Página pública com cara de painel esportivo/editorial
- Hero forte com concurso, data e dezenas sorteadas como peças centrais
- Blocos de “Seus jogos”, “Acertos”, “Premiação” e “Próximo concurso” bem separados
- Admin com layout de workspace, sidebar leve e formulários mais organizados
- Melhor equilíbrio entre visual novo, legibilidade e velocidade de implementação

### Opção B: Terminal Neon / Retro-Tech

- Visual inspirado em painel de terminal moderno
- Tipografia monoespaçada, cards escuros e destaques fortes para acertos
- Diferente e memorável, mas mais arriscado para usabilidade longa no admin
- Bom se você quer identidade mais marcante do que institucional

### Opção C: Caderno de Apostas / Papel Premium

- Visual claro, quente, com cara de bloco de anotações premium
- Foco em leitura, organização de jogos e sensação mais “pessoal”
- Admin muito confortável para edição, mas menos impactante visualmente

Direção recomendada para implementação inicial:

- **Opção A**, porque moderniza bastante sem prejudicar clareza nem manutenção

## Mudanças de implementação

### Arquitetura

- Criar `newloteca-node/` como app isolado, sem mexer na versão Go existente
- Usar **Next.js App Router + TypeScript**
- Manter backend e frontend no mesmo app via Route Handlers
- Separar domínio em módulos como `src/lib/lottery/`, `src/lib/bets/`, `src/lib/auth/`, `src/lib/validation/`

### Interfaces e contratos

- Manter `bets.json` com o mesmo shape:
  - `permanent: string[][]`
  - `one_off: Record<string, string[][]>`
- Manter `ADMIN_PASSWORD` como credencial principal
- Adicionar `SESSION_SECRET` na versão Node para assinar cookie de sessão
- Criar tipos equivalentes ao Go:
  - `ContestData`
  - `PrizeTier`
  - `BetsConfig`
- Expor rotas internas da nova app:
  - `GET /api/contest/latest`
  - `GET /api/contest/[contestNumber]`
  - `POST /api/admin/login`
  - `GET /api/admin/bets`
  - `PUT /api/admin/bets`

### Backend

- Reimplementar cliente da loteria com API primária + fallback, timeout e normalização de payload
- Reimplementar validações:
  - concurso vazio permitido como “último”
  - concurso numérico entre 1 e 9999
  - aposta com 6 a 20 dezenas
  - dezenas em formato `"01"` a `"60"`
  - sem duplicatas na mesma aposta
- Reimplementar helpers:
  - contagem de acertos
  - renomeação de faixa
  - formatação monetária pt-BR
  - composição de apostas permanentes + pontuais por concurso
- Ler e gravar `bets.json` no filesystem do app Node com escrita formatada
- Proteger rotas admin por cookie assinado e `HttpOnly`; usar `Secure` em produção

### Frontend público

- Página inicial renderizada no servidor buscando o último concurso
- Busca/navegação por concurso específico via query param
- Controles de anterior, próximo e “mais recente”
- Visualização clara de:
  - dezenas sorteadas
  - jogos do usuário
  - quantidade de acertos por jogo
  - premiação por faixa
  - indicador de próximo concurso e acumulado
- Persistir preferência de tema no browser

### Frontend admin

- Tela de login separada
- Tela de manutenção com duas áreas:
  - apostas permanentes
  - apostas pontuais por concurso
- Permitir adicionar, editar e remover jogos e blocos de concurso
- Aviso de alterações não salvas
- Salvamento com feedback de sucesso/erro
- Validação no cliente para UX rápida e validação no servidor como fonte da verdade

## Plano de testes

- Unitários com **Vitest** para:
  - validação de concurso
  - validação de aposta
  - validação do `BetsConfig`
  - validação de concurso em entradas `one_off`, garantindo rejeição de chaves inválidas no mapa de apostas pontuais
  - helpers de acertos, faixa e moeda
  - autenticação e assinatura de sessão
- Integração para:
  - fallback entre APIs externas
  - leitura/escrita de `bets.json`
  - login admin
  - bloqueio de rotas sem sessão
  - salvamento de apostas inválidas e válidas
- E2E com **Playwright** para:
  - abrir último concurso
  - abrir um concurso que contenha apostas one-off - buscar exemplo em bets.json
  - navegar para concurso anterior/próximo
  - ver acertos destacados
  - login no admin
  - editar apostas e salvar
  - recarregar e confirmar persistência
- Fixtures/mocks para APIs externas, evitando dependência da rede nos testes

## Assumptions e defaults

- Pasta nova: `newloteca-node/`
- Stack planejada: **Next.js + TypeScript**
- UI inicial: **Opção A**
- CLI não será portada para Node por decisão atual
- `bets.json` continuará sendo a fonte de dados local e compatível com a versão Go
- O app Go permanece intacto durante a migração, servindo como referência de comportamento
- Textos da nova interface continuam em português

## Estado atual resumido

- A aplicação já existe nesta pasta e roda com Next.js, React e TypeScript
- `bets.json` é lido e gravado a partir da raiz deste projeto
- Há testes unitários com Vitest para módulos em `src/lib/`
- A CLI do projeto Go continua fora de escopo
