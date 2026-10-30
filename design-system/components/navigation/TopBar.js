// @ts-check
/**
 * TopBar — cabeçalho fixo de 64px com fundo translúcido e desfocado. É o único
 * lugar, além dos tooltips, onde o blur é permitido.
 *
 * ```js
 * TopBar({
 *   brand: [h('img', { attrs: { src: 'assets/logo-impoclick.png', alt: '' } }), 'Impoclick'],
 *   center: NavPills({ items: tabs, value: tab, onChange: setTab }),
 *   actions: [IconButton({ icon: 'notifications', label: 'Avisos' }), Avatar({ name: 'RL', size: 'sm' })],
 * })
 * ```
 */
import { h, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   brand?: Child,
 *   center?: Child,
 *   actions?: Child,
 * }} TopBarProps
 * `brand`: a marca mais "Impoclick" em Urbanist Bold. `center`: em geral NavPills.
 * `actions`: grupo da direita — IconButtons, troca de tema, Avatar.
 */

/**
 * @param {TopBarProps} props
 * @returns {HTMLElement}
 */
export function TopBar({ brand, center, actions, ...common }) {
  const el = h('header', { className: 'ic-topbar' },
    h('div', { className: 'ic-topbar__brand' }, brand),
    h('div', { className: 'ic-topbar__spacer' }),
    center,
    h('div', { className: 'ic-topbar__spacer' }),
    h('div', { className: 'ic-topbar__actions' }, actions));
  return applyCommon(el, common);
}
