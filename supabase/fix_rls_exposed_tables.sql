-- URGENTE — Rodar manualmente no SQL Editor do Supabase assim que possível.
--
-- Achado numa auditoria de segurança: as tabelas abaixo são lidas diretamente
-- pelo navegador (supabase_client.js, usando a anon key pública) e NÃO tinham
-- Row Level Security habilitada. Confirmado com teste real: um curl anônimo
-- (só com a anon key pública, sem login nenhum) conseguiu ler linhas de
-- OUTROS usuários na tabela import_history — inclusive dados de simulação de
-- importação completos.
--
-- As tabelas ml_* (ml_reviews, ml_catalog_status, ml_promotions,
-- ml_lightning_candidates, ml_check_status) e profiles já estavam protegidas
-- corretamente (retornam vazio pra chave anônima) — não precisam de mudança.
--
-- Este SQL habilita RLS e restringe cada tabela a "o dono só vê/edita a
-- própria linha" — exatamente o padrão que o próprio app.js/supabase_client.js
-- já assume em todas as suas queries (sempre filtra por user_id = usuário
-- logado), então não muda nenhum comportamento legítimo, só bloqueia acesso
-- de terceiros.

alter table import_history enable row level security;
create policy "own rows only" on import_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table products_catalog enable row level security;
create policy "own rows only" on products_catalog
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table company_settings enable row level security;
create policy "own rows only" on company_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table active_simulation enable row level security;
create policy "own rows only" on active_simulation
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
