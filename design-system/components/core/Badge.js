// @ts-check
/**
 * Badge — pílula de status somente leitura, 24px de altura.
 *
 * ```js
 * Badge({ tone: 'success', dot: true, children: 'Entregue' })
 * Badge({ tone: 'warning', icon: 'schedule', children: 'Aguardando DI' })
 * ```
 *
 * Mapa de status usado no produto inteiro: `accent` em trânsito · `success`
 * entregue/liberado · `warning` aguardando/pendente · `danger` retido/atrasado ·
 * `neutral` rascunho. Badge é status; Tag é filtro editável — não troque.
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from './Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   children?: Child,
 *   tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'secondary',
 *   icon?: string,
 *   dot?: boolean,
 *   solid?: boolean,
 * }} BadgeProps
 * `dot`: ponto de 6px à esquerda em vez de ícone.
 */

/**
 * @param {BadgeProps} props
 * @returns {HTMLSpanElement}
 */
export function Badge({ children, tone = 'neutral', icon, dot = false, solid = false, ...common }) {
  const el = h('span', { className: cx('ic-badge', 'is-' + tone, solid && 'is-solid') },
    dot && h('span', { className: 'ic-badge__dot' }),
    icon && Icon({ name: icon }),
    children);
  return applyCommon(el, common);
}
