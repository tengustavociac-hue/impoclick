// @ts-check
/**
 * ProgressBar — trilho em pílula. O preenchimento anima em 360ms com o
 * ease-out da casa; nunca quica.
 *
 * ```js
 * ProgressBar({ label: 'Trajeto Shenzhen → Santos', valueText: '18 / 32 dias', value: 18, max: 32, thick: true })
 * ```
 */
import { h, cx, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   value?: number,
 *   max?: number,
 *   label?: Child,
 *   valueText?: Child,
 *   tone?: 'accent' | 'secondary' | 'success' | 'danger',
 *   thick?: boolean,
 * }} ProgressBarProps
 * `valueText`: leitura à direita, ex. "18 / 40 dias". `thick`: trilho de 14px em vez de 8px —
 * para o único progresso de destaque da página.
 */

/**
 * @param {ProgressBarProps} props
 * @returns {HTMLDivElement}
 */
export function ProgressBar({ value = 0, max = 100, label, valueText, tone = 'accent', thick = false, ...common }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const el = h('div', { className: cx('ic-progress', 'is-' + tone, thick && 'is-thick') },
    (label || valueText) && h('div', { className: 'ic-progress__meta' },
      label && h('span', { className: 'ic-progress__label' }, label),
      valueText && h('span', { className: 'ic-progress__value' }, valueText)),
    h('div', {
      className: 'ic-progress__track',
      attrs: { role: 'progressbar', 'aria-valuenow': value, 'aria-valuemin': 0, 'aria-valuemax': max },
    }, h('div', { className: 'ic-progress__fill', style: { width: pct + '%' } })));
  return applyCommon(el, common);
}
