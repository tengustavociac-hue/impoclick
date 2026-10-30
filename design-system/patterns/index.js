// @ts-check
// Padrões de composição: telas e seções montadas só com componentes da
// biblioteca. Portados dos ui_kits do export do Claude Design; os originais em
// React continuam abrindo em reference/ui-kits/ para comparação visual.
//
// O CSS de layout destes padrões fica em patterns/patterns.css.

export { AppShell, ThemeToggle, LOGO_URL } from './app/AppShell.js';
export { DashboardScreen } from './app/DashboardScreen.js';
export { ImportsScreen } from './app/ImportsScreen.js';
export { ShipmentScreen } from './app/ShipmentScreen.js';
export { QuoteScreen } from './app/QuoteScreen.js';
export { CostsScreen } from './app/CostsScreen.js';

export { Eyebrow, Section, SiteHeader, Hero, LogoStrip } from './site/SiteSections.js';
export { Features, HowItWorks, Numbers, Testimonial, CTA, SiteFooter } from './site/SiteBody.js';
