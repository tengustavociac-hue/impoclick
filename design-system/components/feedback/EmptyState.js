// @ts-check
/**
 * EmptyState — espaço reservado, centralizado, para lista vazia. Sempre oferece
 * a única ação que resolve o vazio.
 *
 * ```js
 * EmptyState({
 *   icon: 'search_off', title: 'Nenhuma importação encontrada',
 *   action: Button({ variant: 'outline', children: 'Limpar filtros' }),
 *   children: 'Ajuste o período ou o status para ver mais resultados.',
 * })
 * ```
 */
import { h, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   icon?: string,
 *   title?: Child,
 *   children?: Child,
 *   action?: Child,
 * }} EmptyStateProps
 * `action`: um único Button, em geral o que preenche a tela vazia.
 */

/**
 * @param {EmptyStateProps} props
 * @returns {HTMLDivElement}
 */
export function EmptyState({ icon = 'inventory_2', title, children, action, ...common }) {
  const el = h('div', { className: 'ic-empty' },
    h('span', { className: 'ic-empty__icon' }, Icon({ name: icon })),
    title && h('div', { className: 'ic-empty__title' }, title),
    children && h('div', { className: 'ic-empty__body' }, children),
    action);
  return applyCommon(el, common);
}
