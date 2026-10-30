// @ts-check
/**
 * Template "Painel do importador" — o app clicável completo: AppShell com
 * rotas entre as cinco telas e a troca claro/escuro.
 *
 * Substitui dois originais do export: `ui_kits/app/index.html` (versão completa,
 * que venceu) e `templates/painel/Painel.dc.html` (versão reduzida da mesma tela,
 * com menos itens de navegação e sem troca de tema). Ver DESIGN.md.
 *
 *   import { mountPainel } from './templates/painel.js';
 *   mountPainel(document.getElementById('root'));
 */
import {
  AppShell, DashboardScreen, ImportsScreen, ShipmentScreen, QuoteScreen, CostsScreen,
} from '../patterns/index.js';

/** @import { Route, Theme } from '../patterns/app/AppShell.js' */

/**
 * @param {HTMLElement} root
 * @param {{ route?: Route, theme?: Theme }} [initial]
 */
export function mountPainel(root, initial = {}) {
  /** @type {Route} */
  let route = initial.route || 'painel';
  /** @type {Theme} */
  let theme = initial.theme || 'light';

  /** @param {Route} next */
  const setRoute = (next) => { route = next; render(); };
  /** @param {Theme} next */
  const setTheme = (next) => { theme = next; render(); };

  /** @returns {HTMLElement} */
  function screen() {
    switch (route) {
      case 'importacoes':
      case 'fornecedores': return ImportsScreen({ setRoute });
      case 'embarque':
      case 'docs': return ShipmentScreen({ setRoute: (r) => setRoute(/** @type {Route} */ (r)) });
      case 'cotacao': return QuoteScreen();
      case 'custos': return CostsScreen();
      default: return DashboardScreen({ setRoute });
    }
  }

  function render() {
    document.documentElement.setAttribute('data-theme', theme);
    root.replaceChildren(AppShell({ route, setRoute, theme, setTheme, children: screen() }));
  }

  render();
}
