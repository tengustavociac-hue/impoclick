-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Automação da Central de Promoções: entrar e renovar promoções sozinho.
--
-- DESENHO: o vendedor DIGITA o preço mínimo de cada anúncio. A automação só
-- entra numa promoção se o preço couber acima dele. Nada é calculado nem
-- sobrescrito automaticamente — o custo de importação que o Impoclick sabe
-- calcular aparece apenas como sugestão na tela, com um botão para adotar.
--
-- Sem preço mínimo definido, o robô não age naquele anúncio. É a trava
-- principal, e ela é explícita: exige uma ação consciente por anúncio.

-- 1) Preço mínimo, definido pelo vendedor -------------------------------
alter table products_catalog add column if not exists price_floor            numeric;
alter table products_catalog add column if not exists price_floor_updated_at timestamptz;

comment on column products_catalog.price_floor is
  'Preço mínimo para entrar em promoção, DIGITADO pelo vendedor. A automação nunca sobrescreve este valor — ela só o obedece. Null = automação não age neste anúncio.';

-- 2) Configuração da automação, por usuário ------------------------------
create table if not exists ml_promo_automation (
  user_id            uuid primary key references profiles(id) on delete cascade,

  -- Desligado por padrão. Automação de preço nunca deve começar ligada.
  enabled            boolean not null default false,

  -- DEAL é reversível (dá pra sair da campanha por DELETE), então é a porta
  -- de entrada natural. LIGHTNING vem desligado: uma vez ativa, a oferta
  -- relâmpago NÃO pode ser removida — só pausando o anúncio inteiro.
  auto_deal          boolean not null default true,
  auto_lightning     boolean not null default false,

  -- Estoque comprometido em cada Relâmpago. Fica reservado até esgotar.
  lightning_stock    integer not null default 1,

  -- Teto de entradas por dia. Trava contra um convite em massa do ML virar
  -- dezenas de descontos de uma vez.
  max_joins_per_day  integer not null default 10,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table ml_promo_automation enable row level security;
create policy "own rows only" on ml_promo_automation
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Registro do que o robô fez ------------------------------------------
-- Automação sem histórico é caixa-preta. Toda decisão entra aqui, inclusive
-- as de NÃO agir — é o que permite auditar por que um item ficou de fora.
create table if not exists ml_promo_actions (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references profiles(id) on delete cascade,
  ml_item_id     text not null,
  item_title     text,
  promotion_id   text,
  promotion_type text,

  -- joined  = entrou na promoção
  -- skipped = decidiu não entrar (motivo em `reason`)
  -- failed  = tentou e o ML recusou (erro em `reason`)
  outcome        text not null check (outcome in ('joined', 'skipped', 'failed')),
  reason         text,

  deal_price     numeric,
  floor_price    numeric,
  min_price      numeric,
  max_price      numeric,

  created_at     timestamptz not null default now()
);

create index if not exists ml_promo_actions_user_date_idx
  on ml_promo_actions (user_id, created_at desc);

alter table ml_promo_actions enable row level security;
create policy "own rows only" on ml_promo_actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
