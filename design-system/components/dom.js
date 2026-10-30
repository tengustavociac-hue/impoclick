// @ts-check
// Montagem de DOM compartilhada pelos componentes do design system.
//
// Os componentes do export do Claude Design eram React. Este projeto não tem
// React nem etapa de build no site: é HTML + JS servido direto pela Vercel. Por
// isso cada componente virou uma função que devolve um HTMLElement com as MESMAS
// classes `ic-*` do original. Variantes e estados (hover, active, focus,
// disabled, selecionado) moram no CSS, então sobrevivem intactos ao porte.
//
// Este arquivo é interno: não é exportado por components/index.js.

/** @typedef {Node | string | number | boolean | null | undefined} ChildAtom */
/** @typedef {ChildAtom | ReadonlyArray<Child>} Child */

/**
 * Estilo inline. Só strings: número cru viraria px implícito e driblaria o lint
 * que proíbe valor fixo. Use `var(--token)`.
 * @typedef {Readonly<Record<string, string>>} StyleProps
 */

/** @typedef {Readonly<Record<string, string | number | boolean | null | undefined>>} AttrProps */

/** @typedef {Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>} EventProps */

/**
 * Props aceitas por todo componente — o equivalente ao `...rest` do React.
 * @typedef {Object} CommonProps
 * @property {string} [className] Classes extras, somadas às do componente.
 * @property {string} [id]
 * @property {StyleProps} [style] Propriedades CSS em camelCase ou `--custom`.
 * @property {AttrProps} [attrs] Atributos HTML/ARIA extras (`title`, `data-*`, `aria-*`…).
 * @property {EventProps} [on] Ouvintes de evento, ex.: `{ click: fn }`.
 */

/**
 * @typedef {Object} ElementProps
 * @property {string} [className]
 * @property {StyleProps} [style]
 * @property {AttrProps} [attrs]
 * @property {EventProps} [on]
 * @property {Readonly<Record<string, unknown>>} [props] Propriedades DOM (value, checked…).
 */

/**
 * Junta nomes de classe ignorando valores falsos.
 * @param {...(string | false | null | undefined)} parts
 * @returns {string}
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * @param {HTMLElement} el
 * @param {StyleProps | undefined} style
 */
function applyStyle(el, style) {
  if (!style) return;
  for (const [key, value] of Object.entries(style)) {
    if (key.includes('-')) el.style.setProperty(key, value);
    else /** @type {Record<string, string>} */ (/** @type {unknown} */ (el.style))[key] = value;
  }
}

/**
 * @param {Element} el
 * @param {AttrProps | undefined} attrs
 */
function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
}

/**
 * @param {EventTarget} el
 * @param {EventProps | undefined} on
 */
function applyEvents(el, on) {
  if (!on) return;
  for (const [type, handler] of Object.entries(on)) {
    if (typeof handler === 'function') el.addEventListener(type, /** @type {EventListener} */ (handler));
  }
}

/**
 * @param {Node} parent
 * @param {ReadonlyArray<Child>} children
 */
export function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * Cria um elemento. `h('span', { className: 'x' }, 'texto')`.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ElementProps} [options]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, options = {}, ...children) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  applyStyle(el, options.style);
  applyAttrs(el, options.attrs);
  applyEvents(el, options.on);
  if (options.props) Object.assign(el, options.props);
  append(el, children);
  return el;
}

/**
 * Aplica as props comuns (className extra, id, style, attrs, on) num elemento já
 * montado pelo componente. As classes do componente vêm antes das do chamador,
 * como no original (`['ic-btn', …, className]`).
 * @template {HTMLElement} E
 * @param {E} el
 * @param {CommonProps} common
 * @returns {E}
 */
export function applyCommon(el, { className, id, style, attrs, on }) {
  if (className) el.className = cx(el.className, className);
  if (id) el.id = id;
  applyStyle(el, style);
  applyAttrs(el, attrs);
  applyEvents(el, on);
  return el;
}

/**
 * Normaliza opções que aceitam string ou objeto `{ value, label }`.
 * @template {{ value: string, label: string }} T
 * @param {string | T} option
 * @returns {{ value: string, label: string, raw: T | null }}
 */
export function normalizeOption(option) {
  return typeof option === 'string'
    ? { value: option, label: option, raw: null }
    : { value: option.value, label: option.label, raw: option };
}

/**
 * Id previsível derivado do rótulo, como no original (`'ic-' + label`). Rótulo
 * que não é texto cai no nome do campo.
 * @param {string | undefined} id
 * @param {Child} label
 * @param {string} fallback
 * @returns {string}
 */
export function fieldId(id, label, fallback) {
  if (id) return id;
  const text = typeof label === 'string' || typeof label === 'number' ? String(label) : fallback;
  return 'ic-' + text.toLowerCase().replace(/\s+/g, '-');
}
