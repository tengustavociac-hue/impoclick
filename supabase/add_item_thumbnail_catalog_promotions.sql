-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
-- Mesma foto do produto que já aparece em Avaliações, agora também em
-- Catálogo e Promoções (reaproveita o thumbnail já buscado no checker).

alter table ml_catalog_status add column item_thumbnail text;
alter table ml_promotions add column item_thumbnail text;
alter table ml_lightning_candidates add column item_thumbnail text;
