# 📋 Como Verificar os Logs no Vercel

## Passo a Passo para Ver os Logs

### 1. Acesse o Dashboard do Vercel
- Vá para: https://vercel.com/dashboard
- Faça login na sua conta

### 2. Encontre seu Projeto
- Clique no projeto "finances" (ou o nome do seu projeto)

### 3. Acesse os Deployments
- Clique na aba **"Deployments"** no topo
- Clique no deployment mais recente (o que está com erro)

### 4. Veja os Logs da Função
- Role a página até encontrar a seção **"Functions"**
- Clique em **"api/index.py"**
- Você verá os logs de execução

## O que Procurar nos Logs

### ✅ Logs de Sucesso
Procure por estas mensagens:
- `"App Flask importado com sucesso"`
- `"Supabase inicializado com sucesso"`

### ❌ Logs de Erro
Procure por estas mensagens:
- `"ERRO ao importar app:"` - Problema na importação
- `"AVISO: SUPABASE_URL ou SUPABASE_KEY não configurados"` - Variáveis não encontradas
- `"Erro ao inicializar Supabase:"` - Problema de conexão
- Tracebacks completos (stack traces)

## Erros Comuns e Soluções

### Erro: "ModuleNotFoundError"
**Causa:** Dependência não instalada
**Solução:** Verifique se está no `requirements.txt`

### Erro: "Supabase não inicializado"
**Causa:** Variáveis de ambiente não configuradas
**Solução:** 
1. Vercel Dashboard → Settings → Environment Variables
2. Verifique se `SUPABASE_URL` e `SUPABASE_KEY` estão configuradas
3. Faça um novo deploy

### Erro: "Table 'transactions' does not exist"
**Causa:** Tabela não criada no Supabase
**Solução:**
1. Acesse Supabase Dashboard
2. SQL Editor
3. Execute o script `database_setup.sql`

### Erro: "Template not found"
**Causa:** Caminho dos templates incorreto
**Solução:** Já corrigido no código, mas verifique se `templates/index.html` existe

## Como Copiar os Logs

1. Selecione todo o texto dos logs
2. Copie (Ctrl+C)
3. Cole aqui para eu analisar

## Teste Local (Opcional)

Se quiser testar localmente antes de fazer deploy:

```bash
# Instale o Vercel CLI
npm i -g vercel

# Execute localmente
vercel dev
```

Isso simula o ambiente do Vercel e mostra os erros antes do deploy.

