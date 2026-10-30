// @ts-check
/**
 * CostsScreen — tela "Custos": KPIs de custo, tendência de 12 meses e tabela
 * por processo com ProgressBar de margem na própria célula.
 *
 * Porte de `ui_kits/app/CostsScreen.jsx`.
 */
import {
  Card, Stat, DataTable, Button, SegmentedControl, SparkBars, ProgressBar,
  Breadcrumbs, IconButton, h,
} from '../../components/index.js';

/** @typedef {{ id: string, route: string, fob: string, freight: string, tax: string, landed: string, m: number }} CostRow */

/** @type {ReadonlyArray<CostRow>} */
const ROWS = [
  { id: 'IMP-2481', route: 'Shenzhen → Santos', fob: 'US$ 84.200', freight: 'R$ 62.900', tax: 'R$ 148.300', landed: 'R$ 612.480', m: 38 },
  { id: 'IMP-2479', route: 'Foshan → Santos', fob: 'US$ 31.980', freight: 'R$ 41.200', tax: 'R$ 62.700', landed: 'R$ 271.140', m: 27 },
  { id: 'IMP-2477', route: 'Yiwu → Paranaguá', fob: 'US$ 18.400', freight: 'R$ 38.900', tax: 'R$ 39.100', landed: 'R$ 183.620', m: 16 },
  { id: 'IMP-2470', route: 'Dongguan → Itajaí', fob: 'US$ 112.430', freight: 'R$ 74.400', tax: 'R$ 201.800', landed: 'R$ 842.010', m: 44 },
];

/**
 * @returns {HTMLDivElement}
 */
export function CostsScreen() {
  return h('div', { className: 'ic-p-page' },
    Breadcrumbs({ items: [{ label: 'Financeiro', href: '#' }, { label: 'Custos' }] }),
    h('div', { className: 'ic-p-pagehead' },
      h('div', {},
        h('h1', { className: 'ic-p-title' }, 'Custos de importação'),
        h('p', { className: 'ic-p-subtitle' }, 'Custo desembarcado por processo, atualizado diariamente.')),
      h('div', { className: 'ic-p-actions' },
        SegmentedControl({ options: [{ value: '30d', label: '30 dias' }, { value: '12m', label: '12 meses' }], value: '12m' }),
        Button({ variant: 'outline', iconLeft: 'download', children: 'Exportar CSV' }))),

    h('div', { className: 'ic-p-grid ic-p-grid--260' },
      Card({ compact: true, children: Stat({ label: 'Custo desembarcado', prefix: 'R$', value: '4.128.940', size: 'sm', delta: '+6,8%', deltaNote: 'vs. ano anterior' }) }),
      Card({ compact: true, children: Stat({ label: 'Custo médio / contêiner', prefix: 'R$', value: '31.280', size: 'sm', delta: '-3,1%', deltaDirection: 'down', deltaNote: 'melhor' }) }),
      Card({ compact: true, children: Stat({ label: 'Impostos pagos', prefix: 'R$', value: '1.402.110', size: 'sm' }) }),
      Card({ compact: true, children: Stat({ label: 'Armazenagem evitada', prefix: 'R$', value: '86.400', size: 'sm', delta: '18 dias', deltaDirection: 'flat' }) })),

    Card({
      eyebrow: 'Tendência', title: 'Custo desembarcado por mês',
      children: SparkBars({
        height: 150,
        data: [286, 312, 274, 341, 388, 352, 401, 368, 392, 447, 376, 349],
        labels: ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set'],
      }),
    }),

    Card({
      eyebrow: 'Detalhe', title: 'Por processo',
      action: IconButton({ icon: 'tune', label: 'Colunas', variant: 'bare', size: 'sm' }),
      children: DataTable({
        columns: [
          { key: 'id', label: 'Referência', primary: true },
          { key: 'route', label: 'Rota' },
          { key: 'fob', label: 'FOB', align: 'right' },
          { key: 'freight', label: 'Frete', align: 'right' },
          { key: 'tax', label: 'Impostos', align: 'right' },
          { key: 'landed', label: 'Desembarcado', align: 'right' },
          {
            key: 'margin', label: 'Margem',
            render: (r) => h('div', { className: 'ic-p-minw-120' },
              ProgressBar({ value: r.m, valueText: r.m + '%', tone: r.m > 35 ? 'success' : r.m > 22 ? 'accent' : 'danger' })),
          },
        ],
        rows: ROWS,
      }),
    }));
}
