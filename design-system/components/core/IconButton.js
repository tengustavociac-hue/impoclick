// @ts-check
/**
 * IconButton — controle circular só com ícone: o botão utilitário da marca
 * (buscar, filtrar, avisos, "abrir" em cards).
 *
 * ```js
 * IconButton({ icon: 'search', label: 'Buscar' })
 * IconButton({ icon: 'arrow_outward', label: 'Abrir', variant: 'bare', size: 'sm' })
 * ```
 *
 * Sempre circular, nunca quadrado. `accent` fica reservado ao atalho mais
 * importante de uma barra de ferramentas.
 */
import { h, cx, applyCommon } from '../dom.js';
import { Icon } from './Icon.js';

/** @import { CommonProps } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   icon: string,
 *   label: string,
 *   size?: 'sm' | 'md' | 'lg',
 *   variant?: 'default' | 'accent' | 'bare',
 *   disabled?: boolean,
 * }} IconButtonProps
 * `label` é obrigatório: vira o aria-label, porque o botão não tem texto visível.
 * `default` = círculo com filete · `accent` = aqua cheio · `bare` = sem borda nem fundo.
 */

/**
 * @param {IconButtonProps} props
 * @returns {HTMLButtonElement}
 */
export function IconButton({ icon, label, size = 'md', variant = 'default', disabled = false, ...common }) {
  const el = h('button', {
    className: cx('ic-iconbtn', 'is-' + size, variant !== 'default' && 'is-' + variant),
    attrs: { type: 'button', 'aria-label': label },
    props: { disabled },
  }, Icon({ name: icon }));
  return applyCommon(el, common);
}
