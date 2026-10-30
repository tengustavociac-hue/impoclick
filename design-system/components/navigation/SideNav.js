// @ts-check
/**
 * SideNav — trilho lateral de 248px (72px recolhido). Item ativo = fundo
 * aqua-soft, rótulo aqua e ícone *preenchido*.
 *
 * ```js
 * SideNav({ value: v, onChange: setV, items: [
 *   { group: 'Operação' },
 *   { value: 'imports', icon: 'inventory_2', label: 'Importações', count: 12 },
 *   { value: 'tracking', icon: 'directions_boat', label: 'Rastreio' },
 * ] })
 * ```
 *
 * Sem re-render no JS puro: o clique já move o item ativo (classe e ícone
 * preenchido) e depois chama `onChange`.
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {Object} SideNavItem
 * @property {string} [value]
 * @property {string} [label]
 * @property {string} [icon]
 * @property {number | string} [count]
 * @property {string} [group] Desenha um título pequeno de seção em vez de um link.
 */

/**
 * @typedef {CommonProps & {
 *   items: ReadonlyArray<SideNavItem>,
 *   value?: string,
 *   onChange?: (value: string) => void,
 *   collapsed?: boolean,
 *   header?: Child,
 *   footer?: Child,
 * }} SideNavProps
 */

/**
 * @param {SideNavProps} props
 * @returns {HTMLElement}
 */
export function SideNav({ items = [], value, onChange, collapsed = false, header, footer, ...common }) {
  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  const select = (/** @type {string} */ val) => {
    for (const b of buttons) {
      const active = b.dataset.value === val;
      b.classList.toggle('is-active', active);
      const icon = b.querySelector('.ic-icon');
      if (icon) icon.classList.toggle('is-filled', active);
    }
    if (onChange) onChange(val);
  };
  const nodes = items.map((it) => {
    if (it.group) return h('div', { className: 'ic-sidenav__group' }, it.group);
    const val = it.value || '';
    const button = h('button', {
      className: 'ic-sidenav__item' + (val === value ? ' is-active' : ''),
      attrs: { type: 'button', 'data-value': val },
      on: { click: () => select(val) },
    },
    Icon({ name: it.icon || '', filled: val === value }),
    h('span', { className: 'ic-sidenav__label' }, it.label),
    it.count != null && h('span', { className: 'ic-sidenav__count' }, it.count));
    buttons.push(button);
    return button;
  });
  const el = h('aside', { className: cx('ic-sidenav', collapsed && 'is-collapsed') }, header, nodes, footer);
  return applyCommon(el, common);
}
