// @ts-check
/**
 * ShipmentScreen — tela "Embarque": quatro cards de métrica, Timeline da rota
 * com ProgressBar, tabelas de itens/documentos em Tabs e o painel invertido do
 * fornecedor.
 *
 * Porte de `ui_kits/app/ShipmentScreen.jsx`. No original o painel do fornecedor
 * usava branco fixo (`#fff`, `rgba(255,255,255,.6)`); no tema escuro a superfície
 * invertida fica clara e o texto sumia. Aqui ele usa os tokens que o
 * `Card({ variant: 'invert' })` remapeia, e fica legível nos dois temas.
 */
import {
  Card, Stat, Badge, Button, IconButton, Timeline, ProgressBar, DataTable,
  Breadcrumbs, Tabs, Alert, Avatar, Tooltip, h,
} from '../../components/index.js';

/** @typedef {{ item: string, ncm: string, qty: string, total: string }} ItemRow */
/** @typedef {{ doc: string, who: string, status: string, tone: 'success' | 'warning' | 'neutral' }} DocRow */

/** @type {ReadonlyArray<ItemRow>} */
const ITEMS = [
  { item: 'Fone bluetooth TWS', ncm: '8518.30.00', qty: '4.800', total: 'US$ 38.400' },
  { item: 'Carregador 65W GaN', ncm: '8504.40.90', qty: '3.200', total: 'US$ 28.800' },
  { item: 'Cabo USB-C 2 m', ncm: '8544.42.00', qty: '9.000', total: 'US$ 17.000' },
];

/** @type {ReadonlyArray<DocRow>} */
const DOCS = [
  { doc: 'Commercial Invoice', who: 'Ana Sousa', status: 'Aprovado', tone: 'success' },
  { doc: 'Packing List', who: 'Ana Sousa', status: 'Aprovado', tone: 'success' },
  { doc: 'Bill of Lading', who: 'MSC', status: 'Aprovado', tone: 'success' },
  { doc: 'Certificado de origem', who: 'Shenzhen Vitec', status: 'Em análise', tone: 'warning' },
  { doc: 'Licença de importação', who: '—', status: 'Pendente', tone: 'neutral' },
];

/** @param {string} tab */
function tabTable(tab) {
  return tab === 'rota'
    ? DataTable({
      columns: [
        { key: 'item', label: 'Produto', primary: true },
        { key: 'ncm', label: 'NCM', render: (r) => h('span', { className: 'ic-mono' }, r.ncm) },
        { key: 'qty', label: 'Qtd.', align: 'right' },
        { key: 'total', label: 'Total FOB', align: 'right' },
      ],
      rows: ITEMS,
    })
    : DataTable({
      columns: [
        { key: 'doc', label: 'Documento', primary: true },
        { key: 'who', label: 'Enviado por', render: (r) => h('span', { className: 'ic-p-inline' }, Avatar({ name: r.who, size: 'xs' }), r.who) },
        { key: 'status', label: 'Status', render: (r) => Badge({ tone: r.tone, dot: true, children: r.status }) },
      ],
      rows: DOCS,
    });
}

/**
 * @param {{ setRoute?: (route: string) => void }} [_props]
 * @returns {HTMLDivElement}
 */
export function ShipmentScreen(_props) {
  const tableSlot = h('div', { className: 'ic-p-mt4' }, tabTable('rota'));

  return h('div', { className: 'ic-p-page' },
    Breadcrumbs({ items: [{ label: 'Importações', href: '#' }, { label: 'IMP-2481' }] }),

    h('div', { className: 'ic-p-pagehead ic-p-pagehead--top' },
      h('div', {},
        h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-row--center ic-p-row--gap3' },
          h('h1', { className: 'ic-p-title' }, 'Shenzhen → Santos'),
          Badge({ tone: 'accent', dot: true, children: 'Em trânsito' })),
        h('p', { className: 'ic-mono ic-p-codeline' }, 'IMP-2481 · MSKU 472 118-3 · BL SZX0482914')),
      h('div', { className: 'ic-p-actions' },
        Tooltip({ label: 'Baixar documentos', children: IconButton({ icon: 'download', label: 'Baixar' }) }),
        Button({ variant: 'outline', iconLeft: 'chat', children: 'Falar com o despachante' }),
        Button({ variant: 'primary', iconLeft: 'upload_file', children: 'Enviar documento' }))),

    h('div', { className: 'ic-p-grid ic-p-grid--240' },
      Card({ compact: true, children: Stat({ label: 'Valor FOB', prefix: 'US$', value: '84.200', fraction: ',00', size: 'sm' }) }),
      Card({ compact: true, children: Stat({ label: 'Custo total estimado', prefix: 'R$', value: '612.480', fraction: ',00', size: 'sm', delta: '+4,2%', deltaDirection: 'up', deltaNote: 'vs. cotação' }) }),
      Card({ compact: true, children: Stat({ label: 'Peso bruto', value: '18.420', suffix: 'kg', size: 'sm' }) }),
      Card({ compact: true, children: Stat({ label: 'Chegada prevista', value: '29', suffix: 'abr', size: 'sm', delta: '14 dias', deltaDirection: 'flat' }) })),

    Alert({ tone: 'info', title: 'Rastreio atualizado há 22 minutos', children: 'Última posição informada pela MSC: 12°44′S 38°30′W, velocidade 16,4 nós.' }),

    h('div', { className: 'ic-p-split ic-p-split--half' },
      Card({
        eyebrow: 'Trajeto', title: 'Etapas do embarque',
        children: [
          h('div', { className: 'ic-p-mb5' }, ProgressBar({ thick: true, label: 'Progresso do trajeto', valueText: '18 / 32 dias', value: 18, max: 32 })),
          Timeline({ steps: [
            { title: 'Pedido confirmado', date: '24 mar', meta: 'Shenzhen Vitec', state: 'done', icon: 'handshake' },
            { title: 'Coleta no fornecedor', date: '02 abr', meta: 'Guangzhou', state: 'done', icon: 'factory' },
            { title: 'Embarque · Shenzhen', date: '07 abr', meta: 'MSC Bianca · Viagem 418W', state: 'done', icon: 'directions_boat' },
            { title: 'Em trânsito marítimo', date: 'prev. 29 abr', meta: 'Atlântico Sul · 14 dias restantes', state: 'current', icon: 'public' },
            { title: 'Atracação · Santos', state: 'todo', icon: 'anchor' },
            { title: 'Desembaraço aduaneiro', state: 'todo', icon: 'gavel' },
            { title: 'Entrega · Curitiba', state: 'todo', icon: 'local_shipping' },
          ] }),
        ],
      }),

      h('div', { className: 'ic-p-stack' },
        Card({
          className: 'ic-p-tablecard',
          children: [
            h('div', { className: 'ic-p-tablecard__tabs' }, Tabs({
              value: 'rota',
              onChange: (v) => tableSlot.replaceChildren(tabTable(v)),
              items: [{ value: 'rota', label: 'Itens', badge: 3 }, { value: 'docs', label: 'Documentos', badge: 5 }],
            })),
            tableSlot,
          ],
        }),

        Card({
          variant: 'invert', eyebrow: 'Parceiro', title: 'Shenzhen Vitec Electronics',
          action: IconButton({ icon: 'arrow_outward', label: 'Abrir fornecedor', variant: 'bare', size: 'sm' }),
          children: h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-row--gap5 ic-p-mt2' },
            [['Embarques', '14'], ['Prazo médio', '31 d'], ['Avarias', '0,4%']].map(([k, v]) => h('div', {},
              h('div', { className: 'ic-p-kv__key' }, k),
              h('div', { className: 'ic-p-kv__value' }, v)))),
        }))));
}
