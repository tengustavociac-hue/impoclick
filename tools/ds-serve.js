// Servidor local do design system: showcase, templates, guidelines e as páginas
// de referência.
//
//   node tools/ds-serve.js            http://localhost:4173/design-system/
//   PORT=5000 node tools/ds-serve.js
//
// Precisa de HTTP porque a biblioteca é carregada como ES module, e módulo não
// carrega de file://. Serve SÓ a pasta design-system/ e escuta só em 127.0.0.1:
// a raiz do projeto tem .env e não deve ficar acessível nem na rede local.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'design-system');
const MOUNT = '/design-system/';
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/design-system') {
    res.writeHead(302, { Location: MOUNT + url.search });
    return res.end();
  }
  if (!url.pathname.startsWith(MOUNT)) {
    res.writeHead(404);
    return res.end('Fora do design system.');
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname.slice(MOUNT.length))));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Não encontrado.');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Design system em http://localhost:${PORT}${MOUNT}`);
  console.log(`  templates:  http://localhost:${PORT}${MOUNT}templates/painel.html · site.html`);
  console.log(`  referência: http://localhost:${PORT}${MOUNT}reference/ui-kits/app/index.html`);
});
