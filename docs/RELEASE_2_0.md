# FINANCES 2.0 — release candidate da Issue #12

Base preservada: PR #9 e PR #11 (`feat/issue-10-pluggy-sync`). Este documento é um
roteiro de revisão; não autoriza executar migrações, merge, deploy ou ativação.
Nenhum serviço pago foi contratado. A aplicação continua Flask + Supabase + Vercel.

Versão candidata: `2.0.0-rc.1`. `release/manifest.json` identifica a base e os SHA-256
das migrações, lockfile e bundle revisados. `python scripts/release_manifest.py --check`
verifica os artefatos; isso não publica release nem certifica homologação bancária.

## O que mudou

- SDK **oficial** `pluggy-connect-sdk@2.14.2`, versão fixa e lockfile NPM com
  integridade. Bundle local com esbuild, sem depender do CDN no carregamento da
  página. `npm ci --ignore-scripts --cache /tmp/finances-npm-cache && npm run build`
  em `frontend/` reproduz o bundle. SDK usa MIT e zoid usa Apache-2.0; as notas de licença
  ficam junto do bundle. O build remove console para não registrar eventos/props.
- Consentimento explícito, callbacks sem log de payload, item vinculado no backend,
  tratamento de erro/fechamento e reconexão com token limitado ao item já pertencente
  ao usuário. CSP libera apenas o iframe oficial `https://connect.pluggy.ai` e
  estilos inline necessários ao modal; não libera scripts inline ou eval.
  O binding é opaco e estável por usuário/ambiente para `avoidDuplicates` funcionar
  entre tentativas de conexão. Consentimentos continuam individuais; renovar um
  não autoriza automaticamente outro item. Falha transitória no callback tem botão
  de retry do mesmo vínculo, sem criar conexão nova. Retry permanece em memória,
  sem guardar tokens ou IDs financeiros em storage do navegador.
- Conexões existentes do Meu Pluggy **não são assumidas acessíveis**. O mesmo item
  deve estar acessível pelas credenciais do aplicativo e ter o binding esperado.
  `clientUserId` divergente é rejeitado. Não usamos listagem paga de items, nem
  adotamos item só porque seu ID foi informado. Sem vínculo, conectar pelo fluxo
  oficial; migração de conexões requer verificação e plano separados com a Pluggy.
- `OPEN_FINANCE_MODE` é `sandbox` por padrão. `connector.isSandbox` é verificado
  no servidor e gravado no inventário; o worker rejeita outro ambiente. Items antigos
  ficam `unknown` até verificação real; não entram no dashboard. Sandbox e produção
  nunca são somados, mesmo para o mesmo usuário.
  Em sandbox, o backend consulta `/connectors?sandbox=true`, verifica isSandbox
  em cada resposta e restringe `connectorIds` do widget. `includeSandbox=true`
  sozinho incluiria bancos reais; sem lista verificada, o Connect não é aberto.
- Autenticação Supabase verificada remotamente, cookies HTTPS/HttpOnly/SameSite,
  CSRF por Origin, rate limits atômicos no DB para login/autenticação/Connect,
  tokens de cron e webhook separados. Sem valores de credenciais em frontend,
  logs, documentação ou respostas. A classificação da chave Supabase é apenas
  metadado; o banco decide os privilégios. Chave service_role/secret existente é
  reutilizada; uma binding separada só é necessária se a chave existente for pública.

## Conciliação e dashboard

Importação de contas, saldos, Pix, compras e pagamentos não exige digitar os dados.
Conciliação incerta exige revisão de natureza/vínculos, não recadastro de valores.

As decisões são append-only em `of_audit`; `of_reconciliations` mantém a visão
corrente. Retry usa request UUID idempotente, revisionamento do banco e locks por
proprietário. Alteração de valor, estado, data ou metadados invalida a decisão até
nova revisão. Pares também verificam a revisão da outra ponta. Não há matching
automático apenas por descrição, data ou valor.

Automático, quando confirmado e não futuro:

- Compra de cartão com metadado explícito SINGLE/INSTALLMENT, direção DEBIT e
  conexão no binding estável desta versão. Conexões antigas com bindings diferentes
  permanecem pendentes até revisão; não são automaticamente somadas em paralelo.
- Transferência BANK com documentos completos de pagador e recebedor iguais ao
  documento da própria conta; comparação transitória, sem guardar CPF/CNPJ.
- Categoria exata, conta e direção de regra previamente aprovada pelo usuário.
  Regra não se estende a outro banco/conta e pode ser desativada com auditoria.

Sem essa evidência, o registro permanece pendente. Não se inventam salários,
pagamentos, faturas ou parcelas futuras para fazer o dashboard parecer completo.

Revisão explícita suporta receita, despesa, estorno de cartão, transferência
própria com duas contas, liquidação de fatura com débito bancário/crédito de cartão,
duplicata de outra importação e vínculo único a histórico/abatimento/recorrência.
Pares são neutros; reabrir um par reabre ambas as pontas. Abatimento é pagamento
efetivo: nunca nova despesa. Estorno reduz despesa e não vira renda. Valores e
moeda precisam coincidir nos vínculos; isso valida consistência, não prova identidade.

O dashboard bancário usa Decimal, separa moedas, realizado conciliado, pendências,
observações de saldo e projeções. Histórico não é somado novamente ao realizado.
Recorrências são estimativas até conciliação por ocorrência; parcelas futuras só
são mostradas quando existentes no histórico atribuído ou retornadas pelo banco.
Não multiplicamos o valor de uma parcela pelo total de parcelas. PENDING/UNKNOWN
e registros futuros, mesmo POSTED, ficam fora do realizado.
Saldos são exibidos por conta observada; não há soma automática de saldos entre
conexões potencialmente duplicadas. A existência de dois saldos semelhantes não
prova que são a mesma conta ou contas distintas.

Histórico legado não tem proprietário na base original. Para não expô-lo a qualquer
conta Supabase, uma operação de cutover **revisada** cria snapshots privados e
imutáveis em `of_legacy_ownership`, sem alterar ou apagar as tabelas originais.
`scripts/assign_legacy_owner.py` usa dry-run por padrão, pagina todas as linhas e
não imprime dados; sandbox só aceita fixture sintética. Produção requer referência
de aprovação externa e verificação de que o usuário é titular do histórico inteiro.
O mapeamento não admite troca de proprietário nem sobrescrita de snapshot.
Alterações posteriores no ledger legado não atualizam snapshots automaticamente;
revisar correções por fluxo auditável, sem operar dois ledgers em paralelo.

## Sincronização automática e limites gratuitos

`vercel.json` mantém um cron diário às 09:00 UTC (06:00 em São Paulo), dentro da
frequência Hobby, protegido por CRON_SECRET. Até três items por chamada, checkpoints
por página e orçamento de execução limitado; grandes cargas podem precisar de
rodadas adicionais autorizadas antes do cutover. Consulta da tela a cada minuto
atualiza a visualização; **não** força coleta bancária nem implica tempo real.
Webhooks autenticados por header customizado apenas enfileiram; a coleta usa a
API oficial. `eventId` tem deduplicação durável. Não se afirma assinatura HMAC:
confirmar com a Pluggy se há contrato oficial adicional antes de ativar webhooks.
Evento de transação removida só enfileira IDs de registros já pertencentes ao
item/conta. O worker confirma identidade e consulta o endpoint da transação;
somente 404 do provedor marca UNKNOWN, invalida a conciliação e registra auditoria,
sem apagar valores ou histórico. Erros 401/429/5xx não são tratados como exclusão.
Ausência em uma página/varredura não é prova de remoção. A verificação é retomável
e limitada por rodada; registros indisponíveis ficam pendentes, sem valores fictícios.

Cron, registro de webhooks, número de conexões, dados disponíveis e frequência da
própria instituição dependem do plano Pluggy. Preços/documentação web retornaram
403 no ambiente. **Plano, franquia gratuita e cobertura real ainda precisam de
confirmação**; não ativar recursos pagos ou aumentar cron por suposição.

## Testes e o que cada um comprova

```sh
venv/bin/python -m unittest discover -s tests -v
bash tests/run_postgres.sh
node --test tests/open-finance-ui.test.cjs
cd frontend
npm ci --ignore-scripts --cache /tmp/finances-npm-cache
npm run build
npm run test:e2e
```

E2E usa Chromium (`FINANCES_CHROMIUM`, padrão `/usr/bin/chromium`), servidor HTTPS
local com certificado descartável e dados sintéticos. Um cenário usa callback
simulado para provar login → consentimento → vínculo → worker → dashboard →
conciliação → reconexão → logout. Outro carrega o SDK oficial real e abre o iframe
oficial, interceptado por uma resposta local. Isso **não comprova login na Pluggy,
consentimento bancário ou sucesso de conexão externa**. Sem conta/plano/bindings
de sandbox disponíveis, o teste vivo permanece skipped, nunca aprovado.
O antigo `test_supabase.py` foi corrigido para não imprimir prefixos de chaves:
smoke remoto só roda com consentimento read-only explícito; o padrão é SKIPPED.

SQL aplica 001/002/003 em PostgreSQL 17 descartável sem rede e verifica RLS/grants,
auditoria, idempotência, neutros, alterações do banco e preservação do histórico.
Não substitui validação real de Supabase Auth/PostgREST e limites do plano.
`scripts/release_preflight.py` verifica apenas presença de bindings e tipo de chave,
sem valores e sem rede; retorna não pronto quando faltam requisitos.

## Aceite por banco — registrar evidência antes de ativar

Para **cada** Nubank, Itaú e Mercado Pago, registrar em homologação, sem PII:

| Verificação | Critério | Evidência necessária |
| --- | --- | --- |
| Conector | Nome/id e isSandbox/cobertura Open Finance correspondem ao banco | Referência do cenário, sem item/CPF real em logs |
| Consentimento | Connect cria vínculo; reconexão e revogação funcionam | Status sanitizado e horário |
| Conta e cartão | BANK/CREDIT reais disponíveis; moeda e saldo coerentes | Contagens e tipos, sem dados pessoais |
| Transações | POSTED/PENDING, Pix, compra, crédito, paginação e reimportação | Contagens estáveis e testes de atualização |
| Fatura paga | Débito bancário/crédito de cartão/abatimento conciliados uma vez | Asserções de neutralidade |
| Próprias | Duas contas e confirmação de titularidade, sem receita/despesa | Teste de par e de dado insuficiente |
| Parcelas/faturas futuras | Metadados e datas efetivamente retornados | Não prometer campos ausentes ou parcelas inventadas |
| Falhas | MFA/LOGIN_ERROR/expiração/cursor/429/5xx/replay | Erros sanitizados e retomada sem duplicar |
| Plano | Conector, contas, cron/webhook e franquia gratuitos confirmados | Registro do plano/limites; sem contratação |

API pode não oferecer faturas completas, quitação correspondente ou todas as
parcelas futuras. A ausência não é zero: manter pendência/estimativa identificada.
Sandbox não demonstra automaticamente a cobertura do banco real. Contas reais só
após consentimento e aprovação específicos; não houve acesso real nesta entrega.

## Roteiro exato de ativação (somente após aprovação final)

1. Revisar este PR e as migrações. Confirmar plano gratuito/franquia/conectores e
   pré-requisitos Vercel/Supabase. Rotacionar credenciais anteriormente expostas,
   sem reproduzir valores. Conferir backups restauráveis e titularidade do histórico.
2. Em **homologação separada**, aplicar 001 e 002 se ainda ausentes, depois 003,
   com parada em erro e histórico de migrações. São transacionais e não reaplicáveis.
   Não executar sobre produção neste trabalho. Verificar funções/grants/RLS no
   Supabase real, pois BYPASSRLS e defaults podem diferir do container de teste.
3. Configurar bindings seguras já existentes em homologação: SUPABASE_URL,
   SUPABASE_KEY, PLUGGY_CLIENT_ID/SECRET, CRON_SECRET e OPEN_FINANCE_WEBHOOK_TOKEN.
   Só se necessário, SUPABASE_SERVICE_ROLE_KEY separado. Rede: api.pluggy.ai,
   connect.pluggy.ai no navegador, hostname exato do Supabase. Sem segredos no chat.
4. Em homologação, OPEN_FINANCE_MODE=sandbox e PLUGGY_ENABLED=true; produção
   continua false. Executar teste vivo opt-in e preencher a matriz acima. Importar
   apenas fixtures sintéticas de legado, testar dois usuários, CSRF, quotas, retorno
   de callbacks, cron autenticado, duplicação e rollback. Registrar resultados reais.
5. Com a matriz concluída, apresentar para aprovação os comandos de migração
   Production, o snapshot de titularidade, plano de deploy e configuração exata.
   A aprovação é a última etapa, após evidências; esta entrega não a pressupõe.
6. Na janela aprovada, manter PLUGGY_ENABLED=false; aplicar somente migrações
   faltantes, atribuir o histórico revisado ao usuário correto via dry-run e --apply
   com --approved-change-id. Comparar contagens/checksums antes/depois. Não usar
   fixtures para mapear produção nem renumerar/apagar históricos.
7. Após revisão e deploy **autorizados**, configurar OPEN_FINANCE_MODE=production,
   OPEN_FINANCE_RELEASE_APPROVED=true, OPEN_FINANCE_DASHBOARD=true e, por último,
   PLUGGY_ENABLED=true. As APIs legadas sem proprietário passam a 410, e `/`
   direciona ao dashboard autenticado. Não operar simultaneamente lançamentos no
   ledger antigo. O site continuará em modo legado até esse corte explícito.
8. Registrar webhook com header autorizado sem query-secret; confirmar autenticidade
   e cron real com CRON_SECRET. Executar smoke: anônimo negado, login HTTPS,
   outro usuário sem dados, consentimento/Connect, coleta, reimportação idempotente,
   neutros e pendências, dashboard consistente, logout sem cache, quotas e erros.
   Não habilitar conciliação automática de categorias antes de revisar as regras.

## Rollback sem apagar histórico

Manter OPEN_FINANCE_DASHBOARD=true para bloquear APIs antigas sem autenticação,
desabilitar PLUGGY_ENABLED e agendamento/webhooks no plano aprovado, e retornar à
tela de manutenção autenticada. Não remover tabelas, snapshots, audit ou dados do
banco. Reverter código só para versão compatível com as colunas aditivas e a
proteção de acesso; reabrir APIs antigas publicamente não é rollback seguro.
Não executar DROP como rotina. Uma transação de migração com erro deve ser
revertida integralmente; reparar somente em homologação antes de repetir.
