-- ============================================================
-- Migração: Reserva com movimentos (Guardar / Retirar)
-- Execute este SQL no SQL Editor do Supabase
-- ============================================================

-- Tabela de movimentos da reserva (entradas = guardar, saídas = retirar)
CREATE TABLE IF NOT EXISTS reserva_movimentos (
    id          TEXT PRIMARY KEY,
    tipo        TEXT NOT NULL CHECK (tipo IN ('guardar', 'retirar')),
    valor       DECIMAL(12, 2) NOT NULL CHECK (valor > 0),
    descricao   TEXT,
    data        DATE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reserva_movimentos_data_idx ON reserva_movimentos (data);

ALTER TABLE reserva_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations reserva_movimentos" ON reserva_movimentos;
CREATE POLICY "Allow all operations reserva_movimentos" ON reserva_movimentos
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Migra o saldo atual de "dinheiro_guardado" para um movimento inicial,
-- para que a reserva já existente não seja perdida.
INSERT INTO reserva_movimentos (id, tipo, valor, descricao, data)
SELECT 'inicial-' || id, 'guardar', valor,
       COALESCE(NULLIF(descricao, ''), 'Saldo inicial da reserva'), CURRENT_DATE
FROM dinheiro_guardado
WHERE valor > 0
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE reserva_movimentos IS 'Movimentos da reserva: guardar (entrada) e retirar (saída). Afetam o Saldo de caixa.';
