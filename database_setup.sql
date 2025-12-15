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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

