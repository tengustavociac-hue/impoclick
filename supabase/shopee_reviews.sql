-- Rodar manualmente no SQL Editor do Supabase (este projeto não usa migrations automatizadas).
-- Tabela que guarda as avaliações de produtos da Shopee detectadas pelo checker
-- (api/ml-reviews.js com ?provider=shopee, disparado pelo GitHub Actions
-- .github/workflows/shopee-reviews-check.yml). Mesmo molde de ml_reviews.sql.

create table shopee_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  shopee_item_id text not null,
  shopee_comment_id text not null,
  item_name text,
  item_thumbnail text,
  item_rating_average numeric,
  item_rating_count int,
  rating int,
  comment text,
  reviewed_at timestamptz,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  -- inclui user_id: duas contas Impoclick podem estar ligadas à mesma loja da
  -- Shopee (mesmos item_id), e cada uma precisa da própria cópia da avaliação
  unique (user_id, shopee_item_id, shopee_comment_id)
);

create index shopee_reviews_user_unread_idx on shopee_reviews (user_id, is_read);
