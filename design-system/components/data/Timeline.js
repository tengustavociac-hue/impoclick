// @ts-check
/**
 * Timeline — o rastreador de embarque: um trilho de pontos de 28px ligados por
 * uma linha de 2px que fica aqua até onde o progresso chegou. É o componente de
 * dados assinatura do produto.
 *
 * ```js
 * Timeline({ steps: [
 *   { title: 'Coleta no fornecedor', date: '02 abr', state: 'done', icon: 'factory' },
 *   { title: 'Embarque · Shenzhen', date: '07 abr', state: 'done', icon: 'directions_boat' },
 *   { title: 'Em trânsito marítimo', date: 'previsto 29 abr', state: 'current', icon: 'public' },
 *   { title: 'Desembaraço · Santos', state: 'todo', icon: 'gavel' },
 * ] })
 * ```
 */
import { h, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {Object} TimelineStep
 * @property {Child} title
 * @property {string} [date]
 * @property {string} [meta]
 * @property {'done' | 'current' | 'todo'} [state] done = aqua cheio · current = contorno aqua · todo = muted.
 * @property {string} [icon]
 */

/**
 * @typedef {CommonProps & { steps: ReadonlyArray<TimelineStep> }} TimelineProps
 */

/**
 * @param {TimelineProps} props
 * @returns {HTMLDivElement}
 */
export function Timeline({ steps = [], ...common }) {
  const el = h('div', { className: 'ic-timeline' }, steps.map((s, i) => h('div', {
    className: 'ic-timeline__row is-' + (s.state || 'todo'),
  },
  h('div', { className: 'ic-timeline__rail' },
    h('span', { className: 'ic-timeline__dot' },
      Icon({ name: s.icon || (s.state === 'done' ? 'check' : 'radio_button_unchecked'), filled: s.state === 'done' })),
    i < steps.length - 1 && h('span', { className: 'ic-timeline__line' })),
  h('div', { className: 'ic-timeline__body' },
    h('div', { className: 'ic-timeline__title' }, s.title),
    (s.meta || s.date) && h('div', { className: 'ic-timeline__meta' }, [s.date, s.meta].filter(Boolean).join(' · '))))));
  return applyCommon(el, common);
}
