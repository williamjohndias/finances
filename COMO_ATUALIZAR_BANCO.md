# 🔧 Como Atualizar o Banco de Dados Supabase

O erro que você está vendo acontece porque o banco de dados não tem as colunas novas que foram adicionadas ao código.

## ✅ Solução Rápida (3 minutos)

### Passo 1: Acessar o Supabase
1. Acesse https://supabase.com/dashboard
2. Faça login na sua conta
3. Selecione seu projeto

### Passo 2: Abrir o SQL Editor
1. No menu lateral, clique em **SQL Editor** (ícone de banco de dados)
2. Clique em **+ New query** (Nova consulta)

### Passo 3: Executar a Migração
1. Abra o arquivo **`migration_add_columns.sql`** nesta pasta
2. **Copie TODO o conteúdo** do arquivo
3. **Cole no SQL Editor** do Supabase
4. Clique em **RUN** (ou pressione Ctrl+Enter)

### Passo 4: Verificar
Você deve ver uma mensagem de sucesso dizendo que as colunas foram adicionadas!

## 📋 O que esse script faz?

✅ Adiciona as colunas novas à tabela `transactions`:
- `categoria` - Para categorizar seus gastos/receitas
- `tags` - Para adicionar tags personalizadas
- `observacoes` - Para notas adicionais
- `updated_at` - Para rastrear atualizações

✅ Cria a tabela `categorias` com categorias pré-definidas:
- Alimentação, Transporte, Moradia, Saúde, etc.

✅ Cria a tabela `metas` para suas metas financeiras

## ⚠️ Importante

- Este script é **seguro** e **não apaga dados existentes**
- Usa `ADD COLUMN IF NOT EXISTS` para não dar erro se já existir
- Pode executar quantas vezes quiser sem problemas

## 🔍 Verificar se Funcionou

Após executar o script:
1. Volte para sua aplicação
2. Tente adicionar uma nova transação
3. O erro deve ter sumido! ✨

## 💡 Dica

Se ainda tiver problemas, verifique:
- Se está usando o projeto correto no Supabase
- Se as credenciais no `config.py` estão corretas
- Se a tabela `transactions` realmente existe

---

**Precisa de ajuda?** O erro que você viu era:
```
Could not find the 'categoria' column of 'transactions' in the schema cache
```

Isso significa apenas que o banco não tem essa coluna ainda. Execute a migração e tudo funcionará! 🚀
