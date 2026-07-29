-- Rodar manualmente no SQL Editor do Supabase (mesmo padrão de supabase/ml_reviews.sql).
-- Guarda o status atual de competição de catálogo de cada anúncio (ganhando/perdendo),
-- verificado pelo mesmo checker de api/ml-reviews.js via GitHub Actions.

create table ml_catalog_status (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  ml_item_id text not null,
  item_title text,
  catalog_product_id text,
  status text not null, -- winning | competing | sharing_first_place | listed
  current_price numeric,
  price_to_win numeric,
  winner_item_id text,
  winner_price numeric,
  reason text,
  is_read boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ml_item_id)
);

create index ml_catalog_status_user_unread_idx on ml_catalog_status (user_id, is_read);
