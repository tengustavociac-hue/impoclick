// @ts-check
/**
 * Card — o contêiner onde tudo mora: raio de 20px, filete e sombra bem leve.
 *
 * ```js
 * Card({
 *   eyebrow: 'Em trânsito', title: 'Contêiner MSKU 472 118-3',
 *   action: IconButton({ icon: 'arrow_outward', label: 'Abrir', variant: 'bare', size: 'sm' }),
 *   children: …,
 * })
 * ```
 *
 * Use `accent` para a única métrica de destaque de um painel — nunca dois cards
 * aqua lado a lado. `interactive` acrescenta a elevação de −2px no hover.
 * `accent` e `invert` remapeiam os tokens de texto/superfície para tudo que
 * estiver dentro, então qualquer componente continua legível ali.
 */
import { h, cx, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @typedef {CommonProps & {
 *   children?: Child,
 *   title?: Child,
 *   eyebrow?: Child,
 *   action?: Child,
 *   variant?: 'default' | 'flat' | 'accent' | 'invert',
 *   compact?: boolean,
 *   interactive?: boolean,
 * }} CardProps
 * `eyebrow`: rótulo pequeno em caixa alta acima do título. `action`: slot do canto
 * superior direito, em geral um IconButton ou SegmentedControl.
 * `flat` = sem sombra, superfície tingida · `accent` = aqua cheio · `invert` = painel mar profundo.
 */

/**
 * @param {CardProps} props
 * @returns {HTMLDivElement}
 */
export function Card({
  children, title, eyebrow, action, variant = 'default',
  compact = false, interactive = false, ...common
}) {
  const hasHead = Boolean(title || eyebrow || action);
  const el = h('div', {
    className: cx('ic-card', variant !== 'default' && 'is-' + variant, compact && 'is-compact', interactive && 'is-interactive'),
  },
  hasHead && h('div', { className: 'ic-card__head' },
    h('div', {},
      eyebrow && h('div', { className: 'ic-card__eyebrow' }, eyebrow),
      title && h('div', { className: 'ic-card__title' }, title)),
    action),
  children);
  return applyCommon(el, common);
}
