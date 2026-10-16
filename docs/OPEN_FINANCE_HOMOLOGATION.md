# Issue #10 — sincronização isolada para homologação

## Estado desta entrega

Código baseado no PR #9, sem merge, deploy ou acesso a bancos de produção.
`PLUGGY_ENABLED` continua **false** por padrão; não alterar a configuração
Production existente. Publicar uma branch não comprova integração bancária
funcional. Sandbox e disponibilidade dos três conectores precisam de homologação.

O backend agora verifica a identidade com `supabase.auth.get_user(token)`, sem
confiar em JWT decodificado localmente. Credenciais bancárias, Pluggy e Supabase
nunca são enviadas à tela. A sessão da tela usa cookie Secure/HttpOnly/SameSite
Strict, sem refresh token ou armazenamento persistente no navegador, com duração
máxima de uma hora e validação remota em cada chamada. A senha é usada apenas para
login no Supabase Auth, sem registro local. O provedor deve manter proteção contra
tentativas abusivas habilitada. Não há criação pública de usuários nesta entrega.

## Inventário, consentimento e sincronização

1. Usuário autenticado solicita `POST /api/open-finance/connect-token` com
   `{"consent":true}`. O servidor grava consentimento local de 30 dias e cria um
   `clientUserId` aleatório; o token limitado é vinculado a ele. Esse registro não
   substitui o consentimento bancário obtido no fluxo oficial Pluggy Connect.
2. Após o fluxo oficial, `POST /api/open-finance/items` recebe `itemId` e
   `consentId`. O backend consulta o item na Pluggy e exige que seu `clientUserId`
   corresponda ao binding do consentimento ativo do usuário. IDs enviados pelo
   cliente nunca determinam propriedade. O widget Connect completo não é adicionado
   nesta etapa; homologar esses endpoints com o widget oficial em ambiente separado.
3. `POST /api/open-finance/sync` apenas marca os items do usuário autenticado.
   O worker descobre as contas pela API, exige `itemId` correto e não usa
   `account_id` recebido do navegador. Items precisam estar `UPDATED` para coleta.
   Erros e estados de autenticação/MFA aparecem separadamente na interface.
4. Conta/saldo e transações normalizadas ficam em staging. Não são guardados
   documentos, nomes de titulares, descrições ou payloads bancários integrais novos.
   Uma página e seu cursor são gravados na mesma transação SQL. Lease de dois
   minutos, consentimento ativo e propriedade são revalidados no banco a cada
   escrita. Repetições atualizam a chave Pluggy/conta/id e preservam conciliação.
5. Cada rodada completa reinicia a varredura, necessária para atualizar pendências
   antigas. Não se usa apenas a data da última transação. Interrupções retomam o
   cursor; cursor rejeitado pelo provedor exige investigar/resetar **apenas o cursor
   de staging** após autorização operacional. Não excluir transações para corrigir.

Sincronização é eventual: transações removidas pelo provedor não são apagadas nem
reclassificadas automaticamente. Eventos de remoção provocam nova consulta; sua
conciliação e eventual tombstone auditável ficam pendentes, sem efeito no ledger.
Pendências com mudança de ID também ficam separadas até conciliação.

`/open-finance` mostra conexão, consentimento, observações de saldo e os últimos
100 registros coletados. Tudo identifica origem e estado; nenhuma importação
participa do dashboard. Revogar consentimento impede novas coletas e mantém os
dados históricos já coletados. Revogação bancária no provedor é um passo separado.
Sem cache HTTP, sem cache offline do service worker e sem persistência de tokens
no frontend. O histórico legado e suas permissões públicas existentes não foram
alterados; esta entrega não resolve a autenticação global do sistema legado.

## Agendamento e webhooks

- `GET /api/open-finance/jobs/sync` exige `Authorization: Bearer <CRON_SECRET>`.
  Vercel Cron usa essa convenção. `vercel.json` propõe execução diária às 09:00 UTC
  (06:00 em São Paulo), compatível com a frequência diária do Hobby; nenhum cron
  foi instalado ou executado na Vercel. Uma chamada trabalha até três items, dez
  páginas por item e orçamento de 20 segundos; excedentes mantêm checkpoint e fila.
  Para grandes históricos, planejar invocações adicionais autorizadas sem aumentar
  a frequência/custo de produção implicitamente. Conferir o limite de duração do
  runtime no plano antes de aprovar deploy. GETs têm até três tentativas com backoff
  limitado/jitter; timeouts transitórios de leitura também são repetidos. POSTs de
  token não são repetidos. Falhas ficam com código genérico e espera de cinco minutos.
- `POST /api/open-finance/webhook` exige outro bearer,
  `OPEN_FINANCE_WEBHOOK_TOKEN`, de pelo menos 32 caracteres, enviado como header
  personalizado configurado no webhook Pluggy. Nunca usar segredo em query string.
  O SDK oficial documenta headers customizados, mas não um protocolo HMAC. Por isso
  **não se afirma validação de assinatura criptográfica do corpo**. Confirmar o
  contrato efetivo com a Pluggy na homologação. Se assinatura vier a ser suportada,
  implementar verificação sobre bytes brutos antes de habilitar esse modo.
- Replay é bloqueado duravelmente por `eventId` único no banco, gravado na mesma
  transação que enfileira o item. IDs de eventos são retidos; não podar sem definir
  janela segura com o provedor. Item desconhecido/revogado é ignorado. Webhook só
  enfileira coleta: não cria contas, não adota items nem aceita valores financeiros.
  O worker volta à API e verifica a identidade. Não há registro automático de
  webhook nesta entrega. Nunca cadastrar endpoint de produção sem aprovação.

## Configuração e permissões (não solicitar valores no chat)

As credenciais já existentes na Vercel não foram copiadas ou lidas. No ambiente
local, os nomes SUPABASE_URL/SUPABASE_KEY/PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET
estavam ausentes; logo, não há como inferir a função da chave de produção ou seu
plano Pluggy. `Runtime.store()` classifica a chave **sem exibir valor**:

- JWT legado: metadado de role `anon` ou `service_role`;
- chave nova: prefixo `sb_publishable_` ou `sb_secret_`;
- desconhecida/ausente: falha fechada, sem tentar promover privilégios.

A classificação de metadados não autentica uma chave nem substitui grants do DB.
Se SUPABASE_KEY for service_role/secret, ela é reutilizada apenas no backend. Se
for anon/publishable, o staging privado exige uma binding separada
`SUPABASE_SERVICE_ROLE_KEY`; somente nessa situação ela é indispensável.
Não é necessário trocar a chave usada pelo ledger existente. Um cliente separado
de Auth impede que sign-in substitua a autorização do cliente privilegiado.

Rede de homologação: `api.pluggy.ai` e o hostname exato do Supabase. Outros requisitos
são PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, CRON_SECRET e OPEN_FINANCE_WEBHOOK_TOKEN,
geridos pelas configurações seguras, nunca no repositório. Nenhum segredo foi pedido.
Há menção de segredo compartilhado em chat na issue: recomenda-se rotacioná-lo
pelo provedor, sem bloquear desenvolvimento local e sem reproduzir o valor.
Também foram removidos literais com formato de credencial de quatro documentos
legados. Remover exemplos não apaga o histórico Git nem revoga chaves: rotacionar
as credenciais anteriormente expostas e não reutilizá-las na homologação.

## Migração e rollback para revisão

1. Revisar SQL, confirmar destino **homologação isolada**, fazer backup verificável
   de schema/dados e preservar a versão anterior do aplicativo.
2. Aplicar `001_open_finance_staging.sql` se ainda não aplicada, depois
   `002_open_finance_sync.sql`, via executor com parada em erro. Cada arquivo é
   transacional e deve ser registrado uma única vez no histórico de migrações;
   não reaplicar em banco existente. A 002 pressupõe `auth.users` e os papéis
   Supabase anon/authenticated/service_role.
3. Verificar grants/RLS e isolamento entre dois usuários com dados sintéticos.
   Nenhuma tabela nova tem policy de leitura pública. RPCs são SECURITY INVOKER,
   têm search_path fixo e EXECUTE somente para service_role. No Supabase esse papel
   tem BYPASSRLS; isso não autoriza o frontend a usá-lo. Testar as permissões reais
   no projeto antes de qualquer aprovação de produção.
4. Linhas sem dono da etapa 1 permanecem privadas/quarentenadas. Colisão com nova
   importação falha sem avançar cursor e exige revisão; não atribuir automaticamente
   seu histórico a um usuário. Nenhuma tabela do ledger é alterada pela 002.
5. Homologar sandbox com consentimento e verificação `connector.isSandbox=true`.
   Só depois preparar os passos concretos de produção para aprovação explícita.

Rollback preferencial: manter PLUGGY_ENABLED=false, interromper scheduler/webhooks
e retornar ao código anterior sem apagar staging. Novas tabelas/colunas são
aditivas; conservar dados e cursores permite retomar com segurança. Não executar
DROP em produção como rollback automático. Se a migração falhar, a transação
inteira deve ser revertida; corrigir e repetir apenas em homologação. Remoção de
schema ou restauração de backup exigem um plano e aprovação próprios.

## Conciliação a implementar antes de contabilizar

- Conservar ids externos e vínculo de origem; identidade distinta nunca é
  duplicata apenas por data/valor/descrição. Gerar candidatos auditáveis, com
  confirmação humana quando faltarem identificadores suficientes.
- Abatimentos históricos são pagamentos efetivos: vincular a pagamento bancário e
  fatura, sem nova despesa. Conservar o registro original e a decisão de matching.
- Transferências próprias são duas pontas do mesmo movimento, sem renda/despesa;
  confirmar titularidade das contas e identificadores de transferência disponíveis.
- Cartões: separar compra, parcela, saldo/fatura e liquidação; não somar liquidação
  às compras. Parcela futura/recorrência é projeção, até ser vinculada a realizado.
- PENDING e UNKNOWN não entram como confirmados. POSTED não é automaticamente
  receita/despesa. Histórico manual permanece fonte preservada para conciliação.
- Não habilitar integração com os totais até testar esses casos e revisar as regras.

## Evidência e limites de homologação

Comandos locais:

```sh
venv/bin/python -m unittest discover -s tests -v
bash tests/run_postgres.sh
node --test tests/open-finance-ui.test.cjs
```

O runner PostgreSQL cria e remove seu próprio container com rede desativada. Não
aceita URL de banco nem usa credenciais existentes. Testa as migrações reais em
PostgreSQL 17 com papéis Supabase simulados; não substitui homologação PostgREST.

Teste vivo opcional: `tests/test_pluggy_sandbox.py` só roda com consentimento
operacional `PLUGGY_SANDBOX_TESTS=true`, credenciais já vinculadas e um
PLUGGY_SANDBOX_ITEM_ID sintético. Confere isSandbox antes de ler contas/transações;
não escreve em DB e não imprime registros. Sem esses requisitos, é **skipped**,
não aprovado. Os testes não acessam dados reais ou produção.

Fontes oficiais consultadas: SDK Pluggy no commit
[`b1662c93e815b14ce5ed29dd89c9a788f794cf50`](https://github.com/pluggyai/pluggy-node/tree/b1662c93e815b14ce5ed29dd89c9a788f794cf50),
`src/baseApi.ts`, `src/client.ts`, `src/types/auth.ts`, `common.ts`, `account.ts`,
`transaction.ts`, `item.ts`, `connector.ts` e `webhook.ts`. Confirmam /auth,
/connect_token, options.clientUserId, paginação, schemas e headers de webhook.
O endpoint pago /v2/items **não é usado**: o SDK diz que listar items exige plano
pago opt-in. Usamos inventário próprio e GET /items/{id}. Nenhuma nova dependência
ou serviço pago foi contratado. Documentação web e página de preços retornaram
403 neste ambiente; **plano, franquia, conectores e custos ainda não confirmados**.
Isso impede declarar homologação concluída ou habilitar produção.
