// @ts-check
/**
 * NavPills — navegação principal do produto: um trilho arredondado com o item
 * ativo erguido numa pílula branca. Fica centralizada dentro da TopBar.
 *
 * ```js
 * NavPills({ items: ['Painel', 'Importações', 'Fornecedores', 'Custos'], value: tab, onChange: setTab })
 * ```
 *
 * No máximo ~7 itens; além disso, mova para SideNav. NavPills troca de TELA;
 * Tabs troca conteúdo dentro de uma tela.
 *
 * Sem re-render no JS puro: o clique já move o item ativo e depois chama `onChange`.
 */
import { h, cx, applyCommon, normalizeOption } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps } from '../dom.js' */

/** @typedef {{ value: string, label: string, icon?: string }} NavPillItem */

/**
 * @typedef {CommonProps & {
 *   items: ReadonlyArray<string | NavPillItem>,
 *   value?: string,
 *   onChange?: (value: string) => void,
 *   accent?: boolean,
 * }} NavPillsProps
 */

/**
 * @param {NavPillsProps} props
 * @returns {HTMLElement}
 */
export function NavPills({ items = [], value, onChange, accent = false, ...common }) {
  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  const select = (/** @type {string} */ val) => {
    for (const b of buttons) b.classList.toggle('is-active', b.dataset.value === val);
    if (onChange) onChange(val);
  };
  for (const it of items) {
    const item = normalizeOption(it);
    const icon = item.raw && item.raw.icon;
    buttons.push(h('button', {
      className: 'ic-navpill__item' + (item.value === value ? ' is-active' : ''),
      attrs: { type: 'button', 'data-value': item.value },
      on: { click: () => select(item.value) },
    }, icon && Icon({ name: icon }), item.label));
  }
  return applyCommon(h('nav', { className: cx('ic-navpill', accent && 'is-accent') }, buttons), common);
}
