---
version: alpha
name: Impoclick
description: >-
  Sistema visual da Impoclick, plataforma brasileira de gestão de importação. Calmo, denso e
  numérico: números grandes, filetes, controles em pílula, um único acento saturado. Este arquivo
  é a fonte da verdade dos tokens; design-system/tokens/*.css espelha estes valores e
  `npm run lint` falha se os dois divergirem.
colors:
  # Paleta base — aqua (primária, tirada da marca do contêiner)
  aqua-50: "#E6F7F8"
  aqua-100: "#C2EDEF"
  aqua-200: "#8FDEE1"
  aqua-300: "#52CFD3"
  aqua-400: "#23D3D3"
  aqua-500: "#12B3B3"
  aqua-600: "#0E7C8C"
  aqua-700: "#0A6674"
  aqua-800: "#08525E"
  aqua-900: "#053A44"
  aqua-950: "#02252C"
  # Mar profundo (o corpo do contêiner)
  sea-700: "#0B3A47"
  sea-800: "#072A34"
  sea-900: "#04202A"
  sea-950: "#020F14"
  # Laranja cargo (a seta)
  orange-50: "#FFF1E6"
  orange-100: "#FFDCC2"
  orange-200: "#FFB783"
  orange-300: "#FF9247"
  orange-400: "#FF7A1A"
  orange-500: "#FF6000"
  orange-600: "#DB4F00"
  orange-700: "#A63C00"
  # Neutros levemente esfriados para o teal
  ink-0: "#FFFFFF"
  ink-25: "#FAFCFC"
  ink-50: "#F6F8F8"
  ink-100: "#F1F4F5"
  ink-200: "#E2E8E9"
  ink-300: "#CBD5D7"
  ink-400: "#9DAEB2"
  ink-500: "#7B8C92"
  ink-600: "#5C6E74"
  ink-700: "#46595F"
  ink-800: "#2A3B40"
  ink-850: "#1E2A2D"
  ink-900: "#162023"
  ink-925: "#0E1618"
  ink-950: "#070D0F"
  # Status
  green-400: "#37D399"
  green-500: "#16A06A"
  green-600: "#0F7C51"
  amber-400: "#F5B33C"
  amber-500: "#C9820B"
  amber-600: "#9A6407"
  red-400: "#FF6B5E"
  red-500: "#D9463C"
  red-600: "#AE332B"

  # Papel semântico exigido pelo formato DESIGN.md; no CSS ele se chama --accent.
  primary: "{colors.aqua-600}"

  # Aliases semânticos — tema claro (padrão, :root)
  surface-page: "{colors.ink-50}"
  surface-card: "{colors.ink-0}"
  surface-raised: "{colors.ink-100}"
  surface-inset: "{colors.ink-200}"
  surface-invert: "{colors.sea-900}"
  surface-scrim: "rgba(4,32,42,.55)"
  text-title: "#0B1A1F"
  text-body: "{colors.ink-700}"
  text-muted: "{colors.ink-500}"
  text-invert: "{colors.ink-0}"
  text-on-accent: "{colors.ink-0}"
  border-subtle: "{colors.ink-200}"
  border-strong: "{colors.ink-300}"
  border-accent: "{colors.aqua-600}"
  accent: "{colors.aqua-600}"
  accent-hover: "{colors.aqua-700}"
  accent-press: "{colors.aqua-800}"
  accent-soft: "{colors.aqua-50}"
  accent-soft-border: "{colors.aqua-100}"
  accent-glow: "{colors.aqua-400}"
  accent-bg: "{colors.aqua-600}"
  accent-ink: "{colors.ink-0}"
  secondary: "{colors.orange-500}"
  secondary-hover: "{colors.orange-600}"
  secondary-soft: "{colors.orange-50}"
  success: "{colors.green-500}"
  success-soft: "#E4F6EE"
  warning: "{colors.amber-500}"
  warning-soft: "#FCF2DD"
  danger: "{colors.red-500}"
  danger-soft: "#FCE9E7"
  info: "{colors.aqua-600}"
  info-soft: "{colors.aqua-50}"
  chart-1: "{colors.aqua-600}"
  chart-2: "{colors.orange-500}"
  chart-3: "{colors.sea-700}"
  chart-4: "{colors.aqua-300}"
  chart-5: "{colors.ink-300}"
  chart-track: "{colors.ink-200}"
  veil-light: "rgba(255,255,255,.72)"
  veil-dark: "rgba(7,13,15,.68)"

  # Aliases semânticos — tema escuro ([data-theme="dark"]). Mesmo nome + "-dark".
  surface-page-dark: "{colors.ink-950}"
  surface-card-dark: "{colors.ink-925}"
  surface-raised-dark: "{colors.ink-900}"
  surface-inset-dark: "{colors.ink-850}"
  surface-invert-dark: "{colors.ink-0}"
  surface-scrim-dark: "rgba(2,15,20,.72)"
  text-title-dark: "#F2F7F7"
  text-body-dark: "#A9BCC0"
  text-muted-dark: "#72878C"
  text-invert-dark: "#0B1A1F"
  text-on-accent-dark: "{colors.aqua-950}"
  border-subtle-dark: "#1D2A2D"
  border-strong-dark: "#2C3A3E"
  border-accent-dark: "{colors.aqua-400}"
  accent-dark: "{colors.aqua-400}"
  accent-hover-dark: "#4BE0E0"
  accent-press-dark: "{colors.aqua-500}"
  accent-soft-dark: "rgba(35,211,211,.13)"
  accent-soft-border-dark: "rgba(35,211,211,.26)"
  accent-glow-dark: "{colors.aqua-400}"
  accent-bg-dark: "{colors.aqua-400}"
  accent-ink-dark: "{colors.aqua-950}"
  secondary-dark: "{colors.orange-400}"
  secondary-hover-dark: "{colors.orange-300}"
  secondary-soft-dark: "rgba(255,122,26,.14)"
  success-dark: "{colors.green-400}"
  success-soft-dark: "rgba(55,211,153,.14)"
  warning-dark: "{colors.amber-400}"
  warning-soft-dark: "rgba(245,179,60,.14)"
  danger-dark: "{colors.red-400}"
  danger-soft-dark: "rgba(255,107,94,.14)"
  info-dark: "{colors.aqua-400}"
  info-soft-dark: "rgba(35,211,211,.13)"
  chart-1-dark: "{colors.aqua-400}"
  chart-2-dark: "{colors.orange-400}"
  chart-3-dark: "{colors.aqua-200}"
  chart-4-dark: "#4F6367"
  chart-5-dark: "#2C3A3E"
  chart-track-dark: "#1D2A2D"
  veil-light-dark: "rgba(14,22,24,.7)"
typography:
  hero:
    fontFamily: Urbanist
    fontSize: 80px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-lg:
    fontFamily: Urbanist
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-md:
    fontFamily: Urbanist
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-sm:
    fontFamily: Urbanist
    fontSize: 38px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Urbanist
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Urbanist
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Urbanist
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  title-card:
    fontFamily: Urbanist
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  wordmark:
    fontFamily: Urbanist
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Urbanist
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Urbanist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Urbanist
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: Urbanist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
  ui-sm:
    fontFamily: Urbanist
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.45
  label-lg:
    fontFamily: Urbanist
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  label-md:
    fontFamily: Urbanist
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  label-sm:
    fontFamily: Urbanist
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  label-caption:
    fontFamily: Urbanist
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  label-table:
    fontFamily: Urbanist
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.04em
  label-micro:
    fontFamily: Urbanist
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.12em
  figure-lg:
    fontFamily: Urbanist
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.03em
    fontFeature: '"tnum"'
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: '"tnum"'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: '"tnum"'
rounded:
  xs: 6px
  sm: 10px
  md: 14px
  lg: 20px
  xl: 28px
  2xl: 36px
  pill: 999px
  control: "{rounded.pill}"
  field: "{rounded.sm}"
  card: "{rounded.lg}"
  sheet: "{rounded.xl}"
spacing:
  space-0: 0px
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-5: 20px
  space-6: 24px
  space-8: 32px
  space-10: 40px
  space-12: 48px
  space-16: 64px
  space-20: 80px
  space-24: 96px
  space-32: 128px
  pad-card: 24px
  pad-card-compact: 16px
  gap-grid: 16px
  gap-section: 64px
  container-max: 1240px
  container-wide: 1440px
  nav-height: 64px
  sidenav-width: 248px
  sidenav-width-collapsed: 72px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
    typography: "{typography.label-md}"
    rounded: "{rounded.control}"
    height: 42px
    padding: 20px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.text-on-accent}"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
    textColor: "{colors.text-on-accent}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink-0}"
    typography: "{typography.label-md}"
    rounded: "{rounded.control}"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "{colors.ink-0}"
  button-outline:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-title}"
    typography: "{typography.label-md}"
    rounded: "{rounded.control}"
  button-outline-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  button-ghost:
    textColor: "{colors.text-body}"
    typography: "{typography.label-md}"
    rounded: "{rounded.control}"
  button-ghost-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-title}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink-0}"
    typography: "{typography.label-md}"
    rounded: "{rounded.control}"
  button-sm:
    typography: "{typography.label-sm}"
    height: 34px
    padding: 14px
  button-lg:
    typography: "{typography.label-lg}"
    height: 52px
    padding: 28px
  icon-button:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-body}"
    size: 40px
  icon-button-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-title}"
  icon-button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
    size: 40px
  icon-button-sm:
    size: 32px
  icon-button-lg:
    size: 48px
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.card}"
    padding: 24px
  card-compact:
    rounded: "{rounded.md}"
    padding: 16px
  card-flat:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-body}"
  card-accent:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent-ink}"
  card-invert:
    backgroundColor: "{colors.surface-invert}"
    textColor: "{colors.text-invert}"
  card-eyebrow:
    textColor: "{colors.text-muted}"
    typography: "{typography.label-micro}"
  card-title:
    textColor: "{colors.text-title}"
    typography: "{typography.title-card}"
  badge-neutral:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-body}"
    typography: "{typography.label-caption}"
    rounded: "{rounded.pill}"
    height: 24px
    padding: 10px
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  badge-secondary:
    backgroundColor: "{colors.secondary-soft}"
    textColor: "{colors.secondary}"
  badge-solid:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
  tag:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-body}"
    typography: "{typography.ui-sm}"
    rounded: "{rounded.pill}"
    height: 30px
  avatar:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-body}"
    size: 40px
  avatar-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  stat-value:
    textColor: "{colors.text-title}"
    typography: "{typography.figure-lg}"
  stat-unit:
    textColor: "{colors.text-muted}"
  progress-track:
    backgroundColor: "{colors.chart-track}"
    rounded: "{rounded.pill}"
    height: 8px
  progress-track-thick:
    height: 14px
  progress-fill:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-title}"
    typography: "{typography.body-md}"
    rounded: "{rounded.field}"
    height: 44px
    padding: 14px
  input-disabled:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-title}"
  input-pill:
    rounded: "{rounded.pill}"
  field-label:
    textColor: "{colors.text-title}"
    typography: "{typography.label-sm}"
  field-hint:
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
  field-error:
    textColor: "{colors.danger}"
    typography: "{typography.caption}"
  select:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-title}"
    typography: "{typography.body-md}"
    rounded: "{rounded.field}"
    height: 44px
  checkbox:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.xs}"
    size: 20px
  checkbox-checked:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
  switch-track:
    backgroundColor: "{colors.surface-inset}"
    rounded: "{rounded.pill}"
    width: 44px
    height: 26px
  switch-track-checked:
    backgroundColor: "{colors.accent}"
  switch-thumb:
    backgroundColor: "{colors.surface-card}"
    size: 20px
  segmented:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.pill}"
    padding: 4px
  segmented-option:
    textColor: "{colors.text-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.pill}"
    height: 32px
    padding: 16px
  segmented-option-active:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-title}"
  segmented-option-active-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
  topbar:
    backgroundColor: "{colors.veil-light}"
    textColor: "{colors.text-title}"
    typography: "{typography.wordmark}"
    height: 64px
    padding: 24px
  navpills:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.pill}"
    padding: 4px
  navpill-item:
    textColor: "{colors.text-body}"
    typography: "{typography.ui-sm}"
    rounded: "{rounded.pill}"
    height: 34px
    padding: 16px
  navpill-item-active:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-title}"
  sidenav:
    backgroundColor: "{colors.surface-card}"
    width: 248px
    padding: 16px
  sidenav-item:
    textColor: "{colors.text-body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 42px
    padding: 12px
  sidenav-item-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-title}"
  sidenav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  sidenav-collapsed:
    width: 72px
  tabs-item:
    textColor: "{colors.text-muted}"
    typography: "{typography.body-md}"
  tabs-item-active:
    textColor: "{colors.text-title}"
  tabs-indicator:
    backgroundColor: "{colors.accent}"
    height: 2px
  breadcrumbs:
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
  breadcrumbs-current:
    textColor: "{colors.text-title}"
  alert-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    padding: 16px
  alert-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  alert-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  alert-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  toast:
    backgroundColor: "{colors.surface-invert}"
    textColor: "{colors.text-invert}"
    typography: "{typography.ui-sm}"
    rounded: "{rounded.md}"
    padding: 12px
  tooltip:
    backgroundColor: "{colors.surface-invert}"
    textColor: "{colors.text-invert}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 6px
  empty-state-icon:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    size: 56px
  table-header:
    textColor: "{colors.text-muted}"
    typography: "{typography.label-table}"
  table-cell:
    textColor: "{colors.text-body}"
    typography: "{typography.body-sm}"
    padding: 16px
  table-row-hover:
    backgroundColor: "{colors.surface-raised}"
  timeline-dot:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-muted}"
    size: 28px
  timeline-dot-done:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
  timeline-dot-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  sparkbar:
    backgroundColor: "{colors.chart-track}"
    rounded: "{rounded.pill}"
  sparkbar-peak:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.pill}"
  mono-code:
    textColor: "{colors.text-muted}"
    typography: "{typography.mono-sm}"
---

# Impoclick — DESIGN.md

Contrato visual da Impoclick e fonte da verdade dos tokens. A implementação mora em
`design-system/` (ver `design-system/README.md`); as regras de uso para agentes estão no
`AGENTS.md`.

## Overview

A Impoclick é uma plataforma brasileira de gestão de importação. A marca é um contêiner com uma
seta de crescimento saindo dele, e a promessa é exatamente essa: **toda a operação de importação
de uma empresa — cotação, fornecedor, embarque, desembaraço e custo desembarcado — em um clique.**

A linguagem do produto é calma, densa e numérica. Números grandes, filetes, controles em pílula,
um único acento saturado e muita contenção em todo o resto.

### Voz e conteúdo

- **Idioma:** português do Brasil, sempre. Inglês só para os termos que o próprio comércio
  exterior usa sem traduzir: *incoterm, FOB, CIF, free time, packing list, bill of lading*.
- **Voz:** prática e um pouco aliviada. Quem lê é um importador que já tomou susto com conta de
  armazenagem. Fala-se como um colega competente — nem banco, nem startup.
- **Pessoa:** "você" para o leitor; nunca "tu", nunca "o cliente". Primeira pessoa do plural só
  quando a própria Impoclick age ("avisamos você sete dias antes").
- **Caixa:** sentença em tudo — títulos, botões, cabeçalhos de tabela, menus. Caixa alta só no
  micro-rótulo de 11px e em siglas do comércio (DI, NCM, BL, ICMS).
- **Números:** formato brasileiro — `R$ 612.480,00`, `US$ 84.200,00`, `18.420 kg`, `29 abr`.
  Datas em `dd mmm` na interface e `dd/mm/aaaa` em documento. Percentual com sinal: `+12,4%`, `−3,1%`.
- **Tamanho:** título com até 10 palavras; parágrafo com até 3 linhas; estado vazio é uma frase
  e uma ação; rótulo de botão com 1–3 palavras, verbo primeiro.
- **Emoji: nunca.** Nem no produto, nem no marketing, nem em e-mail. Status é ponto colorido ou glifo.

| Faça | Não faça |
|---|---|
| "Nova importação" | "Criar nova importação agora" |
| "A DI do IMP-2479 vence em 3 dias." | "Atenção! Sua DI está prestes a vencer!!" |
| "Nenhuma importação encontrada. Ajuste o período ou o status." | "Ops! Parece que não encontramos nada por aqui" |
| "Cotação enviada para 3 agentes de carga." | "Sucesso! Sua cotação foi enviada!" |

### Origem

Construído no Claude Design a partir de duas fontes: o logo da Impoclick (as cores foram
amostradas dos pixels dele: mar profundo `#003040`, aqua `#20C0C0`, laranja `#FF6000`) e um estudo
de caso visual de outro produto, "Finpath", usado como referência de *look and feel* — dele vieram
a linguagem estrutural (quase-preto + um acento elétrico, navegação em pílula, números grandes
divididos, cards de 20px) e a fonte Urbanist. Nada aqui recria o Finpath. O inventário de
componentes e as telas foram propostos, não copiados de um produto existente.

### Estado de adoção no projeto

O sistema vale para **todo código novo**, e o site já usa esta identidade.

- **Site (`index.html`, `style.css`, `app.js`): migrado.** O `index.html` carrega
  `design-system/styles.css` antes do `style.css`, e os nomes de token antigos (`--primary`,
  `--bg-card`, `--border-radius-*`…) passaram a apontar para os tokens daqui, num bloco de ponte
  no topo do `style.css`. A marcação continua com as classes legadas: a troca de classe por
  componente da biblioteca é migração de estrutura, e acontece tela a tela
  (tabela em `design-system/README.md`).
- **Extensão do Chrome: migrada.** Os tokens vão num arquivo gerado
  (`extension/ds-tokens.css`, por `tools/ds-extension-tokens.js`) **escopado nas raízes que a
  extensão injeta** — o painel mora dentro da página do Mercado Livre e não pode declarar variável
  em `:root`. A Urbanist vai embutida em `extension/fonts/urbanist.woff2`, porque a CSP do Mercado
  Livre bloqueia fonte externa. Só o tema claro entra: o painel convive com a interface do ML.
  Um pacote novo precisa ser gerado para a Web Store (o 1.7.0 ainda é o dourado).
- **Publicação: pendente.** A migração foi validada localmente; o site no ar ainda mostra a
  identidade anterior até alguém rodar `vercel --prod`.

### Perguntas em aberto para o dono da marca

1. O contêiner é o logo final? Existe vetor (SVG/AI) e um lockup horizontal com o nome?
2. A Urbanist é licenciada para a Impoclick, ou era só a fonte da referência? Idem para os ícones.
3. O tema padrão do produto é claro ou escuro? Os dois estão completos; o claro é o `:root`.
   O site atual usa escuro como base.
4. ~~A identidade dourada do site será substituída por esta?~~ **Sim** — o site foi migrado em
   17/09/2026 e está validado localmente, à espera de publicação. A extensão do Chrome continua
   dourada.
5. Nenhum componente define estado de carregamento (*loading*). Precisa existir?
6. **Contraste abaixo do AA na paleta exportada.** O lint oficial do DESIGN.md aponta 18 pares
   de componente abaixo de 4,5:1 no tema claro, entre eles: texto de status sobre o fundo `-soft`
   (sucesso 2,98:1, aviso 2,83:1, perigo 3,67:1, laranja 2,74:1), aqua sobre `accent-soft`
   (4,44:1 — badge, alerta info, item ativo da SideNav, hover do outline), branco sobre laranja
   (3,03:1) e sobre vermelho (4,29:1), e o ponto `todo` da Timeline (2,82:1). Os valores foram
   mantidos como vieram do Claude Design; os tons `green-600`, `amber-600` e `red-600`, que
   existem na paleta sem uso, são o caminho natural para texto sobre fundo suave. Corrigir é
   mudar cor de marca e precisa de decisão. `npx designmd lint DESIGN.md` lista todos.

## Colors

- **Um acento por vez.** Aqua (`accent`: `aqua-600` no claro, `aqua-400` no escuro) carrega toda
  ação primária, estado ativo e a primeira série de gráfico. O laranja cargo (`secondary`) aparece
  **só** em botão de conversão de marketing e como `chart-2`. Nunca duas superfícies aqua cheias
  na mesma tela.
- **Neutros esfriados para o teal**, nunca quentes e nunca cinza puro — de `ink-50` a `ink-950`.
- **Tema escuro é tema de primeira classe** (`[data-theme="dark"]`), não inversão: os quase-pretos
  são tingidos com a cor do mar. Nos tokens deste arquivo, o valor escuro de cada alias é o mesmo
  nome com sufixo `-dark`. A paleta base não muda entre temas.
- **Exatamente quatro níveis de superfície:** page → card → raised → inset, mais no máximo um
  painel invertido mar profundo por tela (`surface-invert`).
- **Mapa de status fixo:** aqua *em trânsito* · verde *entregue* · âmbar *aguardando* ·
  vermelho *retido* · neutro *rascunho*. Cor sólida para texto e ícone; o `-soft` para o fundo.
- **Gráficos:** `chart-1` … `chart-5` em ordem, com `chart-track` como trilho. Nunca invente cor
  de gráfico.
- **Gradiente é quase proibido.** O único uso aprovado são os dois brilhos radiais atrás do hero
  de marketing (aqua ≤ 26%, laranja ≤ 14%). Nada de botão, texto ou fundo em gradiente.
- **Cards tingidos remapeiam tokens.** Dentro de `card-accent` e `card-invert`, os tokens de texto,
  borda e superfície são redefinidos para que qualquer componente continue legível. Por isso, dentro
  desses cards, use sempre token semântico — cor fixa como `#fff` some num dos temas.

## Typography

- **Urbanist** para tudo que é visível; **JetBrains Mono** para tudo que uma pessoa copia
  (número de contêiner, NCM, BL, referências); **Material Symbols Rounded** como fonte de ícones.
  As três vêm do Google Fonts (`design-system/tokens/fonts.css`).
- **Quatro pesos em uso:** 400 / 500 / 600 / 700. Título é 600, nunca 700 — o 700 fica para a
  marca nominal e o texto do hero.
- **Escala:** micro 11 · caption 12 · sm 13 · body 15 · lg 17 · títulos 20/24/30 ·
  display 38/48/64 · hero 80. Corpo é 15px com entrelinha 1.45.
- **Tamanhos de display** são apertados (−0.015em a −0.03em) com entrelinha 1.05–1.2.
- **O tratamento de figura é a assinatura.** Prefixo de moeda e decimais em 52% do tamanho, na cor
  `text-muted`; a parte inteira mantém peso e contraste cheios. Todo número é `tabular-nums`.
  Nunca renderize um valor inteiro num peso só — use o componente `Stat`.
- O micro-rótulo (`label-micro`) é o único texto em caixa alta, com `letter-spacing: 0.12em`.

## Layout

- **Grade de 4px.** 16px é o espaço padrão entre elementos, 24px o padding de card, 64px o ritmo
  entre seções. Conteúdo vai até 1240px (`container-max`); cromado de marketing até 1440px.
- **Fixos só estes:** a TopBar de 64px do app e o cabeçalho de 72px do site (translúcidos e
  desfocados), e o card de estimativa da cotação (`position: sticky`). Nada mais fica fixo.
- **Painéis usam grades `auto-fit, minmax(260px, 1fr)`**: refluem em vez de quebrar.
- **Espaçamento sempre por token** (`--space-*`, `--pad-card`, `--gap-grid`…). Métricas de layout
  que não são espaçamento — largura mínima de trilho de grade, largura de coluna, altura de
  controle — ficam no CSS do componente ou padrão, comentadas como métrica.
- Ao portar uma tela com valor fora da escala, arredonde para o token mais próximo; empate vai
  para o menor.

## Elevation & Depth

- **Card = filete de 1px + sombra sussurrada.** Nem só borda, nem só sombra.
- **Sombras tingidas com a cor do mar**, nunca pretas, e nunca acima de 12% de opacidade
  (`--shadow-xs` filete · `sm` cards · `md` hover · `lg` modais). No tema escuro elas quase
  somem e a borda assume a separação.
- **Blur só em dois lugares:** as barras fixas (`--blur-bar` sobre `veil-light`) e os tooltips.
  Nada de card fosco nem glassmorphism.
- **Texto sobre imagem** usa `--scrim-bottom` (gradiente de proteção inferior), não cápsula
  semitransparente.

### Movimento

- Uma curva só: `cubic-bezier(.22,.61,.36,1)`. **Sem quique, sem overshoot, nunca.**
- 140ms para controles, 220ms para superfícies, 360ms para dados (barras, progresso, anéis),
  520ms para entrada de tela.
- **Hover** = superfície um nível acima, ou borda/texto para aqua. Nunca fade de opacidade em
  elemento interativo. Cards interativos sobem −2px.
- **Pressionar** = `scale(0.975)`. Não é flash de cor nem troca de sombra.
- **Foco** = anel aqua de 3px (`--focus-ring`), idêntico em todo controle.
- Todas as durações vão a 0 com `prefers-reduced-motion`.

## Shapes

- **Controles são pílulas inteiras** (`rounded.control`): botões, chips, badges, segmentado,
  itens de navegação, busca.
- **Cards têm 20px** (`rounded.card`). **Folhas e painéis de hero têm 28px** (`rounded.sheet`).
- **Campos são o único raio de 10px** (`rounded.field`) — a tensão proposital entre controle macio
  e campo nítido faz parte do visual.
- Círculos (avatar, ícone circular, pontos) usam `--radius-circle` (50%), que fica fora do front
  matter porque o formato DESIGN.md só aceita px, em e rem.
- Nunca borda esquerda colorida em card.

## Components

A biblioteca tem **29 componentes** em `design-system/components/`, em JavaScript com tipos JSDoc,
importados sempre de `design-system/components/index.js`:

- **core:** Icon · Button · IconButton · Card · Badge · Tag · Avatar · AvatarGroup · Stat · ProgressBar
- **forms:** Input · Select · Checkbox (também radio) · Switch · SegmentedControl
- **navigation:** TopBar · NavPills · SideNav · Tabs · Breadcrumbs
- **feedback:** Alert · Toast · Tooltip · EmptyState
- **data:** DataTable · Timeline · SparkBars · DonutMeter · Legend

Estados definidos no sistema: default, hover, active (pressionar), focus, disabled, erro (Input,
Select), vazio (EmptyState; DataTable sem linhas vira EmptyState) e selecionado (SegmentedControl,
NavPills, SideNav, Tabs, Checkbox, Switch). Não há estado de carregamento. Todos aparecem, nos
dois temas, no showcase `design-system/index.html`.

Regras que não cabem nos tokens:

- **Button:** exatamente um `primary` por tela; o resto é `outline` ou `ghost`. `secondary`
  (laranja) só em CTA de marketing.
- **Card:** `accent` para a única métrica de destaque de um painel — nunca dois lado a lado.
- **Badge vs. Tag:** Badge é status somente leitura; Tag é filtro editável e removível.
- **SegmentedControl** para 2–4 opções; cinco ou mais, use Tabs ou Select.
- **NavPills** troca de tela (máx. ~7 itens, depois SideNav); **Tabs** troca conteúdo dentro da tela.
- **Alert** fica na página (nunca mais de dois empilhados); **Toast** some sozinho (~5s,
  inferior esquerdo).
- **Tooltip:** texto curto, uma linha, sem ação dentro.
- **EmptyState:** sempre oferece a única ação que resolve o vazio.
- **DataTable:** cabeçalho em micro caixa alta, filete entre linhas, hover tingido. Nunca zebrada.
- **Timeline:** o rastreador de embarque; `done` aqua cheio, `current` contorno aqua, `todo` muted.
- **DonutMeter + Legend:** composição de custo com `conic-gradient` — sem biblioteca de gráfico.

### Iconografia

- **Material Symbols Rounded**, tamanho óptico 24, peso 300, FILL 0 — a substituição mais próxima
  da linha fina e arredondada da referência, já que a marca não trouxe ícones próprios. Se a
  Impoclick tiver um conjunto real, os binários vão em `design-system/assets/icons/` e
  `--font-icon` passa a apontar para eles.
- Só pelo componente `Icon`. **Nunca desenhe SVG de ícone à mão.**
- `filled` (FILL 1 / peso 400) marca **só** o estado ativo — o item selecionado da SideNav ou um
  glifo de status confirmado.
- Dentro de Button, IconButton, SideNav e Badge o ícone herda o tamanho; `size` só em glifo avulso.
- Vocabulário do domínio: `inventory_2` (contêiner/importação), `directions_boat` (marítimo),
  `flight` (aéreo), `local_shipping` (entrega), `warehouse`, `gavel` (desembaraço), `anchor`
  (atracação), `factory` (fornecedor), `receipt_long` (documentos), `payments` (custos),
  `request_quote` (cotação), `public` (trânsito internacional), `bolt` (plano), `radar` (rastreio).
- Caractere Unicode e emoji nunca são ícone. Símbolo de moeda (R$, US$) é tipografia.

## Do's and Don'ts

- Faça: componentes novos a partir da biblioteca em `design-system/components/index.js`.
- Não faça: cor, fonte, espaçamento ou raio fixo no código — use `var(--token)`. O lint recusa
  hex, px e `font-family` crus em JavaScript.
- Faça: mantenha este arquivo e `design-system/tokens/*.css` em sincronia; `npm run lint` confere.
- Faça: carregue `design-system/styles.css` **antes** do `style.css` do site. A ordem importa: o
  `style.css` abre com um bloco de ponte que redefine os nomes antigos em cima destes tokens.
- Não faça: reintroduzir `--secondary` como superfície no `style.css`. No site legado esse nome
  virou `--surface-2`, porque aqui `--secondary` é o laranja de conversão. Os outros cinco nomes
  que colidiam (`--success`, `--warning`, `--danger`, `--info`, `--text-muted`) têm o mesmo
  significado nos dois e hoje vêm só daqui.
- Faça: exatamente um botão `primary` e no máximo um card `accent` por tela.
- Não faça: gradiente fora do brilho do hero, blur fora de barra fixa e tooltip, sombra preta.
- Faça: todo número em `tabular-nums`, com unidade e decimais rebaixados pelo `Stat`.
- Não faça: emoji, ícone desenhado à mão ou ícone preenchido fora do estado ativo.
- Faça: contraste AA (4,5:1) em texto novo nos dois temas; teste o tema escuro sempre. A paleta
  exportada ainda tem 18 pares abaixo disso (item 6 das perguntas em aberto) — não os replique
  em combinações novas.
- Não faça: publicar as imagens de `design-system/reference/images/` — são de outro produto.
