// @ts-check
/**
 * SparkBars — série de barras com ponta arredondada. Toda barra é cinza de
 * trilho, menos UM destaque aqua — esse único acento é o ponto do gráfico.
 *
 * ```js
 * SparkBars({ data: [12, 18, 9, 24, 31, 15, 21], labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] })
 * ```
 */
import { h, applyCommon } from '../dom.js';

/** @import { CommonProps } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   data: ReadonlyArray<number>,
 *   labels?: ReadonlyArray<string>,
 *   peakIndex?: number,
 *   height?: number,
 * }} SparkBarsProps
 * `peakIndex`: qual barra fica aqua; por padrão, a mais alta. `height`: altura do gráfico em px.
 */

/**
 * @param {SparkBarsProps} props
 * @returns {HTMLDivElement}
 */
export function SparkBars({ data = [], labels = [], peakIndex, height = 88, ...common }) {
  const max = Math.max(...data, 1);
  const peak = peakIndex != null ? peakIndex : data.indexOf(Math.max(...data));
  const bars = h('div', { className: 'ic-sparkbars', style: { height: height + 'px' } },
    data.map((v, i) => h('div', {
      className: 'ic-sparkbars__bar' + (i === peak ? ' is-peak' : ''),
      style: { height: Math.max(6, (v / max) * 100) + '%' },
      attrs: { title: String(v) },
    })));
  const el = h('div', {}, bars,
    labels.length > 0 && h('div', { className: 'ic-sparkbars__labels' }, labels.map((l) => h('span', {}, l))));
  return applyCommon(el, common);
}
