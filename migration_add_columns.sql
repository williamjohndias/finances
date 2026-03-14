-- ===================================
-- MIGRAÇÃO: Adicionar novas colunas à tabela transactions
-- Execute este SQL no SQL Editor do Supabase
-- ===================================

-- Adicionar coluna categoria
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Adicionar coluna tags (array de texto)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Adicionar coluna observacoes
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Adicionar coluna updated_at
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Criar índice para categoria
CREATE INDEX IF NOT EXISTS idx_transactions_categoria ON transactions(categoria);

-- Adicionar comentários
COMMENT ON COLUMN transactions.categoria IS 'Categoria da transação (alimentacao, transporte, moradia, etc)';
COMMENT ON COLUMN transactions.tags IS 'Tags para classificação adicional';
COMMENT ON COLUMN transactions.observacoes IS 'Observações e notas adicionais';
COMMENT ON COLUMN transactions.updated_at IS 'Data da última atualização';

-- ===================================
-- Criar tabela de categorias (se não existir)
-- ===================================
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
DROP POLICY IF EXISTS "Allow all operations categorias" ON categorias;
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

-- ===================================
-- Criar tabela de metas (se não existir)
-- ===================================
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

-- Índices para metas
CREATE INDEX IF NOT EXISTS idx_metas_status ON metas(status);
CREATE INDEX IF NOT EXISTS idx_metas_categoria ON metas(categoria);

-- Habilitar Row Level Security
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas as operações
DROP POLICY IF EXISTS "Allow all operations metas" ON metas;
CREATE POLICY "Allow all operations metas" ON metas
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comentários
COMMENT ON TABLE categorias IS 'Tabela para armazenar categorias de transações';
COMMENT ON TABLE metas IS 'Tabela para armazenar metas financeiras do usuário';

-- ===================================
-- CONCLUÍDO!
-- ===================================
-- Execute este script no Supabase SQL Editor
-- Depois teste adicionando uma nova transação
