-- Conexão com a Amazon Advertising API (Sponsored Products) — separada da
-- SP-API (ver amazon_conexao.sql): outro app, outro client_id, outro fluxo de
-- OAuth (esse sim com redirect pelo nosso site, igual ML/Shopee).
alter table profiles
    add column if not exists amazon_ads_refresh_token text,
    add column if not exists amazon_ads_access_token text,
    add column if not exists amazon_ads_token_expires_at timestamptz,
    add column if not exists amazon_ads_profile_id text,
    -- Controle do relatório de gastos em andamento (ver _amazon-ads-helper.js).
    -- A Amazon pode levar até 3h para gerar o relatório, então o cron faz
    -- isso em etapas: pede, e nas rodadas seguintes só confere se ficou
    -- pronto. Sem guardar isso, cada rodada pediria um relatório novo.
    add column if not exists amazon_ads_relatorio_pendente_id text,
    add column if not exists amazon_ads_relatorio_pedido_em timestamptz,
    add column if not exists amazon_ads_relatorio_atualizado_em timestamptz;

-- Última foto do gasto de anúncios por produto anunciado (ASIN), resumida
-- pelos últimos 30 dias — não é histórico diário, é sobrescrita a cada
-- relatório novo (uma linha por user_id + asin + campanha).
create table if not exists amazon_ads_relatorio (
    user_id uuid not null references auth.users (id) on delete cascade,
    asin text not null,
    sku text,
    campaign_id text not null,
    campaign_name text,
    impressoes bigint not null default 0,
    cliques bigint not null default 0,
    gasto numeric not null default 0,
    vendas_atribuidas numeric not null default 0,
    pedidos_atribuidos bigint not null default 0,
    periodo_inicio date not null,
    periodo_fim date not null,
    atualizado_em timestamptz not null default now(),
    primary key (user_id, asin, campaign_id)
);

alter table amazon_ads_relatorio enable row level security;
drop policy if exists "own rows only" on amazon_ads_relatorio;
create policy "own rows only" on amazon_ads_relatorio
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
