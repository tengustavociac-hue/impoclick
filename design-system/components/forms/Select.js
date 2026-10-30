// @ts-check
/**
 * Select — <select> nativo com a pele de campo da Impoclick e o chevron
 * Material `expand_more`.
 *
 * ```js
 * Select({ label: 'Modal de transporte', options: ['Marítimo', 'Aéreo', 'Rodoviário'] })
 * ```
 *
 * Mesmos estados do Input: hover aqua, foco com anel, `error`, `disabled`.
 * `className` vai no invólucro; `style`, `attrs` e `on` vão no <select>.
 */
import { h, cx, applyCommon, fieldId, normalizeOption } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/** @typedef {{ value: string, label: string }} SelectOption */

/**
 * @typedef {CommonProps & {
 *   label?: Child,
 *   hint?: Child,
 *   error?: Child,
 *   options?: ReadonlyArray<string | SelectOption>,
 *   required?: boolean,
 *   name?: string,
 *   value?: string,
 *   disabled?: boolean,
 *   children?: Child,
 * }} SelectProps
 * `options`: strings ou pares {value,label}. Ignorado quando `children` (elementos <option>) é passado.
 */

/**
 * @param {SelectProps} props
 * @returns {HTMLDivElement}
 */
export function Select({
  label, hint, error, options = [], required = false, id, className,
  name, value, disabled = false, children, ...selectCommon
}) {
  const controlId = fieldId(id, label, 'select');
  const optionNodes = children || options.map((o) => {
    const opt = normalizeOption(o);
    return h('option', { attrs: { value: opt.value } }, opt.label);
  });
  const select = h('select', {
    className: 'ic-select',
    attrs: { id: controlId, name },
    props: { disabled },
  }, optionNodes);
  if (value != null) select.value = value;
  applyCommon(select, selectCommon);

  return h('div', { className: cx('ic-field', className) },
    label && h('label', { className: 'ic-label', attrs: { for: controlId } },
      label, required && h('span', { className: 'ic-label__req' }, '*')),
    h('div', { className: 'ic-selectwrap' }, select, Icon({ name: 'expand_more' })),
    (error || hint) && h('span', { className: 'ic-hint' + (error ? ' is-error' : '') }, error || hint));
}
