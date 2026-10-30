// @ts-check
/**
 * DonutMeter — anel de composição feito com conic-gradient do CSS: sem
 * biblioteca de gráfico e sem SVG desenhado à mão. Use junto com `Legend`.
 *
 * ```js
 * const segs = [
 *   { value: 46, color: 'var(--chart-1)', label: 'Frete' },
 *   { value: 31, color: 'var(--chart-2)', label: 'Impostos' },
 *   { value: 23, color: 'var(--chart-5)', label: 'Outros' },
 * ];
 * DonutMeter({ segments: segs, value: 'US$ 84,2k', label: 'Custo total' });
 * Legend({ items: segs });
 * ```
 *
 * Use `--chart-1 … --chart-5` em ordem; nunca invente cor de gráfico.
 */
import { h, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {Object} DonutSegment
 * @property {number} value Percentual do anel, 0–100. Os segmentos devem somar 100.
 * @property {string} color Sempre `var(--chart-n)`.
 * @property {string} [label]
 */

/**
 * @typedef {CommonProps & {
 *   segments: ReadonlyArray<DonutSegment>,
 *   size?: number,
 *   thickness?: number,
 *   value?: Child,
 *   label?: Child,
 * }} DonutMeterProps
 * `size` e `thickness` em px. `value`: número central.
 */

/**
 * @param {DonutMeterProps} props
 * @returns {HTMLDivElement}
 */
export function DonutMeter({ segments = [], size = 168, thickness = 26, value, label, ...common }) {
  let acc = 0;
  const stops = segments.map((s) => {
    const from = acc;
    acc += s.value;
    return `${s.color} ${from}% ${acc}%`;
  }).join(', ');
  const hole = size - thickness * 2;
  const el = h('div', { className: 'ic-donut', style: { width: size + 'px', height: size + 'px' } },
    h('div', { className: 'ic-donut__ring', style: { background: `conic-gradient(from -90deg, ${stops || 'var(--chart-track) 0% 100%'})` } }),
    h('div', { className: 'ic-donut__hole', style: { width: hole + 'px', height: hole + 'px' } },
      h('div', {},
        value != null && h('div', { className: 'ic-donut__value' }, value),
        label && h('div', { className: 'ic-donut__label' }, label))));
  return applyCommon(el, common);
}

/**
 * @typedef {CommonProps & {
 *   items: ReadonlyArray<{ label?: string, color: string }>,
 * }} LegendProps
 */

/**
 * @param {LegendProps} props
 * @returns {HTMLDivElement}
 */
export function Legend({ items = [], ...common }) {
  const el = h('div', { className: 'ic-legend' }, items.map((i) => h('span', { className: 'ic-legend__item' },
    h('span', { className: 'ic-legend__swatch', style: { background: i.color } }),
    i.label)));
  return applyCommon(el, common);
}
