const crypto = require('crypto');

// Fluxo de conexão com o Mercado Livre: ml-auth.js começa, ml-callback.js termina.
//
// O state carrega o usuário do Impoclick que está conectando, assinado com
// HMAC. Só a assinatura NÃO basta: o callback confia no userId de dentro do
// state, e quem o assinou foi o próprio servidor a pedido de quem quer que
// chamasse ml-auth. Um atacante logado na conta dele poderia pedir o link,
// mandá-lo a um vendedor do ML e, se o vendedor autorizasse, o Mercado Livre
// DELE ficaria vinculado à conta do atacante (CSRF de vínculo de conta).
//
// Por isso o state também leva um nonce, e o mesmo nonce vai num cookie
// HttpOnly que só o navegador que iniciou o fluxo tem. No callback os dois
// precisam bater: o link entregue a outra pessoa chega no navegador dela sem o
// cookie e é recusado.

const COOKIE = 'ml_oauth_nonce';
// Mesmo caminho/arquivo atende a Shopee agora (?provider=shopee em ml-auth.js
// e ml-callback.js), por isso um cookie próprio — ver o comentário de
// cookieDoNonce mais abaixo.
const COOKIE_SHOPEE = 'shopee_oauth_nonce';
const COOKIE_AMAZON_ADS = 'amazon_ads_oauth_nonce';
const COOKIE_CAMINHO = '/api/ml-callback';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // janela pra completar o consentimento no ML/Shopee

function assinar(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// Devolve { state, nonce }. O nonce vai também no cookie (ver cookieDoNonce).
function criarState(userId, secret) {
    const nonce = crypto.randomBytes(16).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now(), nonce })).toString('base64url');
    return { state: `${payload}.${assinar(payload, secret)}`, nonce };
}

// Devolve { userId, nonce } ou null quando a assinatura, a validade ou o
// formato não valem. State sem nonce é recusado: nenhum state legítimo nasce
// sem ele desde que o cookie passou a existir.
function verificarState(state, secret) {
    if (!state || typeof state !== 'string' || !secret || !state.includes('.')) return null;
    const idx = state.lastIndexOf('.');
    const payload = state.slice(0, idx);
    const sig = state.slice(idx + 1);

    const a = Buffer.from(sig);
    const b = Buffer.from(assinar(payload, secret));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch (e) {
        return null;
    }
    if (!parsed.userId || !parsed.iat || !parsed.nonce) return null;
    if (Date.now() - parsed.iat > STATE_MAX_AGE_MS) return null;
    return { userId: parsed.userId, nonce: parsed.nonce };
}

// Set-Cookie que guarda o nonce. Path restrito ao callback: nenhuma outra rota
// do site recebe esse valor. SameSite=Lax deixa o cookie ir na volta do ML
// (navegação de topo, GET), e só nela.
//
// nomeCookie é opcional (default = COOKIE, o do Mercado Livre) — ml-auth.js/
// ml-callback.js passaram a atender também a Shopee (ver _shopee-helper.js),
// que usa outro nome de cookie para o nonce não se misturar se alguém abrir
// as duas conexões ao mesmo tempo em abas diferentes. criarState/
// verificarState não mudam: elas só lidam com o valor do nonce, nunca com o
// cookie em si.
function cookieDoNonce(nonce, nomeCookie = COOKIE) {
    return `${nomeCookie}=${nonce}; Max-Age=${STATE_MAX_AGE_MS / 1000}; Path=${COOKIE_CAMINHO}; HttpOnly; Secure; SameSite=Lax`;
}

function cookieApagado(nomeCookie = COOKIE) {
    return `${nomeCookie}=; Max-Age=0; Path=${COOKIE_CAMINHO}; HttpOnly; Secure; SameSite=Lax`;
}

function lerCookie(req, nome) {
    const bruto = (req.headers && req.headers.cookie) || '';
    for (const parte of bruto.split(';')) {
        const i = parte.indexOf('=');
        if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
    }
    return null;
}

// Comparação em tempo constante do nonce do state com o do cookie.
function nonceConfere(doState, doCookie) {
    if (!doState || !doCookie) return false;
    const a = Buffer.from(String(doState));
    const b = Buffer.from(String(doCookie));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
    COOKIE, COOKIE_SHOPEE, COOKIE_AMAZON_ADS, STATE_MAX_AGE_MS,
    criarState, verificarState, cookieDoNonce, cookieApagado, lerCookie, nonceConfere,
};
