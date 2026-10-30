// @ts-check
// Showcase do design system: tokens, os 29 componentes em todas as variantes e
// estados, padrões, templates, guidelines e páginas de referência — tudo nos
// temas claro e escuro ao mesmo tempo.
//
// Estados de interação (hover, active, focus) não aparecem parados numa página.
// Em vez de reescrever o CSS deles, installForcedStates() lê as regras reais da
// biblioteca e clona cada `:hover`/`:active`/`:focus*` para uma classe
// `.is-sc-*`. O estado exibido é, portanto, o CSS de produção.

import {
  Icon, Button, IconButton, Card, Badge, Tag, Avatar, AvatarGroup, Stat, ProgressBar,
  Input, Select, Checkbox, Switch, SegmentedControl,
  TopBar, NavPills, SideNav, Tabs, Breadcrumbs,
  Alert, Toast, Tooltip, EmptyState,
  DataTable, Timeline, SparkBars, DonutMeter, Legend,
  h,
} from '../components/index.js';

/** @import { Child } from '../components/dom.js' */

const LOGO = new URL('../assets/logo-impoclick.png', import.meta.url).href;

// ---------------------------------------------------------------------------
// Estados forçados
// ---------------------------------------------------------------------------

/** @typedef {'hover' | 'active' | 'focus'} ForcedState */

const PSEUDO_TO_CLASS = /** @type {const} */ ([
  [':focus-visible', '.is-sc-focus'],
  [':focus-within', '.is-sc-focus'],
  [':focus', '.is-sc-focus'],
  [':hover', '.is-sc-hover'],
  [':active', '.is-sc-active'],
]);

/**
 * Percorre todas as regras de estilo da página, descendo nas folhas importadas.
 *
 * Ler `cssRules` de uma folha de outra origem lança exceção — e o tokens/fonts.css
 * importa o Google Fonts. O try/catch precisa ficar em volta de CADA folha: em
 * volta da varredura inteira, a primeira importação externa abortava tudo e o
 * showcase ficava sem tokens e sem estados.
 * @param {(rule: CSSStyleRule) => void} visit
 */
function eachStyleRule(visit) {
  /** @param {CSSStyleSheet} sheet */
  const walk = (sheet) => {
    /** @type {CSSRuleList} */
    let rules;
    try { rules = sheet.cssRules; } catch { return; /* outra origem */ }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) walk(rule.styleSheet);
      } else if (rule instanceof CSSStyleRule) {
        visit(rule);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) walk(sheet);
}

/** @returns {number} quantas regras foram clonadas */
function installForcedStates() {
  const sheet = new CSSStyleSheet();
  let count = 0;
  eachStyleRule((rule) => {
    if (!/:(hover|active|focus)/.test(rule.selectorText)) return;
    let selector = rule.selectorText;
    for (const [pseudo, cls] of PSEUDO_TO_CLASS) selector = selector.split(pseudo).join(cls);
    try {
      sheet.insertRule(`${selector}{${rule.style.cssText}}`, sheet.cssRules.length);
      count++;
    } catch { /* seletor que não sobrevive à troca: ignora */ }
  });
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  return count;
}

/**
 * Marca um elemento (ou um descendente) com o estado forçado.
 * @template {Element} E
 * @param {E} el
 * @param {ForcedState} state
 * @param {string} [selector] descendente que recebe a classe
 * @returns {E}
 */
function force(el, state, selector) {
  const target = selector ? el.querySelector(selector) : el;
  if (target) target.classList.add('is-sc-' + state);
  return el;
}

/**
 * @param {string} label
 * @param {Child} content
 * @returns {HTMLDivElement}
 */
function scCase(label, content) {
  return h('div', { className: 'sc-case' }, h('span', { className: 'sc-case__label' }, label), content);
}

// ---------------------------------------------------------------------------
// Estrutura: cada bloco é desenhado duas vezes, claro e escuro
// ---------------------------------------------------------------------------

let demoCount = 0;

/**
 * @param {{ title: string, code?: string, desc?: string, render: (pane: 'light' | 'dark') => Child }} block
 * @returns {HTMLElement}
 */
function block({ title, code, desc, render }) {
  demoCount++;
  const pane = (/** @type {'light' | 'dark'} */ theme) => h('div', {
    className: 'sc-pane sc-pane--' + theme,
    attrs: theme === 'dark' ? { 'data-theme': 'dark' } : {},
  }, h('span', { className: 'sc-pane__label' }, theme === 'dark' ? 'Tema escuro' : 'Tema claro'), render(theme));
  return h('section', { className: 'sc-block' },
    h('div', { className: 'sc-block__head' }, h('h3', {}, title), code && h('code', {}, code)),
    desc && h('p', { className: 'sc-block__desc' }, desc),
    h('div', { className: 'sc-panes' }, pane('light'), pane('dark')));
}

/**
 * @param {string} id
 * @param {string} title
 * @param {string} intro
 * @param {Child} children
 */
function part(id, title, intro, children) {
  return h('section', { className: 'sc-part', attrs: { id } }, h('h2', {}, title), h('p', {}, intro), children);
}

// ---------------------------------------------------------------------------
// Tokens — lidos do próprio CSS, não de uma lista mantida à mão
// ---------------------------------------------------------------------------

/** @returns {string[]} */
function tokenNames() {
  /** @type {Set<string>} */
  const names = new Set();
  eachStyleRule((rule) => {
    if (rule.selectorText !== ':root' && rule.selectorText !== '[data-theme="dark"]') return;
    for (const prop of Array.from(rule.style)) if (prop.startsWith('--')) names.add(prop);
  });
  return Array.from(names);
}

/** @param {string} name */
const isColorToken = (name) => /^--(aqua|sea|orange|ink|green|amber|red|surface|text-(title|body|muted|invert|on-accent)$|border|accent|secondary|success|warning|danger|info|chart|veil)/.test(name);

function tokensPart() {
  const names = tokenNames();
  const colors = names.filter(isColorToken);
  const textSizes = names.filter((n) => /^--text-(micro|caption|sm|body-size|lg|title-|display-|hero)/.test(n));
  const spaces = names.filter((n) => /^--space-\d+$/.test(n));
  const radii = names.filter((n) => n.startsWith('--radius-'));
  const shadows = names.filter((n) => n.startsWith('--shadow-'));
  const motion = names.filter((n) => /^--(dur|ease)-/.test(n));

  return part('tokens', 'Tokens', `Lidos em tempo de execução das folhas tokens/*.css (${names.length} tokens). Os valores de referência estão no DESIGN.md da raiz.`, [
    block({
      title: 'Cores', code: `${colors.length} tokens`,
      desc: 'Paleta base e aliases semânticos. O painel escuro aplica [data-theme="dark"]: os aliases semânticos mudam, a paleta base não.',
      render: () => h('div', { className: 'sc-swatches' }, colors.map((n) => h('div', { className: 'sc-swatch' },
        h('div', { className: 'sc-swatch__chip', style: { background: `var(${n})` } }),
        h('span', { className: 'sc-swatch__name' }, n)))),
    }),
    block({
      title: 'Tipografia', code: 'Urbanist · JetBrains Mono · Material Symbols Rounded',
      render: () => h('div', {},
        textSizes.map((n) => h('div', { className: 'sc-typeline' }, h('code', {}, n),
          h('span', { style: { fontSize: `var(${n})`, fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-tight)' } }, 'Importar sem atrito'))),
        h('div', { className: 'sc-typeline' }, h('code', {}, '--font-mono'), h('span', { className: 'ic-mono' }, 'MSKU 472 118-3 · NCM 8471.30.12')),
        h('div', { className: 'sc-typeline' }, h('code', {}, 'Stat (figura)'), Stat({ prefix: 'US$', value: '1.284.600', fraction: ',00', size: 'sm' }))),
    }),
    block({
      title: 'Espaçamento', code: 'grade de 4 em 4 (--space-*)',
      render: () => h('div', {}, spaces.map((n) => h('div', { className: 'sc-typeline' }, h('code', {}, n),
        h('div', { className: 'sc-spacebar', style: { width: `var(${n})` } })))),
    }),
    block({
      title: 'Raios', code: `${radii.length} tokens`,
      render: () => h('div', { className: 'sc-row sc-row--top' }, radii.map((n) => scCase(n,
        h('div', { className: 'sc-radiusbox', style: { borderRadius: `var(${n})` } })))),
    }),
    block({
      title: 'Elevação', code: `${shadows.length} sombras`,
      render: () => h('div', { className: 'sc-grid' }, shadows.map((n) => scCase(n,
        h('div', { className: 'sc-shadowbox', style: { boxShadow: `var(${n})` } })))),
    }),
    block({
      title: 'Movimento', code: 'uma curva, sem quique',
      render: () => h('div', {}, motion.map((n) => h('div', { className: 'sc-typeline' }, h('code', {}, n),
        h('span', { className: 'ic-mono' }, getComputedStyle(document.documentElement).getPropertyValue(n).trim())))),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

const STATES = /** @type {const} */ (['default', 'hover', 'active', 'focus', 'disabled']);

const donutSegments = [
  { value: 46, color: 'var(--chart-1)', label: 'Frete' },
  { value: 31, color: 'var(--chart-2)', label: 'Impostos' },
  { value: 23, color: 'var(--chart-5)', label: 'Outros' },
];

/** @param {'light' | 'dark'} pane @param {string} name */
const uid = (pane, name) => `sc-${pane}-${name}`;

function componentsPart() {
  return part('componentes', 'Componentes', '29 componentes em 5 grupos. Cada caso mostra uma variante ou estado; hover, active e focus são as regras reais do CSS aplicadas por classe.', [
    h('p', { className: 'sc-note' }, 'Estado "loading": o design system exportado não define estado de carregamento em nenhum componente, então não há o que mostrar aqui. Ver "Perguntas em aberto" no DESIGN.md.'),

    // ----- core -----
    block({
      title: 'Button', code: 'core/Button.js',
      desc: '5 variantes × estados; 3 tamanhos; ícones; block; como link.',
      render: () => h('div', { className: 'sc-row sc-row--top' },
        h('div', { className: 'sc-grid' }, (/** @type {const} */ (['primary', 'secondary', 'outline', 'ghost', 'danger'])).map((variant) => scCase(variant,
          h('div', { className: 'sc-row' }, STATES.map((state) => {
            const label = state === 'default' ? 'Salvar' : state;
            if (state === 'disabled') return Button({ variant, size: 'sm', disabled: true, children: label });
            const b = Button({ variant, size: 'sm', children: label });
            return state === 'default' ? b : force(b, state);
          }))))),
        scCase('tamanhos', h('div', { className: 'sc-row' },
          Button({ size: 'lg', children: 'Large 52' }), Button({ size: 'md', variant: 'outline', children: 'Medium 42' }), Button({ size: 'sm', variant: 'outline', children: 'Small 34' }))),
        scCase('ícones', h('div', { className: 'sc-row' },
          Button({ iconRight: 'arrow_outward', children: 'Nova importação' }), Button({ variant: 'outline', iconLeft: 'download', children: 'Exportar' }))),
        scCase('block · as link', h('div', { className: 'sc-row', style: { width: '100%' } },
          Button({ block: true, variant: 'outline', children: 'Largura total' }),
          Button({ as: 'a', href: '#componentes', variant: 'ghost', iconRight: 'arrow_outward', children: 'Link' })))),
    }),
    block({
      title: 'IconButton', code: 'core/IconButton.js',
      render: () => h('div', { className: 'sc-grid' },
        (/** @type {const} */ (['default', 'accent', 'bare'])).map((variant) => scCase(variant,
          h('div', { className: 'sc-row' }, STATES.map((state) => {
            if (state === 'disabled') return IconButton({ icon: 'tune', label: 'Filtros', variant, disabled: true });
            const b = IconButton({ icon: 'tune', label: 'Filtros', variant });
            return state === 'default' ? b : force(b, state);
          })))),
        scCase('tamanhos sm · md · lg', h('div', { className: 'sc-row' },
          IconButton({ icon: 'search', label: 'Buscar', size: 'sm' }), IconButton({ icon: 'search', label: 'Buscar' }), IconButton({ icon: 'search', label: 'Buscar', size: 'lg' })))),
    }),
    block({
      title: 'Icon', code: 'core/Icon.js',
      render: () => h('div', { className: 'sc-row' },
        ['inventory_2', 'directions_boat', 'flight', 'local_shipping', 'warehouse', 'gavel', 'payments', 'bolt'].map((name) => Icon({ name, size: 24 })),
        scCase('filled (só estado ativo)', h('div', { className: 'sc-row' }, Icon({ name: 'check_circle', size: 24, filled: true }), Icon({ name: 'bolt', size: 24, filled: true })))),
    }),
    block({
      title: 'Card', code: 'core/Card.js',
      render: () => h('div', { className: 'sc-grid' },
        (/** @type {const} */ (['default', 'flat', 'accent', 'invert'])).map((variant) => scCase(variant, Card({
          variant, eyebrow: 'Em trânsito', title: 'MSKU 472 118-3',
          action: IconButton({ icon: 'arrow_outward', label: 'Abrir', variant: 'bare', size: 'sm' }),
          children: [Stat({ value: '14', suffix: 'dias', size: 'sm' }), h('div', { className: 'sc-row' }, Badge({ tone: 'accent', dot: true, children: 'Em trânsito' }), Button({ size: 'sm', children: 'Abrir' }))],
        }))),
        scCase('compact', Card({ compact: true, title: 'Compacto', children: 'Padding --pad-card-compact.' })),
        scCase('interactive', Card({ interactive: true, title: 'Interativo', children: 'Eleva no hover.' })),
        scCase('interactive · hover', force(Card({ interactive: true, title: 'Interativo', children: 'Estado hover.' }), 'hover'))),
    }),
    block({
      title: 'Badge', code: 'core/Badge.js',
      render: () => h('div', { className: 'sc-grid' },
        scCase('tons', h('div', { className: 'sc-row' }, (/** @type {const} */ (['neutral', 'accent', 'success', 'warning', 'danger', 'secondary'])).map((tone) => Badge({ tone, children: tone })))),
        scCase('dot', h('div', { className: 'sc-row' }, Badge({ tone: 'accent', dot: true, children: 'Em trânsito' }), Badge({ tone: 'success', dot: true, children: 'Entregue' }), Badge({ tone: 'danger', dot: true, children: 'Retido' }))),
        scCase('ícone', h('div', { className: 'sc-row' }, Badge({ tone: 'warning', icon: 'schedule', children: 'Aguardando DI' }), Badge({ tone: 'success', icon: 'check_circle', children: 'Liberado' }))),
        scCase('solid', Badge({ solid: true, children: 'Novo' }))),
    }),
    block({
      title: 'Tag', code: 'core/Tag.js',
      render: () => h('div', { className: 'sc-row' },
        scCase('estática', Tag({ children: 'Marítimo' })),
        scCase('removível', Tag({ children: 'Origem: China', onRemove: () => {} })),
        scCase('removível · hover no x', force(Tag({ children: 'Origem: China', onRemove: () => {} }), 'hover', '.ic-tag__x')),
        scCase('foco no x', force(Tag({ children: 'NCM 8518', onRemove: () => {} }), 'focus', '.ic-tag__x'))),
    }),
    block({
      title: 'Avatar · AvatarGroup', code: 'core/Avatar.js',
      render: () => h('div', { className: 'sc-row' },
        (/** @type {const} */ (['xs', 'sm', 'md', 'lg'])).map((size) => scCase(size, Avatar({ name: 'Ana Sousa', size }))),
        scCase('accent', Avatar({ name: 'Camila Prado', accent: true })),
        scCase('imagem', Avatar({ name: 'Impoclick', src: LOGO })),
        scCase('grupo', AvatarGroup({ children: [Avatar({ name: 'Rafael Lima', size: 'sm' }), Avatar({ name: 'Ana Sousa', size: 'sm' }), Avatar({ name: '+4', size: 'sm', accent: true })] }))),
    }),
    block({
      title: 'Stat', code: 'core/Stat.js',
      render: () => h('div', { className: 'sc-row sc-row--top' },
        scCase('lg · delta up', Stat({ label: 'Valor em trânsito', prefix: 'US$', value: '1.284.600', fraction: ',00', delta: '+12,4%', deltaNote: 'vs. mês anterior', size: 'lg' })),
        scCase('md · delta down', Stat({ label: 'Custo médio', prefix: 'R$', value: '31.280', delta: '-3,1%', deltaDirection: 'down', size: 'md' })),
        scCase('sm · flat · fração', Stat({ label: 'Contêineres', value: '18', fraction: '/ 40', delta: '14 dias', deltaDirection: 'flat', size: 'sm' })),
        scCase('sufixo', Stat({ label: 'Peso bruto', value: '18.420', suffix: 'kg', size: 'sm' }))),
    }),
    block({
      title: 'ProgressBar', code: 'core/ProgressBar.js',
      render: () => h('div', { className: 'sc-grid' },
        (/** @type {const} */ (['accent', 'secondary', 'success', 'danger'])).map((tone) => scCase(tone, ProgressBar({ tone, value: 62, label: 'Uso mensal', valueText: '62%' }))),
        scCase('thick', ProgressBar({ thick: true, value: 18, max: 32, label: 'Shenzhen → Santos', valueText: '18 / 32 dias' })),
        scCase('vazio · 0%', ProgressBar({ value: 0 })),
        scCase('completo · 100%', ProgressBar({ value: 100, tone: 'success' }))),
    }),

    // ----- forms -----
    block({
      title: 'Input', code: 'forms/Input.js',
      desc: 'Estados: default, hover, focus, preenchido, erro, disabled; variações com ícone, pill, obrigatório, hint e multiline.',
      render: (pane) => h('div', { className: 'sc-grid' },
        scCase('default', Input({ id: uid(pane, 'in1'), label: 'Número do contêiner', placeholder: 'MSKU 000 000-0' })),
        scCase('hover', force(Input({ id: uid(pane, 'in2'), label: 'Hover', placeholder: 'MSKU 000 000-0' }), 'hover', 'input')),
        scCase('focus', force(Input({ id: uid(pane, 'in3'), label: 'Focus', placeholder: 'MSKU 000 000-0' }), 'focus', 'input')),
        scCase('preenchido · ícone · obrigatório', Input({ id: uid(pane, 'in4'), label: 'Valor FOB', icon: 'payments', required: true, value: '84.200,00' })),
        scCase('erro', Input({ id: uid(pane, 'in5'), label: 'Valor FOB', icon: 'payments', placeholder: '0,00', error: 'Informe o valor da fatura' })),
        scCase('hint', Input({ id: uid(pane, 'in6'), label: 'NCM principal', placeholder: '8518.30.00', hint: 'Usada para estimar II e IPI' })),
        scCase('disabled', Input({ id: uid(pane, 'in7'), label: 'Desativado', value: 'Somente leitura', disabled: true })),
        scCase('pill (busca)', Input({ id: uid(pane, 'in8'), pill: true, icon: 'search', placeholder: 'Buscar importações, NCM, fornecedor' })),
        scCase('multiline', Input({ id: uid(pane, 'in9'), label: 'Observações', multiline: true, hint: 'Visível apenas para a sua equipe' }))),
    }),
    block({
      title: 'Select', code: 'forms/Select.js',
      render: (pane) => h('div', { className: 'sc-grid' },
        scCase('default', Select({ id: uid(pane, 's1'), label: 'Modal de transporte', options: ['Marítimo', 'Aéreo', 'Rodoviário'] })),
        scCase('hover', force(Select({ id: uid(pane, 's2'), label: 'Hover', options: ['Marítimo'] }), 'hover', 'select')),
        scCase('focus', force(Select({ id: uid(pane, 's3'), label: 'Focus', options: ['Marítimo'] }), 'focus', 'select')),
        scCase('erro · obrigatório', Select({ id: uid(pane, 's4'), label: 'Incoterm', required: true, options: [{ value: '', label: 'Selecione' }], error: 'Escolha um incoterm' })),
        scCase('disabled', Select({ id: uid(pane, 's5'), label: 'Desativado', options: ['FOB'], disabled: true }))),
    }),
    block({
      title: 'Checkbox · radio', code: 'forms/Checkbox.js',
      render: (pane) => h('div', { className: 'sc-row' },
        scCase('desmarcado', Checkbox({ label: 'Carga perigosa' })),
        scCase('marcado', Checkbox({ label: 'Incluir seguro', checked: true })),
        scCase('hover', force(Checkbox({ label: 'Hover' }), 'hover')),
        scCase('focus', force(Checkbox({ label: 'Focus', checked: true }), 'focus', 'input')),
        scCase('disabled', Checkbox({ label: 'Desativado', disabled: true, checked: true })),
        scCase('radio', h('div', { className: 'sc-row' },
          Checkbox({ radio: true, name: uid(pane, 'r'), label: 'Porta a porta', checked: true }),
          Checkbox({ radio: true, name: uid(pane, 'r'), label: 'Porto a porto' })))),
    }),
    block({
      title: 'Switch', code: 'forms/Switch.js',
      render: () => h('div', { className: 'sc-row' },
        scCase('desligado', Switch({ label: 'Relatório semanal' })),
        scCase('ligado', Switch({ label: 'Avisar na atracação', checked: true })),
        scCase('focus', force(Switch({ label: 'Focus', checked: true }), 'focus', 'input')),
        scCase('disabled', Switch({ label: 'Desativado', disabled: true })),
        scCase('disabled · ligado', Switch({ label: 'Desativado', disabled: true, checked: true }))),
    }),
    block({
      title: 'SegmentedControl', code: 'forms/SegmentedControl.js',
      desc: 'Clique para trocar a opção selecionada.',
      render: () => h('div', { className: 'sc-row sc-row--top' },
        scCase('default · selecionado', SegmentedControl({ options: ['USD', 'BRL', 'CNY'], value: 'USD' })),
        scCase('accent · ícones', SegmentedControl({ accent: true, value: 'sea', options: [{ value: 'sea', label: 'Marítimo', icon: 'directions_boat' }, { value: 'air', label: 'Aéreo', icon: 'flight' }] })),
        scCase('hover numa opção', force(SegmentedControl({ options: ['7 dias', '30 dias'], value: '7 dias' }), 'hover', '.ic-seg__opt:not(.is-active)')),
        scCase('focus', force(SegmentedControl({ options: ['7 dias', '30 dias'], value: '7 dias' }), 'focus', '.ic-seg__opt'))),
    }),

    // ----- navigation -----
    block({
      title: 'TopBar · NavPills', code: 'navigation/TopBar.js · NavPills.js',
      render: () => h('div', { className: 'sc-wide' },
        TopBar({
          style: { position: 'static' },
          brand: [h('img', { attrs: { src: LOGO, alt: '' } }), 'Impoclick'],
          center: NavPills({ items: ['Painel', 'Importações', 'Fornecedores', 'Custos'], value: 'Importações' }),
          actions: [IconButton({ icon: 'search', label: 'Buscar', size: 'sm' }), IconButton({ icon: 'notifications', label: 'Avisos', size: 'sm' }), Avatar({ name: 'Rafael Lima', size: 'sm' })],
        }),
        h('div', { className: 'sc-row', style: { marginTop: 'var(--space-4)' } },
          scCase('NavPills accent', NavPills({ accent: true, items: ['Painel', 'Custos'], value: 'Painel' })),
          scCase('hover num item', force(NavPills({ items: ['Painel', 'Custos'], value: 'Painel' }), 'hover', '.ic-navpill__item:not(.is-active)')))),
    }),
    block({
      title: 'SideNav', code: 'navigation/SideNav.js',
      render: () => h('div', { className: 'sc-row sc-row--top' },
        scCase('expandido · ativo · hover', force(SideNav({
          value: 'imports',
          items: [{ group: 'Operação' }, { value: 'imports', icon: 'inventory_2', label: 'Importações', count: 12 }, { value: 'tracking', icon: 'directions_boat', label: 'Rastreio' }, { value: 'docs', icon: 'receipt_long', label: 'Documentos', count: 3 }],
        }), 'hover', '[data-value="tracking"]')),
        scCase('recolhido', SideNav({
          collapsed: true, value: 'imports',
          items: [{ value: 'imports', icon: 'inventory_2', label: 'Importações' }, { value: 'tracking', icon: 'directions_boat', label: 'Rastreio' }, { value: 'costs', icon: 'payments', label: 'Custos' }],
        }))),
    }),
    block({
      title: 'Tabs · Breadcrumbs', code: 'navigation/Tabs.js · Breadcrumbs.js',
      render: () => h('div', { className: 'sc-block' },
        Breadcrumbs({ items: [{ label: 'Importações', href: '#' }, { label: 'IMP-2481' }] }),
        scCase('Breadcrumbs · hover no link', force(Breadcrumbs({ items: [{ label: 'Operação', href: '#' }, { label: 'Importações', href: '#' }, { label: 'IMP-2481' }] }), 'hover', 'a')),
        scCase('Tabs · badge · selecionado', Tabs({ value: 'transit', items: [{ value: 'all', label: 'Todas', badge: 34 }, { value: 'transit', label: 'Em trânsito', badge: 12 }, { value: 'done', label: 'Concluídas' }] })),
        scCase('Tabs · ícone · hover', force(Tabs({ value: 'a', items: [{ value: 'a', label: 'Itens', icon: 'inventory_2' }, { value: 'b', label: 'Documentos', icon: 'receipt_long' }] }), 'hover', '[data-value="b"]'))),
    }),

    // ----- feedback -----
    block({
      title: 'Alert', code: 'feedback/Alert.js',
      render: () => h('div', { className: 'sc-block' },
        (/** @type {const} */ (['info', 'success', 'warning', 'danger'])).map((tone) => Alert({ tone, title: 'Tom ' + tone, children: 'Envie a fatura comercial até 22/04 para evitar armazenagem.' })),
        scCase('dispensável · só corpo · ícone próprio', Alert({ tone: 'warning', icon: 'schedule', onDismiss: () => {}, children: 'A DI do IMP-2479 vence em 3 dias.' }))),
    }),
    block({
      title: 'Toast', code: 'feedback/Toast.js',
      render: () => h('div', { className: 'sc-block' },
        Toast({ tone: 'success', actionLabel: 'Desfazer', children: 'Importação IMP-2481 arquivada.' }),
        Toast({ tone: 'info', children: 'Rastreio atualizado há 22 minutos.' }),
        Toast({ tone: 'danger', actionLabel: 'Tentar de novo', children: 'Não foi possível enviar a cotação.' })),
    }),
    block({
      title: 'Tooltip', code: 'feedback/Tooltip.js',
      desc: 'Visível no hover e no foco; aqui forçado.',
      render: () => h('div', { className: 'sc-row', style: { paddingTop: 'var(--space-10)' } },
        force(Tooltip({ label: 'Exportar planilha', children: IconButton({ icon: 'download', label: 'Exportar' }) }), 'hover'),
        force(Tooltip({ label: 'Em trânsito desde 07 abr', children: Badge({ tone: 'accent', dot: true, children: 'Tooltip' }) }), 'focus')),
    }),
    block({
      title: 'EmptyState', code: 'feedback/EmptyState.js',
      render: () => Card({ children: EmptyState({ icon: 'search_off', title: 'Nenhuma importação encontrada', action: Button({ variant: 'outline', size: 'sm', children: 'Limpar filtros' }), children: 'Ajuste o período ou o status para ver mais resultados.' }) }),
    }),

    // ----- data -----
    block({
      title: 'DataTable', code: 'data/DataTable.js',
      desc: 'Linha com hover forçado; a tabela vazia é substituída por EmptyState.',
      render: () => h('div', { className: 'sc-block' },
        force(DataTable({
          columns: [
            { key: 'ref', label: 'Referência', primary: true },
            { key: 'code', label: 'Contêiner', render: (r) => h('span', { className: 'ic-mono' }, r.code) },
            { key: 'status', label: 'Status', render: (r) => Badge({ tone: r.tone, dot: true, children: r.status }) },
            { key: 'value', label: 'Valor FOB', align: 'right' },
          ],
          rows: /** @type {Array<{ ref: string, code: string, status: string, tone: 'accent' | 'warning' | 'success', value: string }>} */ ([
            { ref: 'IMP-2481', code: 'MSKU 472 118-3', status: 'Em trânsito', tone: 'accent', value: 'US$ 84.200' },
            { ref: 'IMP-2479', code: 'TCLU 883 401-9', status: 'Aguardando DI', tone: 'warning', value: 'US$ 31.980' },
            { ref: 'IMP-2470', code: 'HLXU 210 774-2', status: 'Entregue', tone: 'success', value: 'US$ 112.430' },
          ]),
        }), 'hover', 'tbody tr:nth-child(2)'),
        scCase('vazio', EmptyState({ icon: 'search_off', title: 'Nenhuma importação encontrada', children: 'Ajuste o período, o status ou o termo buscado.' }))),
    }),
    block({
      title: 'Timeline', code: 'data/Timeline.js',
      render: () => Timeline({ steps: [
        { title: 'Coleta no fornecedor', date: '02 abr', state: 'done', icon: 'factory' },
        { title: 'Embarque · Shenzhen', date: '07 abr', meta: 'MSC Bianca', state: 'done', icon: 'directions_boat' },
        { title: 'Em trânsito marítimo', date: 'previsto 29 abr', state: 'current', icon: 'public' },
        { title: 'Desembaraço · Santos', state: 'todo', icon: 'gavel' },
        { title: 'Sem ícone', state: 'todo' },
      ] }),
    }),
    block({
      title: 'SparkBars · DonutMeter · Legend', code: 'data/SparkBars.js · DonutMeter.js',
      render: () => h('div', { className: 'sc-row sc-row--top' },
        scCase('SparkBars · pico automático', h('div', { className: 'sc-w-spark' }, SparkBars({ data: [12, 18, 9, 24, 31, 15, 21], labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] }))),
        scCase('SparkBars · pico escolhido', h('div', { className: 'sc-w-spark' }, SparkBars({ data: [12, 18, 9, 24, 31, 15, 21], peakIndex: 1, height: 64 }))),
        scCase('DonutMeter · Legend', h('div', { className: 'sc-row' }, DonutMeter({ segments: donutSegments, size: 150, thickness: 24, value: 'US$ 84,2k', label: 'Custo total' }), Legend({ items: donutSegments }))),
        scCase('DonutMeter · sem segmentos', DonutMeter({ segments: [], size: 110, thickness: 18, value: '—', label: 'Sem dados' }))),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Padrões, templates, guidelines e referência (em iframe: documentos isolados)
// ---------------------------------------------------------------------------

/**
 * @param {string} src
 * @param {string} title
 * @param {string} className
 */
const frame = (src, title, className) => h('iframe', { className: 'sc-frame ' + className, attrs: { src, title, loading: 'lazy' } });

function patternsPart() {
  const screens = /** @type {const} */ ([
    ['painel', 'DashboardScreen'], ['importacoes', 'ImportsScreen'], ['embarque', 'ShipmentScreen'], ['cotacao', 'QuoteScreen'], ['custos', 'CostsScreen'],
  ]);
  return part('padroes', 'Padrões e templates', 'Telas e seções compostas só com a biblioteca (patterns/), montadas nos templates templates/painel.html e templates/site.html. Cada tela abre em documento próprio, nos dois temas.', [
    ...screens.map(([rota, name]) => h('section', { className: 'sc-block' },
      h('div', { className: 'sc-block__head' }, h('h3', {}, name), h('code', {}, `templates/painel.html?rota=${rota}`)),
      h('div', { className: 'sc-panes' },
        frame(`../templates/painel.html?rota=${rota}`, name + ' claro', 'sc-frame--screen sc-pane--light'),
        frame(`../templates/painel.html?rota=${rota}&tema=dark`, name + ' escuro', 'sc-frame--screen sc-pane--dark')))),
    h('section', { className: 'sc-block' },
      h('div', { className: 'sc-block__head' }, h('h3', {}, 'Site institucional'), h('code', {}, 'templates/site.html')),
      h('div', { className: 'sc-panes' },
        frame('../templates/site.html', 'Site claro', 'sc-frame--site sc-pane--light'),
        frame('../templates/site.html?tema=dark', 'Site escuro', 'sc-frame--site sc-pane--dark'))),
  ]);
}

const GUIDELINES = /** @type {const} */ ([
  ['colors-aqua', 120], ['colors-brand-secondary', 120], ['colors-neutrals', 120], ['colors-status', 140],
  ['colors-surfaces-light', 150], ['colors-surfaces-dark', 150], ['colors-charts', 120],
  ['type-display', 250], ['type-titles', 190], ['type-body', 200], ['type-numerals', 180], ['type-mono', 150], ['type-weights', 140],
  ['spacing-scale', 160], ['spacing-radius', 170], ['spacing-anatomy', 230],
  ['brand-logo', 200], ['brand-elevation', 170], ['brand-icons', 180], ['brand-motion', 150],
]);

function guidelinesPart() {
  return part('guidelines', 'Guidelines', 'Os 20 cartões de especificação do export, em guidelines/. São HTML estático: abrem também direto do disco.', [
    h('div', { className: 'sc-gallery' }, GUIDELINES.map(([name, height]) => scCase(name,
      h('iframe', { className: 'sc-frame', style: { height: height + 'px' }, attrs: { src: `../guidelines/${name}.card.html`, title: name, loading: 'lazy' } })))),
  ]);
}

function referencePart() {
  const link = (/** @type {string} */ href, /** @type {string} */ text) => h('a', { attrs: { href } }, text);
  return part('referencia', 'Referência visual', 'Páginas originais do Claude Design, em React, preservadas para comparação. Não são componentes: ver reference/ no README do design system.', [
    h('div', { className: 'sc-links' },
      link('../reference/ui-kits/app/index.html', 'UI kit — Painel do importador (original React)'),
      link('../reference/ui-kits/site/index.html', 'UI kit — Site institucional (original React)'),
      link('../reference/component-cards/core.card.html', 'Cartão de componentes — Core'),
      link('../reference/component-cards/forms.card.html', 'Cartão de componentes — Forms'),
      link('../reference/component-cards/navigation.card.html', 'Cartão de componentes — Navigation'),
      link('../reference/component-cards/feedback.card.html', 'Cartão de componentes — Feedback'),
      link('../reference/component-cards/data.card.html', 'Cartão de componentes — Data'),
      link('../reference/templates/Painel.dc.html', 'Template .dc — Painel (versão reduzida)'),
      link('../reference/templates/Site.dc.html', 'Template .dc — Site (versão reduzida)')),
  ]);
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

function header() {
  const modes = SegmentedControl({
    options: [{ value: 'both', label: 'Lado a lado' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }],
    value: 'both',
    onChange: (v) => {
      document.body.classList.toggle('sc-only-light', v === 'light');
      document.body.classList.toggle('sc-only-dark', v === 'dark');
    },
  });
  const nav = h('nav', { className: 'sc-nav' },
    [['tokens', 'Tokens'], ['componentes', 'Componentes'], ['padroes', 'Padrões'], ['guidelines', 'Guidelines'], ['referencia', 'Referência']]
      .map(([id, text]) => h('a', { attrs: { href: '#' + id } }, text)));
  return h('header', { className: 'sc-header' }, h('div', { className: 'sc-header__inner' },
    h('div', { className: 'sc-brand' }, h('img', { attrs: { src: LOGO, alt: '' } }), 'Impoclick', h('small', {}, 'Design System')),
    nav, modes));
}

function mount() {
  const status = h('p', { className: 'sc-status', attrs: { id: 'sc-status' } }, 'Montando…');
  const main = h('main', { className: 'sc-main' },
    h('div', { className: 'sc-intro' },
      h('h1', {}, 'Design System'),
      h('p', {}, 'Biblioteca de componentes da Impoclick. Contrato visual e fonte da verdade dos tokens: DESIGN.md na raiz do repositório.'),
      status));
  document.body.replaceChildren(header(), main);
  try {
    const forced = installForcedStates();
    main.append(tokensPart(), componentsPart(), patternsPart(), guidelinesPart(), referencePart());
    status.textContent = `${demoCount} blocos · 29 componentes · ${forced} regras de estado clonadas do CSS`;
    document.body.dataset.showcase = 'ok';
    document.body.dataset.blocks = String(demoCount);
    document.body.dataset.forcedRules = String(forced);
  } catch (err) {
    status.textContent = 'Erro ao montar o showcase: ' + (err instanceof Error ? err.stack || err.message : String(err));
    document.body.dataset.showcase = 'erro';
    throw err;
  }
}

mount();
