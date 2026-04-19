# NewLoteca Node

Nova implementação em Node.js/Next.js do projeto `newloteca`, mantendo as funcionalidades web/admin e usando `bets.json` local na raiz do projeto.

## Ambiente

Defina:

```bash
ADMIN_PASSWORD=sua_senha
SESSION_SECRET=um_segredo_longo
```

## Scripts

```bash
npm install
npm run dev
npm test
npm run build
```

Abra `http://localhost:3000` para a interface pública e `http://localhost:3000/admin/login` para o admin.

## Stack

- Next.js 16
- React 19
- TypeScript em modo `strict`
- Vitest para testes unitários

## Deploy (homelab)

- Serviço app: `~/.config/systemd/user/newloteca.service`
- Porta local: `127.0.0.1:8126`
- Cloudflare tunnel service: `~/.config/systemd/user/cloudflared-newloteca.service`
- Token do túnel: `~/.config/cloudflared/newloteca.token` (arquivo com token)
- URL pública: `https://newloteca.botlab.dev.br/`

Comandos úteis:

```bash
systemctl --user daemon-reload
systemctl --user enable --now newloteca.service
systemctl --user restart newloteca.service
systemctl --user status newloteca.service --no-pager
journalctl --user -u newloteca.service -n 100 --no-pager

# após preencher token
systemctl --user enable --now cloudflared-newloteca.service
systemctl --user status cloudflared-newloteca.service --no-pager
journalctl --user -u cloudflared-newloteca.service -n 100 --no-pager
```

## Cache SQLite

A aplicação mantém um cache local dos dados de concursos da Mega-Sena em SQLite:

- **Caminho do banco**: `data/loteca.db`
- **Tabela**: `contests`
- **Dependência**: `better-sqlite3`

Comportamento do cache:

- **`/api/contest/latest`**: Sempre busca da API externa, salva no banco e retorna os dados
- **`/api/contest/[numero]`**: Primeiro verifica o cache local; se não existir, busca da API externa e salva

O cache reduz latência para concursos já consultados e serve como fallback em caso de indisponibilidade temporária das APIs externas. O banco é compartilhado com o script Python `loteca_checker.py`.

## Observações

- Web app e checker leem/escrevem o mesmo arquivo canônico `bets.json` na raiz do projeto
- O banco SQLite em `data/loteca.db` armazena cache de concursos
- Foundation de migração de apostas para DB: `docs/bets-db-migration-foundation.md`
- O projeto Go original permanece como referência funcional
- A CLI não foi portada para esta versão

---

## loteca-checker (notificador)

O projeto inclui um script de conferência e notificação da Mega-Sena, executado via timer systemd.

### Execução manual

```bash
cd /home/ubuntu/projects/web/loteca
npm run checker
# ou diretamente:
# tsx scripts/loteca-checker.ts
```

### Funcionamento

1. Busca o último resultado da Mega-Sena (APIs: guidi.dev.br → Caixa → proxy herokuapp)
2. Compara com as apostas em `bets.json` (raiz do projeto)
3. Envia notificação via Discord usando `ops/config/send_notification`
4. Deduplicação: grava último concurso notificado em `state/ultimo_concurso.txt`

### Timer systemd

O timer executa Ter/Quie/Sáb às 22:00 e 23:00 (America/Sao_Paulo):

```bash
systemctl --user status loteca-checker.timer --no-pager
journalctl --user -u loteca-checker.service -n 20 --no-pager
```

### Configuração de apostas

Arquivo canônico: `bets.json` (raiz do projeto)

> `config/bets.json` é legado/deprecated e não é fonte de runtime.

```json
{
  "permanent": [["01", "02", "03", "04", "05", "06"]],
  "one_off": {
    "2995": [["10", "20", "30", "40", "50", "60"]]
  }
}
```

- `permanent`: apostas fixas (verificadas em todos os concursos)
- `one_off`: apostas específicas por número do concurso
