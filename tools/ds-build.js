// Empacota a biblioteca do design system em design-system/dist/.
//
// Os componentes rodam direto do código-fonte (ES modules), então o site não
// precisa deste passo para usar a biblioteca. O pacote existe para quem não
// pode carregar módulos: script clássico (o app.js do site é um) recebe
// `window.ImpoclickDS`, e o CSS sai num arquivo só, sem a cascata de @import.
// Substitui o _ds_bundle.js que vinha no export do Claude Design.
//
//   node tools/ds-build.js
//
// Saída (ignorada pelo Git e pelo deploy):
//   dist/impoclick-ds.js       ESM
//   dist/impoclick-ds.iife.js  script clássico, global ImpoclickDS
//   dist/impoclick-ds.css      tokens + componentes
//   dist/types/                declarações .d.ts geradas dos tipos JSDoc
//
// Não se chama `build` de propósito: um script `build` no package.json pode
// virar comando de build da Vercel no deploy do site.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const DS = path.join(__dirname, '..', 'design-system');
const DIST = path.join(DS, 'dist');

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  const entry = path.join(DS, 'components', 'index.js');
  const common = { entryPoints: [entry], bundle: true, target: 'es2022', legalComments: 'none', logLevel: 'warning' };

  await esbuild.build({ ...common, format: 'esm', outfile: path.join(DIST, 'impoclick-ds.js') });
  await esbuild.build({ ...common, format: 'iife', globalName: 'ImpoclickDS', minify: true, outfile: path.join(DIST, 'impoclick-ds.iife.js') });
  await esbuild.build({
    entryPoints: [path.join(DS, 'styles.css')],
    bundle: true,
    minify: true,
    logLevel: 'warning',
    outfile: path.join(DIST, 'impoclick-ds.css'),
  });

  // TypeScript 7 não exporta bin/tsc; o caminho sai do package.json, que é exportado.
  const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
  execFileSync(process.execPath, [tsc, '-p', path.join(DS, 'tsconfig.build.json')], { stdio: 'inherit' });

  const files = fs.readdirSync(DIST, { recursive: true }).filter((f) => fs.statSync(path.join(DIST, f)).isFile());
  for (const f of files.sort()) {
    const kb = (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(1);
    console.log(`  dist/${String(f).split(path.sep).join('/')}  ${kb} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
