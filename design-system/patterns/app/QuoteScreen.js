// @ts-check
/**
 * QuoteScreen — tela "Cotação": formulário em duas etapas, card aqua de
 * estimativa fixo (sticky) com DonutMeter e Toast ao enviar.
 *
 * Porte de `ui_kits/app/QuoteScreen.jsx`. Trocar o modal atualiza total e prazo;
 * trocar o incoterm atualiza o badge; "Solicitar cotação firme" mostra o Toast
 * com "Desfazer".
 */
import {
  Card, Input, Select, Checkbox, Switch, SegmentedControl, Button, Stat, Badge,
  Breadcrumbs, DonutMeter, Legend, Toast, h,
} from '../../components/index.js';

const quoteSegments = [
  { value: 44, color: 'var(--chart-1)', label: 'Frete' },
  { value: 34, color: 'var(--chart-2)', label: 'Impostos' },
  { value: 12, color: 'var(--chart-3)', label: 'Despacho' },
  { value: 10, color: 'var(--chart-5)', label: 'Seguro e taxas' },
];

/**
 * @returns {HTMLDivElement}
 */
export function QuoteScreen() {
  let modal = 'sea';
  let incoterm = 'FOB';

  const statSlot = h('div');
  const badges = h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-estimate__badges' });
  const toastSlot = h('div', { className: 'ic-p-toastslot' });

  function renderEstimate() {
    const total = modal === 'sea' ? '86.400' : '142.900';
    const days = modal === 'sea' ? '32' : '9';
    statSlot.replaceChildren(Stat({ prefix: 'US$', value: total, fraction: ',00', size: 'md' }));
    badges.replaceChildren(
      Badge({ tone: 'neutral', icon: 'schedule', children: days + ' dias porta a porta' }),
      Badge({ tone: 'neutral', children: incoterm }));
  }

  /** @param {boolean} sent */
  function renderToast(sent) {
    toastSlot.replaceChildren(sent
      ? Toast({ tone: 'success', actionLabel: 'Desfazer', onAction: () => renderToast(false), children: 'Cotação enviada para 3 agentes de carga.' })
      : '');
  }

  renderEstimate();

  return h('div', { className: 'ic-p-page ic-p-page--narrow' },
    Breadcrumbs({ items: [{ label: 'Comercial', href: '#' }, { label: 'Nova cotação' }] }),
    h('div', {},
      h('h1', { className: 'ic-p-title' }, 'Nova cotação'),
      h('p', { className: 'ic-p-subtitle' }, 'Simule o custo total antes de fechar com o fornecedor.')),

    h('div', { className: 'ic-p-split ic-p-split--quote' },
      h('div', { className: 'ic-p-stack' },
        Card({
          eyebrow: 'Etapa 1', title: 'Origem e destino',
          children: [
            h('div', { className: 'ic-p-formgrid ic-p-formgrid--2' },
              Select({ label: 'Porto de origem', id: 'ic-p-q-origem', options: ['Shenzhen (CNSZX)', 'Ningbo (CNNGB)', 'Xangai (CNSHA)'] }),
              Select({ label: 'Porto de destino', id: 'ic-p-q-destino', options: ['Santos (BRSSZ)', 'Paranaguá (BRPNG)', 'Itajaí (BRITJ)'] }),
              Select({ label: 'Fornecedor', id: 'ic-p-q-fornecedor', options: ['Shenzhen Vitec', 'Ningbo Tools Co.', 'Foshan Home'] }),
              Select({
                label: 'Incoterm', id: 'ic-p-q-incoterm', value: incoterm, options: ['FOB', 'EXW', 'CIF', 'DDP'],
                on: { change: (e) => { incoterm = /** @type {HTMLSelectElement} */ (e.target).value; renderEstimate(); } },
              })),
            h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-row--center ic-p-row--gap3 ic-p-mt4' },
              h('span', { className: 'ic-p-fieldlabel' }, 'Modal'),
              SegmentedControl({
                accent: true, value: modal,
                options: [{ value: 'sea', label: 'Marítimo', icon: 'directions_boat' }, { value: 'air', label: 'Aéreo', icon: 'flight' }],
                onChange: (v) => { modal = v; renderEstimate(); },
              })),
          ],
        }),

        Card({
          eyebrow: 'Etapa 2', title: 'Carga',
          children: [
            h('div', { className: 'ic-p-formgrid ic-p-formgrid--3' },
              Input({ label: 'Valor FOB (US$)', id: 'ic-p-q-fob', placeholder: '84.200,00', icon: 'payments', required: true }),
              Input({ label: 'Peso bruto (kg)', id: 'ic-p-q-peso', placeholder: '18.420', icon: 'scale', required: true }),
              Input({ label: 'Volume (m³)', id: 'ic-p-q-volume', placeholder: '58,4', icon: 'deployed_code' }),
              Input({ label: 'NCM principal', id: 'ic-p-q-ncm', placeholder: '8518.30.00', icon: 'tag', hint: 'Usada para estimar II e IPI' }),
              Select({ label: 'Tipo de contêiner', id: 'ic-p-q-conteiner', options: ['40" HC', '20" DV', 'LCL (carga solta)'] }),
              Input({ label: 'Quantidade', id: 'ic-p-q-qtd', placeholder: '1', icon: 'inventory_2' })),
            h('div', { className: 'ic-p-row ic-p-row--wrap ic-p-row--gap6 ic-p-mt5' },
              Checkbox({ label: 'Incluir seguro internacional', checked: true }),
              Checkbox({ label: 'Carga perigosa (IMO)' }),
              Switch({ label: 'Entrega porta a porta', checked: true })),
          ],
        })),

      Card({
        variant: 'accent', eyebrow: 'Estimativa', title: 'Custo desembarcado', className: 'ic-p-sticky',
        children: [
          statSlot,
          badges,
          h('div', { className: 'ic-p-row ic-p-row--center ic-p-row--gap4' },
            DonutMeter({ segments: quoteSegments, size: 118, thickness: 20 }),
            Legend({ items: quoteSegments, className: 'ic-p-legend-col' })),
          h('div', { className: 'ic-p-stack ic-p-stack--tight ic-p-mt5' },
            Button({ variant: 'primary', block: true, iconRight: 'arrow_outward', children: 'Solicitar cotação firme', on: { click: () => renderToast(true) } }),
            Button({ variant: 'ghost', block: true, children: 'Salvar rascunho' })),
        ],
      })),

    toastSlot);
}
