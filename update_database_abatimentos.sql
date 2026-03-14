-- Script para adicionar tabela de abatimentos ao banco existente
-- Execute este SQL no SQL Editor do Supabase se você já tem a tabela transactions criada

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

