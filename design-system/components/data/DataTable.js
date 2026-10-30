// @ts-check
/**
 * DataTable — tabela de lista sem bordas: cabeçalho em micro caixa alta, filetes
 * entre linhas, hover tingido na linha. Nunca zebrada.
 *
 * ```js
 * DataTable({
 *   columns: [
 *     { key: 'ref', label: 'Referência', primary: true },
 *     { key: 'status', label: 'Status', render: (r) => Badge({ tone: r.tone, dot: true, children: r.status }) },
 *     { key: 'value', label: 'Valor FOB', align: 'right' },
 *   ],
 *   rows,
 * })
 * ```
 *
 * Estado vazio: a tabela não desenha um; quem a usa troca por EmptyState quando
 * `rows` está vazio (ver o padrão Importações).
 */
import { h, applyCommon } from '../dom.js';

/** @import { CommonProps, Child } from '../dom.js' */

/**
 * @template [Row=Record<string, unknown>]
 * @typedef {Object} DataColumn
 * @property {string} key
 * @property {Child} label
 * @property {'left' | 'right'} [align] `right` alinha à direita com algarismos tabulares: dinheiro, peso, contagem.
 * @property {boolean} [primary] Célula na cor de título e semibold — uma por linha.
 * @property {string} [width]
 * @property {(row: Row) => Child} [render]
 */

/**
 * @template [Row=Record<string, unknown>]
 * @typedef {CommonProps & {
 *   columns: ReadonlyArray<DataColumn<Row>>,
 *   rows: ReadonlyArray<Row>,
 * }} DataTableProps
 */

/**
 * @template [Row=Record<string, unknown>]
 * @param {DataTableProps<Row>} props
 * @returns {HTMLDivElement}
 */
export function DataTable({ columns = [], rows = [], ...common }) {
  const table = h('table', { className: 'ic-table' },
    h('thead', {}, h('tr', {}, columns.map((c) => {
      const th = h('th', { className: c.align === 'right' ? 'is-num' : '' }, c.label);
      if (c.width) th.style.width = c.width;
      return th;
    }))),
    h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => h('td', {
      className: [c.align === 'right' ? 'is-num' : '', c.primary ? 'is-title' : ''].filter(Boolean).join(' '),
    }, c.render ? c.render(r) : /** @type {Child} */ (/** @type {Record<string, unknown>} */ (r)[c.key])))))));
  applyCommon(table, common);
  return h('div', { style: { overflowX: 'auto', minWidth: '0', maxWidth: '100%' } }, table);
}
