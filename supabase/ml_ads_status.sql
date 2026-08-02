-- Aba "Patrocinados" do monitoramento.
--
-- Guarda os anúncios que estão FORA de publicidade (status idle ou paused na
-- API do Mercado Livre). Anúncio que volta a rodar sai da tabela — o que
-- interessa aqui é quem está parado.
--
-- Uma linha por anúncio (unique user_id + ml_item_id), atualizada a cada
-- rodada do cron. is_read guarda se o vendedor já viu aquele alerta.

create table if not exists ml_ads_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ml_item_id text not null,
  item_title text,
  item_thumbnail text,
  -- idle = nunca entrou em campanha | paused = está em campanha, mas pausado
  status text not null,
  catalog_listing boolean not null default false,
  buy_box_winner boolean not null default false,
  -- o próprio ML marca os anúncios que responderiam bem ao investimento
  recommended boolean not null default false,
  is_read boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, ml_item_id)
);

create index if not exists ml_ads_status_user_idx on ml_ads_status (user_id, updated_at desc);

-- RLS desde o início: a tabela é lida pelo navegador com a chave anônima
-- pública, então sem isso qualquer pessoa leria os anúncios de todo mundo.
alter table ml_ads_status enable row level security;

drop policy if exists "own rows only" on ml_ads_status;
create policy "own rows only" on ml_ads_status
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
