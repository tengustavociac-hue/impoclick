// Gera o .oxlintrc.json do projeto a partir dos tipos da biblioteca.
//
// O export do Claude Design trazia uma config de lint de aderência
// (_adherence.oxlintrc.json) escrita para JSX: `<Button variant=…>`. Aqui os
// componentes são funções — `Button({ variant: … })` — então as regras foram
// traduzidas para chamadas. E em vez de copiar a lista de props daquele arquivo
// (que tinha regra para tipo de dado que nunca vira elemento e deixava nove
// componentes sem regra nenhuma), a lista sai dos @typedef JSDoc dos próprios
// componentes. Mudou a API de um componente, rode isto de novo.
//
//   node tools/ds-lint-rules.js          reescreve .oxlintrc.json
//   node tools/ds-lint-rules.js --check  falha se o arquivo estiver desatualizado
//
// A config gerada vale para o repositório inteiro: arquivo novo nasce com todas
// as regras. Os arquivos legados listados em LEGACY ficam fora da aderência e de
// três regras de corretude ruidosas (70 achados em 16/09/2026, nenhum bug de
// comportamento) até serem migrados — tire o arquivo da lista ao migrar.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = path.join(ROOT, 'design-system', 'components');
const OUT = path.join(ROOT, '.oxlintrc.json');

// Props que todo componente aceita (ver CommonProps em components/dom.js).
const COMMON_PROPS = ['className', 'id', 'style', 'attrs', 'on'];

const LEGACY = [
  'app.js',
  'supabase_client.js',
  'ncm_db.js',
  'ncm_rates.js',
  'api/**',
  'server/**',
  'extension/**',
  'tools/**',
];

function listComponentFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listComponentFiles(full);
    return /^[A-Z]\w*\.js$/.test(entry.name) ? [full] : [];
  });
}

// Separa `a: X, b: Y<Z, W>` nas vírgulas de nível zero: os typedefs podem estar
// numa linha só ou em várias, com genéricos e objetos aninhados.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  let previous = '';
  for (const ch of text) {
    if ('<({['.includes(ch)) depth++;
    // O `>` de uma seta `=>` não fecha genérico.
    if (')}]'.includes(ch) || (ch === '>' && previous !== '=')) depth--;
    previous = ch;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

// Lê cada `@typedef {CommonProps & { … }} NomeProps` e devolve as props e as
// uniões de string literal de cada componente.
function readComponentTypes() {
  const components = [];
  for (const file of listComponentFiles(COMPONENTS)) {
    const source = fs.readFileSync(file, 'utf8');
    const typedefs = source.matchAll(/@typedef \{CommonProps & \{([\s\S]*?)\}\} (\w+)Props/g);
    for (const [, body, name] of typedefs) {
      const props = [];
      const enums = {};
      for (const entry of splitTopLevel(body.replace(/^\s*\*/gm, ' '))) {
        const m = entry.match(/^\s*(\w+)\??:\s*([\s\S]+?)\s*$/);
        if (!m) continue;
        const [, prop, type] = m;
        props.push(prop);
        const literals = [...type.matchAll(/'([^']+)'/g)].map((x) => x[1]);
        if (literals.length > 0 && /^('[^']+'\s*\|\s*)*'[^']+'$/.test(type.trim())) enums[prop] = literals;
      }
      components.push({ name, props, enums, file: path.relative(ROOT, file).split(path.sep).join('/') });
    }
  }
  return components.sort((a, b) => a.name.localeCompare(b.name));
}

const alternation = (values) => values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

function buildConfig(components) {
  const syntax = [
    { selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]', message: 'Cor hex crua — use um token de cor do design system via var().' },
    { selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]', message: 'Cor hex crua — use um token de cor do design system via var().' },
    { selector: 'Literal[value=/\\b\\d+px\\b/]', message: 'Valor em px cru — use um token de espaçamento/tipografia via var(), ou uma classe CSS para métrica de layout.' },
    { selector: 'TemplateElement[value.raw=/\\b\\d+px\\b/]', message: 'Valor em px cru — use um token de espaçamento/tipografia via var(), ou uma classe CSS para métrica de layout.' },
    // A regex original do export tinha `:\s*(?!…)`: o \s* voltava atrás, casava
    // zero espaços e acusava até `font-family: Urbanist`. O lookahead agora
    // engole o espaço antes de testar a fonte.
    { selector: "Literal[value=/font-family\\s*:(?!\\s*['\"]?(?:Urbanist|JetBrains Mono|Material Symbols Rounded|var\\())/i]", message: 'Fonte fora do design system. Disponíveis: Urbanist, JetBrains Mono, Material Symbols Rounded — via var(--font-*).' },
    // Acréscimos ao export: em JS puro o estilo vai por objeto/propriedade, que a
    // regra de string `font-family:` não enxerga, e cor em rgb()/hsl() passava.
    { selector: "AssignmentExpression[left.property.name='fontFamily'] > Literal.right[value!=/^var\\(--font-/]", message: 'Fonte fora do design system — use var(--font-sans), var(--font-mono) ou var(--font-icon).' },
    { selector: "Property[key.name='fontFamily'] > Literal.value[value!=/^var\\(--font-/]", message: 'Fonte fora do design system — use var(--font-sans), var(--font-mono) ou var(--font-icon).' },
    { selector: 'Literal[value=/\\b(?:rgba?|hsla?)\\(\\s*\\d/]', message: 'Cor crua em rgb()/hsl() — use um token de cor do design system via var().' },
  ];
  for (const c of components) {
    const allowed = alternation([...c.props, ...COMMON_PROPS]);
    syntax.push({
      selector: `CallExpression[callee.name='${c.name}'] > ObjectExpression > Property > Identifier.key[name!=/^(?:${allowed})$/]`,
      message: `${c.name}() não aceita essa prop. Declaradas: ${c.props.join(', ')} (+ ${COMMON_PROPS.join(', ')}). Ver ${c.file}.`,
    });
    for (const [prop, values] of Object.entries(c.enums)) {
      syntax.push({
        selector: `CallExpression[callee.name='${c.name}'] > ObjectExpression > Property[key.name='${prop}'] > Literal.value[value!=/^(?:${alternation(values)})$/]`,
        message: `${c.name}() ${prop} deve ser ${values.map((v) => `'${v}'`).join(' | ')}.`,
      });
    }
  }

  return {
    $schema: './node_modules/oxlint/configuration_schema.json',
    plugins: ['eslint', 'unicorn', 'oxc', 'import'],
    jsPlugins: [{ name: 'eslint-js', specifier: 'oxlint-plugin-eslint' }],
    categories: { correctness: 'error' },
    env: { browser: true, node: true, es2024: true },
    ignorePatterns: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      'design-system/dist/**',
      'design-system/reference/**',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '**/design-system/components/core/*',
            '**/design-system/components/forms/*',
            '**/design-system/components/navigation/*',
            '**/design-system/components/feedback/*',
            '**/design-system/components/data/*',
            '**/design-system/components/dom.js',
          ],
          message: "Importe os componentes de 'design-system/components/index.js', não dos arquivos internos.",
        }],
      }],
      'eslint-js/no-restricted-syntax': ['error', ...syntax],
    },
    overrides: [
      {
        // A própria biblioteca importa os arquivos internos entre si.
        files: ['design-system/components/**'],
        rules: { 'no-restricted-imports': 'off' },
      },
      {
        // Código legado ainda não migrado para o design system. Ver AGENTS.md.
        files: LEGACY,
        rules: {
          'eslint-js/no-restricted-syntax': 'off',
          'no-unused-vars': 'off',
          'no-useless-escape': 'off',
          'unicorn/no-useless-fallback-in-spread': 'off',
        },
      },
    ],
  };
}

function main() {
  const components = readComponentTypes();
  if (components.length === 0) throw new Error('Nenhum @typedef de componente encontrado em ' + COMPONENTS);
  const json = JSON.stringify(buildConfig(components), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== json) {
      console.error('.oxlintrc.json está desatualizado em relação aos tipos dos componentes. Rode: npm run ds:lint-rules');
      process.exit(1);
    }
    console.log(`.oxlintrc.json em dia (${components.length} componentes).`);
    return;
  }
  fs.writeFileSync(OUT, json);
  console.log(`.oxlintrc.json gerado: ${components.length} componentes — ${components.map((c) => c.name).join(', ')}`);
}

main();
