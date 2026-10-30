// @ts-check
/**
 * DashboardScreen — tela "Painel": card aqua de destaque, uso do plano, donut de
 * custo, SparkBars de 12 meses, Timeline ao vivo do embarque e atividade do time.
 *
 * Porte de `ui_kits/app/DashboardScreen.jsx`. A troca USD/BRL atualiza só a
 * métrica do card de destaque, sem refazer a tela.
 */
import {
  Card, Stat, Badge, Button, IconButton, SegmentedControl, SparkBars, DonutMeter,
  Legend, Timeline, ProgressBar, Alert, Avatar, h,
} from '../../components/index.js';

const costSegments = [
  { value: 46, color: 'var(--chart-1)', label: 'Frete internacional' },
  { value: 31, color: 'var(--chart-2)', label: 'Impostos' },
  { value: 14, color: 'var(--chart-3)', label: 'Armazenagem' },
  { value: 9, color: 'var(--chart-5)', label: 'Outros' },
];

const activity = [
  ['Ana Sousa', 'anexou a fatura comercial em', 'IMP-2479', 'há 12 min'],
  ['Marcos Dias', 'aprovou a cotação de', 'Ningbo Tools Co.', 'há 1 h'],
  ['Rafael Lima', 'criou a importação', 'IMP-2483', 'ontem'],
];

/**
 * @param {'USD' | 'BRL'} currency
 * @returns {HTMLDivElement}
 */
function transitStat(currency) {
  return Stat({
    prefix: currency === 'USD' ? 'US$' : 'R$',
    value: currency === 'USD' ? '1.284.600' : '6.873.610',
    fraction: ',00',
    delta: '+12,4%', deltaNote: 'vs. período anterior', size: 'lg',
  });
}

/**
 * @param {{ setRoute: (route: 'embarque') => void }} props
 * @returns {HTMLDivElement}
 */
export function DashboardScreen({ setRoute }) {
  let stat = transitStat('USD');

  return h('div', { className: 'ic-p-page' },
    h('div', { className: 'ic-p-pagehead' },
      h('div', {},
        h('div', { className: 'ic-p-kicker' }, 'Terça, 16 de setembro'),
        h('h1', { className: 'ic-p-title ic-p-title--gap' }, 'Olá, Rafael')),
      h('div', { className: 'ic-p-actions ic-p-actions--center' },
        SegmentedControl({ options: [{ value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '12m', label: '12 meses' }], value: '30d' }),
        Button({ variant: 'primary', iconLeft: 'add', children: 'Nova importação' }))),

    Alert({
      tone: 'warning', title: '2 embarques aguardam documentos',
      children: 'A DI do IMP-2479 vence em 3 dias. Envie a fatura comercial para evitar armazenagem no porto de Santos.',
    }),

    h('div', { className: 'ic-p-grid ic-p-grid--300 ic-p-grid--stretch' },
      Card({
        variant: 'accent', eyebrow: 'Valor em trânsito',
        action: SegmentedControl({
          options: ['USD', 'BRL'], value: 'USD',
          onChange: (v) => { const next = transitStat(v === 'BRL' ? 'BRL' : 'USD'); stat.replaceWith(next); stat = next; },
        }),
        children: [
          stat,
          h('div', { className: 'ic-p-row ic-p-row--mt5' },
            Button({ variant: 'outline', size: 'sm', iconLeft: 'download', children: 'Extrato' }),
            Button({ variant: 'outline', size: 'sm', iconLeft: 'share', children: 'Compartilhar' })),
        ],
      }),

      Card({
        eyebrow: 'Contêineres', title: 'Ocupação do plano',
        action: IconButton({ icon: 'arrow_outward', label: 'Abrir', variant: 'bare', size: 'sm' }),
        children: [
          Stat({ value: '18', fraction: '/ 40', size: 'md', delta: '+3', deltaNote: 'nesta semana' }),
          h('div', { className: 'ic-p-mt4' }, ProgressBar({ value: 18, max: 40, valueText: '45%', label: 'Uso mensal' })),
          h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-mt4' },
            Badge({ tone: 'accent', dot: true, children: '12 em trânsito' }),
            Badge({ tone: 'warning', dot: true, children: '4 no porto' }),
            Badge({ tone: 'success', dot: true, children: '2 entregues' })),
        ],
      }),

      Card({
        eyebrow: 'Composição de custo', title: 'Últimos 30 dias',
        action: IconButton({ icon: 'arrow_outward', label: 'Abrir', variant: 'bare', size: 'sm' }),
        children: h('div', { className: 'ic-p-row ic-p-row--center ic-p-row--gap4' },
          DonutMeter({ segments: costSegments, size: 132, thickness: 22, value: 'US$ 84,2k', label: 'Custo total' }),
          Legend({ items: costSegments, className: 'ic-p-legend-col' })),
      })),

    h('div', { className: 'ic-p-split ic-p-split--wide' },
      Card({
        eyebrow: 'Volume', title: 'Embarques por semana',
        action: SegmentedControl({ options: [{ value: 's', label: 'Marítimo' }, { value: 'a', label: 'Aéreo' }], value: 's' }),
        children: [
          h('div', { className: 'ic-p-mb4' }, Stat({ value: '132', suffix: 'contêineres', size: 'sm', delta: '+8,1%', deltaNote: 'vs. trimestre anterior' })),
          SparkBars({
            data: [9, 14, 11, 18, 22, 16, 27, 19, 24, 31, 21, 17], height: 132,
            labels: ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set'],
          }),
        ],
      }),

      Card({
        eyebrow: 'IMP-2481', title: 'Shenzhen → Santos',
        action: IconButton({ icon: 'arrow_outward', label: 'Abrir embarque', variant: 'bare', size: 'sm', on: { click: () => setRoute('embarque') } }),
        children: Timeline({ steps: [
          { title: 'Coleta no fornecedor', date: '02 abr', meta: 'Guangzhou', state: 'done', icon: 'factory' },
          { title: 'Embarque · Shenzhen', date: '07 abr', meta: 'MSC Bianca', state: 'done', icon: 'directions_boat' },
          { title: 'Em trânsito marítimo', date: 'prev. 29 abr', meta: '14 dias restantes', state: 'current', icon: 'public' },
          { title: 'Desembaraço · Santos', state: 'todo', icon: 'gavel' },
          { title: 'Entrega · Curitiba', state: 'todo', icon: 'local_shipping' },
        ] }),
      })),

    Card({
      eyebrow: 'Equipe', title: 'Atividade recente', compact: true,
      children: h('div', { className: 'ic-p-list' }, activity.map(([who, what, ref, when]) => h('div', { className: 'ic-p-list__row' },
        Avatar({ name: who, size: 'sm' }),
        h('span', { className: 'ic-p-list__text' },
          h('b', { className: 'ic-p-strong' }, who), ' ', what, ' ', h('b', { className: 'ic-p-strong ic-p-strong--accent' }, ref)),
        h('span', { className: 'ic-p-list__when' }, when)))),
    }));
}
