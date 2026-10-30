// @ts-check
/**
 * Tabs — abas sublinhadas dentro da página, para trocar conteúdo DENTRO de uma
 * tela (NavPills troca de tela).
 *
 * ```js
 * Tabs({ value: t, onChange: setT, items: [
 *   { value: 'all', label: 'Todas', badge: 34 }, { value: 'transit', label: 'Em trânsito', badge: 12 },
 * ] })
 * ```
 *
 * Sem re-render no JS puro: o clique já move a aba ativa e depois chama `onChange`.
 */
import { h, applyCommon, normalizeOption } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps } from '../dom.js' */

/** @typedef {{ value: string, label: string, icon?: string, badge?: number | string }} TabItem */

/**
 * @typedef {CommonProps & {
 *   items: ReadonlyArray<string | TabItem>,
 *   value?: string,
 *   onChange?: (value: string) => void,
 * }} TabsProps
 */

/**
 * @param {TabsProps} props
 * @returns {HTMLDivElement}
 */
export function Tabs({ items = [], value, onChange, ...common }) {
  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  const select = (/** @type {string} */ val) => {
    for (const b of buttons) {
      const active = b.dataset.value === val;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    }
    if (onChange) onChange(val);
  };
  for (const it of items) {
    const item = normalizeOption(it);
    const icon = item.raw && item.raw.icon;
    const badge = item.raw ? item.raw.badge : undefined;
    buttons.push(h('button', {
      className: 'ic-tabs__item' + (item.value === value ? ' is-active' : ''),
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(item.value === value), 'data-value': item.value },
      on: { click: () => select(item.value) },
    },
    icon && Icon({ name: icon, size: 19 }),
    item.label,
    badge != null && h('span', { className: 'ic-tabs__badge' }, badge)));
  }
  return applyCommon(h('div', { className: 'ic-tabs', attrs: { role: 'tablist' } }, buttons), common);
}
