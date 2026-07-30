-- Rodar manualmente no SQL Editor do Supabase (mesmo padrão de ml_reviews.sql / ml_catalog_status.sql).
-- Guarda só promoções REAIS com prazo de término definido (DEAL, MARKETPLACE_CAMPAIGN,
-- VOLUME, PRE_NEGOTIATED, SELLER_CAMPAIGN, UNHEALTHY_STOCK, PRICE_DISCOUNT quando tiver
-- data). Modalidades sem prazo fixo (LIGHTNING, DOD, SMART, PRICE_MATCHING) não entram
-- aqui — candidatos a Oferta Relâmpago vivem em ml_lightning_candidates (ver esse arquivo).
--
-- Alerta quando faltam <= 3 dias pro fim, e quando a promoção some da lista de
-- ativas da API (ou seja, terminou).
--
-- Se a tabela ml_promotions já existir na sua base (versão antiga, com status
-- 'candidate' misturado), rode supabase/ml_promotions_v2_split_lightning.sql em vez deste.

create table ml_promotions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  ml_item_id text not null,
  item_title text,
  promotion_id text not null,
  promotion_type text,
  promotion_name text,
  finish_date timestamptz not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  soon_alerted boolean not null default false, -- já disparamos o alerta de "faltam <=3 dias" pra essa promoção?
  is_read boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ml_item_id, promotion_id)
);

create index ml_promotions_user_unread_idx on ml_promotions (user_id, is_read);

create table ml_lightning_candidates (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  ml_item_id text not null,
  item_title text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ml_item_id)
);
