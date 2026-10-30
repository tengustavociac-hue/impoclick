// @ts-check
/**
 * Checkbox — checkbox e radio dividem um componente; `radio` só muda o formato
 * da caixa e o tipo do input.
 *
 * ```js
 * Checkbox({ label: 'Incluir seguro internacional', checked: true })
 * Checkbox({ radio: true, name: 'modal', label: 'Aéreo' })
 * ```
 *
 * Estados no CSS: hover (borda aqua), marcado, foco (anel no box), disabled.
 * `className` vai no <label>; `style`, `attrs` e `on` vão no <input>.
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   label?: Child,
 *   radio?: boolean,
 *   disabled?: boolean,
 *   checked?: boolean,
 *   name?: string,
 *   value?: string,
 * }} CheckboxProps
 */

/**
 * @param {CheckboxProps} props
 * @returns {HTMLLabelElement}
 */
export function Checkbox({ label, radio = false, disabled = false, checked = false, name, value, className, ...inputCommon }) {
  const input = h('input', {
    attrs: { type: radio ? 'radio' : 'checkbox', name, value },
    props: { disabled, checked },
  });
  applyCommon(input, inputCommon);
  return h('label', { className: cx('ic-check', radio && 'is-radio', disabled && 'is-disabled', className) },
    input,
    h('span', { className: 'ic-check__box' }, Icon({ name: radio ? 'circle' : 'check' })),
    label && h('span', {}, label));
}
