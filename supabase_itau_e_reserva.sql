-- ============================================================
-- Migração: Cartão Itaú Platinum + seção "Dinheiro Guardado"
-- Execute este SQL no SQL Editor do Supabase
-- ============================================================

-- 1) Permitir o novo tipo 'itau' na tabela de transações
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_tipo_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_tipo_check
    CHECK (tipo IN ('receita', 'debito', 'mercado_pago', 'nubank', 'itau'));

-- 2) Permitir abatimentos do cartão Itaú
ALTER TABLE abatimentos DROP CONSTRAINT IF EXISTS abatimentos_tipo_cartao_check;
ALTER TABLE abatimentos ADD CONSTRAINT abatimentos_tipo_cartao_check
    CHECK (tipo_cartao IN ('mercado_pago', 'nubank', 'itau'));

-- 3) Tabela de "Dinheiro Guardado" (reserva — valor único editável)
CREATE TABLE IF NOT EXISTS dinheiro_guardado (
    id TEXT PRIMARY KEY,
    valor DECIMAL(12, 2) NOT NULL DEFAULT 0,
    descricao TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE dinheiro_guardado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations dinheiro_guardado" ON dinheiro_guardado;
CREATE POLICY "Allow all operations dinheiro_guardado" ON dinheiro_guardado
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Linha única que guarda o valor da reserva
INSERT INTO dinheiro_guardado (id, valor, descricao)
VALUES ('principal', 0, 'Reserva')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE dinheiro_guardado IS 'Valor de dinheiro guardado/reserva (linha única id=principal)';
