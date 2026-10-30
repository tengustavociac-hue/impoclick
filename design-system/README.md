# Design system da Impoclick

Biblioteca de componentes, tokens, padrões e guidelines. O contrato visual e a fonte da verdade
dos tokens é o [`DESIGN.md`](../DESIGN.md) da raiz; esta pasta é a implementação.

Veio de um export do Claude Design (React + JSX) e foi portada para a stack real do projeto:
**HTML + JavaScript sem framework e sem etapa de build**, servido direto pela Vercel. Cada componente
é uma função que devolve um `HTMLElement` com as mesmas classes `ic-*` do original; variantes e
estados moram no CSS e sobreviveram intactos.

## Mapa

| Caminho | O que tem |
|---|---|
| `styles.css` | Entrada única de CSS: tokens + componentes (`@import`). Não inclui padrões nem showcase. |
| `tokens/` | `fonts` · `colors` (claro em `:root`, escuro em `[data-theme="dark"]`) · `typography` · `spacing` · `radius` · `elevation` · `motion` · `base`. Espelho do front matter do `DESIGN.md`. |
| `components/` | Os 29 componentes, um arquivo por componente (dois arquivos têm dois: `Avatar.js` → `Avatar`, `AvatarGroup`; `DonutMeter.js` → `DonutMeter`, `Legend`), e um CSS por grupo. |
| `components/index.js` | **Único ponto de import** da biblioteca. O lint recusa import dos arquivos internos. |
| `components/dom.js` | Utilitário interno de montagem (`h`, `cx`, `applyCommon`) e o tipo `CommonProps`. |
| `patterns/` | Telas e seções compostas só com a biblioteca: `app/` (AppShell, Dashboard, Imports, Shipment, Quote, Costs) e `site/` (SiteHeader, Hero, Features, CTA, SiteFooter…). Layout em `patterns/patterns.css`. |
| `templates/` | Páginas montadas: `painel.html` (app clicável, `?rota=` e `?tema=dark`) e `site.html` (landing). |
| `guidelines/` | Os 20 cartões de especificação do export (cores, tipo, espaço, marca). HTML estático. |
| `assets/` | `logo-impoclick.png`. Ícones reais da marca, se um dia existirem, vão em `assets/icons/`. |
| `index.html` + `showcase/` | Rota de showcase: tokens, todos os componentes em todas as variantes e estados, padrões, templates e guidelines, nos dois temas. |
| `reference/` | Páginas de referência visual do export original. Ver abaixo. |
| `tsconfig.json` · `tsconfig.build.json` | Typecheck do JS com tipos JSDoc; emissão de `.d.ts` no build. |
| `dist/` | Saída de `npm run ds:build` (ignorada pelo Git e pelo deploy). |

### Grupos de componentes

- **core:** Icon · Button · IconButton · Card · Badge · Tag · Avatar · AvatarGroup · Stat · ProgressBar
- **forms:** Input · Select · Checkbox · Switch · SegmentedControl
- **navigation:** TopBar · NavPills · SideNav · Tabs · Breadcrumbs
- **feedback:** Alert · Toast · Tooltip · EmptyState
- **data:** DataTable · Timeline · SparkBars · DonutMeter · Legend

As regras de uso de cada um estão no comentário de cabeçalho do próprio arquivo (exemplo de chamada
e quando usar) e na seção *Components* do `DESIGN.md`.

## Como usar

```html
<link rel="stylesheet" href="/design-system/styles.css">
<script type="module">
  import { Card, Stat, Button } from '/design-system/components/index.js';

  document.querySelector('#painel').append(
    Card({
      eyebrow: 'Valor em trânsito',
      children: Stat({ prefix: 'US$', value: '1.284.600', fraction: ',00', size: 'lg' }),
      action: Button({ variant: 'outline', size: 'sm', children: 'Extrato', on: { click: abrirExtrato } }),
    }),
  );
</script>
```

- Toda prop do original virou chave do objeto; `children` aceita texto, nó, ou lista dos dois.
- Além das props de cada componente, todos aceitam `className`, `id`, `style` (strings com
  `var(--token)`), `attrs` (atributos HTML/ARIA) e `on` (ouvintes, ex. `{ click: fn }`).
- Em Input, Select, Checkbox e Switch, `className` vai no invólucro e `style`/`attrs`/`on` vão no
  próprio campo — igual ao original.
- SegmentedControl, NavPills, SideNav e Tabs atualizam o item selecionado sozinhos no clique e
  depois chamam `onChange` (no React o pai re-renderizava; aqui não há re-render).
- Script clássico, que não carrega módulo (o `app.js` do site é um): use `dist/impoclick-ds.iife.js`,
  que expõe `window.ImpoclickDS`, e `dist/impoclick-ds.css`.
- **Não carregue `styles.css` na mesma página que o `style.css` do site.** Os dois definem
  `--secondary`, `--secondary-hover`, `--success`, `--warning`, `--danger`, `--info` e `--text-muted`
  com valores diferentes.

## Comandos

| Comando | Faz |
|---|---|
| `npm run ds:serve` | Sobe `http://localhost:4173/design-system/` (showcase, templates, guidelines, referência). Módulos ES não carregam de `file://`. |
| `npm run typecheck` | TypeScript em modo estrito sobre componentes, padrões, templates e showcase. |
| `npm run lint` | oxlint no repositório + conferência da config de lint + lint do `DESIGN.md` + sincronia `DESIGN.md` ↔ `tokens/*.css`. |
| `npm run ds:build` | Gera `dist/` (ESM, IIFE, CSS único, `.d.ts`). |
| `npm run ds:lint-rules` | Regenera o `.oxlintrc.json` a partir dos tipos dos componentes. |
| `npm run ds:check` | Os três anteriores em sequência: typecheck, lint e build. |

Nenhum script se chama `build`: um script com esse nome pode virar comando de build da Vercel no
deploy do site.

## Criar um componente novo

1. **Tokens primeiro.** Se o componente precisa de cor, tamanho ou raio que ainda não existe,
   acrescente no front matter do `DESIGN.md` e depois no `tokens/*.css` correspondente. Nunca
   escreva o valor direto no componente.
2. **Arquivo.** `components/<grupo>/<Nome>.js`, começando com `// @ts-check` e um comentário de
   cabeçalho com propósito, exemplo de chamada e regras de uso. Tipos em JSDoc no formato
   `@typedef {CommonProps & { … }} NomeProps` — variantes como união de strings
   (`'sm' | 'md' | 'lg'`), porque o gerador de lint lê exatamente esse formato. A função monta o
   DOM com `h()` e termina com `applyCommon(el, common)`.
3. **Estilo.** No CSS do grupo, com classe `ic-nome` e modificadores `is-*`. Estados de interação
   por pseudo-classe (`:hover`, `:active`, `:focus-visible`, `[disabled]`), só com `var(--token)`.
   Medida que não é token (altura de controle, tamanho de ícone) fica literal, comentada.
4. **Exporte** em `components/index.js`.
5. **Showcase.** Acrescente um bloco em `showcase/showcase.js` com todas as variantes e estados;
   hover/active/focus aparecem com `force(elemento, 'hover')`.
6. **Contrato.** Registre o componente e as variantes na seção `components` do front matter e na
   seção *Components* do `DESIGN.md`.
7. `npm run ds:lint-rules` e depois `npm run ds:check`.

## Referência visual (`reference/`)

Páginas originais do Claude Design, em React, preservadas para comparação. **Não são componentes**
e não devem ser importadas.

| Caminho | Conteúdo |
|---|---|
| `reference/ui-kits/app/index.html` | Painel do importador original (6 arquivos `.jsx` + README). |
| `reference/ui-kits/site/index.html` | Site institucional original (2 `.jsx` + README). |
| `reference/component-cards/*.card.html` | Os 5 cartões de demonstração por grupo de componente. |
| `reference/templates/*.dc.html` | Versões reduzidas das duas telas, no formato de template do Claude Design. |
| `reference/_runtime/ds-bundle.js` | Biblioteca React compilada pelo Claude Design. Só existe porque essas páginas precisam dela para renderizar. |
| `reference/images/` | 7 quadros do estudo de caso "Finpath", a referência de *look and feel* usada para criar o sistema. **São de outro produto: nunca publique.** |

Abra por `npm run ds:serve`. Os cartões de componente e os templates `.dc` também abrem direto do
disco; os UI kits não, porque carregam os `.jsx` por requisição. Todas precisam de internet (React,
Babel e fontes vêm de CDN). Usam o `styles.css` desta pasta, então refletem os tokens atuais.

## O que mudou em relação ao export

- **Componentes em JS puro com tipos JSDoc** no lugar de JSX + `.d.ts` escritos à mão. Os `.d.ts`
  agora saem do build. Os `.prompt.md` de cada componente viraram o comentário de cabeçalho do
  próprio arquivo.
- **`required` em Input/Select** continua só desenhando o asterisco, como no original.
- **CSS de componente:** 29 valores trocados por token de valor idêntico (`#fff` → `var(--ink-0)`,
  `50%` → `var(--radius-circle)`, espaçamentos da escala de 4px → `var(--space-*)`). Nenhuma
  mudança visual.
- **Padrões:** o layout que era estilo inline nos `.jsx` foi para `patterns/patterns.css`. Valores
  fora da escala foram arredondados para o token mais próximo, com empate indo para o menor
  (ex.: 14px → `--space-3`/`--text-sm`, 10px → `--space-2`, 19px → `--text-title-sm`). Por isso as
  telas portadas diferem em poucos pixels das de `reference/`.
- **Dois bugs do export corrigidos nos padrões:** o texto do CTA usava `--text-on-accent` dentro do
  card `accent`, onde esse token vira a cor do fundo (texto invisível); e o painel do fornecedor e o
  depoimento usavam `#fff` fixo, que some no tema escuro.
- **Lint de aderência** gerado dos tipos (ver `tools/ds-lint-rules.js`), com três correções em
  relação ao `_adherence.oxlintrc.json` original: cobre os 29 componentes (o original deixava nove
  sem regra e tinha regra para tipos de dado que nunca viram elemento), a regex de `font-family`
  não acusa mais as fontes permitidas, e a verificação passou a pegar `style.fontFamily` e cor em
  `rgb()`/`hsl()`.
- **Não vieram:** `_ds_manifest.json`, `SKILL.md`, `thumbnail.html`, arquivos `.thumbnail` e a pasta
  `uploads/` (artefatos da ferramenta); os 13 quadros de referência que o próprio export não tinha
  selecionado; as cópias duplicadas de `support.js` e `ds-base.js` dos templates.

## Migração do site legado

**Identidade: já migrada.** O `index.html` carrega `styles.css` daqui antes do `style.css`, e os
tokens antigos do site apontam para os deste sistema (bloco de ponte no topo do `style.css`). Cor,
tipografia, superfície, raio e sombra do site já são os desta pasta.

**Estrutura: pendente.** A marcação continua com as classes legadas. A migração de estrutura é
trocar classe por componente, tela por tela:

| Legado (`style.css`) | Componente |
|---|---|
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-sm`, `.btn-block`, `.lp-btn*` | Button |
| `.btn-icon-edit`, `.btn-icon-danger`, `.modal-close-btn` | IconButton |
| `.card`, `.config-card`, `.info-card`, `.chart-card`, `.lp-card`, `.auth-card` | Card |
| `.kpi-card`, `.home-kpi-*`, `.viab-kpi-*` | Card + Stat |
| `.badge`, `.nav-badge`, `.ncm-badge`, `.pricing-badge`, `.pmk-tipo-tag` | Badge |
| `.form-control`, `.form-group`, `.input-hint`, `.mp-field*` | Input · Select |
| `.toggle-switch` | Switch |
| `.theme-toggle`, `.tax-mode-toggle` | SegmentedControl |
| `.radio-label`, `.radio-tile*`, `.feature-check` | Checkbox (`radio`) |
| `.results-tab-btn`, `.auth-tabs`, `.payment-tabs` | Tabs |
| `.nav-sidebar`, `.nav-item`, `.nav-subitem`, `.nav-eyebrow` | SideNav |
| `.toast`, `.toast-success`, `.toast-error` | Toast |
| `.auth-alert`, `.gtin-aviso*`, `.trial-banner` | Alert |
| `.table-results`, `.table-doc` | DataTable |
| `.bar-item`, `.bar-name`, `.bar-value` | SparkBars |
| `.user-avatar` | Avatar |
| `.empty-state` | EmptyState |

Sem equivalente na biblioteca: modal (`.modal-*`) e barra de progresso empilhada
(`.stacked-progress-bar`). Criar esses componentes segue o roteiro acima.

O tema já é compatível: os dois usam `data-theme` no `<html>`.
