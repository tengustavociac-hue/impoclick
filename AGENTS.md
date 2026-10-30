# AGENTS.md — Impoclick

Instruções para agentes de código (Codex, Claude Code, Cursor e afins) neste repositório.

## O projeto

Simulador de custo e viabilidade de importação, com monitoramento de anúncios do Mercado Livre.
Em produção em `www.impoclick.com.br`.

| Caminho | O que é |
|---|---|
| `index.html` · `app.js` · `style.css` | O site e o app. HTML + JavaScript sem framework e **sem etapa de build**: a Vercel serve os arquivos como estão. |
| `navio.js` · `navio.css` | Aba **Navio - Container** (Importação). Primeira tela feita inteira com a biblioteca de componentes, como módulo ES. Ver *Telas em módulo* abaixo. |
| `lote.js` · `lote.css` | Relatório **Ver** de um lote do Histórico de Importação: custos, composição em gráfico e memória fiscal, só leitura. |
| `ml-conexao.js` · `ml-conexao.css` | Aviso de conta do Mercado Livre não conectada no topo das abas Avaliações, Catálogos, Promoções e Patrocinados. Só aparece quando o `/api/ml-status` responde `motivo` (`nao_conectado` ou `expirado`); erro não mostra nada. `conexaoMercadoLivre()` é compartilhada com outros módulos. |
| `patrocinados.js` · `patrocinados-regras.js` · `patrocinados.css` | Painel da aba **Patrocinados**: margem depois dos anúncios por anúncio e diagnósticos. A conta e as regras ficam em `patrocinados-regras.js`, sem tela. |
| `supabase_client.js` · `ncm_db.js` · `ncm_rates.js` | Cliente do Supabase e bases locais de NCM, carregados por `<script>` no `index.html`. |
| `api/` | Funções serverless da Vercel (Node, CommonJS). |
| `design-system/` | Biblioteca de componentes, tokens e showcase. Ver *Design system* abaixo. |
| `extension/` | Extensão do Chrome. Fora do deploy do site; o pacote da Chrome Web Store vai para `dist/`. |
| `supabase/` | SQL do esquema e das correções do banco. |
| `server/` | Backend local antigo, não usado pelas funções da Vercel. |
| `tools/` | Scripts de manutenção (Node, CommonJS). |

## Comandos

- `npm run ds:check` — typecheck, lint e build do design system. Rode antes de entregar mudança em
  JavaScript ou em `design-system/`.
- `npm run typecheck` · `npm run lint` · `npm run ds:build` · `npm run ds:serve` — ver
  `design-system/README.md`.
- `node tools/csp-hash.js` — recalcula o hash CSP depois de mexer no script inline do `index.html`
  (o hash vai no `vercel.json`).

## Deploy e Git — leia antes de qualquer push

- **O deploy de produção é `vercel --prod`**, rodado na pasta. Ele sobe o conteúdo **local**, não o
  que está no Git.
- **`git push` também publica em produção**, a partir do que está commitado. Com trabalho local não
  commitado (o caso normal aqui), um push **reverte a produção**. Depois de qualquer push, rode
  `vercel --prod`. Nunca faça push sem pedido explícito.
- **`api/` está no teto de 12 funções** do plano da Vercel. Não crie arquivo novo em `api/`: endpoint
  novo entra como `action=`/`resource=` num handler existente. Arquivo com `_` na frente
  (`_ml-helper.js`) não conta como função.
- **`.vercelignore` substitui o `.gitignore` no upload.** Tudo que não estiver listado ali vira URL
  pública. Arquivo novo com segredo, documento interno ou material de referência precisa entrar nele.
- Ao mudar `app.js`, `style.css`, `supabase_client.js`, `navio.js`, `navio.css`, `lote.js`, `lote.css` ou as bases de NCM,
  suba o `?v=` correspondente no `index.html`: o `vercel.json` manda o navegador guardar esses
  arquivos por um dia.
- **Tabela nova no Supabase não se cria sozinha.** O SQL fica em `supabase/` e é rodado à mão no SQL
  Editor, sempre com RLS "own rows only" (ver `fix_rls_exposed_tables.sql`). Não publique a tela
  antes de a tabela existir: sem ela a aba abre, mas avisa que está indisponível.

## Design system

- **`DESIGN.md` na raiz é o contrato visual e a fonte da verdade dos tokens.** `design-system/tokens/*.css`
  espelha o front matter dele; `npm run lint` falha se divergirem. Mudou um token? Mude primeiro no
  `DESIGN.md`.
- **Componente novo sai da biblioteca** em `design-system/components/`, importado sempre de
  `design-system/components/index.js`. Se falta um componente, crie-o dentro do sistema
  (roteiro em `design-system/README.md` › *Criar um componente novo*), nunca solto numa tela.
- **Nenhum valor de cor, fonte, espaçamento ou raio fixo no código.** Use `var(--token)`. O lint
  recusa hex, `rgb()`, px e fonte crus em JavaScript, prop ou variante inexistente e import dos
  arquivos internos da biblioteca. Medida de layout que não é token (largura de coluna, altura de
  controle) vai numa classe CSS, comentada como métrica.
- **Mapa da biblioteca:**
  - `design-system/tokens/` — tokens em CSS (tema claro em `:root`, escuro em `[data-theme="dark"]`)
  - `design-system/components/{core,forms,navigation,feedback,data}/` — os 29 componentes, JS com
    tipos JSDoc, um CSS por grupo
  - `design-system/patterns/` — telas e seções compostas (`app/`, `site/`)
  - `design-system/templates/` — páginas montadas (`painel.html`, `site.html`)
  - `design-system/guidelines/` — cartões de especificação em HTML estático
  - `design-system/index.html` — showcase com tudo, nos dois temas (`npm run ds:serve`)
  - `design-system/reference/` — **HTMLs de referência visual** do export original do Claude Design
    (UI kits em React, cartões de componente, templates `.dc`). Só para comparação: não importe nada
    dali e não publique `reference/images/`, que são de outro produto.
- **Depois de mudar a API de um componente**, rode `npm run ds:lint-rules`: o `.oxlintrc.json` é
  gerado a partir dos tipos e o lint confere se está em dia.

### Estado da migração do site

O site **já usa a identidade do design system** (migrado em 17/09/2026, publicado em 18/09/2026).
Como funciona:

- O `index.html` carrega `design-system/styles.css` **antes** do `style.css`. Não inverta a ordem.
- O `style.css` abre com um bloco de ponte: os nomes antigos (`--primary`, `--bg-card`,
  `--border-radius-*`, `--font-primary`…) apontam para os tokens do sistema. Mudança de cor,
  fonte, raio ou superfície do site se faz **nessa ponte ou no `DESIGN.md`**, nunca com valor fixo.
- `--secondary` no site virou `--surface-2` (no sistema, `--secondary` é o laranja de conversão).
  `--success`, `--warning`, `--danger`, `--info` e `--text-muted` agora vêm só do sistema.
- Continuam fixas de propósito: as cores de marca de terceiros (Mercado Livre, Shopee, Amazon) e a
  folha A4 das pré-visualizações de documento, que imita papel nos dois temas.
- **A marcação ainda usa as classes legadas** (`.btn`, `.card`, `.form-control`…). Trocar classe por
  componente da biblioteca é o próximo passo, tela a tela: a tabela está em
  `design-system/README.md` › *Migração do site legado*.
- A **extensão do Chrome** também já usa o design system, com duas particularidades: os tokens vêm
  de `extension/ds-tokens.css`, **gerado** por `tools/ds-extension-tokens.js` e escopado nas raízes
  injetadas (nunca `:root`, senão vazam para a página do Mercado Livre), e a Urbanist vai embutida
  em `extension/fonts/urbanist.woff2`, porque a CSP do ML bloqueia fonte externa. Mudou um token?
  Rode `npm run ds:extension-tokens` — o `npm run lint` confere se está em dia.
- **Pacote da Chrome Web Store:** `npm run ext:pack` gera `dist/impoclick-extension-<versão>.zip`
  a partir da versão do `manifest.json`. A lista de arquivos em `tools/empacotar-extensao.js` é
  explícita, para nenhum arquivo de desenvolvimento entrar no pacote: arquivo novo na extensão
  precisa ser somado à lista.
- Os arquivos legados seguem fora das regras de aderência e de três regras de corretude no
  `.oxlintrc.json` (lista `LEGACY` em `tools/ds-lint-rules.js`). Ao migrar a marcação de um
  arquivo, tire-o dessa lista.
- **CSS legado que vaza nos componentes.** Regras de elemento do `style.css` alcançam o que a
  biblioteca renderiza. A de `<label>` já exclui `.ic-label`, `.ic-check` e `.ic-switch` — dentro de
  `:where()`, para não subir a especificidade e vencer ajustes legados. As de `table`/`th`/`td` ainda
  não excluem `.ic-table`: confira ao usar `DataTable` numa tela do site.

### Telas em módulo

Tela nova do site segue o padrão da aba Navio - Container:

- Um módulo na raiz (`navio.js`) carregado com `<script type="module">` **depois** do `app.js`,
  importando de `design-system/components/index.js`. O `index.html` só tem a raiz vazia da tela.
- O layout vai num CSS próprio (`navio.css`), carregado **depois** do `style.css`, só com tokens e
  métricas comentadas. As classes `ic-p-*` das telas-modelo não servem: `design-system/patterns/`
  fica fora do deploy.
- O módulo não mexe no menu. O `switchView` do `app.js` dispara `impoclick:tela` com o id do painel,
  e o módulo se monta ao ouvi-lo. O título do topo vem de `VIEW_HEADER_META` no `app.js`.
- Dados pelo `window.db` (`supabase_client.js`), devolvendo `{ dados }` ou `{ erro }` em vez de
  `alert()`, para a tela decidir o que dizer.
- `npm run typecheck` também verifica os módulos da raiz (`navio.js`, `lote.js`, `patrocinados*.js`), por
  `tsconfig.site.json`: acrescente o arquivo novo ao `include` de lá.
- Revisão sem login: `tools/preview-navio.html` abre o `index.html` real, troca o `window.db` por um
  banco em memória e clica no item do menu (cenários na primeira linha do arquivo).
- **A conta da calculadora é `calcularLote(estado)`**, no `app.js`: câmbio, rateios, tributos e custo
  final, sem tela. O `updateUI` desenha a partir dela e o relatório "Ver" também — nunca refaça a
  conta num módulo. Mexeu nela (ou em `calculateItemTaxes`)? Rode `tools/referencia-calculo.html`
  antes e depois e compare: ele passa oito lotes, um por regime, pelo `updateUI` real.
- O relatório "Ver" recebe os dados pronto no evento `impoclick:ver-lote`, disparado por
  `verLoteSalvo()`. Revisão sem login: `tools/preview-lote.html`.
- A aba Navio - Container depende de `supabase/shipments.sql`. O mapa é o widget gratuito da
  VesselFinder em iframe (liberado no `frame-src` da CSP); o site não lê a posição, só a exibe.
- O painel de Patrocinados lê `/api/ml-reviews?resource=ads-painel`, montado em
  `api/_ads-painel.js`: Product Ads v2 (grupos, anúncios, campanhas) mais os pedidos dos últimos 30
  dias para preço, comissão e frete reais por unidade. Os endpoints de métricas por anúncio foram
  desligados pelo ML em 30/05/2026 — métrica de anúncio só por `ad_groups/{id}/ads`, também no
  TACOS da extensão (`metricasDoItem`). O custo de cada MLB e a alíquota ficam em
  `supabase/ml_ads_margem.sql`. Revisão sem login: `tools/preview-patrocinados.html`.
- **Custo do produto e imposto são compartilhados entre telas** — `ml_item_costs`/`ml_ads_settings`
  (via `window.db.getAdsMargemDados/saveItemCost/saveAdsTax`), a mesma dupla de tabelas do Patrocinados.
  A aba Catálogo — Ganhando reusa isso em `/api/ml-reviews?resource=catalog-margem`
  (`contaMargemCatalogo`/`buildCatalogMargemBlock`, direto no `app.js`, sem módulo próprio: a tela de
  Catálogo continua em DOM puro) para mostrar se o preço travado pela disputa de catálogo ainda dá
  lucro, e o gasto com anúncio patrocinado daquele item (`metricasVariosItens`, de `_ads-painel.js`).
  Revisão sem login: `tools/preview-catalogo-margem.html`.
  A 3ª aba **Prejuízo** (`renderCatalogPrejuizoTab`/`catalogItensComPrejuizo`, mesmo arquivo) é
  derivada — não busca nada sozinha, só filtra `catalogUltimosItens` pelos "Ganhando" que já têm
  margem calculada, custo digitado e `contaMargemCatalogo(...).margemUn < 0`. É recalculada toda vez
  que `renderCatalogList` roda e a cada mudança de custo/imposto — nunca cobre "Perdendo" (decisão do
  usuário: manter no escopo de sempre, sem dobrar as chamadas ao ML por verificação).
  **Comissão e frete são os REAIS das vendas dos últimos 30 dias** (`vendasDoPeriodo`, mesma função e
  mesma prioridade do painel de Patrocinados — `/shipments/{id}/costs`, o que aparece em "Detalhe da
  venda" no próprio Mercado Livre) sempre que o item vendeu no período; sem venda, cai na estimativa
  de tabela (`custosDeTabela`) e a tela marca "(estimado)". Não existe pergunta de "sempre oferece
  frete grátis" (uma versão anterior tinha isso e chutava errado). `custosDeTabela` também não zera
  mais o frete de tabela pra item abaixo de R$ 79: o vendedor não paga frete grátis promocional, paga
  a tarifa OBRIGATÓRIA do Mercado Envios (regra vigente desde 02/03/2026) mesmo em item barato — visto
  ao vivo num anúncio de R$ 41,61 que cobrou R$ 7,35 de frete e a conta antiga mostrava R$ 0.
  **`pack_id` preenchido em `/orders/search` NÃO quer dizer envio dividido com outro anúncio** — o
  checkout do ML embrulha em "pack" até uma compra avulsa de um item só. `vendasDoPeriodo` (em
  `_ads-painel.js`) só descartava a amostra de frete de todo pedido com `pack_id`, e numa conta real
  isso jogou fora 12 de 14 vendas de um mesmo anúncio em 30 dias, sobrando 2 — mediana bem diferente da
  maioria (R$ 12,95 contra R$ 6,85 real). A correção confere `GET /packs/{pack_id}` (`orders.length`)
  antes de aceitar o envio; só descarta quando o pacote tem mais de um pedido de verdade. Isso também
  ajuda o Catálogo — Ganhando a cair menos vezes na estimativa de tabela.
  O título dos cards de Catálogo linka pro anúncio (`permalink`) e mostra o SKU do vendedor
  (`seller_sku`, atributo `SELLER_SKU`) — `ml_catalog_status.permalink`/`.seller_sku`
  (`supabase/ml_catalog_link_sku.sql`), preenchidos por `fetchLinkESku` dentro de
  `checkCatalogCompetition`. Os `resource=`/upserts que tocam colunas novas (`catalog`, o upsert do
  cron) têm fallback (regex no `error.message`) para quando o SQL ainda não rodou.
  **`ml_catalog_status` limpa órfãos** — anúncio que sai do catálogo (pausado, sem estoque, perdeu o
  `catalog_product_id`) não volta em `itemIds`, e sem limpeza a linha antiga ficava "Ganhando" pra
  sempre (achada ao vivo: uma de 12 dias parada, ainda "pedindo" custo do produto). `checkCatalogCompetition`
  agora recebe `listaCompleta` (mesmo sinal que `checkPromotions` já usava) e, só quando a varredura
  cobriu a conta inteira, apaga do banco quem não apareceu mais — mesmo idioma da limpeza de
  `ml_promotions`/`ml_lightning_candidates` logo abaixo.
- **A automação de promoções** (`automatizarPromocoesDoItem`, em `api/ml-reviews.js`). O ML não troca
  uma promoção por outra: a nova vira "programada", na fila atrás da ativa, e só vale (no preço que
  tiver) quando a ativa termina. Entrar "por cima" nunca melhora o preço de agora e foi o que
  empilhou promoções, uma 25% acima. Por isso: sem promoção, entra como antes; **com** promoção ativa
  só existe `trocarDePromocao`, que exige preço menor para o comprador, ganho mínimo para o vendedor,
  período vigente e duração igual ou maior que a da ativa, e faz ENTRAR na nova e só depois TIRAR a
  ativa (DELETE por tipo; SMART e preços competitivos pedem `offer_id`). Nunca empilha, e só tira da
  fila o que ela mesma inscreveu acima do limite (`max_price_increase_pct`). Com ativa, candidata
  descartada não gera linha de histórico (`avisar`): seria ruído a cada 15 minutos.

## Convenções

- Interface e textos em português do Brasil. Voz, formato de números e datas: `DESIGN.md` › *Overview*.
- **Dados de exemplo:** nunca use o nome real do dono do projeto, nem variações parecidas, como
  placeholder, dado de teste ou usuário fictício. Use nomes genéricos sem relação.
- Comentários explicam o porquê, não o quê, no estilo dos arquivos existentes.

## Documentos do repositório

- `DESIGN.md` — contrato visual e tokens.
- `design-system/README.md` — mapa detalhado, uso e migração da biblioteca.
- `AUDITORIA.md` — levantamento de falhas de segurança e correção (15/08/2026).
- `PASSO-A-PASSO.md` — roteiro de correção dos itens críticos da auditoria.
- `docs/shopee_pentest_elegibilidade.md` — análise da exigência de pentest da Shopee.
- `server/README.md` — backend local antigo.
