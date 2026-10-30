// @ts-check
/**
 * Toast — confirmação passageira na superfície invertida mar profundo,
 * no canto inferior esquerdo, sumindo depois de ~5s.
 *
 * ```js
 * Toast({ tone: 'success', actionLabel: 'Desfazer', onAction: undo, children: 'Importação IMP-2481 arquivada.' })
 * ```
 *
 * O posicionamento e o tempo de vida ficam com quem mostra o toast; o componente
 * desenha só a pílula.
 */
import { h, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

const TOAST_ICONS = { info: 'info', success: 'check_circle', danger: 'error' };

/**
 * @typedef {CommonProps & {
 *   tone?: 'info' | 'success' | 'danger',
 *   children?: Child,
 *   actionLabel?: Child,
 *   onAction?: () => void,
 * }} ToastProps
 * `actionLabel`: uma ação curta, ex. "Desfazer".
 */

/**
 * @param {ToastProps} props
 * @returns {HTMLDivElement}
 */
export function Toast({ tone = 'info', children, actionLabel, onAction, ...common }) {
  const el = h('div', { className: 'ic-toast', attrs: { role: 'status' } },
    Icon({ name: TOAST_ICONS[tone], className: 'ic-toast__icon is-' + tone, filled: true }),
    h('span', {}, children),
    actionLabel && h('button', {
      className: 'ic-toast__action',
      attrs: { type: 'button' },
      on: { click: () => { if (onAction) onAction(); } },
    }, actionLabel));
  return applyCommon(el, common);
}
