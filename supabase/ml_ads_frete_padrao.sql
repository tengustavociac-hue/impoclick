-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Se o vendedor SEMPRE oferece frete grátis nos próprios anúncios (paga o
-- envio, pelas medidas, mesmo abaixo de R$ 79) — mesma pergunta que a
-- extensão já faz (chrome.storage.local: "ofereceFreteGratis", padrão Sim),
-- agora também no site, para a margem do Catálogo — Ganhando e do painel de
-- Patrocinados saberem quando CONTAR o frete mesmo com a API do Mercado Livre
-- devolvendo free_shipping: false para aquele anúncio específico.
--
-- Sem isto, um anúncio abaixo de R$ 79 sem o campo free_shipping = true
-- aparecia com "Frete: R$ 0,00" — verdade para quem NÃO paga o frete abaixo
-- do limite, mas errado para quem paga sempre.

alter table ml_ads_settings
  add column if not exists sempre_frete_gratis boolean not null default true;

comment on column ml_ads_settings.sempre_frete_gratis is
  'true = o vendedor sempre paga o frete dos próprios anúncios, mesmo abaixo de R$ 79 e mesmo quando o Mercado Livre não marca o anúncio como frete grátis. Padrão true, igual ao da extensão.';
