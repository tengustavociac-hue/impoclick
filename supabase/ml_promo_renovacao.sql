-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Reposição do desconto que o vendedor JÁ praticava.
--
-- O PROBLEMA: uma promoção acaba, o anúncio volta sozinho ao preço cheio e
-- fica sem desconto até alguém perceber. O vendedor já tinha decidido o preço
-- que queria — ele só não tem como ficar vigiando a data de término de cada
-- campanha.
--
-- A REGRA DA AUTOMAÇÃO é nunca receber menos do que já se recebe, e repor um
-- desconto que já era seu não a viola: o líquido volta a ser exatamente o que
-- era enquanto a promoção rodava. Não é uma concessão nova, é desfazer o
-- efeito colateral do vencimento.
--
-- POR ISSO só entra aqui promoção SEM abatimento do Mercado Livre. Na
-- cofinanciada o preço baixo só se sustenta porque o ML paga a diferença;
-- repor aquele preço depois que a campanha acabou seria vender mais barato
-- com o abatimento que sumiu — ou seja, receber menos.

-- 1) Chave da reposição, por usuário ------------------------------------
alter table ml_promo_automation
  add column if not exists auto_renew boolean not null default true;

comment on column ml_promo_automation.auto_renew is
  'Repor o desconto que o anúncio já praticava quando a promoção vencer. Só repõe promoção sem abatimento do ML, e sempre no mesmo preço — o líquido não muda.';

-- 2) Memória do desconto praticado, por anúncio --------------------------
-- Vai na tabela que a automação já carrega. Sem isto não há o que repor: uma
-- vez que a campanha vence, o Mercado Livre não informa mais qual era o preço.
alter table ml_promo_item_config add column if not exists last_deal_price     numeric;
alter table ml_promo_item_config add column if not exists last_original_price numeric;
alter table ml_promo_item_config add column if not exists last_promotion_type text;
alter table ml_promo_item_config add column if not exists last_seen_at        timestamptz;

comment on column ml_promo_item_config.last_deal_price is
  'Último preço promocional que o anúncio praticou, anotado enquanto a promoção estava ativa. É o valor que a reposição devolve.';
comment on column ml_promo_item_config.last_original_price is
  'Preço cheio na época daquele desconto. Se o cheio mudar, a memória é descartada: o desconto antigo deixou de ser referência.';

-- 3) Líquido de cada anúncio, para a tela -------------------------------
-- A aba mostra quanto o anúncio deixa LIMPO, que é o número da regra. Calcular
-- na hora de abrir a tela custaria duas consultas ao ML por anúncio, então a
-- verificação de 15 minutos calcula e guarda aqui. Só é refeito quando o preço
-- praticado muda ou quando o valor passa de meio dia.
alter table ml_promo_item_config add column if not exists current_price  numeric;
alter table ml_promo_item_config add column if not exists current_net    numeric;
alter table ml_promo_item_config add column if not exists current_net_at timestamptz;

comment on column ml_promo_item_config.current_net is
  'Quanto o anúncio deixa limpo por venda no preço em vigor: preço praticado na campanha ativa menos tarifa e frete, mais o que o ML banca. É o piso da automação e o valor exibido na aba.';
