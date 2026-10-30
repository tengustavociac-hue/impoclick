-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Prepara o terreno para o "piso de preço" nas Ofertas Relâmpago.
--
-- CONTEXTO: a API do Mercado Livre já devolve, para cada item candidato a
-- Relâmpago, os limites de preço e de estoque da oportunidade
-- (GET /seller-promotions/items/{id}?app_version=v2). O código guardava só
-- id, título e imagem, jogando fora justamente os números que permitem
-- decidir se vale a pena entrar.
--
-- E faltava a ligação entre o anúncio do ML e o produto do catálogo — sem
-- ela não há como saber o custo importado daquele anúncio, que é o dado que
-- só o Impoclick tem.

-- 1) Preços e estoque da oportunidade -----------------------------------
-- Todos em numeric/integer e nullable: a API nem sempre manda todos os
-- campos (suggested_discounted_price pode vir null quando o ML não tem
-- histórico suficiente para sugerir).

alter table ml_lightning_candidates add column if not exists original_price  numeric;
alter table ml_lightning_candidates add column if not exists suggested_price numeric;
alter table ml_lightning_candidates add column if not exists min_price       numeric;
alter table ml_lightning_candidates add column if not exists max_price       numeric;
alter table ml_lightning_candidates add column if not exists stock_min       integer;
alter table ml_lightning_candidates add column if not exists stock_max       integer;

comment on column ml_lightning_candidates.min_price is
  'Preço MÍNIMO permitido pelo ML (maior desconto possível). É o limite da plataforma, não o limite do vendedor — o piso de margem é calculado pelo Impoclick a partir do custo importado.';
comment on column ml_lightning_candidates.max_price is
  'Preço MÁXIMO ao qual o item pode ser ofertado na promoção.';
comment on column ml_lightning_candidates.suggested_price is
  'Preço sugerido pelo ML. Pode ser null quando não há sugestão disponível.';

-- 2) Vínculo anúncio do ML <-> produto do catálogo -----------------------
-- Nullable de propósito: a maioria dos produtos do catálogo nunca vai ser
-- anunciada, e a maioria dos anúncios pode não ter custo cadastrado. O
-- cálculo de piso só aparece para os que estiverem ligados.

alter table products_catalog add column if not exists ml_item_id text;

create index if not exists products_catalog_ml_item_id_idx
  on products_catalog (user_id, ml_item_id);

comment on column products_catalog.ml_item_id is
  'MLB do anúncio correspondente no Mercado Livre. Liga o custo de importação calculado aqui ao anúncio real, para decidir se um preço promocional cobre o custo.';

-- 3) Campos do produto que o formulário coletava e o código nunca gravava ---
--
-- BUG ENCONTRADO: o formulário de catálogo pede moeda, tributação, descrição e
-- imagem, mas o saveCatalogItem só persistia sku, name, ncm, unit_price e
-- weight. Tudo o mais era descartado em silêncio — um produto cadastrado em
-- dólar voltava do banco sem moeda e era tratado como real, subestimando o
-- custo em ~5x.
--
-- Sem a moeda não há como calcular piso de preço confiável, então estes campos
-- passam a ser gravados.

alter table products_catalog add column if not exists currency    text;
alter table products_catalog add column if not exists taxation    text;
alter table products_catalog add column if not exists description text;
alter table products_catalog add column if not exists image       text;

-- Produtos cadastrados antes desta correção ficaram sem moeda. BRL é o
-- palpite mais seguro: se o produto era em dólar, o custo aparece MENOR que o
-- real e o usuário percebe; o contrário passaria despercebido.
update products_catalog set currency = 'BRL' where currency is null;
