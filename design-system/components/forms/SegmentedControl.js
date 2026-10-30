// @ts-check
/**
 * SegmentedControl — pílula dentro de pílula para 2–4 visões mutuamente
 * exclusivas: moeda, período, modal. É o controle mais usado da marca depois
 * do Button.
 *
 * ```js
 * SegmentedControl({ options: ['USD', 'BRL', 'CNY'], value: cur, onChange: setCur })
 * SegmentedControl({
 *   accent: true, value: m, onChange: setM,
 *   options: [{ value: 'sea', label: 'Marítimo', icon: 'directions_boat' }, { value: 'air', label: 'Aéreo', icon: 'flight' }],
 * })
 * ```
 *
 * Cinco opções ou mais → use Tabs ou Select.
 *
 * Diferença do original React: lá o componente era controlado e o pai
 * re-renderizava. Aqui não há re-render, então o clique já move o estado
 * selecionado (classe `is-active` + `aria-selected`) e depois chama `onChange`.
 */
import { h, cx, applyCommon, normalizeOption } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps } from '../dom.js' */

/** @typedef {{ value: string, label: string, icon?: string }} SegmentedOption */

/**
 * @typedef {CommonProps & {
 *   options: ReadonlyArray<string | SegmentedOption>,
 *   value?: string,
 *   onChange?: (value: string) => void,
 *   accent?: boolean,
 * }} SegmentedControlProps
 * `accent`: a pílula ativa usa aqua cheio em vez da superfície elevada.
 */

/**
 * @param {SegmentedControlProps} props
 * @returns {HTMLDivElement}
 */
export function SegmentedControl({ options = [], value, onChange, accent = false, ...common }) {
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
  for (const o of options) {
    const opt = normalizeOption(o);
    const icon = opt.raw && opt.raw.icon;
    buttons.push(h('button', {
      className: 'ic-seg__opt' + (opt.value === value ? ' is-active' : ''),
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(opt.value === value), 'data-value': opt.value },
      on: { click: () => select(opt.value) },
    }, icon && Icon({ name: icon }), opt.label));
  }
  const el = h('div', { className: cx('ic-seg', accent && 'is-accent'), attrs: { role: 'tablist' } }, buttons);
  return applyCommon(el, common);
}
