-- Rodar manualmente no SQL Editor do Supabase, uma única vez.
--
-- Limite de subida do preço para o comprador na automação de promoções.
--
-- O PROBLEMA: a regra era só "nunca receber menos do que hoje". Nos descontos
-- em que o preço é do vendedor (DEAL, PRICE_DISCOUNT, SELLER_CAMPAIGN) a
-- automação usava o preço sugerido ou o máximo da faixa, e trocava uma
-- campanha de R$ 27,96 por uma de R$ 59,42 porque deixava mais por venda.
-- Receber mais subindo o preço custa vendas.

-- 1) Quanto o preço pode subir numa troca, em % ----------------------------
alter table ml_promo_automation
  add column if not exists max_price_increase_pct numeric not null default 5
  check (max_price_increase_pct >= 0 and max_price_increase_pct <= 100);

comment on column ml_promo_automation.max_price_increase_pct is
  'Quanto o preço para o comprador pode subir numa troca de campanha, sobre o preço de antes das trocas dos últimos 30 dias. 0 = a automação nunca sobe o preço.';

-- 2) Preço que o comprador pagava antes de cada troca ----------------------
-- É a referência do limite: sem ela, cada troca poderia subir um pouco em
-- cima da anterior.
alter table ml_promo_actions add column if not exists previous_price numeric;

comment on column ml_promo_actions.previous_price is
  'Preço que o comprador pagava antes desta entrada. Referência do limite de subida.';

-- 3) As trocas já feitas guardaram esse preço só no texto do motivo
-- ("... que a campanha de agora deixa (a R$ 27,96)"). Sem trazê-lo para a
-- coluna, a automação não saberia quais anúncios subiu demais.
update ml_promo_actions
set previous_price = replace(substring(reason from 'deixa \(a R\$ ([0-9]+,[0-9]{2})\)'), ',', '.')::numeric
where outcome = 'joined'
  and previous_price is null
  and reason ~ 'deixa \(a R\$ [0-9]+,[0-9]{2}\)';
