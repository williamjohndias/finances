# 🗄️ Configuração do Supabase

## Passo a Passo

### 1. Criar a Tabela

1. Acesse o Supabase Dashboard: https://app.supabase.com
2. Selecione seu projeto
3. Vá em **SQL Editor** (no menu lateral)
4. Clique em **New Query**
5. Cole o conteúdo do arquivo `database_setup.sql`
6. Clique em **Run** ou pressione `Ctrl+Enter`

A tabela `transactions` será criada com:
- Todas as colunas necessárias
- Índices para performance
- Row Level Security (RLS) habilitado
- Política de acesso configurada

### 2. Verificar a Tabela

1. Vá em **Table Editor** no menu lateral
2. Você deve ver a tabela `transactions`
3. Verifique se as colunas foram criadas corretamente

### 3. Configurar Credenciais

1. No Supabase Dashboard, vá em **Settings** → **API**
2. Copie:
   - **Project URL** → será o `SUPABASE_URL`
   - **Secret Key** (service_role) → será o `SUPABASE_KEY`

3. Edite o arquivo `config.py`:
```python
SUPABASE_URL = "https://uagmckigwlfnlprdnfmo.supabase.co"
SUPABASE_KEY = "<SUPABASE_SECRET_KEY_CONFIGURADA_EM_VARIAVEIS_SEGURAS>"
```

### 4. Testar a Conexão

Execute o servidor:
```bash
python app.py
```

Se tudo estiver correto, você poderá adicionar transações e elas serão salvas no Supabase!

## Estrutura da Tabela

A tabela `transactions` possui os seguintes campos:

- `id` (TEXT, PRIMARY KEY) - ID único da transação
- `tipo` (TEXT) - Tipo: receita, debito, mercado_pago, nubank
- `descricao` (TEXT) - Descrição da transação
- `valor` (DECIMAL) - Valor da transação
- `data` (DATE) - Data da transação
- `parcelado` (BOOLEAN) - Se é parcelado
- `parcela_atual` (INTEGER) - Número da parcela atual
- `total_parcelas` (INTEGER) - Total de parcelas
- `valor_total` (DECIMAL) - Valor total (para parcelas)
- `parcel_group_id` (TEXT) - ID para agrupar parcelas
- `created_at` (TIMESTAMP) - Data de criação

## Troubleshooting

### Erro de conexão
- Verifique se as credenciais em `config.py` estão corretas
- Verifique se o projeto Supabase está ativo

### Erro ao criar tabela
- Certifique-se de executar o SQL completo
- Verifique se não há tabela com o mesmo nome

### Erro de permissão
- Verifique se a política RLS está configurada corretamente
- O script SQL já cria uma política permissiva para desenvolvimento

