// Confere que o DESIGN.md (fonte da verdade) e design-system/tokens/*.css dizem
// a mesma coisa.
//
//   node tools/ds-check-tokens.js
//
// Os tokens do DESIGN.md são lidos pelo exportador oficial (`designmd export
// --format dtcg`), que já resolve referências {colors.x} e normaliza cor para
// hex. Do lado do CSS, as var() são resolvidas aqui. Compara:
//   - cores do :root com as de mesmo nome; as de [data-theme="dark"] com o
//     mesmo nome + "-dark"; `primary` com --accent
//   - raios (--radius-*) e espaçamentos (--space-N → space-N, demais pelo nome)
//   - tipografia: cada tamanho, peso, entrelinha e tracking do DESIGN.md precisa
//     existir na escala do CSS, e cada família precisa ser a do --font-sans ou
//     --font-mono
// e acusa token que existe de um lado e falta do outro.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOKENS = path.join(ROOT, 'design-system', 'tokens');
const DESIGN_MD = path.join(ROOT, 'DESIGN.md');

// Fora do front matter de propósito: o formato DESIGN.md não tem tipo para eles.
const CSS_ONLY = new Set([
  '--focus-ring',     // box-shadow, não cor
  '--radius-circle',  // 50%: o formato só aceita px, em e rem
]);

const problems = [];
const fail = (msg) => problems.push(msg);

function readDesignTokens() {
  const pkgDir = path.join(ROOT, 'node_modules', '@google', 'design.md');
  const bin = path.join(pkgDir, require(path.join(pkgDir, 'package.json')).bin.designmd);
  const out = execFileSync(process.execPath, [bin, 'export', '--format', 'dtcg', DESIGN_MD], { encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('{')));
}

// Declarações `--x: valor` por seletor (':root' ou '[data-theme="dark"]').
function readCssTokens(file) {
  const css = fs.readFileSync(path.join(TOKENS, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const scopes = { root: {}, dark: {} };
  for (const [, selector, body] of css.matchAll(/(:root|\[data-theme="dark"\])\s*\{([^}]*)\}/g)) {
    const scope = selector === ':root' ? scopes.root : scopes.dark;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) scope[name] = value.trim();
  }
  return scopes;
}

function resolve(value, scope, root, depth = 0) {
  if (depth > 10) throw new Error('referência circular em ' + value);
  return value.replace(/var\((--[\w-]+)\)/g, (_, ref) => {
    const next = scope[ref] ?? root[ref];
    if (next == null) throw new Error('var() sem definição: ' + ref);
    return resolve(next, scope, root, depth + 1);
  });
}

// #rgb, #rrggbb ou rgba() → '#rrggbb' ou '#rrggbbaa', como o exportador escreve.
function toHex(color) {
  const c = color.trim().toLowerCase();
  let m;
  if ((m = c.match(/^#([0-9a-f]{3})$/))) return '#' + [...m[1]].map((x) => x + x).join('');
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if ((m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/))) {
    const hex = (n) => Math.round(Number(n)).toString(16).padStart(2, '0');
    const alpha = m[4] == null || Number(m[4]) === 1 ? '' : hex(Number(m[4]) * 255);
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]) + alpha;
  }
  return null;
}

const px = (v) => (v && v.unit === 'px' ? v.value : null);
const num = (s) => Number(String(s).replace(/(px|em)$/, ''));

function main() {
  const design = readDesignTokens();
  const colors = readCssTokens('colors.css');
  const elevation = readCssTokens('elevation.css');
  const radius = readCssTokens('radius.css').root;
  const spacing = readCssTokens('spacing.css').root;
  const type = readCssTokens('typography.css').root;

  // ---- cores ----
  const cssColors = new Map();
  const addColors = (scope, root, suffix) => {
    for (const [name, value] of Object.entries(scope)) {
      if (CSS_ONLY.has(name)) continue;
      const hex = toHex(resolve(value, scope, root));
      if (!hex) { fail(`cor não comparável no CSS: ${name}: ${value}`); continue; }
      cssColors.set(name.slice(2) + suffix, hex);
    }
  };
  addColors(colors.root, colors.root, '');
  addColors(colors.dark, colors.root, '-dark');
  for (const name of ['--veil-light', '--veil-dark']) cssColors.set(name.slice(2), toHex(elevation.root[name]));
  cssColors.set('veil-light-dark', toHex(elevation.dark['--veil-light']));

  const mdColors = new Map(Object.entries(design.color).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, v.$value.hex.toLowerCase()]));
  for (const [name, hex] of cssColors) {
    if (!mdColors.has(name)) fail(`cor --${name.replace(/-dark$/, '')}${name.endsWith('-dark') ? ' (tema escuro)' : ''} está no CSS e falta no DESIGN.md como "${name}"`);
    else if (mdColors.get(name) !== hex) fail(`cor ${name}: DESIGN.md ${mdColors.get(name)} ≠ CSS ${hex}`);
  }
  for (const name of mdColors.keys()) {
    if (name === 'primary') {
      if (mdColors.get('primary') !== cssColors.get('accent')) fail(`primary (${mdColors.get('primary')}) deveria ser igual a --accent (${cssColors.get('accent')})`);
    } else if (!cssColors.has(name)) fail(`cor "${name}" está no DESIGN.md e falta no CSS`);
  }

  // ---- raios ----
  const mdRounded = design.rounded;
  for (const [name, value] of Object.entries(radius)) {
    if (CSS_ONLY.has(name)) continue;
    const key = name.replace('--radius-', '');
    const css = num(resolve(value, radius, radius));
    if (!mdRounded[key]) fail(`raio ${name} falta no DESIGN.md como rounded.${key}`);
    else if (px(mdRounded[key].$value) !== css) fail(`raio ${key}: DESIGN.md ${px(mdRounded[key].$value)}px ≠ CSS ${css}px`);
  }
  for (const key of Object.keys(mdRounded).filter((k) => !k.startsWith('$'))) {
    if (!radius['--radius-' + key]) fail(`rounded.${key} está no DESIGN.md e falta no CSS`);
  }

  // ---- espaçamento ----
  const mdSpacing = design.spacing;
  for (const [name, value] of Object.entries(spacing)) {
    const key = name.slice(2);
    if (!mdSpacing[key]) fail(`espaçamento ${name} falta no DESIGN.md como spacing.${key}`);
    else if (px(mdSpacing[key].$value) !== num(value)) fail(`espaçamento ${key}: DESIGN.md ${px(mdSpacing[key].$value)}px ≠ CSS ${value}`);
  }
  for (const key of Object.keys(mdSpacing).filter((k) => !k.startsWith('$'))) {
    if (!spacing['--' + key]) fail(`spacing.${key} está no DESIGN.md e falta no CSS`);
  }

  // ---- tipografia: todo valor do DESIGN.md precisa existir na escala do CSS ----
  const scale = (prefix) => new Set(Object.entries(type).filter(([n]) => n.startsWith(prefix)).map(([, v]) => num(v)));
  const sizes = scale('--text-');
  const weights = scale('--weight-');
  const leadings = scale('--leading-');
  const trackings = scale('--tracking-');
  const families = new Set(['--font-sans', '--font-mono'].map((n) => type[n].split(',')[0].replace(/["']/g, '').trim()));
  for (const [role, token] of Object.entries(design.typography).filter(([k]) => !k.startsWith('$'))) {
    const t = token.$value;
    if (!families.has(t.fontFamily)) fail(`typography.${role}: família "${t.fontFamily}" não é --font-sans nem --font-mono`);
    if (!sizes.has(px(t.fontSize))) fail(`typography.${role}: fontSize ${px(t.fontSize)}px fora da escala --text-*`);
    if (!weights.has(Number(t.fontWeight))) fail(`typography.${role}: fontWeight ${t.fontWeight} fora de --weight-*`);
    if (t.letterSpacing && !trackings.has(t.letterSpacing.value)) fail(`typography.${role}: letterSpacing ${t.letterSpacing.value}em fora de --tracking-*`);
  }
  // O exportador descarta lineHeight sem unidade; lido direto do front matter.
  const front = fs.readFileSync(DESIGN_MD, 'utf8').split(/^---$/m)[1];
  for (const [, value] of front.matchAll(/^\s+lineHeight:\s*([\d.]+)\s*$/gm)) {
    if (!leadings.has(Number(value))) fail(`lineHeight ${value} fora da escala --leading-*`);
  }

  if (problems.length > 0) {
    console.error(`DESIGN.md e design-system/tokens/*.css divergem (${problems.length}):`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`Tokens em sincronia: ${cssColors.size} cores, ${Object.keys(radius).length - 1} raios, ${Object.keys(spacing).length} espaçamentos, ${Object.keys(design.typography).length - 1} papéis tipográficos.`);
}

main();
