// Recalcula o hash CSP do script inline do index.html.
//
// O CSP em vercel.json libera aquele script (o anti-FOUC, que define o tema e
// esconde a landing antes da primeira pintura) por hash em vez de
// 'unsafe-inline'. Isso é o correto do ponto de vista de segurança, mas cria
// uma armadilha: mexer no script sem atualizar o hash faz o navegador recusá-lo
// silenciosamente. Este script existe pra fechar essa armadilha.
//
//   node tools/csp-hash.js
//
// Copie a linha impressa e substitua o 'sha256-...' dentro do valor de
// Content-Security-Policy(-Report-Only) em vercel.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Casa apenas blocos <script> sem NENHUM atributo — o executável inline. Os
// blocos application/ld+json têm type= e ficam de fora (não são executados,
// então o CSP não os cobre). A abertura é montada por concatenação de
// propósito: escrever a tag literal aqui faria este próprio arquivo virar um
// falso positivo se alguém um dia rodasse a busca sobre a pasta inteira.
const OPEN = '<' + 'script>';
const CLOSE = '<' + '/script>';

const blocos = [];
let cursor = 0;
for (;;) {
    const ini = html.indexOf(OPEN, cursor);
    if (ini === -1) break;
    const fim = html.indexOf(CLOSE, ini + OPEN.length);
    if (fim === -1) break;
    blocos.push(html.slice(ini + OPEN.length, fim));
    cursor = fim + CLOSE.length;
}

if (blocos.length === 0) {
    console.error('Nenhum script inline executável encontrado no index.html.');
    process.exit(1);
}

if (blocos.length > 1) {
    console.error(
        `Atenção: encontrei ${blocos.length} scripts inline. O CSP em vercel.json ` +
        'precisa de um hash para CADA um deles, separados por espaço.'
    );
}

blocos.forEach((conteudo, i) => {
    const hash = crypto.createHash('sha256').update(conteudo, 'utf8').digest('base64');
    const rotulo = blocos.length > 1 ? `bloco ${i + 1}: ` : '';
    console.log(`${rotulo}'sha256-${hash}'`);
});
