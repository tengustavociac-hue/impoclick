// @ts-check
/**
 * Corpo do site institucional:
 * - Features — 6 cards interativos.
 * - HowItWorks — texto + Timeline.
 * - Numbers — 4 cards `flat` com Stat.
 * - Testimonial — card invertido mar profundo.
 * - CTA — card aqua com captura de e-mail e o botão laranja `secondary`
 *   (marketing é a única superfície onde o laranja pode ser botão).
 * - SiteFooter.
 *
 * Porte de `ui_kits/site/SiteBody.jsx`. O depoimento usava branco fixo; aqui usa
 * os tokens remapeados pelo card `invert`, legíveis nos dois temas.
 */
import { Button, Card, Stat, Icon, Input, Timeline, Avatar, h } from '../../components/index.js';
import { Eyebrow, Section } from './SiteSections.js';
import { LOGO_URL } from '../app/AppShell.js';

const siteFeatures = [
  { icon: 'radar', title: 'Rastreio em tempo real', body: 'Posição do navio, ETA recalculada e alerta quando o contêiner atraca — sem abrir o site da armadora.' },
  { icon: 'calculate', title: 'Custo desembarcado', body: 'II, IPI, PIS, COFINS, ICMS, frete e armazenagem calculados por NCM antes de você fechar o pedido.' },
  { icon: 'description', title: 'Documentos num lugar só', body: 'Invoice, packing list, BL e certificados anexados ao processo e compartilhados com o despachante.' },
  { icon: 'factory', title: 'Histórico por fornecedor', body: 'Prazo médio, índice de avaria e divergências de NCM de cada fábrica com quem você já trabalhou.' },
  { icon: 'notifications_active', title: 'Alertas que evitam custo', body: 'Avisos de vencimento de DI e de free time para você não pagar armazenagem por esquecimento.' },
  { icon: 'group', title: 'Time e despachante juntos', body: 'Comentários e aprovações no próprio processo. Ninguém mais procura o anexo no WhatsApp.' },
];

/** @returns {HTMLElement} */
export function Features() {
  return Section({ children: [
    h('div', { className: 'ic-p-sectionhead' },
      Eyebrow({ children: 'Plataforma' }),
      h('h2', { className: 'ic-p-h2' }, 'Seis planilhas, três grupos de WhatsApp e um despachante — substituídos por uma tela.')),
    h('div', { className: 'ic-p-grid ic-p-grid--300' }, siteFeatures.map((f) => Card({
      interactive: true,
      children: [
        h('span', { className: 'ic-p-featureicon' }, Icon({ name: f.icon, size: 24 })),
        h('h3', { className: 'ic-p-h3' }, f.title),
        h('p', { className: 'ic-p-body-muted' }, f.body),
      ],
    }))),
  ] });
}

/** @returns {HTMLElement} */
export function HowItWorks() {
  return Section({ className: 'ic-p-section--band', children: h('div', { className: 'ic-p-split ic-p-split--how' },
    h('div', {},
      Eyebrow({ children: 'Como funciona' }),
      h('h2', { className: 'ic-p-h2 ic-p-h2--spaced' }, 'Do pedido à sua porta, com quatro paradas visíveis.'),
      h('p', { className: 'ic-p-lead' }, 'Você cadastra a cotação uma vez. A partir daí a Impoclick puxa o status da armadora, calcula o custo e avisa o seu time a cada etapa.'),
      Button({ variant: 'primary', iconRight: 'arrow_outward', children: 'Começar uma cotação' })),
    Card({ children: Timeline({ steps: [
      { title: 'Cote com 3 agentes', date: 'dia 0', meta: 'Modal, incoterm e NCM em um formulário', state: 'done', icon: 'request_quote' },
      { title: 'Feche com o fornecedor', date: 'dia 4', meta: 'Documentos anexados ao processo', state: 'done', icon: 'handshake' },
      { title: 'Acompanhe o trajeto', date: 'dia 7–39', meta: 'Posição e ETA atualizadas todo dia', state: 'current', icon: 'directions_boat' },
      { title: 'Receba com o custo fechado', date: 'dia 42', meta: 'Custo desembarcado por item', state: 'todo', icon: 'local_shipping' },
    ] }) })) });
}

/** @returns {HTMLElement} */
export function Numbers() {
  return Section({ children: h('div', { className: 'ic-p-grid ic-p-grid--250' },
    Card({ variant: 'flat', children: Stat({ label: 'Contêineres acompanhados', value: '12.480', delta: '+31%', deltaNote: 'em 2026', size: 'sm' }) }),
    Card({ variant: 'flat', children: Stat({ label: 'Economia média em armazenagem', prefix: 'R$', value: '14.200', size: 'sm' }) }),
    Card({ variant: 'flat', children: Stat({ label: 'Dias a menos no desembaraço', value: '3,4', suffix: 'dias', size: 'sm' }) }),
    Card({ variant: 'flat', children: Stat({ label: 'Importadores ativos', value: '640', delta: '+18%', size: 'sm' }) })) });
}

/** @returns {HTMLElement} */
export function Testimonial() {
  return Section({ className: 'ic-p-section--flush', children: Card({
    variant: 'invert', className: 'ic-p-bigcard',
    children: h('div', { className: 'ic-p-quote' },
      Icon({ name: 'format_quote', size: 40, className: 'ic-p-quote__mark' }),
      h('p', { className: 'ic-p-quote__text' },
        'Antes eu descobria a armazenagem na fatura. Agora eu recebo o aviso sete dias antes e resolvo com o despachante no mesmo dia.'),
      h('div', { className: 'ic-p-row ic-p-row--center ic-p-row--gap3' },
        Avatar({ name: 'Camila Prado', size: 'md', accent: true }),
        h('div', {},
          h('div', { className: 'ic-p-quote__who' }, 'Camila Prado'),
          h('div', { className: 'ic-p-quote__role' }, 'Head de Suprimentos · Vertta Eletro')))),
  }) });
}

/**
 * @param {{ onEnter?: () => void }} props
 * @returns {HTMLElement}
 */
export function CTA({ onEnter }) {
  return Section({ className: 'ic-p-section--flush', children: Card({
    variant: 'accent', className: 'ic-p-bigcard ic-p-center',
    children: [
      h('h2', { className: 'ic-p-h2 ic-p-cta__title' }, 'Acompanhe o seu próximo contêiner sem custo'),
      h('p', { className: 'ic-p-cta__lead' }, 'Cadastre um processo em andamento e veja o custo desembarcado em menos de dez minutos.'),
      h('div', { className: 'ic-p-cta__form' },
        h('div', { className: 'ic-p-grow-240' }, Input({ pill: true, id: 'ic-p-cta-email', placeholder: 'seu@email.com.br', icon: 'mail' })),
        Button({ variant: 'secondary', size: 'md', iconRight: 'arrow_outward', children: 'Começar', on: { click: () => onEnter && onEnter() } })),
    ],
  }) });
}

/** @returns {HTMLElement} */
export function SiteFooter() {
  const columns = /** @type {const} */ ([
    ['Produto', ['Plataforma', 'Rastreio', 'Custos', 'Integrações']],
    ['Empresa', ['Sobre', 'Carreiras', 'Contato']],
    ['Recursos', ['Central de ajuda', 'Guia de NCM', 'Status', 'Privacidade']],
  ]);
  return h('footer', { className: 'ic-p-footer' },
    h('div', { className: 'ic-p-footer__grid' },
      h('div', {},
        h('div', { className: 'ic-p-footer__brand' },
          h('img', { className: 'ic-p-footer__logo', attrs: { src: LOGO_URL, alt: '' } }),
          h('span', { className: 'ic-p-footer__name' }, 'Impoclick')),
        h('p', { className: 'ic-p-footer__about' }, 'Plataforma brasileira de gestão de importação. Do pedido ao custo desembarcado.')),
      columns.map(([title, links]) => h('div', {},
        h('div', { className: 'ic-p-microlabel' }, title),
        h('div', { className: 'ic-p-footer__links' }, links.map((l) => h('a', { attrs: { href: '#' } }, l)))))),
    h('div', { className: 'ic-p-footer__legal' },
      h('span', {}, '© 2026 Impoclick Tecnologia Ltda. · CNPJ 00.000.000/0001-00'),
      h('span', {}, 'São Paulo · Brasil')));
}
