# NewLoteca Node

Next.js 16 app for Mega-Sena lottery tracking and personal bets, running on a homelab server.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript (strict mode)
- better-sqlite3 — local SQLite for contest cache and bets
- Vitest — unit/integration tests

## Requisitos

Node.js v22 LTS (gerenciado via nvm). Execute antes de instalar ou testar:

```bash
nvm use
```

## Scripts

```bash
npm install
npm run dev          # servidor de desenvolvimento em http://localhost:3000
npm test             # suite de testes Vitest
npm run verify:runtime   # verifica alinhamento de Node + better-sqlite3
npm run build        # build de produção
npm run checker      # executa o conferidor manualmente
```

## SQLite (`data/loteca.db`)

Banco único para todo estado persistente — criado automaticamente na primeira execução.

**Tabela `contests`** — cache de resultados da Mega-Sena  
**Tabela `bets`** — apostas (uma linha por aposta)  
**Tabela `app_state`** — metadados simples do app, incluindo a última fonte bem-sucedida da Mega-Sena

```
id         INTEGER PRIMARY KEY AUTOINCREMENT
numbers    TEXT    -- números separados por espaço, ex: "03 15 18 23 40 54"
type       TEXT    -- 'permanent' ou 'one_off'
contest    INTEGER -- NULL para apostas permanentes
created_at TEXT
```

Apostas são gerenciadas diretamente no banco (sem interface admin). O campo `numbers` é legível via `sqlite3 data/loteca.db "SELECT * FROM bets;"`.

## Cache de concursos

- **Concurso mais recente**: sempre busca na API externa, salva no banco, usa banco como fallback
- **Concurso específico por número**: busca no banco primeiro; consulta API somente em cache miss

Fontes externas:
- **Cloudflare Worker** (`caixa-worker`): fonte única e oficial (proxy edge para a API da Caixa), evita bloqueios de IP. URL configurada via `CAIXA_WORKER_URL` em `.env.production` e nos services systemd. Se a env var não estiver presente, a consulta falha.
- Fallback local: se a API estiver fora, o app usa o último concurso salvo no banco SQLite.
- Removido fallback exaustivo (Guidi, Lotorama, Proxy Heroku) para otimizar performance e confiabilidade.

## Deploy (homelab)

- Serviço app: `~/.config/systemd/user/newloteca.service`
- Porta local: `127.0.0.1:8126`
- URL pública: `https://newloteca.botlab.dev.br/` (via Cloudflare Tunnel)

Após qualquer `npm run build`, reiniciar o serviço é obrigatório:

```bash
npm run build && systemctl --user restart newloteca.service
```

Comandos úteis:

```bash
systemctl --user status newloteca.service --no-pager
journalctl --user -u newloteca.service -n 100 --no-pager
```

### Verificação de runtime (Node / better-sqlite3)

`better-sqlite3` é um addon nativo — deve ser compilado para o ABI do Node em uso. Em caso de mismatch os logs mostram `ERR_DLOPEN_FAILED`.

```bash
npm run verify:runtime
```

O script compara o node do serviço com o node do ambiente e testa o carregamento do addon. Também executa via `ExecStartPre` antes de o serviço subir.

Para realinhar tudo (reinstalar nvm, node 22, reconstruir addon, atualizar serviços):

```bash
bash scripts/setup-node.sh
```

---

## loteca-checker (notificador)

Script TypeScript que confere o resultado da Mega-Sena e envia notificações, executado via timer systemd.

### Execução manual

```bash
npm run checker
```

### Funcionamento

1. Busca o último resultado via pipeline compartilhado de fontes externas (ordem dinâmica baseada na última fonte bem-sucedida; falha se todas estiverem fora do ar)
2. Salva no banco SQLite antes do check de deduplicação
3. Carrega apostas do banco (`data/loteca.db`, tabela `bets`)
4. Compara apostas com o sorteio e formata mensagem
5. Envia notificação via Discord/Telegram usando `ops/config/send_notification`
6. Grava o número do concurso notificado em `state/ultimo_concurso.txt` (deduplicação)

O checker compartilha todo o código de `src/lib/` com o web app — sem lógica duplicada.

### Timer systemd

Executa Ter/Qui/Sáb às 22:00 e 23:00 (America/Sao_Paulo):

```bash
systemctl --user status loteca-checker.timer --no-pager
journalctl --user -u loteca-checker.service -n 20 --no-pager
```

### Apostas

As apostas ficam na tabela `bets` do SQLite. Exemplo de consulta direta:

```bash
sqlite3 data/loteca.db "SELECT type, contest, numbers FROM bets ORDER BY type, contest, id;"
```

- `permanent` — verificadas em todos os concursos (`contest` = NULL)
- `one_off` — verificadas apenas no concurso indicado em `contest`

Para editar apostas, use qualquer cliente SQLite ou insira diretamente:

```sql
-- Aposta permanente
INSERT INTO bets (numbers, type, contest) VALUES ('01 07 14 23 38 52', 'permanent', NULL);

-- Aposta avulsa para o concurso 3001
INSERT INTO bets (numbers, type, contest) VALUES ('05 12 19 27 44 58', 'one_off', 3001);

-- Substituir todas as apostas de um concurso
DELETE FROM bets WHERE type='one_off' AND contest=3001;
```
