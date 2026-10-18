# 🚀 Deploy no Vercel - Guia Completo

## ✅ Pré-requisitos

1. ✅ Código funcionando localmente
2. ✅ Supabase conectado e testado
3. ✅ Tabela `transactions` criada no Supabase

## 📋 Passo a Passo

### 1. Verificar se o código está no GitHub

```bash
git status
git push origin main
```

### 2. Configurar Variáveis de Ambiente no Vercel

1. **Acesse o Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Faça login

2. **Selecione seu Projeto:**
   - Clique no projeto "finances"

3. **Vá em Settings → Environment Variables:**
   - Menu lateral → **Settings**
   - Clique em **Environment Variables**

4. **Adicione as Variáveis:**

   #### Variável 1: SUPABASE_URL
   - **Nome:** `SUPABASE_URL`
   - **Valor:** `https://uagmckigwlfnlprdnfmo.supabase.co`
   - **Environments:** Selecione **"All Environments"** ✅

   #### Variável 2: SUPABASE_KEY
   - **Nome:** `SUPABASE_KEY`
   - **Valor:** `<SUPABASE_KEY_CONFIGURADA_EM_VARIAVEIS_SEGURAS>`
   - **Environments:** Selecione **"All Environments"** ✅

5. **Salve as Variáveis:**
   - Clique em **"Save"** após adicionar cada variável

### 3. Fazer o Deploy

#### Opção A: Deploy Automático (Recomendado)
- O Vercel detecta automaticamente novos commits no GitHub
- Faça um commit/push e o deploy acontece automaticamente

#### Opção B: Deploy Manual
1. Vá em **Deployments**
2. Clique nos três pontos (...) no deployment mais recente
3. Clique em **"Redeploy"**

### 4. Verificar o Deploy

Após o deploy, verifique:

1. **Acesse a URL do seu projeto** (fornecida pelo Vercel)
2. **Verifique os Logs:**
   - Vercel Dashboard → **Deployments** → Clique no deployment
   - **Functions** → **api/index.py** → Veja os logs

**✅ Logs de Sucesso:**
```
Variáveis de ambiente disponíveis:
  SUPABASE_URL: Sim
  SUPABASE_KEY: Sim
✓ App Flask importado com sucesso
  Supabase inicializado: Sim
✓ Supabase inicializado com sucesso
```

**❌ Se houver erro:**
```
SUPABASE_KEY presente: Não (tamanho: 0)
✗ AVISO: SUPABASE_URL ou SUPABASE_KEY não configurados
```

## 🔍 Troubleshooting

### Erro: "Supabase não inicializado"
- **Causa:** Variáveis de ambiente não configuradas
- **Solução:** Verifique se `SUPABASE_URL` e `SUPABASE_KEY` estão configuradas no Vercel

### Erro: "Table 'transactions' does not exist"
- **Causa:** Tabela não criada no Supabase
- **Solução:** Execute o `database_setup.sql` no Supabase SQL Editor

### Erro: "Invalid API key"
- **Causa:** Chave incorreta ou expirada
- **Solução:** Verifique a chave no Supabase Dashboard (Settings → API → service_role key)

### Erro de Build
- **Causa:** Dependências incompatíveis
- **Solução:** O `requirements.txt` já está atualizado com versões compatíveis

## 📝 Checklist Final

Antes de fazer deploy, verifique:

- [ ] Código commitado e enviado para GitHub
- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] Tabela `transactions` criada no Supabase
- [ ] `requirements.txt` atualizado
- [ ] Testado localmente e funcionando

## 🎉 Após o Deploy

1. Acesse a URL fornecida pelo Vercel
2. Teste adicionar uma transação
3. Verifique se os dados estão sendo salvos no Supabase

## 📞 Suporte

Se tiver problemas:
1. Verifique os logs no Vercel Dashboard
2. Verifique os logs no Supabase Dashboard
3. Compare com o funcionamento local

