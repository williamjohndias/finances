# 🔧 Troubleshooting - Erros no Vercel

## Erro 500: INTERNAL_SERVER_ERROR

### Possíveis causas e soluções:

### 1. Variáveis de Ambiente não configuradas

**Sintoma:** Erro 500 ao acessar a aplicação

**Solução:**
1. Acesse o Vercel Dashboard
2. Vá em **Settings** → **Environment Variables**
3. Adicione:
   - `SUPABASE_URL` = `https://uagmckigwlfnlprdnfmo.supabase.co`
   - `SUPABASE_KEY` = `<SUPABASE_SECRET_KEY_CONFIGURADA_EM_VARIAVEIS_SEGURAS>`
4. Faça um novo deploy

### 2. Erro na importação do app

**Sintoma:** Erro ao importar módulos

**Solução:**
- Verifique se todas as dependências estão no `requirements.txt`
- Certifique-se de que o `config.py` está acessível (ou use variáveis de ambiente)

### 3. Erro de conexão com Supabase

**Sintoma:** Erro ao conectar com o banco de dados

**Solução:**
- Verifique se as credenciais do Supabase estão corretas
- Verifique se a tabela `transactions` foi criada no Supabase
- Verifique se o RLS (Row Level Security) está configurado corretamente

### 4. Erro no handler do Vercel

**Sintoma:** FUNCTION_INVOCATION_FAILED

**Solução:**
- O arquivo `api/index.py` deve exportar `handler = app`
- Verifique os logs no Vercel Dashboard para ver o erro específico

## Como verificar os logs

1. Acesse o Vercel Dashboard
2. Vá em **Deployments**
3. Clique no deployment que falhou
4. Vá em **Functions** → **api/index.py**
5. Veja os logs de erro

## Teste local com Vercel CLI

```bash
# Instale o Vercel CLI
npm i -g vercel

# Execute localmente
vercel dev
```

Isso simula o ambiente do Vercel localmente e ajuda a debugar problemas.

## Estrutura esperada

```
/
├── api/
│   └── index.py      # Handler do Vercel
├── app.py             # App Flask
├── config.py          # Configurações (não versionado)
├── templates/
│   └── index.html     # Template HTML
├── requirements.txt   # Dependências
└── vercel.json        # Configuração do Vercel
```

## Checklist antes do deploy

- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] Tabela `transactions` criada no Supabase
- [ ] RLS configurado no Supabase
- [ ] Todas as dependências no `requirements.txt`
- [ ] `config.py` usa variáveis de ambiente (já está configurado)

