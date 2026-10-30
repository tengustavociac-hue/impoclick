// @ts-check
/**
 * Switch — alternador em pílula de 44×26 para configurações que valem na hora
 * (sem botão Salvar).
 *
 * ```js
 * Switch({ label: 'Avisar quando o contêiner atracar', checked: true })
 * ```
 *
 * Se a mudança precisa de confirmação, use Checkbox dentro de um formulário.
 * `className` vai no <label>; `style`, `attrs` e `on` vão no <input>.
 */
import { h, cx, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   label?: Child,
 *   disabled?: boolean,
 *   checked?: boolean,
 *   name?: string,
 * }} SwitchProps
 */

/**
 * @param {SwitchProps} props
 * @returns {HTMLLabelElement}
 */
export function Switch({ label, disabled = false, checked = false, name, className, ...inputCommon }) {
  const input = h('input', { attrs: { type: 'checkbox', role: 'switch', name }, props: { disabled, checked } });
  applyCommon(input, inputCommon);
  return h('label', { className: cx('ic-switch', disabled && 'is-disabled', className) },
    input,
    h('span', { className: 'ic-switch__track' }, h('span', { className: 'ic-switch__thumb' })),
    label && h('span', {}, label));
}
