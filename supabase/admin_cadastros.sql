-- Painel de cadastros: quem criou conta no Impoclick, quem confirmou o e-mail,
-- quem assina e quem de fato usou o produto. Só o dono do sistema vê.
--
-- Como a trava funciona: o site nunca lê auth.users direto (a chave pública
-- não alcança o schema auth). Ele chama admin_cadastros(), que roda como dono
-- do banco (security definer) e, antes de devolver qualquer linha, confere se
-- quem chamou está em app_admins. Para qualquer outra conta, recusa.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Depois registre a sua
-- conta como admin com o insert que está no fim — ele NÃO fica no arquivo
-- porque o repositório é público e levaria o seu e-mail junto.

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS ligado e nenhuma policy: pela API ninguém lê nem escreve esta tabela.
-- Só as duas funções abaixo, que rodam como dono, consultam.
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;


-- Usada pelo site só para decidir se mostra o item "Cadastros" no menu.
-- Esconder o menu é conveniência; a segurança está em admin_cadastros().
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- O Supabase concede EXECUTE a anon por padrão em função nova do schema public.
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;


create or replace function public.admin_cadastros()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  -- Devolve só o que a tela mostra. Nada de token, senha ou dado de cartão:
  -- do Mercado Livre sai apenas SE a conta está conectada.
  return jsonb_build_object(
    'gerado_em', now(),
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                   u.id,
        'email',                u.email,
        'nome',                 u.raw_user_meta_data ->> 'name',
        'criado_em',            u.created_at,
        'ultimo_acesso',        u.last_sign_in_at,
        'confirmou_email',      u.email_confirmed_at is not null,
        'assinante',            coalesce(p.is_pro, false),
        'assinatura_expira_em', p.subscription_expires_at,
        'ml_conectado',         p.ml_user_id is not null,
        'simulacoes',           (select count(*) from public.import_history h where h.user_id = u.id),
        'produtos',             (select count(*) from public.products_catalog c where c.user_id = u.id),
        'admin',                exists (select 1 from public.app_admins a where a.user_id = u.id)
      ) order by u.created_at desc)
      from auth.users u
      left join public.profiles p on p.id = u.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_cadastros() from public, anon;
grant execute on function public.admin_cadastros() to authenticated;


-- ── Depois de rodar o arquivo: registrar a sua conta ───────────────────
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'SEU_EMAIL_DE_LOGIN'
--   on conflict do nothing;
--
--   select u.email from public.app_admins a join auth.users u on u.id = a.user_id;
--
-- O select precisa devolver o seu e-mail. Se vier vazio, o e-mail do insert
-- não é o mesmo com que você entra no Impoclick.
