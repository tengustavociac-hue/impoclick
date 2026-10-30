const crypto = require('crypto');
const { supabaseAdmin, getVerifiedUserId, requireAccess } = require('./_ml-helper');

// Conexão com a Shopee (Open Platform / Partner API) — mesma ideia de
// _ml-helper.js, mas o modelo de autenticação é bem diferente do Mercado
// Livre: não é só Bearer token, TODA chamada carrega partner_id, timestamp e
// uma assinatura HMAC-SHA256 nos parâmetros da URL, calculada com a chave do
// app (SHOPEE_PARTNER_KEY). Ver supabase/shopee_conexao.sql para as colunas
// novas em profiles.
//
// PENDENTE DE CREDENCIAIS REAIS: este arquivo ainda não foi testado contra a
// API de verdade da Shopee (o app ainda não existe — perfil de vendedor em
// análise em 27/10/2026). A fórmula da assinatura e os nomes dos campos vêm
// da documentação pública; confirmar/ajustar assim que houver Partner ID e
// Partner Key de teste para testar de ponta a ponta.
// .trim(): colar a chave/ID no campo da Vercel costuma deixar um espaço ou
// quebra de linha invisível no fim — isso já basta pra assinatura HMAC dar
// errado (a Shopee usa a string byte a byte), mesmo com o valor "certo".
const PARTNER_ID = (process.env.SHOPEE_PARTNER_ID || '').trim();
const PARTNER_KEY = (process.env.SHOPEE_PARTNER_KEY || '').trim();
// "test" por padrão de propósito: mais seguro errar pro sandbox (não faz mal
// nenhum) do que um ambiente mal configurado acabar chamando a Shopee real.
const SHOPEE_ENV = (process.env.SHOPEE_ENV || '').trim() === 'live' ? 'live' : 'test';
// O host de sandbox "partner.test-stable.shopeemobile.com" (usado por
// várias libs de terceiros) NÃO é o que a própria ferramenta de teste da
// Shopee usa pra essa conta — confirmado no "API Test Tool" do Open
// Platform, que mostrou "openplatform.sandbox.test-stable.shopee.sg".
const SHOPEE_BASE = SHOPEE_ENV === 'live'
    ? 'https://partner.shopeemobile.com'
    : 'https://openplatform.sandbox.test-stable.shopee.sg';

function exigirCredenciais() {
    if (!PARTNER_ID || !PARTNER_KEY) {
        throw new Error('SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY não configurados na Vercel.');
    }
}

function assinar(baseString) {
    return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

// APIs "públicas" (sem conta de loja ainda vinculada): auth_partner,
// token/get, access_token/get. Base = partner_id + path + timestamp.
function assinaturaPublica(path, timestamp) {
    return assinar(`${PARTNER_ID}${path}${timestamp}`);
}

// APIs de loja (pedidos, itens, etc., já com a conta conectada): a base
// ganha também o access_token e o shop_id.
function assinaturaDeLoja(path, timestamp, accessToken, shopId) {
    return assinar(`${PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`);
}

const timestampAtual = () => Math.floor(Date.now() / 1000);

// Monta o link que o navegador do vendedor abre para autorizar a loja. O
// redirectUri precisa ser EXATAMENTE a URL registrada no app do Open
// Platform (painel da Shopee).
function urlDeAutorizacao(redirectUri) {
    exigirCredenciais();
    const path = '/api/v2/shop/auth_partner';
    const timestamp = timestampAtual();
    const sign = assinaturaPublica(path, timestamp);
    return `${SHOPEE_BASE}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUri)}`;
}

// Troca o "code" que a Shopee devolveu no callback pelos tokens de acesso.
async function trocarCodigoPorToken(code, shopId) {
    exigirCredenciais();
    const path = '/api/v2/auth/token/get';
    const timestamp = timestampAtual();
    const sign = assinaturaPublica(path, timestamp);
    const resp = await fetch(`${SHOPEE_BASE}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(PARTNER_ID) }),
    });
    if (!resp.ok) throw new Error(`Falha ao trocar código por token na Shopee (${resp.status}): ${await resp.text()}`);
    const data = await resp.json();
    if (data.error) throw new Error(`Shopee recusou a troca de token: ${data.error} — ${data.message || ''}`);
    return data; // { access_token, refresh_token, expire_in, shop_id, ... }
}

// Renova o access_token vencido com o refresh_token guardado, e já salva o
// resultado em profiles — mesmo padrão de refreshMlToken.
async function refreshShopeeToken(userId, refreshToken, shopId) {
    exigirCredenciais();
    if (!supabaseAdmin) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');

    const path = '/api/v2/auth/access_token/get';
    const timestamp = timestampAtual();
    const sign = assinaturaPublica(path, timestamp);
    const resp = await fetch(`${SHOPEE_BASE}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(PARTNER_ID) }),
    });
    if (!resp.ok) throw new Error(`Falha ao renovar token da Shopee (${resp.status}): ${await resp.text()}`);
    const data = await resp.json();
    if (data.error) throw new Error(`Shopee recusou a renovação: ${data.error} — ${data.message || ''}`);

    // Igual ao ML: 5 min de margem para não usar um token na borda do vencimento.
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + data.expire_in - 300);

    await supabaseAdmin
        .from('profiles')
        .update({
            shopee_access_token: data.access_token,
            shopee_refresh_token: data.refresh_token || refreshToken,
            shopee_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', userId);

    return data.access_token;
}

async function getShopeeToken(userId) {
    if (!supabaseAdmin) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('shopee_access_token, shopee_refresh_token, shopee_token_expires_at, shopee_shop_id')
        .eq('id', userId)
        .single();

    if (error || !profile || !profile.shopee_access_token) {
        throw new Error('Conta da Shopee não conectada para este usuário.');
    }

    let token = profile.shopee_access_token;
    if (profile.shopee_token_expires_at && new Date(profile.shopee_token_expires_at) < new Date()) {
        if (!profile.shopee_refresh_token) {
            throw new Error('Refresh token da Shopee não encontrado. Conecte a conta de novo.');
        }
        token = await refreshShopeeToken(userId, profile.shopee_refresh_token, profile.shopee_shop_id);
    }

    return { token, shopId: profile.shopee_shop_id };
}

// Chama uma API DE LOJA da Shopee (pedidos, itens, avaliações...) já
// assinada e com o access_token do usuário. 401 tenta renovar uma vez —
// mesmo padrão de mlFetch em _ml-helper.js.
async function shopeeFetch(userId, path, opts = {}) {
    let { token, shopId } = await getShopeeToken(userId);
    if (!shopId) throw new Error('shop_id da Shopee não encontrado para este usuário. Conecte a conta de novo.');

    const montar = (t) => {
        const timestamp = timestampAtual();
        const sign = assinaturaDeLoja(path, timestamp, t, shopId);
        const qs = `partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&access_token=${t}&shop_id=${shopId}`;
        const separador = path.includes('?') ? '&' : '?';
        return fetch(`${SHOPEE_BASE}${path}${separador}${qs}`, opts);
    };

    let resp = await montar(token);

    if (resp.status === 401) {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('shopee_refresh_token, shopee_shop_id')
            .eq('id', userId)
            .single();
        if (profile && profile.shopee_refresh_token) {
            token = await refreshShopeeToken(userId, profile.shopee_refresh_token, profile.shopee_shop_id);
            resp = await montar(token);
        }
    }

    return resp;
}

module.exports = {
    SHOPEE_BASE, PARTNER_ID,
    assinar, assinaturaPublica, assinaturaDeLoja, timestampAtual,
    urlDeAutorizacao, trocarCodigoPorToken, refreshShopeeToken, getShopeeToken, shopeeFetch,
    // Repassados de _ml-helper.js para quem importar só deste arquivo não
    // precisar dos dois requires — são genéricos (sessão do Supabase), não
    // têm nada de Mercado Livre apesar do nome do arquivo de origem.
    getVerifiedUserId, requireAccess, supabaseAdmin,
};
