# Evidências locais — FINANCES 2.0 RC1

Data: 16/10/2026 (São Paulo). Base: `45b539e63c2fa2d25084e564e72b370051050dd5`,
PR #11, preservando o PR #9. Branch: `feat/issue-12-production-release`.

| Execução | Resultado observado |
| --- | --- |
| Python unittest discover em tests/ | 66 descobertos: 65 aprovados, 1 sandbox skipped |
| tests/run_postgres.sh | 40 verificações aprovadas; migrações 001/002/003 em PostgreSQL 17 isolado sem rede |
| Node open-finance-ui.test.cjs | 2 aprovados; renderização segura e ausência de cache financeiro |
| Playwright + Chromium local | 2 aprovados; fluxo completo simulado e modal do SDK oficial real |
| npm ci --ignore-scripts e npm run build | Aprovados; bundle fixo 2.14.2 e notices reproduzíveis |
| npm audit --omit=dev | Zero vulnerabilidades reportadas no grafo de produção |
| release_manifest.py --check | SHA-256 dos artefatos conferidos |
| test_import.py | Flask, Supabase, dateutil e app importados; config/bindings ausentes |
| test_supabase.py | SKIPPED por ausência de consentimento read-only explícito |
| release_preflight.py | Bloqueado (exit 2): bindings locais ausentes; não pronto para ativação |

## Validação efetiva na Pluggy

SDK oficial obtido do NPM com integridade verificada e lockfile; modal carregado
no navegador com CSP sem script inline/eval, usando iframe interceptado localmente.
Contratos oficiais conferidos no SDK. Autenticação, callbacks e API nos testes
funcionais usam fixtures/transporte simulado. **Nenhuma autenticação viva, conexão
bancária, consentimento externo ou coleta real foi validada** nesta máquina.
O teste vivo de sandbox existe e está skipped porque as bindings não estão
disponíveis. Não foram solicitadas nem extraídas credenciais da Vercel.

Não há evidência de homologação Supabase Auth/PostgREST, cron/webhook remoto ou
cobertura/custos de Nubank, Itaú e Mercado Pago. Não houve migração de produção,
merge, contratação ou comando de deploy. CI remota não foi observada.

## Ativação pendente

Seguir `docs/RELEASE_2_0.md`: confirmar plano gratuito/cobertura, concluir sandbox
e matriz por banco, homologar Supabase/RLS e ownership do histórico, revisar PR e
aprovar os passos concretos de produção. Só então aplicar migrações faltantes e
ativar o release na janela aprovada. O código não substitui essa validação externa.
