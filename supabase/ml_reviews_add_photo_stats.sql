-- Rodar manualmente no SQL Editor do Supabase, uma única vez, na tabela
-- ml_reviews já existente — colunas novas pra mostrar foto do produto e as
-- estatísticas de avaliação do produto (média e total), não só da avaliação
-- individual.

alter table ml_reviews add column item_thumbnail text;
alter table ml_reviews add column item_rating_average numeric;
alter table ml_reviews add column item_rating_count int;
