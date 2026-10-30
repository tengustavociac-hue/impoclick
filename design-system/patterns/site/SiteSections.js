// @ts-check
/**
 * Seções de topo do site institucional:
 * - Eyebrow — pílula aqua-soft com ponto, acima de títulos de seção.
 * - Section — faixa com o ritmo vertical de seção e o contêiner de 1240px.
 * - SiteHeader — barra fixa de 72px, translúcida e desfocada.
 * - Hero — título central com brilho radial e prévia do produto montada com
 *   componentes reais (não é screenshot).
 * - LogoStrip — faixa "Operando com".
 *
 * Porte de `ui_kits/site/SiteSections.jsx`. O brilho do hero (aqua ≤26%,
 * laranja ≤14%) é o ÚNICO gradiente permitido na marca.
 */
import { Button, Badge, Card, Stat, Timeline, h, cx } from '../../components/index.js';
import { LOGO_URL } from '../app/AppShell.js';

/** @import { Child } from '../../components/dom.js' */

/**
 * @param {{ children?: Child }} props
 * @returns {HTMLSpanElement}
 */
export function Eyebrow({ children }) {
  return h('span', { className: 'ic-p-eyebrow' }, h('span', { className: 'ic-p-eyebrow__dot' }), children);
}

/**
 * @param {{ children?: Child, className?: string }} props
 * @returns {HTMLElement}
 */
export function Section({ children, className }) {
  return h('section', { className: cx('ic-p-section', className) }, h('div', { className: 'ic-p-container' }, children));
}

/**
 * @param {{ onEnter?: () => void }} props
 * @returns {HTMLElement}
 */
export function SiteHeader({ onEnter }) {
  return h('header', { className: 'ic-p-siteheader' },
    h('div', { className: 'ic-p-siteheader__inner' },
      h('a', { className: 'ic-p-brand', attrs: { href: '#' } },
        h('img', { className: 'ic-p-brand__logo', attrs: { src: LOGO_URL, alt: '' } }),
        h('span', { className: 'ic-p-brand__name' }, 'Impoclick')),
      h('nav', { className: 'ic-p-siteheader__nav' },
        ['Plataforma', 'Como funciona', 'Preços', 'Casos'].map((l) => h('a', { attrs: { href: '#' } }, l))),
      h('div', { className: 'ic-p-siteheader__actions' },
        Button({ variant: 'ghost', size: 'sm', children: 'Entrar' }),
        Button({ variant: 'primary', size: 'sm', iconRight: 'arrow_outward', children: 'Abrir demonstração', on: { click: () => onEnter && onEnter() } }))));
}

/**
 * @param {{ onEnter?: () => void }} props
 * @returns {HTMLElement}
 */
export function Hero({ onEnter }) {
  return h('section', { className: 'ic-p-hero' },
    h('div', { className: 'ic-p-hero__glow ic-p-hero__glow--aqua' }),
    h('div', { className: 'ic-p-hero__glow ic-p-hero__glow--orange' }),
    h('div', { className: 'ic-p-hero__inner' },
      Eyebrow({ children: 'Importação da China, ponta a ponta' }),
      h('h1', { className: 'ic-p-hero__title' }, 'Todo o seu processo de importação ', h('span', { className: 'ic-p-accent-text' }, 'em um clique')),
      h('p', { className: 'ic-p-hero__lead' },
        'Cotação, fornecedor, embarque, desembaraço e custo desembarcado no mesmo painel. Você vê onde a carga está e quanto ela custa — antes de ela chegar.'),
      h('div', { className: 'ic-p-hero__cta' },
        Button({ variant: 'primary', size: 'lg', iconRight: 'arrow_outward', children: 'Abrir demonstração', on: { click: () => onEnter && onEnter() } }),
        Button({ variant: 'outline', size: 'lg', iconLeft: 'play_circle', children: 'Ver em 2 minutos' })),
      h('p', { className: 'ic-p-hero__fineprint' }, 'Sem cartão. Primeiro contêiner acompanhado grátis.'),

      h('div', { className: 'ic-p-browser' },
        h('div', { className: 'ic-p-browser__bar' },
          h('span', { className: 'ic-p-browser__dot' }), h('span', { className: 'ic-p-browser__dot' }), h('span', { className: 'ic-p-browser__dot' }),
          h('span', { className: 'ic-mono ic-p-browser__url' }, 'app.impoclick.com.br/painel')),
        h('div', { className: 'ic-p-browser__body' },
          Card({ variant: 'accent', eyebrow: 'Valor em trânsito', compact: true, children: Stat({ prefix: 'US$', value: '1.284.600', fraction: ',00', delta: '+12,4%', deltaNote: 'vs. mês anterior', size: 'sm' }) }),
          Card({ eyebrow: 'IMP-2481', title: 'Shenzhen → Santos', compact: true, children: Timeline({ steps: [
            { title: 'Embarcado', date: '07 abr', state: 'done', icon: 'directions_boat' },
            { title: 'Em trânsito', date: 'prev. 29 abr', state: 'current', icon: 'public' },
            { title: 'Desembaraço', state: 'todo', icon: 'gavel' },
          ] }) }),
          Card({ eyebrow: 'Status da frota', compact: true, children: h('div', { className: 'ic-p-stack ic-p-stack--tight ic-p-mt1' },
            Badge({ tone: 'accent', dot: true, children: '12 em trânsito' }),
            Badge({ tone: 'warning', dot: true, children: '4 aguardando DI' }),
            Badge({ tone: 'success', dot: true, children: '2 entregues esta semana' }),
            Badge({ tone: 'danger', dot: true, children: '1 retido' })) })))));
}

/**
 * @returns {HTMLDivElement}
 */
export function LogoStrip() {
  return h('div', { className: 'ic-p-logostrip' },
    h('div', { className: 'ic-p-logostrip__inner' },
      h('span', { className: 'ic-p-logostrip__label' }, 'Operando com'),
      ['MSC', 'Maersk', 'COSCO', 'Hapag-Lloyd', 'CMA CGM', 'Receita Federal'].map((n) => h('span', { className: 'ic-p-logostrip__name' }, n))));
}
