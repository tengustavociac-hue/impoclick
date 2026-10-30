-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Preço mínimo por ANÚNCIO, sem depender do catálogo de produtos.
--
-- POR QUE ESTA TABELA EXISTE: o preço mínimo estava em products_catalog, o que
-- obrigava a vincular cada anúncio a um produto cadastrado só para poder
-- digitar um número. Isso era uma limitação de armazenamento aparecendo como
-- exigência na interface — o usuário não quer catalogar nada, quer definir um
-- piso e deixar a automação renovar as promoções.
--
-- Agora a chave é o próprio MLB do anúncio. Sem catálogo, sem vínculo.

create table if not exists ml_promo_item_config (
  user_id    uuid not null references profiles(id) on delete cascade,
  ml_item_id text not null,
  min_price  numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, ml_item_id)
);

comment on table ml_promo_item_config is
  'Preço mínimo por anúncio para a automação de promoções. min_price null (ou linha ausente) = a automação ignora o anúncio.';

alter table ml_promo_item_config enable row level security;
create policy "own rows only" on ml_promo_item_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Aproveita o que já tiver sido configurado pelo caminho antigo.
insert into ml_promo_item_config (user_id, ml_item_id, min_price)
select user_id, ml_item_id, price_floor
from products_catalog
where ml_item_id is not null and price_floor is not null
on conflict (user_id, ml_item_id) do nothing;
