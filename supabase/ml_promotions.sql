-- Rodar manualmente no SQL Editor do Supabase (mesmo padrão de ml_reviews.sql / ml_catalog_status.sql).
-- Guarda as promoções ativas de cada anúncio que têm prazo de término definido
-- (nem toda modalidade tem: DOD, SMART e PRICE_MATCHING rodam sem data fixa de
-- fim, então nunca entram aqui). Alerta quando faltam <= 3 dias pro fim, e quando
-- a promoção some da lista de ativas (ou seja, terminou).
-- Também guarda anúncios candidatos a Oferta Relâmpago (LIGHTNING), usando o
-- promotion_id fixo 'LIGHTNING_CANDIDATE' — LIGHTNING não tem prazo, então esse
-- registro é só informativo (status='candidate', finish_date null).

create table ml_promotions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  ml_item_id text not null,
  item_title text,
  promotion_id text not null,
  promotion_type text,
  promotion_name text,
  finish_date timestamptz,
  status text not null default 'active', -- active | ended (rastreado por nós, não é campo do ML)
  soon_alerted boolean not null default false, -- já disparamos o alerta de "faltam <=3 dias" pra essa promoção?
  is_read boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ml_item_id, promotion_id)
);

create index ml_promotions_user_unread_idx on ml_promotions (user_id, is_read);
