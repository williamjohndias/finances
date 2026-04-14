-- ==========================================
-- FINANCES - Novas funcionalidades
-- 1) Orcamento por categoria
-- 2) Recorrencias
-- ==========================================

create table if not exists public.orcamentos (
    id text primary key,
    categoria text not null check (categoria in ('debito', 'mercado_pago', 'nubank')),
    mes_referencia text not null,
    limite numeric not null default 0,
    alerta_percentual numeric not null default 80,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_orcamentos_categoria_mes
on public.orcamentos (categoria, mes_referencia);

create table if not exists public.recorrencias (
    id text primary key,
    tipo text not null check (tipo in ('receita', 'debito', 'mercado_pago', 'nubank')),
    descricao text not null,
    valor numeric not null,
    dia_mes integer not null check (dia_mes between 1 and 31),
    data_inicio date not null default current_date,
    ativo boolean not null default true,
    observacao text,
    ultima_competencia text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_recorrencias_ativo
on public.recorrencias (ativo);
