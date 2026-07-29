-- Rodar manualmente no SQL Editor do Supabase, uma única vez, na tabela
-- ml_catalog_status já criada — adiciona a coluna usada pra montar o link
-- direto de edição do anúncio no Mercado Livre.

alter table ml_catalog_status add column user_product_id text;
