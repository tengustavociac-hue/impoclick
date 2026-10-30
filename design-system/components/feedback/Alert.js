// @ts-check
/**
 * Alert — mensagem em linha, ligada ao conteúdo em volta. Fundo tingido, sem
 * borda, raio de 14px.
 *
 * ```js
 * Alert({ tone: 'warning', title: 'DI pendente', children: 'Envie a fatura comercial até 22/04 para evitar armazenagem.' })
 * ```
 *
 * Alert fica na página; Toast some. Nunca empilhe mais de dois Alerts.
 */
import { h, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';
import { IconButton } from '../core/IconButton.js';

/** @import { CommonProps, Child } from '../dom.js' */

const ALERT_ICONS = { info: 'info', success: 'check_circle', warning: 'warning', danger: 'error' };

/**
 * @typedef {CommonProps & {
 *   tone?: 'info' | 'success' | 'warning' | 'danger',
 *   title?: Child,
 *   children?: Child,
 *   icon?: string,
 *   onDismiss?: () => void,
 * }} AlertProps
 * `icon`: substitui o glifo padrão do tom.
 */

/**
 * @param {AlertProps} props
 * @returns {HTMLDivElement}
 */
export function Alert({ tone = 'info', title, children, icon, onDismiss, ...common }) {
  const el = h('div', { className: 'ic-alert is-' + tone, attrs: { role: 'status' } },
    Icon({ name: icon || ALERT_ICONS[tone] }),
    h('div', {},
      title && h('div', { className: 'ic-alert__title' }, title),
      children && h('div', { className: 'ic-alert__body' }, children)),
    onDismiss && IconButton({
      className: 'ic-alert__close', icon: 'close', label: 'Fechar', variant: 'bare', size: 'sm',
      on: { click: () => onDismiss() },
    }));
  return applyCommon(el, common);
}
