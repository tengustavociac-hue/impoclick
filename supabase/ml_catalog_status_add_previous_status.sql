-- Rodar manualmente no SQL Editor do Supabase (mesmo padrão dos outros arquivos
-- em supabase/). Guarda o status ANTERIOR de cada item no momento em que ele
-- disparou o alerta (ex: estava "winning", passou a "competing") — sem isso,
-- o card na aba de Catálogo não tinha como mostrar qual foi a mudança exata
-- que gerou aquele alerta específico, só o status atual.
alter table ml_catalog_status add column if not exists previous_status text;
