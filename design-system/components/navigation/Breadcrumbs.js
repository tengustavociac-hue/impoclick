// @ts-check
/**
 * Breadcrumbs — trilha para telas de detalhe (uma importação, um fornecedor,
 * uma fatura).
 *
 * ```js
 * Breadcrumbs({ items: [{ label: 'Importações', href: '#' }, { label: 'IMP-2481' }] })
 * ```
 *
 * O último item é sempre a página atual.
 */
import { h, applyCommon } from '../dom.js';
import { Icon } from '../core/Icon.js';

/** @import { CommonProps } from '../dom.js' */

/** @typedef {{ label: string, href?: string }} Crumb */

/**
 * @typedef {CommonProps & {
 *   items: ReadonlyArray<string | Crumb>,
 * }} BreadcrumbsProps
 */

/**
 * @param {BreadcrumbsProps} props
 * @returns {HTMLElement}
 */
export function Breadcrumbs({ items = [], ...common }) {
  const nodes = items.map((it, i) => {
    const last = i === items.length - 1;
    const text = typeof it === 'string' ? it : it.label;
    const href = typeof it === 'string' ? undefined : it.href;
    return [
      last ? h('span', { className: 'ic-crumbs__current' }, text) : h('a', { attrs: { href: href || '#' } }, text),
      !last && Icon({ name: 'chevron_right', className: 'ic-crumbs__sep' }),
    ];
  });
  return applyCommon(h('nav', { className: 'ic-crumbs', attrs: { 'aria-label': 'Breadcrumb' } }, nodes), common);
}
