-- Conexão com a Amazon (SP-API). Mesmo molde das colunas ml_*/shopee_*: nada
-- destrutivo, só adiciona colunas nullable em profiles. Seguro rodar a qualquer
-- momento.
--
-- Diferente do Mercado Livre e da Shopee, a autorização hoje é um app PRIVADO
-- (autoautorizado direto no Seller Central, sem passar pelo nosso callback) —
-- por isso não existe ainda um "amazon_shop_id" equivalente; o refresh_token
-- já é a credencial vinculada à conta de vendedor específica. Quando o app for
-- público, as mesmas colunas servem para qualquer usuário conectado via OAuth.

alter table profiles
    add column if not exists amazon_refresh_token text,
    add column if not exists amazon_access_token text,
    add column if not exists amazon_token_expires_at timestamptz,
    add column if not exists amazon_selling_partner_id text;
