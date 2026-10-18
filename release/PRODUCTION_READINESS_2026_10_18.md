# Verificação pré-produção — 18/10/2026 UTC

Base inspecionada: RC1 `27e715eb473f8e2d9d1a5cac472a24294abfcddc`, preservando
o commit do PR #11 e a integração inicial do PR #9. A main remota consultada
permanece em `200ce50bcb9ba38e78fdd3e7bb242a740559bae0`.

## Correção preparada

A auditoria do ambiente instalado apontou os advisories PYSEC-2026-2151
(Flask 3.0.0) e PYSEC-2026-348 (h11 0.14.0). Atualizados Flask para 3.1.3,
httpcore para 1.0.9 e h11 para 0.16.0, mantendo httpx 0.27.0 e Supabase 2.5.0.
O manifesto passa a verificar também requirements.txt. Nenhuma migração foi
alterada. O pip local foi atualizado para 26.2.1; sua versão no ambiente de
build da Vercel ainda precisa ser inspecionada.

## Evidências desta execução

- Python após a correção: 66 testes descobertos, 65 aprovados e 1 pulado.
  O teste pulado exige bindings e consentimento de sandbox real.
- PostgreSQL 17 descartável, container sem rede: 40 verificações aprovadas,
  aplicando 001/002/003 somente ao banco sintético.
- Node: 2 testes aprovados.
- Playwright/Chromium após a correção: 2 cenários aprovados, com dados e
  respostas bancárias simulados. O iframe do SDK oficial é interceptado localmente.
- npm ci, build, npm audit --omit=dev: aprovados; zero vulnerabilidades NPM
  de produção reportadas.
- pip check: sem incompatibilidades. pip-audit após a correção: nenhuma
  vulnerabilidade conhecida reportada nos pacotes instalados.
- Manifesto regenerado para os novos requisitos; hashes conferidos.
- Nenhuma autenticação viva na Pluggy ou importação de contas reais validada.

## Bloqueios observados

Há acesso de leitura Git. A consulta GraphQL do GitHub retorna Forbidden,
inclusive com tentativa de permissão ampliada; checks e aprovações remotas
não foram confirmados. As páginas públicas dos PRs foram acessíveis.
O proxy retorna HTTP 403 no túnel HTTPS para finances-smoky.vercel.app;
isso não demonstra indisponibilidade da aplicação.

Esta sessão não disponibiliza navegador/conectores para os painéis nem bindings
Vercel, Supabase ou Pluggy. Credenciais configuradas na Vercel não são herdadas
pelo workspace. O preflight local retorna exit 2 por ausência das bindings.
Não foram verificados o isolamento Production/Preview, alertas Supabase,
Auth/RLS remoto, estado de migrações de produção, backup/restauração, rotação
de chaves, plano gratuito Pluggy ou acesso às conexões MeuPluggy.

O sucesso das migrações em homologação e as conexões ativas são informações
fornecidas pelo titular, ainda não verificadas nesta sessão. O código exige
clientUserId compatível com o binding do proprietário; uma conexão MeuPluggy
ativa não comprova acesso por estas credenciais nem compatibilidade de vínculo.

## Retomada

Disponibilizar acesso autenticado por ferramentas ou configuração segura da
sessão, nunca por valores no chat. Inspecionar serviços e isolar ambientes;
produzir backup protegido e comprovar restauração antes de alterações.
Apresentar o plano exato de rotação, migrações faltantes, atribuição do histórico
e corte de produção para aprovação, com estado real e evidências.

Não houve alteração de produção, migração remota, merge, deploy, ativação de
sincronização, contratação ou modificação dos registros financeiros. A branch
de correção fica local enquanto o isolamento de Preview não puder ser verificado;
um push pode disparar publicação automática na Vercel.
