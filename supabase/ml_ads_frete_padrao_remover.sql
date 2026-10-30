-- Opcional. Rodar no SQL Editor do Supabase só se quiser limpar a coluna.
--
-- ml_ads_settings.sempre_frete_gratis (de supabase/ml_ads_frete_padrao.sql)
-- deixou de ser usada: a margem do Catálogo — Ganhando agora usa a comissão e
-- o frete REAIS das vendas dos últimos 30 dias (o mesmo /shipments/{id}/costs
-- que aparece em "Detalhe da venda" no Mercado Livre), não uma pergunta de
-- sim/não. Sem venda no período, cai numa estimativa de tabela — marcada como
-- "(estimado)" na tela, sem precisar de configuração nenhuma.
--
-- Não tem pressa nem obrigação: a coluna só fica parada, sem custo, se você
-- preferir deixar como está.

alter table ml_ads_settings drop column if exists sempre_frete_gratis;
