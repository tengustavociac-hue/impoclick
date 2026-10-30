// @ts-check
/**
 * Stat — o número grande que ancora todo card de painel. É a assinatura da
 * marca: tracking apertado, algarismos tabulares, unidade e decimais rebaixados.
 *
 * ```js
 * Stat({
 *   label: 'Valor em trânsito', prefix: 'US$', value: '1.284.600', fraction: ',00',
 *   delta: '+12,4%', deltaDirection: 'up', deltaNote: 'vs. mês anterior', size: 'lg',
 * })
 * ```
 *
 * Nunca renderize um valor inteiro num peso só — separe `prefix` / `value` /
 * `fraction`. Esse contraste é o estilo da casa.
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from './Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   label?: Child,
 *   value: Child,
 *   prefix?: Child,
 *   suffix?: Child,
 *   fraction?: Child,
 *   delta?: Child,
 *   deltaDirection?: 'up' | 'down' | 'flat',
 *   deltaNote?: Child,
 *   size?: 'sm' | 'md' | 'lg',
 * }} StatProps
 * `value`: parte inteira, peso e contraste cheios. `prefix`: moeda/unidade a 52%, ex. "US$".
 * `fraction`: decimais ou denominador em tom muted, ex. ",00" ou "/ 40".
 */

const DELTA_ICONS = { up: 'trending_up', down: 'trending_down', flat: 'trending_flat' };

/**
 * @param {StatProps} props
 * @returns {HTMLDivElement}
 */
export function Stat({
  label, value, prefix, suffix, fraction, delta,
  deltaDirection = 'up', deltaNote, size = 'md', ...common
}) {
  const el = h('div', { className: cx('ic-stat', 'is-' + size) },
    label && h('div', { className: 'ic-stat__label' }, label),
    h('div', { className: 'ic-stat__value' },
      prefix && h('span', { className: 'ic-stat__unit' }, prefix),
      h('span', {}, value),
      fraction && h('span', { className: 'ic-stat__frac' }, fraction),
      suffix && h('span', { className: 'ic-stat__unit' }, suffix)),
    delta && h('div', { className: 'ic-stat__delta is-' + deltaDirection },
      Icon({ name: DELTA_ICONS[deltaDirection] }),
      delta,
      deltaNote && h('span', { style: { color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)' } }, deltaNote)));
  return applyCommon(el, common);
}
