-- Rodar manualmente no SQL Editor do Supabase, uma única vez, pra corrigir a
-- tabela ml_reviews já criada (a constraint original não considerava o usuário,
-- então avaliações de um usuário eram descartadas se outro usuário já tivesse
-- gravado o mesmo item_id + review_id — ver supabase/ml_reviews.sql atualizado).

alter table ml_reviews drop constraint ml_reviews_ml_item_id_ml_review_id_key;
alter table ml_reviews add constraint ml_reviews_user_item_review_key unique (user_id, ml_item_id, ml_review_id);
