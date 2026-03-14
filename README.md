# 💰 FINANCES - Sistema Inteligente de Controle Financeiro

Sistema completo e moderno de controle financeiro pessoal com design profissional, modo escuro/claro e funcionalidades avançadas.

![Versão](https://img.shields.io/badge/vers%C3%A3o-2.0.0-blue)
![Python](https://img.shields.io/badge/Python-3.8+-green)
![Flask](https://img.shields.io/badge/Flask-3.0.0-lightgrey)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)

---

## ✨ Funcionalidades

### 💳 Gestão de Transações
- ✅ **Receitas e Gastos** - Controle total de entradas e saídas
- ✅ **Múltiplos cartões** - Mercado Pago, Nubank e Débito
- ✅ **Parcelamento inteligente** - Divisão automática em parcelas mensais
- ✅ **Categorias** - Classifique por Alimentação, Transporte, Moradia, etc
- ✅ **Edição e exclusão** - Gerencie suas transações facilmente
- ✅ **Exclusão em lote** - Selecione e exclua múltiplas transações

### 📊 Visualizações e Relatórios
- ✅ **Dashboard completo** - Visão geral de suas finanças
- ✅ **Gráficos interativos** - Evolução mensal e distribuição de gastos
- ✅ **Estatísticas detalhadas** - Percentuais, médias e totais
- ✅ **Filtros avançados** - Por mês, tipo, categoria e busca
- ✅ **Saldo acumulado** - Real e projetado com faturas

### 💸 Gestão de Faturas
- ✅ **Faturas de cartão** - Acompanhe Mercado Pago e Nubank
- ✅ **Sistema de abatimentos** - Registre pagamentos de fatura
- ✅ **Histórico completo** - Todos abatimentos organizados

### 📤 Exportação
- ✅ **Exportar CSV** - Todos dados estruturados para Excel
- ✅ **Imprimir/PDF** - Relatórios prontos para impressão

### 🎨 Design
- ✅ **Modo Escuro/Claro** - Troca com um clique
- ✅ **Interface moderna** - Design minimalista e profissional
- ✅ **Totalmente responsivo** - Mobile, Tablet e Desktop
- ✅ **Animações suaves** - Experiência fluida e agradável

---

## 🚀 Instalação

### 1. Clone o repositório
```bash
git clone https://github.com/williamjohndias/finances.git
cd finances
```

### 2. Instale as dependências
```bash
pip install -r requirements.txt
```

### 3. Configure o Supabase

**a) Crie as tabelas no banco de dados:**
1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Vá em **SQL Editor**
3. Execute o script completo do arquivo `database_setup.sql`
4. Isso criará as tabelas: `transactions`, `abatimentos`, `categorias` e `metas`

**b) Configure as credenciais:**
1. Copie o arquivo de exemplo:
   ```bash
   cp config.example.py config.py
   ```
2. Edite `config.py` com suas credenciais do Supabase:
   - `SUPABASE_URL`: URL do seu projeto (ex: https://xxx.supabase.co)
   - `SUPABASE_KEY`: Secret key do seu projeto

### 4. Execute o sistema
```bash
python app.py
```

Acesse em: **http://localhost:5000**

---

## 📁 Estrutura do Projeto

```
finances/
├── app.py                          # Backend Flask com API REST
├── api/
│   └── index.py                    # Serverless function para Vercel
├── templates/
│   ├── index.html                  # Frontend HTML (limpo e organizado)
│   └── static/
│       ├── css/
│       │   └── style.css          # Estilos completos com dark mode
│       └── js/
│           └── app.js             # Lógica da aplicação
├── database_setup.sql              # Schema completo do banco
├── requirements.txt                # Dependências Python
├── vercel.json                     # Configuração de deploy Vercel
├── config.example.py               # Exemplo de configuração
└── README.md                       # Este arquivo
```

---

## 🎯 Como Usar

### Adicionar Transação
1. Selecione o **tipo** (Receita, Débito, Mercado Pago ou Nubank)
2. Informe o **valor total** da transação
3. Escolha a **categoria** (opcional)
4. Defina o **número de parcelas** (padrão: 1)
5. Adicione uma **descrição**
6. Selecione a **data** (primeira parcela se parcelado)
7. Clique em **Adicionar Transação**

### Abater Fatura
1. Selecione o **cartão** (Mercado Pago ou Nubank)
2. Informe o **valor** do pagamento/depósito
3. Escolha a **data** do abatimento
4. Adicione uma **descrição** (opcional)
5. Clique em **Adicionar Abatimento**

### Filtrar Transações
- **Por mês**: Selecione o mês desejado no dropdown
- **Por tipo**: Filtre por Receitas, Débito, Mercado Pago ou Nubank
- **Por categoria**: Filtre por Alimentação, Transporte, etc
- **Por texto**: Digite na busca para filtrar por descrição

### Exportar Dados
- **CSV**: Clique em "📊 Exportar CSV" para baixar planilha
- **PDF**: Clique em "📄 Imprimir / PDF" para gerar relatório

### Modo Escuro
- Clique no botão **🌙 Modo Escuro** no cabeçalho
- A preferência é salva automaticamente

---

## 🗄️ Banco de Dados

O sistema usa **PostgreSQL** via **Supabase** com 4 tabelas principais:

### Tabelas
1. **transactions** - Todas receitas e gastos
   - Campos: id, tipo, descricao, valor, data, parcelado, categoria, tags, observacoes
   - Suporta: parcelamento, categorização, tags

2. **abatimentos** - Pagamentos de faturas de cartão
   - Campos: id, tipo_cartao, valor, data, descricao
   - Vinculado às faturas mensais

3. **categorias** - Categorias de transações
   - Campos: id, nome, icone, cor, tipo
   - 10 categorias padrão pré-cadastradas

4. **metas** - Metas financeiras (backend pronto)
   - Campos: id, nome, valor_alvo, valor_atual, datas, status
   - Pronto para implementação no frontend

---

## 🌐 Deploy no Vercel

O projeto está 100% configurado para deploy no Vercel.

### Passos:
1. **Conecte o repositório** ao Vercel
2. **Configure as variáveis de ambiente:**
   - `SUPABASE_URL` → URL do seu projeto Supabase
   - `SUPABASE_KEY` → Secret key do Supabase
3. **Deploy automático** - O Vercel detecta `vercel.json` e faz tudo

Mais detalhes em: `VERCEL_DEPLOY.md`

---

## 🎨 Temas e Personalização

### Modo Claro
- Background: Gradiente azul/roxo suave
- Cards: Brancos com shadows discretos
- Texto: Preto e cinzas escuros

### Modo Escuro
- Background: Gradiente cinza escuro
- Cards: Escuros com borders sutis
- Texto: Branco e cinzas claros

### Personalizar Cores
Edite as variáveis CSS em `templates/static/css/style.css`:
```css
:root {
    --primary: #4f46e5;
    --accent: #f59e0b;
    --success: #22c55e;
    --danger: #ef4444;
    /* ... */
}
```

---

## 📊 Categorias Disponíveis

### Gastos
- 🍔 Alimentação
- 🚗 Transporte
- 🏠 Moradia
- 💊 Saúde
- 📚 Educação
- 🎮 Lazer
- 👕 Roupas
- 📦 Outros

### Receitas
- 💰 Salário
- 📈 Investimentos

---

## 🔧 API Endpoints

### Transações
- `GET /api/transactions` - Lista todas transações
- `POST /api/transactions` - Cria nova transação
- `PUT /api/transactions/<tipo>/<id>` - Atualiza transação
- `DELETE /api/transactions/<tipo>/<id>` - Remove transação
- `GET /api/transactions/monthly` - Dados para gráfico mensal
- `GET /api/statistics` - Estatísticas detalhadas
- `GET /api/faturas` - Resumo de faturas

### Abatimentos
- `GET /api/abatimentos` - Lista todos abatimentos
- `POST /api/abatimentos` - Cria novo abatimento
- `PUT /api/abatimentos/<id>` - Atualiza abatimento
- `DELETE /api/abatimentos/<id>` - Remove abatimento

### Categorias
- `GET /api/categories` - Lista todas categorias

### Metas (Backend pronto)
- `GET /api/metas` - Lista todas metas
- `POST /api/metas` - Cria nova meta
- `PUT /api/metas/<id>` - Atualiza meta
- `DELETE /api/metas/<id>` - Remove meta

---

## 🔒 Segurança

- ✅ **Row Level Security (RLS)** habilitado em todas tabelas
- ✅ **Credenciais protegidas** - `config.py` no `.gitignore`
- ✅ **Variáveis de ambiente** para produção (Vercel)
- ✅ **Validação de dados** no backend
- ✅ **Tratamento de erros** robusto

---

## 📱 Compatibilidade

- ✅ **Desktop**: Chrome, Firefox, Safari, Edge (últimas versões)
- ✅ **Mobile**: iOS Safari, Chrome Android
- ✅ **Tablet**: Layouts adaptativos
- ✅ **Progressive Web App** ready

---

## 🆕 Novidades da Versão 2.0

### Arquitetura
- ✅ CSS e JavaScript separados do HTML
- ✅ Código modular e organizado
- ✅ Melhor estrutura de pastas

### Design
- ✅ Sistema de design completo com variáveis CSS
- ✅ Modo escuro profissional
- ✅ Animações e transições suaves
- ✅ Interface mais moderna

### Funcionalidades
- ✅ Sistema de categorias
- ✅ Exportação CSV e PDF
- ✅ Filtros avançados
- ✅ Backend de metas pronto

### Performance
- ✅ Carregamento mais rápido
- ✅ Código otimizado
- ✅ Cache do navegador

---

## 📝 Notas Importantes

- Os dados são armazenados no **Supabase** (PostgreSQL em cloud)
- Parcelas são **agrupadas** e excluídas em conjunto
- O sistema calcula **saldo real** e **saldo projetado** automaticamente
- As credenciais ficam em `config.py` (não versionado)
- Para produção, use **variáveis de ambiente** no Vercel

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
3. Commit: `git commit -m 'Adiciona nova funcionalidade'`
4. Push: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 🎯 Roadmap Futuro

- [ ] Interface de gerenciamento de metas no frontend
- [ ] Gráficos de progresso das metas
- [ ] Notificações de metas próximas do prazo
- [ ] Relatórios personalizados avançados
- [ ] Exportação para Excel (.xlsx)
- [ ] Dashboard de insights com IA
- [ ] Recorrência automática de transações
- [ ] Multi-usuário com autenticação
- [ ] App mobile nativo

---

## 🔗 Links Úteis

- **Live Demo**: [finances-rho-seven.vercel.app](https://finances-rho-seven.vercel.app)
- **Supabase**: [app.supabase.com](https://app.supabase.com)
- **Chart.js**: [chartjs.org](https://www.chartjs.org/)
- **Documentação detalhada**: Veja `MELHORIAS.md`

---

## 💡 Suporte

Se encontrar algum problema ou tiver sugestões:
1. Abra uma [Issue](https://github.com/williamjohndias/finances/issues)
2. Descreva o problema ou sugestão
3. Inclua prints se possível

---

**Desenvolvido com 💜 por William John Dias**

*Sistema de controle financeiro pessoal - Versão 2.0.0*
