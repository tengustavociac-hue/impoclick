// @ts-check
/**
 * ImportsScreen — tela "Importações": barra de filtros (busca em pílula,
 * selects, Tags removíveis), Tabs por etapa, DataTable e EmptyState quando a
 * busca não acha nada. É o exemplo canônico de estado vazio numa tabela.
 *
 * Porte de `ui_kits/app/ImportsScreen.jsx`. Busca e abas redesenham só a área da
 * tabela, então o campo de busca não perde o foco enquanto se digita.
 */
import {
  Card, Tabs, DataTable, Badge, Button, IconButton, Input, Select, Tag, EmptyState,
  Avatar, Breadcrumbs, h,
} from '../../components/index.js';

/**
 * @typedef {Object} ImportRow
 * @property {string} id
 * @property {string} code
 * @property {string} supplier
 * @property {string} origin
 * @property {string} status
 * @property {'accent' | 'warning' | 'danger' | 'success'} tone
 * @property {string} eta
 * @property {string} value
 * @property {'transit' | 'customs' | 'done'} bucket
 */

/** @type {ReadonlyArray<ImportRow>} */
const ALL_ROWS = [
  { id: 'IMP-2481', code: 'MSKU 472 118-3', supplier: 'Shenzhen Vitec', origin: 'Shenzhen', status: 'Em trânsito', tone: 'accent', eta: '29 abr', value: 'US$ 84.200', bucket: 'transit' },
  { id: 'IMP-2483', code: 'TGHU 662 045-1', supplier: 'Ningbo Tools Co.', origin: 'Ningbo', status: 'Em trânsito', tone: 'accent', eta: '06 mai', value: 'US$ 42.710', bucket: 'transit' },
  { id: 'IMP-2479', code: 'TCLU 883 401-9', supplier: 'Foshan Home', origin: 'Foshan', status: 'Aguardando DI', tone: 'warning', eta: '18 abr', value: 'US$ 31.980', bucket: 'customs' },
  { id: 'IMP-2477', code: 'CAIU 190 338-7', supplier: 'Yiwu Trading', origin: 'Yiwu', status: 'Retido', tone: 'danger', eta: '—', value: 'US$ 18.400', bucket: 'customs' },
  { id: 'IMP-2470', code: 'HLXU 210 774-2', supplier: 'Dongguan Plast', origin: 'Dongguan', status: 'Entregue', tone: 'success', eta: '04 abr', value: 'US$ 112.430', bucket: 'done' },
  { id: 'IMP-2468', code: 'MSDU 774 902-5', supplier: 'Shenzhen Vitec', origin: 'Shenzhen', status: 'Entregue', tone: 'success', eta: '28 mar', value: 'US$ 66.150', bucket: 'done' },
];

/**
 * @param {{ setRoute: (route: 'embarque') => void }} props
 * @returns {HTMLDivElement}
 */
export function ImportsScreen({ setRoute }) {
  let tab = 'all';
  let query = '';
  let filters = ['Origem: China'];

  const results = h('div', { className: 'ic-p-mt4' });
  const filterBar = h('div');
  /** @type {HTMLDivElement} */
  let tabs;

  function renderResults() {
    const rows = ALL_ROWS
      .filter((r) => tab === 'all' || r.bucket === tab)
      .filter((r) => (r.id + r.supplier + r.code).toLowerCase().includes(query.toLowerCase()));
    results.replaceChildren(rows.length === 0
      ? EmptyState({
        icon: 'search_off', title: 'Nenhuma importação encontrada',
        action: Button({
          variant: 'outline', size: 'sm', children: 'Limpar busca',
          on: { click: () => { query = ''; searchInput.value = ''; tab = 'all'; tabs.replaceWith(tabs = buildTabs()); renderResults(); } },
        }),
        children: 'Ajuste o período, o status ou o termo buscado.',
      })
      : DataTable({
        columns: [
          { key: 'id', label: 'Referência', primary: true },
          { key: 'code', label: 'Contêiner', render: (r) => h('span', { className: 'ic-mono' }, r.code) },
          { key: 'supplier', label: 'Fornecedor', render: (r) => h('span', { className: 'ic-p-inline' }, Avatar({ name: r.supplier, size: 'xs' }), r.supplier) },
          { key: 'origin', label: 'Origem' },
          { key: 'status', label: 'Status', render: (r) => Badge({ tone: r.tone, dot: true, children: r.status }) },
          { key: 'eta', label: 'ETA' },
          { key: 'value', label: 'Valor FOB', align: 'right' },
          { key: 'go', label: '', render: (r) => IconButton({ icon: 'arrow_outward', label: 'Abrir ' + r.id, variant: 'bare', size: 'sm', on: { click: () => setRoute('embarque') } }) },
        ],
        rows,
      }));
  }

  function renderFilters() {
    filterBar.replaceChildren(filters.length > 0
      ? h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-row--center ic-p-mt3' },
        filters.map((t) => Tag({ children: t, onRemove: () => { filters = filters.filter((x) => x !== t); renderFilters(); } })),
        Button({ variant: 'ghost', size: 'sm', children: 'Limpar', on: { click: () => { filters = []; renderFilters(); } } }))
      : '');
  }

  function buildTabs() {
    return Tabs({
      value: tab,
      onChange: (v) => { tab = v; renderResults(); },
      items: [
        { value: 'all', label: 'Todas', badge: ALL_ROWS.length },
        { value: 'transit', label: 'Em trânsito', badge: 2 },
        { value: 'customs', label: 'Desembaraço', badge: 2 },
        { value: 'done', label: 'Concluídas', badge: 2 },
      ],
    });
  }

  const search = Input({
    pill: true, icon: 'search', id: 'ic-p-imports-search',
    placeholder: 'Buscar por referência, contêiner ou fornecedor',
    on: { input: (e) => { query = /** @type {HTMLInputElement} */ (e.target).value; renderResults(); } },
  });
  const searchInput = /** @type {HTMLInputElement} */ (search.querySelector('input'));
  tabs = buildTabs();
  renderResults();
  renderFilters();

  return h('div', { className: 'ic-p-page' },
    Breadcrumbs({ items: [{ label: 'Operação', href: '#' }, { label: 'Importações' }] }),
    h('div', { className: 'ic-p-pagehead' },
      h('div', {},
        h('h1', { className: 'ic-p-title' }, 'Importações'),
        h('p', { className: 'ic-p-subtitle' }, '34 processos abertos · US$ 1,28 mi em trânsito')),
      h('div', { className: 'ic-p-actions' },
        Button({ variant: 'outline', iconLeft: 'download', children: 'Exportar' }),
        Button({ variant: 'primary', iconLeft: 'add', children: 'Nova importação' }))),

    Card({
      compact: true,
      children: [
        h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-row--end ic-p-row--gap3' },
          h('div', { className: 'ic-p-grow-260' }, search),
          h('div', { className: 'ic-p-w-180' }, Select({ id: 'ic-p-imports-modal', options: ['Todos os modais', 'Marítimo', 'Aéreo'] })),
          h('div', { className: 'ic-p-w-180' }, Select({ id: 'ic-p-imports-period', options: ['Últimos 90 dias', 'Este mês', 'Este ano'] })),
          IconButton({ icon: 'tune', label: 'Mais filtros' })),
        filterBar,
      ],
    }),

    Card({
      className: 'ic-p-tablecard',
      children: [h('div', { className: 'ic-p-tablecard__tabs' }, tabs), results],
    }));
}
