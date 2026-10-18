# 🔧 Configurar Variáveis de Ambiente no Vercel

## ⚠️ IMPORTANTE: Configure no Vercel Dashboard

O build completou, mas você precisa configurar as variáveis de ambiente no Vercel:

### Passo a Passo:

1. **Acesse o Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Faça login

2. **Selecione seu Projeto:**
   - Clique no projeto "finances"

3. **Vá em Settings → Environment Variables:**
   - Menu lateral → **Settings**
   - Clique em **Environment Variables**

4. **Adicione/Edite as Variáveis:**

   #### Variável 1: SUPABASE_URL
   - **Nome:** `SUPABASE_URL`
   - **Valor:** `https://uagmckigwlfnlprdnfmo.supabase.co`
   - **Environments:** Selecione **"All Environments"** (Production, Preview, Development)

   #### Variável 2: SUPABASE_KEY
   - **Nome:** `SUPABASE_KEY`
   - **Valor:** `<SUPABASE_KEY_CONFIGURADA_EM_VARIAVEIS_SEGURAS>`
   - **Environments:** Selecione **"All Environments"** (Production, Preview, Development)

5. **Salve as Variáveis:**
   - Clique em **"Save"** após adicionar cada variável

6. **Faça um Redeploy:**
   - Vá em **Deployments**
   - Clique nos três pontos (...) no deployment mais recente
   - Clique em **"Redeploy"**
   - Ou faça um novo commit/push para trigger automático

## ✅ Verificação

Após o redeploy, verifique os logs:

1. **Deployments** → Clique no deployment mais recente
2. **Functions** → **api/index.py**
3. Procure por estas mensagens:

**✅ Sucesso:**
```
Variáveis de ambiente disponíveis:
  SUPABASE_URL: Sim
  SUPABASE_KEY: Sim
✓ App Flask importado com sucesso
  Supabase inicializado: Sim
✓ Supabase inicializado com sucesso
```

**❌ Se ainda der erro:**
```
SUPABASE_KEY presente: Não (tamanho: 0)
✗ AVISO: SUPABASE_URL ou SUPABASE_KEY não configurados
```

## 📝 Nota

O arquivo `config.py` foi atualizado com a chave correta para desenvolvimento local. No Vercel, sempre use as variáveis de ambiente!

