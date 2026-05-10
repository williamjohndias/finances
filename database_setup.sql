-- Criação da tabela de transações no Supabase
-- Execute este SQL no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'debito', 'mercado_pago', 'nubank')),
    descricao TEXT NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    data DATE NOT NULL,
    parcelado BOOLEAN DEFAULT FALSE,
    parcela_atual INTEGER,
    total_parcelas INTEGER,
    valor_total DECIMAL(10, 2),
    parcel_group_id TEXT,
    categoria TEXT,
    tags TEXT[],
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_transactions_tipo ON transactions(tipo);
CREATE INDEX IF NOT EXISTS idx_transactions_data ON transactions(data);
CREATE INDEX IF NOT EXISTS idx_transactions_parcel_group ON transactions(parcel_group_id);

-- Habilitar Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas as operações (ajuste conforme necessário para produção)
CREATE POLICY "Allow all operations" ON transactions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comentários nas colunas
COMMENT ON TABLE transactions IS 'Tabela para armazenar receitas e gastos financeiros';
COMMENT ON COLUMN transactions.tipo IS 'Tipo: receita, debito, mercado_pago, nubank';
COMMENT ON COLUMN transactions.parcelado IS 'Indica se a transação é parcelada';
COMMENT ON COLUMN transactions.parcel_group_id IS 'ID para agrupar parcelas da mesma compra';
COMMENT ON COLUMN transactions.categoria IS 'Categoria da transação (alimentacao, transporte, moradia, etc)';
COMMENT ON COLUMN transactions.tags IS 'Tags para classificação adicional';
COMMENT ON COLUMN transactions.observacoes IS 'Observações e notas adicionais';

-- Tabela de abatimentos/depósitos para faturas de cartão de crédito
CREATE TABLE IF NOT EXISTS abatimentos (
    id TEXT PRIMARY KEY,
    tipo_cartao TEXT NOT NULL CHECK (tipo_cartao IN ('mercado_pago', 'nubank')),
    valor DECIMAL(10, 2) NOT NULL,
    data DATE NOT NULL,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_abatimentos_tipo ON abatimentos(tipo_cartao);
CREATE INDEX IF NOT EXISTS idx_abatimentos_data ON abatimentos(data);

-- Habilitar Row Level Security (RLS)
ALTER TABLE abatimentos ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas as operações
CREATE POLICY "Allow all operations abatimentos" ON abatimentos
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comentários nas colunas
COMMENT ON TABLE abatimentos IS 'Tabela para armazenar abatimentos/depósitos para faturas de cartão de crédito';
COMMENT ON COLUMN abatimentos.tipo_cartao IS 'Tipo do cartão: mercado_pago ou nubank';
COMMENT ON COLUMN abatimentos.valor IS 'Valor do abatimento/depósito';

-- Tabela de categorias
CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    icone TEXT,
    cor TEXT,
    tipo TEXT CHECK (tipo IN ('receita', 'gasto')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para categorias
CREATE INDEX IF NOT EXISTS idx_categorias_tipo ON categorias(tipo);

-- Habilitar Row Level Security
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas as operações
CREATE POLICY "Allow all operations categorias" ON categorias
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Inserir categorias padrão
INSERT INTO categorias (id, nome, icone, cor, tipo) VALUES
    ('alimentacao', 'Alimentação', '🍔', '#ef4444', 'gasto'),
    ('transporte', 'Transporte', '🚗', '#f59e0b', 'gasto'),
    ('moradia', 'Moradia', '🏠', '#8b5cf6', 'gasto'),
    ('saude', 'Saúde', '💊', '#ec4899', 'gasto'),
    ('educacao', 'Educação', '📚', '#06b6d4', 'gasto'),
    ('lazer', 'Lazer', '🎮', '#10b981', 'gasto'),
    ('roupas', 'Roupas', '👕', '#6366f1', 'gasto'),
    ('outros', 'Outros', '📦', '#64748b', 'gasto'),
    ('salario', 'Salário', '💰', '#22c55e', 'receita'),
    ('investimentos', 'Investimentos', '📈', '#14b8a6', 'receita')
ON CONFLICT (id) DO NOTHING;

-- Tabela de metas financeiras
CREATE TABLE IF NOT EXISTS metas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    valor_alvo DECIMAL(10, 2) NOT NULL,
    valor_atual DECIMAL(10, 2) DEFAULT 0,
    data_inicio DATE NOT NULL,
    data_fim DATE,
    categoria TEXT,
    status TEXT CHECK (status IN ('ativa', 'concluida', 'cancelada')) DEFAULT 'ativa',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para metas
CREATE INDEX IF NOT EXISTS idx_metas_status ON metas(status);
CREATE INDEX IF NOT EXISTS idx_metas_categoria ON metas(categoria);

-- Habilitar Row Level Security
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas as operações
CREATE POLICY "Allow all operations metas" ON metas
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE categorias IS 'Tabela para armazenar categorias de transações';
COMMENT ON TABLE metas IS 'Tabela para armazenar metas financeiras do usuário';

