// @ts-check
/**
 * Template "Página institucional" — landing completa: cabeçalho fixo, hero com
 * prévia do produto, faixa de logos, recursos, como funciona, números,
 * depoimento, CTA e rodapé.
 *
 * Substitui dois originais do export: `ui_kits/site/index.html` (versão
 * completa, que venceu) e `templates/site/Site.dc.html` (versão reduzida: 3 dos
 * 6 recursos, sem prévia do produto, sem números, depoimento nem rodapé).
 *
 *   import { mountSite } from './templates/site.js';
 *   mountSite(document.getElementById('root'), { onEnter: () => location.assign('painel.html') });
 */
import {
  SiteHeader, Hero, LogoStrip, Features, HowItWorks, Numbers, Testimonial, CTA, SiteFooter,
} from '../patterns/index.js';

/**
 * @param {HTMLElement} root
 * @param {{ onEnter?: () => void }} [options]
 */
export function mountSite(root, options = {}) {
  const onEnter = options.onEnter;
  root.replaceChildren(
    SiteHeader({ onEnter }),
    Hero({ onEnter }),
    LogoStrip(),
    Features(),
    HowItWorks(),
    Numbers(),
    Testimonial(),
    CTA({ onEnter }),
    SiteFooter());
}
