// @ts-check
/**
 * Avatar — marca circular de pessoa ou empresa, com iniciais quando não há foto.
 * AvatarGroup — sobrepõe avatares.
 *
 * ```js
 * Avatar({ name: 'Rafael Lima', size: 'sm' })
 * AvatarGroup({ children: [Avatar({ name: 'A B', size: 'xs' }), Avatar({ name: 'C D', size: 'xs' })] })
 * ```
 *
 * Grupos sobrepostos recuam −8px e ganham um anel de 2px na cor da superfície.
 */
import { h, cx, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   src?: string,
 *   name?: string,
 *   size?: 'xs' | 'sm' | 'md' | 'lg',
 *   accent?: boolean,
 * }} AvatarProps
 * Sem `src`, mostra até duas iniciais de `name`.
 */

/**
 * @param {AvatarProps} props
 * @returns {HTMLSpanElement}
 */
export function Avatar({ src, name = '', size = 'md', accent = false, ...common }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  const el = h('span', {
    className: cx('ic-avatar', 'is-' + size, accent && 'is-accent'),
    attrs: { title: name || undefined },
  }, src ? h('img', { attrs: { src, alt: name } }) : initials);
  return applyCommon(el, common);
}

/**
 * @typedef {CommonProps & { children?: Child }} AvatarGroupProps
 */

/**
 * @param {AvatarGroupProps} props
 * @returns {HTMLSpanElement}
 */
export function AvatarGroup({ children, ...common }) {
  return applyCommon(h('span', { className: 'ic-avatar-group' }, children), common);
}
