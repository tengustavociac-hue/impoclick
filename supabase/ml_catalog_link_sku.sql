-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Duas colunas na tabela de status do catálogo, para a tela poder linkar o
-- título do anúncio direto para a página dele no Mercado Livre e mostrar o
-- SKU (o código que o próprio vendedor cadastrou no anúncio, atributo
-- SELLER_SKU) ao lado do preço. Nenhuma das duas mudava com que frequência o
-- item ganha ou perde a disputa, então ficam soltas, preenchidas junto com o
-- resto na verificação de 15 minutos.

alter table ml_catalog_status add column if not exists permalink   text;
alter table ml_catalog_status add column if not exists seller_sku  text;

comment on column ml_catalog_status.permalink is
  'Link do anúncio no Mercado Livre (campo permalink do /items). Usado para o título do card abrir o anúncio.';
comment on column ml_catalog_status.seller_sku is
  'SKU que o vendedor cadastrou no anúncio (atributo SELLER_SKU do /items). Null quando o anúncio não tem SKU cadastrado.';
