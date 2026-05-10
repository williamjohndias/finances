# 🚀 Deploy no Vercel

## Configuração

### 1. Variáveis de Ambiente

No Vercel Dashboard, configure as seguintes variáveis de ambiente:

- `SUPABASE_URL`: URL do seu projeto Supabase
- `SUPABASE_KEY`: Secret key do Supabase

**Como configurar:**
1. Acesse seu projeto no Vercel
2. Vá em **Settings** → **Environment Variables**
3. Adicione as variáveis acima

### 2. Atualizar config.py para usar variáveis de ambiente

O arquivo `config.py` já está preparado, mas você pode atualizá-lo para usar variáveis de ambiente em produção:

```python
import os

SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://uagmckigwlfnlprdnfmo.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_secret_XceKRnCaZ1GaPr0m9fSlfQ_svM3lt6V')
```

### 3. Deploy

1. Conecte seu repositório GitHub ao Vercel
2. O Vercel detectará automaticamente o `vercel.json`
3. Configure as variáveis de ambiente
4. Faça o deploy!

## Estrutura para Vercel

- `vercel.json` - Configuração do Vercel
- `api/index.py` - Wrapper serverless para Flask
- `app.py` - Aplicação Flask principal

## Notas Importantes

- O Vercel usa funções serverless, então cada requisição é uma nova instância
- Certifique-se de que as variáveis de ambiente estão configuradas
- O Supabase precisa estar acessível publicamente (já está com RLS configurado)

