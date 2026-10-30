// Gera o .zip da extensão para a Chrome Web Store.
//
//   npm run ext:pack        -> dist/impoclick-extension-<versão do manifest>.zip
//
// A lista de arquivos é EXPLÍCITA, não uma varredura da pasta: assim nenhum
// arquivo de desenvolvimento (página de teste, backup, .map) entra no pacote que
// vai para a loja por descuido. Arquivo novo na extensão precisa ser adicionado
// aqui de propósito.
//
// O zip é escrito aqui mesmo, com zlib: o `tar` que está no PATH desta máquina é
// o GNU (do Git Bash), que não cria zip — ele gera um .tar com nome .zip, e a
// loja recusa. Sem dependência de npm e com data fixa, o mesmo conteúdo sempre
// gera o mesmo arquivo.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * @param {{ nome: string, dados: Buffer }[]} entradas
 * @returns {Buffer} arquivo .zip
 */
function criarZip(entradas) {
  const local = [];
  const central = [];
  let deslocamento = 0;
  for (const { nome, dados } of entradas) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const comprimido = zlib.deflateRawSync(dados, { level: 9 });
    const crc = zlib.crc32(dados);
    const cabecalho = Buffer.alloc(30);
    cabecalho.writeUInt32LE(0x04034b50, 0);
    cabecalho.writeUInt16LE(20, 4);          // versão mínima
    cabecalho.writeUInt16LE(8, 8);           // método: deflate
    cabecalho.writeUInt16LE(0, 10);          // hora fixa
    cabecalho.writeUInt16LE(0x21, 12);       // data fixa (1980-01-01)
    cabecalho.writeUInt32LE(crc, 14);
    cabecalho.writeUInt32LE(comprimido.length, 18);
    cabecalho.writeUInt32LE(dados.length, 22);
    cabecalho.writeUInt16LE(nomeBuf.length, 26);
    local.push(cabecalho, nomeBuf, comprimido);

    const entradaCentral = Buffer.alloc(46);
    entradaCentral.writeUInt32LE(0x02014b50, 0);
    entradaCentral.writeUInt16LE(20, 4);
    entradaCentral.writeUInt16LE(20, 6);
    entradaCentral.writeUInt16LE(8, 10);
    entradaCentral.writeUInt16LE(0, 12);
    entradaCentral.writeUInt16LE(0x21, 14);
    entradaCentral.writeUInt32LE(crc, 16);
    entradaCentral.writeUInt32LE(comprimido.length, 20);
    entradaCentral.writeUInt32LE(dados.length, 24);
    entradaCentral.writeUInt16LE(nomeBuf.length, 28);
    entradaCentral.writeUInt32LE(deslocamento, 42);
    central.push(entradaCentral, nomeBuf);

    deslocamento += cabecalho.length + nomeBuf.length + comprimido.length;
  }
  const corpoCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(corpoCentral.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...local, corpoCentral, fim]);
}

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

const ARQUIVOS = [
  'manifest.json',
  'background.js',
  'content.js',
  'ds-tokens.css',
  'panel.css',
  'popup.html',
  'popup.css',
  'popup.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'fonts/urbanist.woff2',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const saida = path.join(DIST, `impoclick-extension-${manifest.version}.zip`);

const faltando = ARQUIVOS.filter((f) => !fs.existsSync(path.join(EXT, f)));
if (faltando.length) {
  console.error('arquivos que a lista pede e não existem:', faltando.join(', '));
  process.exit(1);
}

// O que está na pasta mas fora da lista — aviso, não erro: pode ser proposital.
function varrer(dir, prefixo = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = prefixo + e.name;
    return e.isDirectory() ? varrer(path.join(dir, e.name), rel + '/') : [rel];
  });
}
const sobrando = varrer(EXT).filter((f) => !ARQUIVOS.includes(f));
if (sobrando.length) console.warn('fora do pacote (confira se é proposital):', sobrando.join(', '));

fs.mkdirSync(DIST, { recursive: true });
fs.rmSync(saida, { force: true });
fs.writeFileSync(saida, criarZip(ARQUIVOS.map((nome) => ({ nome, dados: fs.readFileSync(path.join(EXT, nome)) }))));

const kb = (fs.statSync(saida).size / 1024).toFixed(1);
console.log(`dist/impoclick-extension-${manifest.version}.zip — ${ARQUIVOS.length} arquivos, ${kb} KB`);
