// @ts-check
/**
 * Button — o controle de ação em pílula. Exatamente UM `primary` por tela; o
 * resto é `outline` ou `ghost`.
 *
 * ```js
 * Button({ variant: 'primary', iconRight: 'arrow_outward', children: 'Nova importação' })
 * Button({ variant: 'outline', iconLeft: 'download', children: 'Exportar' })
 * Button({ variant: 'ghost', size: 'sm', children: 'Cancelar' })
 * ```
 *
 * Variantes: `primary` (aqua), `secondary` (laranja cargo — só CTA de marketing),
 * `outline`, `ghost`, `danger`. Tamanhos: `sm` 34px · `md` 42px · `lg` 52px.
 * Estados no CSS: hover, active (scale .975, nunca flash de cor), focus
 * (anel aqua de 3px) e disabled (atributo `disabled` ou classe `is-disabled`).
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from './Icon.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   children?: Child,
 *   variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
 *   size?: 'sm' | 'md' | 'lg',
 *   iconLeft?: string,
 *   iconRight?: string,
 *   block?: boolean,
 *   disabled?: boolean,
 *   as?: 'button' | 'a',
 *   href?: string,
 * }} ButtonProps
 * `iconRight`: use "arrow_outward" em CTA de navegação. `as: 'a'` quando o botão navega.
 */

/**
 * @param {ButtonProps} props
 * @returns {HTMLButtonElement | HTMLAnchorElement}
 */
export function Button({
  children, variant = 'primary', size = 'md', iconLeft, iconRight,
  block = false, disabled = false, as = 'button', href, ...common
}) {
  const className = cx('ic-btn', 'is-' + variant, 'is-' + size, block && 'is-block');
  const content = [iconLeft && Icon({ name: iconLeft }), children, iconRight && Icon({ name: iconRight })];
  if (as === 'a') {
    // Âncora não tem `disabled`; o original só repassava o atributo para <button>.
    return applyCommon(h('a', { className, attrs: { href } }, content), common);
  }
  return applyCommon(h('button', { className, props: { disabled } }, content), common);
}
