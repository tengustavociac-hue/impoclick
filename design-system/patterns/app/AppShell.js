// @ts-check
/**
 * AppShell — o cromado do Painel do importador: TopBar fixa com NavPills no
 * centro, SideNav de 248px, troca claro/escuro e o card de uso do plano no
 * rodapé do trilho. ThemeToggle — o SegmentedControl claro/escuro da TopBar.
 *
 * Porte de `ui_kits/app/AppShell.jsx`. Quem monta o shell decide o que fazer em
 * `setRoute`/`setTheme` (ver templates/painel.js).
 */
import { TopBar, NavPills, SideNav, IconButton, Avatar, SegmentedControl, Icon, h } from '../../components/index.js';

/** @import { Child } from '../../components/dom.js' */

/** @typedef {'light' | 'dark'} Theme */
/** @typedef {'painel' | 'importacoes' | 'embarque' | 'cotacao' | 'custos' | 'fornecedores' | 'docs'} Route */

export const LOGO_URL = new URL('../../assets/logo-impoclick.png', import.meta.url).href;

/**
 * @param {{ theme: Theme, setTheme: (theme: Theme) => void }} props
 * @returns {HTMLDivElement}
 */
export function ThemeToggle({ theme, setTheme }) {
  return SegmentedControl({
    options: [{ value: 'light', label: 'Claro', icon: 'light_mode' }, { value: 'dark', label: 'Escuro', icon: 'dark_mode' }],
    value: theme,
    onChange: (v) => setTheme(v === 'dark' ? 'dark' : 'light'),
  });
}

/**
 * @param {{
 *   route: Route,
 *   setRoute: (route: Route) => void,
 *   theme: Theme,
 *   setTheme: (theme: Theme) => void,
 *   children?: Child,
 * }} props
 * @returns {HTMLDivElement}
 */
export function AppShell({ route, setRoute, theme, setTheme, children }) {
  const go = (/** @type {string} */ v) => setRoute(/** @type {Route} */ (v));
  return h('div', { className: 'ic-p-shell' },
    TopBar({
      brand: [h('img', { attrs: { src: LOGO_URL, alt: '' } }), 'Impoclick'],
      center: NavPills({
        items: [
          { value: 'painel', label: 'Painel' },
          { value: 'importacoes', label: 'Importações' },
          { value: 'cotacao', label: 'Cotação' },
          { value: 'custos', label: 'Custos' },
        ],
        value: route === 'embarque' ? 'importacoes' : route,
        onChange: go,
      }),
      actions: [
        ThemeToggle({ theme, setTheme }),
        IconButton({ icon: 'search', label: 'Buscar', size: 'sm' }),
        IconButton({ icon: 'notifications', label: 'Avisos', size: 'sm' }),
        Avatar({ name: 'Rafael Lima', size: 'sm' }),
      ],
    }),
    h('div', { className: 'ic-p-shell__body' },
      SideNav({
        value: route,
        onChange: go,
        items: [
          { group: 'Operação' },
          { value: 'painel', icon: 'dashboard', label: 'Painel' },
          { value: 'importacoes', icon: 'inventory_2', label: 'Importações', count: 12 },
          { value: 'embarque', icon: 'directions_boat', label: 'Rastreio' },
          { group: 'Comercial' },
          { value: 'cotacao', icon: 'request_quote', label: 'Cotação' },
          { value: 'fornecedores', icon: 'factory', label: 'Fornecedores', count: 27 },
          { group: 'Financeiro' },
          { value: 'custos', icon: 'payments', label: 'Custos' },
          { value: 'docs', icon: 'receipt_long', label: 'Documentos', count: 3 },
        ],
        footer: h('div', { className: 'ic-p-shell__plan' },
          h('div', { className: 'ic-p-shell__plancard' },
            h('div', { className: 'ic-p-shell__planname' }, Icon({ name: 'bolt', size: 18, filled: true }), 'Plano Comex Pro'),
            h('div', { className: 'ic-p-shell__plannote' }, '18 de 40 contêineres usados neste mês.'))),
      }),
      h('main', { className: 'ic-p-shell__main' }, children)));
}
