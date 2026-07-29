-- Rodar manualmente no SQL Editor do Supabase (este projeto não usa migrations automatizadas).
-- Tabela que guarda as avaliações de anúncios do Mercado Livre detectadas pelo checker
-- (api/ml-reviews.js, disparado pelo GitHub Actions .github/workflows/ml-reviews-check.yml).

create table ml_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  ml_item_id text not null,
  ml_review_id text not null,
  item_title text,
  rating int,
  comment text,
  reviewed_at timestamptz,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  -- inclui user_id: duas contas Impoclick podem estar ligadas à mesma conta do
  -- Mercado Livre (mesmos item_id), e cada uma precisa da própria cópia da avaliação
  unique (user_id, ml_item_id, ml_review_id)
);

create index ml_reviews_user_unread_idx on ml_reviews (user_id, is_read);
