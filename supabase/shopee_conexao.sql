-- Conexão da conta da Shopee, nos mesmos moldes das colunas ml_* já usadas
-- para o Mercado Livre em profiles. Token de acesso dura só ~4h na Shopee
-- (bem menos que o do ML) — por isso shopee_token_expires_at é conferido a
-- cada chamada, renovando sozinho via refresh_token quando precisa (mesmo
-- padrão de mlFetch/refreshMlToken em api/_ml-helper.js).
alter table public.profiles
  add column if not exists shopee_shop_id text,
  add column if not exists shopee_access_token text,
  add column if not exists shopee_refresh_token text,
  add column if not exists shopee_token_expires_at timestamptz;
