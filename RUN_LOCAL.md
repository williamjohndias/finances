# 🏃 Como Rodar Localmente

## Passo a Passo

### 1. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 2. Configurar o Supabase

Edite o arquivo `config.py` e verifique se as credenciais estão corretas:

```python
SUPABASE_URL = "https://uagmckigwlfnlprdnfmo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ21ja2lnd2xmbmxwcmRuZm1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTQ3OTQ0NSwiZXhwIjoyMDgxMDU1NDQ1fQ.MjbOWx6iTQlSvCNdx2e5Yby21ypsEL_aqIFPGHXL9DU"
```

### 3. Criar a Tabela no Supabase

1. Acesse: https://app.supabase.com
2. Vá em **SQL Editor**
3. Execute o conteúdo do arquivo `database_setup.sql`

### 4. Rodar o Servidor

```bash
python app.py
```

### 5. Acessar a Aplicação

Abra o navegador em: **http://localhost:5000**

## Verificação

Quando rodar `python app.py`, você deve ver:

```
==================================================
🚀 Iniciando servidor Flask...
==================================================
✓ Configurações carregadas do config.py
  URL: https://uagmckigwlfnlprdnfmo.supabase.co
  Key presente: Sim
✓ Supabase inicializado com sucesso
📁 Diretório de templates: C:\...\templates
🗄️  Supabase: Conectado ✓
==================================================
🌐 Servidor rodando em: http://localhost:5000
==================================================
```

## Problemas Comuns

### Erro: "Supabase não inicializado"
- **Causa:** Chave incorreta ou tabela não criada
- **Solução:** 
  1. Verifique o `config.py`
  2. Execute o `database_setup.sql` no Supabase

### Erro: "ModuleNotFoundError"
- **Causa:** Dependências não instaladas
- **Solução:** Execute `pip install -r requirements.txt`

### Erro: "Table 'transactions' does not exist"
- **Causa:** Tabela não criada
- **Solução:** Execute o `database_setup.sql` no Supabase SQL Editor

## Teste Rápido

Após iniciar o servidor, teste:

1. Acesse http://localhost:5000
2. Tente adicionar uma transação
3. Verifique o console do servidor para ver os logs

