// @ts-check
/**
 * Tooltip — balão de hover/foco acima do gatilho, na superfície invertida.
 *
 * ```js
 * Tooltip({ label: 'Exportar planilha', children: IconButton({ icon: 'download', label: 'Exportar' }) })
 * ```
 *
 * Texto curto, uma linha, sem pontuação. Nunca coloque ação dentro de tooltip.
 * Aparece no hover e no foco (`:focus-within`), sem JS.
 */
import { h, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   label: Child,
 *   children?: Child,
 * }} TooltipProps
 */

/**
 * @param {TooltipProps} props
 * @returns {HTMLSpanElement}
 */
export function Tooltip({ label, children, ...common }) {
  const el = h('span', { className: 'ic-tooltip' },
    children,
    h('span', { className: 'ic-tooltip__bubble', attrs: { role: 'tooltip' } }, label));
  return applyCommon(el, common);
}
