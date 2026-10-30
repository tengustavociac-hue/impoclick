// @ts-check
/**
 * Input — campo de texto com rótulo, 44px de altura, raio de 10px. Hover leva a
 * borda para aqua; foco acrescenta o anel aqua de 3px.
 *
 * ```js
 * Input({ label: 'Número do contêiner', placeholder: 'MSKU 000 000-0', icon: 'inventory_2', required: true })
 * Input({ label: 'Observações', multiline: true, hint: 'Visível apenas para a sua equipe' })
 * ```
 *
 * Use `pill` só na busca de uma barra de ferramentas; formulário usa o raio de
 * campo. Estado de erro: passe `error` (substitui o hint e deixa a borda vermelha).
 * Disabled: `disabled: true`.
 *
 * Como no original, `className` vai no invólucro `.ic-field`; `style`, `attrs`
 * e `on` vão no próprio <input>/<textarea>, que é onde ficam os eventos.
 */
import { h, cx, applyCommon, fieldId } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   label?: Child,
 *   hint?: Child,
 *   error?: Child,
 *   icon?: string,
 *   required?: boolean,
 *   pill?: boolean,
 *   multiline?: boolean,
 *   type?: string,
 *   name?: string,
 *   placeholder?: string,
 *   value?: string,
 *   disabled?: boolean,
 *   readOnly?: boolean,
 * }} InputProps
 */

/**
 * @param {InputProps} props
 * @returns {HTMLDivElement}
 */
export function Input({
  label, hint, error, icon, required = false, pill = false, multiline = false,
  id, className, type, name, placeholder, value, disabled = false, readOnly = false, ...fieldCommon
}) {
  const controlId = fieldId(id, label, 'input');
  const controlClass = cx('ic-input', pill && 'is-pill', Boolean(error) && 'is-invalid');
  // `required` só desenha o asterisco, como no original: não liga a validação nativa.
  const attrs = { id: controlId, name, placeholder };
  const control = multiline
    ? h('textarea', { className: controlClass, attrs, props: { disabled, readOnly } })
    : h('input', { className: controlClass, attrs: { ...attrs, type }, props: { disabled, readOnly } });
  if (value != null) control.value = value;
  applyCommon(control, fieldCommon);

  return h('div', { className: cx('ic-field', className) },
    label && h('label', { className: 'ic-label', attrs: { for: controlId } },
      label, required && h('span', { className: 'ic-label__req' }, '*')),
    h('div', { className: cx('ic-inputwrap', icon && 'has-icon') },
      icon && Icon({ name: icon }),
      control),
    (error || hint) && h('span', { className: 'ic-hint' + (error ? ' is-error' : '') }, error || hint));
}
