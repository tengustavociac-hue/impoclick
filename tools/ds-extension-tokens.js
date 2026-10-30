// Gera extension/ds-tokens.css a partir dos tokens do design system.
//
//   node tools/ds-extension-tokens.js          reescreve o arquivo
//   node tools/ds-extension-tokens.js --check  falha se estiver desatualizado
//
// Por que um arquivo gerado, e não o design-system/styles.css direto:
//
// 1. ESCOPO. O painel é injetado DENTRO da página do Mercado Livre. Declarar os
//    tokens em :root ali jogaria ~170 variáveis no documento deles. Aqui cada
//    declaração sai escopada nas raízes que a extensão cria.
// 2. FONTE. A página do ML bloqueia fonte externa por CSP, então a Urbanist vai
//    embutida em fonts/urbanist.woff2 (como já era com a Jakarta). O @font-face
//    aponta para o arquivo local.
// 3. TEMA. O painel é sempre claro — ele convive com a interface do ML, que é
//    clara. Só os valores do tema claro entram.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOKENS = path.join(ROOT, 'design-system', 'tokens');
const OUT = path.join(ROOT, 'extension', 'ds-tokens.css');

// Tudo que a extensão injeta na página do Mercado Livre, mais .impoclick-page,
// que é o <body> das páginas da própria extensão (popup e painel lateral).
const SCOPES = [
  '.impoclick-page',
  '#impoclick-panel',
  '#impoclick-pdp-card',
  '#impoclick-filtros',
  '#impoclick-modal',
  '#impoclick-dica',
  '.impoclick-catalog-badge',
  // O crachá dos cards de busca é filho do <body> da página do Mercado
  // Livre, fora de qualquer outra raiz daqui: sem ele nesta lista, todo
  // var() dentro do crachá fica indefinido — o fundo some e o texto cai
  // para preto. Foi assim que o CATÁLOGO sumiu da busca.
  '.impoclick-card-badge',
];

const FILES = ['colors.css', 'typography.css', 'spacing.css', 'radius.css', 'elevation.css', 'motion.css'];

// JetBrains Mono não é embutida: só os códigos curtos (MLB, NCM) usariam, e não
// compensa outro arquivo de fonte na página do ML.
const OVERRIDES = {
  '--font-mono': 'ui-monospace, "Cascadia Mono", Consolas, monospace',
};

function rootDeclarations(file) {
  const css = fs.readFileSync(path.join(TOKENS, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const [, body] of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.push([name, OVERRIDES[name] ?? value.trim()]);
    }
  }
  return out;
}

function build() {
  const decls = FILES.flatMap(rootDeclarations);
  const lines = [
    '/* GERADO por tools/ds-extension-tokens.js — não edite à mão.',
    ' *',
    ' * Tokens do design system (tema claro) escopados nas raízes da extensão: o',
    ' * painel é injetado na página do Mercado Livre e não pode declarar variável',
    ' * em :root. A fonte da verdade é o DESIGN.md; rode o gerador depois de mudar',
    ' * qualquer token. */',
    '',
    '@font-face {',
    "  font-family: 'Urbanist';",
    '  /* Embutida: a CSP do Mercado Livre bloqueia fonte externa, mas libera',
    '     recurso da extensão declarado em web_accessible_resources. */',
    "  src: url('fonts/urbanist.woff2') format('woff2-variations');",
    '  font-weight: 400 800;',
    '  font-style: normal;',
    '  font-display: swap;',
    '}',
    '',
    SCOPES.join(',\n') + ' {',
    ...decls.map(([name, value]) => `  ${name}: ${value};`),
    '}',
    '',
  ];
  return lines.join('\n');
}

const css = build();
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== css) {
    console.error('extension/ds-tokens.css está desatualizado. Rode: npm run ds:extension-tokens');
    process.exit(1);
  }
  console.log('extension/ds-tokens.css em dia.');
} else {
  fs.writeFileSync(OUT, css);
  console.log(`extension/ds-tokens.css gerado: ${css.split('\n').length} linhas, ${SCOPES.length} escopos.`);
}
