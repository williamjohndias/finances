# 🔑 Como Corrigir o Erro "Invalid API key"

## Problema

O erro `Invalid API key` significa que a chave do Supabase está incorreta ou incompleta.

## Solução

### 1. Obter a Chave Correta no Supabase

1. Acesse: https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings** → **API**
4. Procure pela seção **"Project API keys"**
5. Copie a **"service_role" key** (secret key)
   - ⚠️ **IMPORTANTE**: Use a **service_role** key, não a **anon** key
   - A service_role key tem permissões completas para o banco

### 2. Atualizar o config.py

Edite o arquivo `config.py` e cole a chave completa:

```python
SUPABASE_URL = os.getenv('SUPABASE_URL', "https://uagmckigwlfnlprdnfmo.supabase.co")
SUPABASE_KEY = os.getenv('SUPABASE_KEY', "COLE_A_CHAVE_COMPLETA_AQUI")
```

### 3. Verificar o Formato da Chave

A chave pode ter dois formatos:

**Formato 1 - JWT (mais comum):**
```
<SUPABASE_KEY_CONFIGURADA_EM_VARIAVEIS_SEGURAS>
```

**Formato 2 - Nova API Key:**
```
sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. No Vercel

Se estiver fazendo deploy no Vercel, configure a variável de ambiente:

1. Vercel Dashboard → Seu Projeto
2. **Settings** → **Environment Variables**
3. Adicione ou edite:
   - `SUPABASE_KEY` = Cole a chave completa aqui
4. Faça um novo deploy

### 5. Testar

Após atualizar a chave:

1. Reinicie o servidor Flask (se estiver rodando localmente)
2. Tente adicionar uma transação
3. Verifique o console do servidor - deve aparecer: `"Supabase inicializado com sucesso"`

## Verificação Rápida

Execute este comando para verificar se a chave está funcionando:

```python
python -c "from supabase import create_client; client = create_client('https://uagmckigwlfnlprdnfmo.supabase.co', 'SUA_CHAVE_AQUI'); print('Chave válida!')"
```

Se aparecer "Chave válida!", está correto!

## Erro Persistente?

Se ainda der erro após atualizar a chave:

1. Verifique se copiou a chave **completa** (pode ser muito longa)
2. Verifique se não há espaços antes ou depois da chave
3. Certifique-se de que está usando a **service_role** key, não a **anon** key
4. Verifique se a tabela `transactions` foi criada no Supabase (execute `database_setup.sql`)

