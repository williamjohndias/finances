# Pluggy — primeira etapa (desativada por padrão)

Esta etapa prepara transporte server-side, Connect Token protegido e coleta para
staging. Não altera dados históricos, saldos, abatimentos ou projeções. Não ativa
sincronização automática, webhooks ou conexão bancária na interface.

## Configuração para homologação, após revisão

- `PLUGGY_ENABLED=true` habilita apenas `POST /api/open-finance/connect-token`.
- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`: credenciais seguras no backend.
- `OPEN_FINANCE_ADMIN_TOKEN`: segredo aleatório de pelo menos 32 caracteres.
  Enviar como `Authorization: Bearer ...` por HTTPS em ferramenta administrativa;
  não embutir na interface, em scripts versionados ou em armazenamento do navegador.
- Supabase: `SUPABASE_URL` e `SUPABASE_KEY`, com permissão de backend para staging.
- Rede de homologação: `api.pluggy.ai` e hostname exato do projeto Supabase.

Nunca enviar client secret ou API key da Pluggy ao frontend. Só o Connect Token
temporário pode ser entregue ao widget oficial após autenticação. Esta etapa não
inclui widget: antes de expor a usuários, implementar autenticação por usuário,
autorização de propriedade dos items/contas, consentimento e limites de requisição.
O token administrativo é temporário para desenvolvimento, não autenticação final.

## Persistência e limites

`migrations/001_open_finance_staging.sql` é aditiva e **não foi executada**.
Revisar e aplicar apenas em homologação autorizada antes de usar `stage_account`.
RLS não concede acesso a anon/authenticated. Dados financeiros ficam server-only.
`stage_account(client, database, item_id, account_id)` é uma primitiva interna,
não um endpoint público; o chamador deve verificar propriedade da conta e item.
Não a chamar para contas reais nesta etapa. Repetições fazem upsert pela chave
Pluggy/conta/id e preservam a decisão de conciliação já salva. Uma falha pode deixar
parte da coleta em staging; repetir é seguro. Falhas não apagam dados anteriores.
Pendências que mudem de ID e duplicatas entre fontes ainda exigem conciliação.

`POSTED` indica confirmação bancária, não classificação contábil. Nenhuma linha
entra automaticamente nos totais, mesmo se POSTED. Uma transferência própria,
pagamento de fatura ou duplicata do histórico deve ser conciliada antes disso.
Abatimentos históricos continuam sendo pagamentos efetivos. Estimativas e parcelas
futuras continuarão separadas; o motor de conciliação será uma próxima etapa.

## Validação

`venv/bin/python -m unittest discover -s tests -v`

Testes locais com transporte simulado: autenticação, token, paginação por cursor,
host fixo, idempotência, atualização PENDING/POSTED, conta divergente, erros e
autorização. Não comprovam contrato vivo, schema remoto ou disponibilidade dos
conectores Nubank/Itaú/Mercado Pago. Validar esses itens em sandbox com consentimento
antes de produção. Não há novas dependências nem assinatura de serviço contratada.
Confirmar plano gratuito/sandbox e preços atuais da Pluggy antes de ativação paga.

Contrato consultado: SDK oficial https://github.com/pluggyai/pluggy-node,
`src/client.ts` (auth, connect_token e v2/transactions com cursor `after`).
Documentação web da Pluggy retornou 403 neste ambiente; sandbox não foi acessado.

## Próximas etapas

1. Autenticação por usuário e vínculos de consentimento/contas; widget oficial.
2. Coleta agendada/webhooks com autenticação, replay seguro e observabilidade sem PII.
3. Conciliação auditável com histórico/abatimentos e transferências próprias.
4. Projeções separadas de realizados e interface com origem/status visíveis.

Nenhum merge, deploy ou alteração de produção está autorizado por esta entrega.
