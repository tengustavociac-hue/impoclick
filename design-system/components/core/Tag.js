// @ts-check
/**
 * Tag — chip do usuário, removível: filtros ativos, fornecedores escolhidos, NCMs.
 *
 * ```js
 * Tag({ onRemove: () => drop('china'), children: 'Origem: China' })
 * Tag({ children: 'Marítimo' })
 * ```
 *
 * Tag é entrada editável; Badge é status somente leitura. Não troque um pelo outro.
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from './Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   children?: Child,
 *   onRemove?: () => void,
 * }} TagProps
 * Passe `onRemove` para desenhar o "x"; sem ele, a tag é estática.
 */

/**
 * @param {TagProps} props
 * @returns {HTMLSpanElement}
 */
export function Tag({ children, onRemove, ...common }) {
  const el = h('span', { className: cx('ic-tag', !onRemove && 'is-plain') },
    children,
    onRemove && h('button', {
      className: 'ic-tag__x',
      attrs: { type: 'button', 'aria-label': 'Remover' },
      on: { click: () => onRemove() },
    }, Icon({ name: 'close' })));
  return applyCommon(el, common);
}
