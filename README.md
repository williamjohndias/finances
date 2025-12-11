# 💰 Assistente Financeiro

Sistema inteligente de controle financeiro pessoal com interface minimalista dark e funcionalidades avançadas.

## Funcionalidades

- ✅ Adicionar receitas
- ✅ Adicionar gastos no débito
- ✅ Adicionar gastos no cartão de crédito Mercado Pago
- ✅ Adicionar gastos no cartão de crédito Nubank
- ✅ **Parcelamento de compras** - Divida compras em múltiplas parcelas automaticamente
- ✅ **Gráfico mensal** - Visualize receitas, gastos e saldo mês a mês
- ✅ **Assistente inteligente** - Mensagens contextuais sobre sua situação financeira
- ✅ Visualizar resumo financeiro completo
- ✅ Excluir transações (parcelas são excluídas em grupo)
- ✅ Interface minimalista dark (preto e branco)

## Instalação

1. Instale as dependências:
```bash
pip install -r requirements.txt
```

2. Configure o Supabase:
   - Acesse o Supabase Dashboard (https://app.supabase.com)
   - Vá em SQL Editor
   - Execute o script `database_setup.sql` para criar a tabela
   - Copie o arquivo `config.example.py` para `config.py`
   - Edite `config.py` com suas credenciais do Supabase:
     - `SUPABASE_URL`: URL do seu projeto
     - `SUPABASE_KEY`: Secret key do seu projeto

**Nota:** O sistema usa Chart.js via CDN, então não precisa instalar nada adicional para o gráfico.

## Execução

Execute o servidor Flask:
```bash
python app.py
```

Acesse o sistema em: http://localhost:5000

## Estrutura

- `app.py` - Servidor Flask com API REST e lógica de parcelamento
- `templates/index.html` - Interface única (HTML/CSS/JavaScript) com gráfico Chart.js
- `config.py` - Configurações do Supabase (não versionado)
- `config.example.py` - Exemplo de configuração
- `database_setup.sql` - Script SQL para criar a tabela no Supabase

## Como Usar Parcelas

1. Selecione o tipo de transação (gasto no cartão de crédito)
2. Informe o valor total da compra
3. Informe o número de parcelas desejado
4. Informe a data da primeira parcela
5. O sistema criará automaticamente todas as parcelas distribuídas mensalmente

**Exemplo:** Uma compra de R$ 1.200,00 em 12x será dividida em 12 parcelas de R$ 100,00, uma para cada mês.

## Gráfico Mensal

O gráfico mostra:
- **Linha branca sólida:** Receitas mensais
- **Linha cinza sólida:** Gastos mensais
- **Linha branca tracejada:** Saldo mensal (receitas - gastos)

## Configuração do Banco de Dados

O sistema usa **Supabase** como banco de dados. Para configurar:

1. **Criar a tabela:**
   - Acesse o Supabase Dashboard
   - Vá em SQL Editor
   - Cole e execute o conteúdo do arquivo `database_setup.sql`
   - Isso criará a tabela `transactions` com todas as colunas necessárias

2. **Configurar credenciais:**
   - Copie `config.example.py` para `config.py`
   - Preencha com suas credenciais do Supabase:
     - Project URL → `SUPABASE_URL`
     - Secret Key → `SUPABASE_KEY`

## Notas

- Os dados são armazenados no Supabase (PostgreSQL)
- Parcelas são agrupadas e excluídas juntas
- O assistente fornece feedback baseado no seu saldo atual
- As credenciais estão em `config.py` (não versionado por segurança)

