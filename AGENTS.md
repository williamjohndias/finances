# FINANCES 2.0 — diretrizes de desenvolvimento

## Objetivo e arquitetura
Automatizar o controle financeiro pessoal por Open Finance, integrando Nubank,
Itaú e Mercado Pago pela Pluggy. Preservar Flask, Supabase e Vercel e a
compatibilidade com a aplicação existente. Priorizar soluções gratuitas;
confirmar limites e custos da Pluggy antes de contratar ou ativar uso pago.

## Dados e conciliação
- Open Finance é a fonte principal dos dados realizados. Eliminar a necessidade
  de cadastrar compras, débitos, Pix e pagamentos de faturas manualmente.
- Preservar todo o histórico. Nunca apagar, sobrescrever ou reclassificar dados
  antigos em massa para facilitar uma importação.
- Importações devem ser idempotentes por identificador externo e conta. Valor,
  data e descrição semelhantes são candidatos à conciliação, não prova de duplicata.
- Evitar duplicação entre dados importados e históricos, receitas, despesas,
  transferências entre contas próprias e pagamentos de faturas. Transferências
  próprias e quitação de faturas não representam novas receitas/despesas.
- Abatimentos existentes são pagamentos efetivos de faturas; conciliá-los antes
  de contabilizar um pagamento importado. Preservar seus registros originais.
- Projetar receitas recorrentes, despesas futuras e parcelas separadamente dos
  realizados. Conciliar projeções com eventos confirmados antes de somar totais.
- Distinguir origem, confirmação bancária, pendência e estimativa na persistência
  e na interface. Pendências e estimativas não viram realizados automaticamente.
- Manter dados importados em preparação até a conciliação explícita. Não alimentar
  saldos existentes diretamente na primeira etapa.

## Segurança e entrega
- Nunca expor credenciais em código, frontend, commits, logs, testes ou chat.
  Usar configurações seguras; não reutilizar chaves presentes em documentação.
- Credenciais Pluggy ficam no backend. Endpoints novos exigem autorização e
  permanecem desativados por padrão. Não registrar payloads financeiros.
- Nunca alterar produção, executar migrações remotas, fazer merge ou deploy sem
  aprovação explícita. Entregar migrações aditivas, não executadas, para revisão.
- Trabalhar em branch separada, com testes e PR. Usar o checkout existente;
  tarefas cloud já são isoladas, sem necessidade de worktree.
- Testar paginação, repetição de importação, atualização de pendências,
  conciliação e falhas sem acesso a bancos reais. Não desativar TLS.

## Desenvolvimento local
Python 3.12: `python3 -m venv venv` e
`venv/bin/python -m pip install -r requirements.txt`.
Testes: `venv/bin/python -m unittest discover -s tests -v`.
Servidor: `venv/bin/python -m flask --app app run --no-reload --no-debugger`.
Não confundir respostas vazias sem Supabase com integração validada.
