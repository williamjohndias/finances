# 🔍 Como Ver os Logs do Vercel

## Passo a Passo para Ver os Logs

### 1. Acesse o Vercel Dashboard
- Vá para: https://vercel.com/dashboard
- Faça login

### 2. Selecione seu Projeto
- Clique no projeto "finances"

### 3. Vá em Deployments
- Clique na aba **"Deployments"** no topo
- Clique no deployment mais recente (o que está com erro)

### 4. Veja os Logs da Função
- Role a página até encontrar a seção **"Functions"**
- Clique em **"api/index.py"**
- Você verá os logs de execução

## O que Procurar nos Logs

### ✅ Logs de Sucesso Esperados:
```
============================================================
Iniciando Vercel serverless function...
============================================================

Verificando variaveis de ambiente:
  SUPABASE_URL: Sim
  SUPABASE_KEY: Sim

Importando app Flask...
OK - App Flask importado
  Supabase inicializado: Sim
============================================================
```

### ❌ Logs de Erro Comuns:

**1. Variáveis não configuradas:**
```
Verificando variaveis de ambiente:
  SUPABASE_URL: Nao
  SUPABASE_KEY: Nao
```

**2. Erro ao importar app:**
```
ERRO ao importar app:
Traceback (most recent call last):
  ...
```

**3. Erro ao inicializar Supabase:**
```
ERRO ao inicializar Supabase:
  Tipo: ...
  Mensagem: ...
```

## Como Copiar os Logs

1. Selecione todo o texto dos logs
2. Copie (Ctrl+C)
3. Cole aqui para eu analisar

## Importante

Os logs mostram exatamente o que está acontecendo. Sem ver os logs, é difícil identificar o problema específico.

**Por favor, copie e cole os logs aqui para eu poder ajudar!**

