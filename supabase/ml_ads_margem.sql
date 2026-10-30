-- Rodar manualmente no SQL Editor do Supabase antes de usar o painel de
-- Patrocinados. Sem estas tabelas o painel abre com as métricas de publicidade,
-- mas não consegue guardar o custo dos produtos — e sem custo não há margem.
--
-- Mesmo desenho da automação de promoções (ml_promo_item_config): o dado mora
-- no próprio anúncio (MLB), sem obrigar a cadastrar produto no catálogo.

-- Custo unitário de cada anúncio: o que o produto custa para o vendedor, já
-- nacionalizado (compra, frete internacional, impostos de importação).
create table if not exists ml_item_costs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  ml_item_id text not null,
  unit_cost  numeric not null check (unit_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, ml_item_id)
);

alter table ml_item_costs enable row level security;
drop policy if exists "own rows only" on ml_item_costs;
create policy "own rows only" on ml_item_costs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Configuração do painel, uma linha por usuário. Fica fora de
-- company_settings porque o salvamento daquela tabela grava todos os campos da
-- empresa de uma vez, e guardar uma alíquota por lá arriscaria criar ou
-- sobrescrever o cadastro da empresa.
create table if not exists ml_ads_settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  sales_tax_pct numeric not null default 0 check (sales_tax_pct >= 0 and sales_tax_pct < 100),
  updated_at    timestamptz not null default now()
);

alter table ml_ads_settings enable row level security;
drop policy if exists "own rows only" on ml_ads_settings;
create policy "own rows only" on ml_ads_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
