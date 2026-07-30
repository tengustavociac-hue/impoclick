-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
-- Separa os candidatos a Oferta Relâmpago (que não têm prazo, são só uma
-- oportunidade informativa) da tabela ml_promotions (que passa a guardar só
-- promoções reais, com prazo definido) — mais preciso do que misturar os dois
-- conceitos num status='candidate' com promotion_id fixo.

create table ml_lightning_candidates (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  ml_item_id text not null,
  item_title text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ml_item_id)
);

-- Migra o que já existir de candidatos (se houver) pra tabela nova.
insert into ml_lightning_candidates (user_id, ml_item_id, item_title, updated_at, created_at)
select user_id, ml_item_id, item_title, updated_at, created_at
from ml_promotions
where status = 'candidate'
on conflict (user_id, ml_item_id) do nothing;

delete from ml_promotions where status = 'candidate';

-- A partir daqui, toda linha de ml_promotions é uma promoção real com prazo.
alter table ml_promotions alter column finish_date set not null;
alter table ml_promotions add constraint ml_promotions_status_check check (status in ('active', 'ended'));
