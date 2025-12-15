# ✅ Verificação de Variáveis de Ambiente no Vercel

## Passo a Passo

### 1. Acesse o Vercel Dashboard
- Vá para: https://vercel.com/dashboard
- Faça login

### 2. Selecione seu Projeto
- Clique no projeto "finances"

### 3. Vá em Settings → Environment Variables
- No menu lateral, clique em **Settings**
- Clique em **Environment Variables**

### 4. Verifique as Variáveis

Você deve ter **EXATAMENTE** estas duas variáveis:

#### ✅ SUPABASE_URL
- **Nome:** `SUPABASE_URL`
- **Valor:** `https://uagmckigwlfnlprdnfmo.supabase.co`
- **Environments:** Todas (Production, Preview, Development)

#### ✅ SUPABASE_KEY
- **Nome:** `SUPABASE_KEY`
- **Valor:** A chave completa do Supabase (service_role key)
- **Environments:** Todas (Production, Preview, Development)

### 5. Como Obter a Chave Correta

1. Acesse: https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings** → **API**
4. Procure por **"service_role" key** (secret key)
5. Clique em **"Reveal"** ou **"Show"** para ver a chave completa
6. **Copie a chave COMPLETA** (pode ser muito longa!)

### 6. Após Configurar

1. **Salve** as variáveis no Vercel
2. **Faça um novo deploy:**
   - Vá em **Deployments**
   - Clique nos três pontos (...) no deployment mais recente
   - Clique em **"Redeploy"**
   - Ou faça um novo commit/push para trigger automático

### 7. Verificar os Logs

Após o deploy, verifique os logs:

1. Vá em **Deployments** → Clique no deployment mais recente
2. Vá em **Functions** → **api/index.py**
3. Procure por estas mensagens nos logs:

**✅ Sucesso:**
```
Variáveis de ambiente disponíveis:
  SUPABASE_URL: Sim
  SUPABASE_KEY: Sim
✓ App Flask importado com sucesso
  Supabase inicializado: Sim
✓ Supabase inicializado com sucesso
```

**❌ Erro:**
```
SUPABASE_KEY presente: Não (tamanho: 0)
✗ AVISO: SUPABASE_URL ou SUPABASE_KEY não configurados
```

## Problemas Comuns

### Variável não aparece nos logs
- **Causa:** Variável não foi salva corretamente
- **Solução:** Delete e recrie a variável

### Chave muito curta
- **Causa:** Chave incompleta ou errada
- **Solução:** Copie a chave COMPLETA do Supabase (pode ter 200+ caracteres)

### Variável só funciona em Production
- **Causa:** Variável configurada apenas para Production
- **Solução:** Configure para "All Environments"

## Checklist

- [ ] `SUPABASE_URL` configurada
- [ ] `SUPABASE_KEY` configurada (chave completa)
- [ ] Ambas configuradas para "All Environments"
- [ ] Novo deploy feito após configurar
- [ ] Logs mostram "Supabase inicializado com sucesso"

