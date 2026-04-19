# Bets storage migration foundation (JSON → DB, sem cutover)

## Estado atual (implementado)

- Fonte canônica de apostas: `bets.json` na raiz do projeto.
- Web (`src/lib/bets.ts`) e checker (`scripts/loteca-checker.ts`) convergem para o mesmo path por padrão.
- `LOTECA_BETS_FILE` continua disponível para override operacional/debug.
- `config/bets.json` é legado/deprecated (não usado como source em runtime).

## Foundation de repository (sem troca de source primária)

Arquivo: `src/lib/bets-repository.ts`

Contrato comum:

```ts
export type BetsRepository = {
  load(): Promise<BetsConfig>;
  save(config: BetsConfig): Promise<void>;
  close?(): void;
};
```

Implementações:
- `createJsonBetsRepository(filePath)`
- `createDbBetsRepository(dbPath)`

Objetivo: permitir migração gradual para DB sem mudar comportamento atual da produção.

## Esquema mínimo proposto para DB (`bets`)

```sql
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  permanent TEXT NOT NULL,
  one_off TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Constraints e índices

- `id=1` garante registro singleton (estado ativo).
- `NOT NULL` em `permanent` e `one_off`.
- `updated_at` atualizado em cada upsert.
- Índice adicional não é necessário no desenho singleton.

## Opção evolutiva: `bet_sets` versionado (próxima fase)

Para histórico/auditoria e rollback por versão:

```sql
CREATE TABLE IF NOT EXISTS bet_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bet_sets_active
ON bet_sets(is_active)
WHERE is_active = 1;
```

Benefícios:
- trilha histórica de mudanças;
- rollback simples por troca de `is_active`;
- base para auditoria/admin avançado.

## Plano de cutover seguro (não executado nesta etapa)

1. **Fase 0 (agora)**: JSON canônico + contrato de repository + testes de contrato.
2. **Fase 1**: introduzir feature flag para leitura primária via DB (`LOTECA_BETS_SOURCE=db|json`, default `json`).
3. **Fase 2**: opcional dual-write com validação pós-escrita e alertas de divergência.
4. **Fase 3**: ativar DB em ambiente controlado, com rollback imediato para JSON.
5. **Fase 4**: remover dependência operacional de JSON após janela estável.

## Riscos conhecidos para o cutover

- Drift se dual-write for ativado sem observabilidade.
- Corrupção de payload JSON serializado no DB sem validação.
- Dependência de ABI (`better-sqlite3`) em upgrades de Node.

Mitigações:
- validação obrigatória (`validateBetsConfig`) em todos os providers;
- testes de contrato iguais para JSON e DB;
- rollback feature-flag para `json` por default.
