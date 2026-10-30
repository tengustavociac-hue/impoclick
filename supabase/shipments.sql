-- Rodar manualmente no SQL Editor do Supabase antes de usar a aba
-- "Navio - Container". Sem esta tabela a tela abre, mas avisa que não tem onde
-- guardar os embarques.
--
-- Um embarque por linha: o navio, o contêiner e as etapas do trajeto até a
-- entrega. A posição ao vivo NÃO fica aqui — ela vem do mapa da VesselFinder
-- pelo IMO (ou MMSI) do navio, na hora em que a tela abre.
--
-- A tabela já nasce com Row Level Security. A auditoria de 15/08/2026 achou
-- tabelas lidas pelo navegador com a anon key e sem RLS, e um curl anônimo lia
-- dados de outros usuários (ver fix_rls_exposed_tables.sql). Mesmo padrão aqui:
-- o dono só vê e edita as próprias linhas.

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Referência interna do importador, ex.: "IMP-2481". Opcional.
  reference text,

  vessel_name text not null,
  -- IMO tem 7 dígitos e não muda durante a vida do navio; MMSI tem 9 e pode
  -- mudar quando o navio troca de bandeira. O mapa aceita qualquer um dos dois,
  -- e o IMO é preferido por ser estável.
  imo text check (imo is null or imo ~ '^[0-9]{7}$'),
  mmsi text check (mmsi is null or mmsi ~ '^[0-9]{9}$'),
  carrier text,
  voyage text,

  container_number text,
  bl_number text,

  origin_port text,
  destination_port text,
  etd date,
  eta date,

  -- Etapas do trajeto, na ordem: [{ "key": "embarque", "done": true, "date": "2026-04-07" }, ...].
  -- Em jsonb porque o conjunto de etapas é fixo na tela e só o estado muda;
  -- uma tabela filha exigiria um join a cada abertura sem ganho nenhum.
  stages jsonb not null default '[]'::jsonb,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipments_user_created_idx
  on shipments (user_id, created_at desc);

alter table shipments enable row level security;

-- O drop deixa o arquivo seguro para rodar de novo: create policy sozinho
-- falha com "already exists" na segunda vez.
drop policy if exists "own rows only" on shipments;
create policy "own rows only" on shipments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
