-- Rodar manualmente no SQL Editor do Supabase.
-- Registra quando a checagem (avaliações/catálogo/promoções) rodou pela última
-- vez pra cada usuário, pra mostrar "última verificação: há X min" no painel —
-- sem isso não tem como saber se o GitHub Actions parou de rodar.

create table ml_check_status (
  user_id uuid primary key references profiles(id),
  last_checked_at timestamptz not null default now(),
  last_items_checked int,
  total_active_items int, -- total real de anúncios ativos (pode ser > 100, o teto verificado por rodada)
  last_error text
);
