-- Ações da tela Cadastros: confirmar e-mail, liberar/retirar Pro e excluir
-- conta. Rode DEPOIS de supabase/admin_cadastros.sql, no SQL Editor.
--
-- Todas conferem app_admins antes de mexer em qualquer coisa — a mesma trava
-- de admin_cadastros(). Rodam como dono do banco (security definer) porque
-- mexem em auth.users, que a chave pública não alcança.
--
-- Assinatura recorrente: o site trata "Pro com subscription_expires_at vazio"
-- como assinatura no cartão, que vale até cancelar (checkSubscriptionStatus no
-- app.js e _ml-helper.js). Essas contas não podem ser excluídas nem ter o Pro
-- mexido por aqui: o Mercado Pago continuaria cobrando, e o próximo pagamento
-- aprovado devolveria o acesso sozinho. Cancela-se no Mercado Pago primeiro.
-- As liberações feitas por esta tela sempre têm data, então nunca se confundem
-- com assinatura.


-- ── admin_cadastros(), agora com a regra de acesso igual à do site ──────
-- Antes, "assinante" era só is_pro. Mas o PIX de 30 dias grava is_pro = true e
-- nada volta para false quando vence: a tela mostrava "Assinante" para quem já
-- tinha perdido o acesso. Agora vale a mesma conta do app.js: pago enquanto a
-- data não passou, ou sem data (assinatura recorrente).
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

  return jsonb_build_object(
    'gerado_em', now(),
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                    u.id,
        'email',                 u.email,
        'nome',                  u.raw_user_meta_data ->> 'name',
        'criado_em',             u.created_at,
        'ultimo_acesso',         u.last_sign_in_at,
        'confirmou_email',       u.email_confirmed_at is not null,
        'pro_marcado',           x.pago,
        'assinante',             x.pago and (p.subscription_expires_at is null or p.subscription_expires_at > now()),
        'assinatura_recorrente', x.pago and p.subscription_expires_at is null,
        'assinatura_expira_em',  p.subscription_expires_at,
        'ml_conectado',          p.ml_user_id is not null,
        'simulacoes',            (select count(*) from public.import_history h where h.user_id = u.id),
        'produtos',              (select count(*) from public.products_catalog c where c.user_id = u.id),
        'admin',                 exists (select 1 from public.app_admins a where a.user_id = u.id)
      ) order by u.created_at desc)
      from auth.users u
      left join public.profiles p on p.id = u.id
      -- is_subscribed pode não existir na tabela: lido pelo JSON da linha,
      -- ausente vira false em vez de derrubar a função.
      cross join lateral (select
        coalesce(p.is_pro, false)
        or coalesce((to_jsonb(p) ->> 'is_subscribed')::boolean, false) as pago) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_cadastros() from public, anon;
grant execute on function public.admin_cadastros() to authenticated;


-- ── Confirmar e-mail ────────────────────────────────────────────────────
-- Para quem não recebeu ou não achou o link. Sem confirmação o Supabase não
-- deixa entrar; com ela, a pessoa entra na hora com a senha que já criou.
create or replace function public.admin_confirmar_email(alvo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  update auth.users set email_confirmed_at = now()
   where id = alvo and email_confirmed_at is null;
  if not found then
    raise exception 'Conta não encontrada ou e-mail já confirmado.';
  end if;
end;
$$;

revoke all on function public.admin_confirmar_email(uuid) from public, anon;
grant execute on function public.admin_confirmar_email(uuid) to authenticated;


-- ── Liberar ou retirar Pro ──────────────────────────────────────────────
-- `ate` com data: Pro até 23:59:59 daquele dia, no horário de Brasília.
-- `ate` nulo: retira o Pro, zerando as mesmas colunas que o servidor zera
-- ao revogar um pagamento (revogarAcesso em api/_ml-helper.js).
create or replace function public.admin_definir_pro(alvo uuid, ate date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  perfil jsonb;
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  select to_jsonb(p) into perfil from public.profiles p where p.id = alvo;
  if perfil is null then
    raise exception 'Esta conta não tem perfil no banco.';
  end if;

  if (coalesce((perfil ->> 'is_pro')::boolean, false) or coalesce((perfil ->> 'is_subscribed')::boolean, false))
     and perfil ->> 'subscription_expires_at' is null then
    raise exception 'Assinatura recorrente no Mercado Pago: altere pelo Mercado Pago.';
  end if;

  if ate is null then
    update public.profiles set is_pro = false, subscription_expires_at = null where id = alvo;
    if perfil ? 'is_subscribed' then
      execute 'update public.profiles set is_subscribed = false where id = $1' using alvo;
    end if;
  else
    if ate < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data precisa ser hoje ou depois.';
    end if;
    -- 23:59:59 do dia escolhido: gravar a meia-noite seguinte faria a tela
    -- mostrar "até" um dia a mais.
    update public.profiles
       set is_pro = true,
           subscription_expires_at = ((ate + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second'
     where id = alvo;
  end if;
end;
$$;

revoke all on function public.admin_definir_pro(uuid, date) from public, anon;
grant execute on function public.admin_definir_pro(uuid, date) to authenticated;


-- ── Excluir conta ───────────────────────────────────────────────────────
-- Apaga a conta e tudo o que é dela. Exige o e-mail da conta digitado: a
-- conferência é aqui no banco, não só na tela, para um id trocado nunca
-- apagar a pessoa errada. Devolve quantas linhas de dados foram apagadas.
create or replace function public.admin_excluir_conta(alvo uuid, confirmacao_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo_email text;
  perfil     jsonb;
  pendentes  text[];
  restantes  text[];
  tabela     text;
  n          integer;
  apagadas   integer := 0;
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if alvo = auth.uid() or exists (select 1 from public.app_admins where user_id = alvo) then
    raise exception 'Contas de admin não podem ser excluídas por aqui.';
  end if;

  select email into alvo_email from auth.users where id = alvo;
  if alvo_email is null then
    raise exception 'Conta não encontrada.';
  end if;
  if lower(trim(coalesce(confirmacao_email, ''))) <> lower(alvo_email) then
    raise exception 'O e-mail digitado não confere com o da conta.';
  end if;

  select to_jsonb(p) into perfil from public.profiles p where p.id = alvo;
  if perfil is not null
     and (coalesce((perfil ->> 'is_pro')::boolean, false) or coalesce((perfil ->> 'is_subscribed')::boolean, false))
     and perfil ->> 'subscription_expires_at' is null then
    raise exception 'Assinatura recorrente ativa: cancele no Mercado Pago antes de excluir.';
  end if;

  -- Toda tabela do schema public com user_id guarda dados da pessoa.
  select coalesce(array_agg(format('%I.%I', c.table_schema, c.table_name)), '{}')
    into pendentes
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and c.column_name = 'user_id'
     and c.udt_name = 'uuid'
     and t.table_type = 'BASE TABLE';

  -- Seis tabelas de monitoramento do ML apontam para profiles sem "on delete
  -- cascade", e algumas podem apontar umas para as outras. Como a ordem certa
  -- não é conhecida de antemão, cada rodada apaga o que der e deixa para a
  -- próxima o que ainda está preso por chave estrangeira.
  while coalesce(array_length(pendentes, 1), 0) > 0 loop
    restantes := '{}';
    foreach tabela in array pendentes loop
      begin
        execute format('delete from %s where user_id = $1', tabela) using alvo;
        get diagnostics n = row_count;
        apagadas := apagadas + n;
      exception when foreign_key_violation then
        restantes := restantes || tabela;
      end;
    end loop;
    if coalesce(array_length(restantes, 1), 0) = coalesce(array_length(pendentes, 1), 0) then
      raise exception 'Não foi possível apagar os dados em: %', array_to_string(restantes, ', ');
    end if;
    pendentes := restantes;
  end loop;

  delete from public.profiles where id = alvo;
  delete from auth.users where id = alvo;
  return apagadas;
end;
$$;

revoke all on function public.admin_excluir_conta(uuid, text) from public, anon;
grant execute on function public.admin_excluir_conta(uuid, text) to authenticated;
