// @ts-check
/**
 * Icon — um glifo Material Symbols Rounded. É o único primitivo de ícone do
 * sistema: nunca desenhe SVG à mão.
 *
 * ```js
 * Icon({ name: 'local_shipping', size: 20 })
 * Icon({ name: 'check_circle', filled: true })
 * ```
 *
 * - Peso padrão 300 (fino, arredondado), para casar com a linha leve da marca.
 * - `filled` troca para FILL 1 / peso 400 — só para o item *ativo* da SideNav e
 *   glifos de confirmação de status.
 * - Dentro de Button / IconButton / SideNav o tamanho é herdado; use `size` só
 *   em glifo avulso.
 */
import { h, cx, applyCommon } from '../dom.js';

/** @import { CommonProps } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   name: string,
 *   size?: number | string,
 *   filled?: boolean,
 * }} IconProps
 * `name`: ligadura Material Symbols, ex. "local_shipping", "bolt", "arrow_outward".
 * `size`: px (número) ou qualquer medida CSS. Sem ele, herda o font-size do pai.
 */

/**
 * @param {IconProps} props
 * @returns {HTMLSpanElement}
 */
export function Icon({ name, size, filled = false, ...common }) {
  const el = h('span', { className: cx('ic-icon', filled && 'is-filled'), attrs: { 'aria-hidden': 'true' } }, name);
  if (size != null) el.style.fontSize = typeof size === 'number' ? size + 'px' : size;
  return applyCommon(el, common);
}
