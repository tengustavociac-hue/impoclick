const { supabaseAdmin, getVerifiedUserId, requireAccess } = require('./_ml-helper');

// Diferente do Mercado Livre e da Shopee: desde 02/10/2023 a SP-API usa OAuth2
// padrão (LWA — Login with Amazon), sem assinatura HMAC por requisição. O
// access_token vai no header `x-amz-access-token` (não `Authorization: Bearer`
// — detalhe específico da SP-API).
//
// Hoje o app é PRIVADO (autoautorizado pelo próprio vendedor direto no Seller
// Central, sem passar pelo nosso site): o refresh_token já nasce vinculado à
// conta dele, então não existe aqui um equivalente a ml-auth.js/ml-callback.js
// ainda. Quando o app for público, a troca authorization_code -> token usa o
// mesmo endpoint LWA_TOKEN_URL com grant_type=authorization_code em vez de
// refresh_token — o resto (refreshAmazonToken, amazonFetch) não muda.

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const AMAZON_SPAPI_HOST = process.env.AMAZON_SPAPI_HOST || 'https://sellingpartnerapi-na.amazon.com';
const AMAZON_MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID || 'A2Q3Y263D00KWC'; // Brasil

function exigirCredenciais() {
    if (!process.env.AMAZON_CLIENT_ID || !process.env.AMAZON_CLIENT_SECRET) {
        throw new Error('AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET não configurados na Vercel.');
    }
}

async function trocarRefreshTokenPorAccessToken(refreshToken) {
    exigirCredenciais();
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.AMAZON_CLIENT_ID,
        client_secret: process.env.AMAZON_CLIENT_SECRET,
    });

    const resp = await fetch(LWA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!resp.ok) {
        throw new Error(`Falha ao renovar token da Amazon (${resp.status}): ${await resp.text()}`);
    }
    return await resp.json(); // { access_token, token_type, expires_in, refresh_token? }
}

async function refreshAmazonToken(userId, refreshToken) {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    }
    const dados = await trocarRefreshTokenPorAccessToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + dados.expires_in - 300); // 5 min de margem, igual ML/Shopee

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({
            amazon_access_token: dados.access_token,
            // A Amazon pode devolver um refresh_token novo; se não devolver, mantém o atual.
            amazon_refresh_token: dados.refresh_token || refreshToken,
            amazon_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', userId);

    if (error) throw new Error('Erro ao salvar token da Amazon no banco: ' + error.message);
    return dados.access_token;
}

async function getAmazonToken(userId) {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    }
    const { data: perfil, error } = await supabaseAdmin
        .from('profiles')
        .select('amazon_access_token, amazon_refresh_token, amazon_token_expires_at')
        .eq('id', userId)
        .maybeSingle();

    if (error) throw new Error('Erro ao buscar token da Amazon no banco: ' + error.message);
    if (!perfil || !perfil.amazon_refresh_token) {
        throw new Error('Conta da Amazon não conectada para este usuário.');
    }

    const expirado = !perfil.amazon_token_expires_at || new Date(perfil.amazon_token_expires_at) <= new Date();
    if (expirado) {
        return await refreshAmazonToken(userId, perfil.amazon_refresh_token);
    }
    return perfil.amazon_access_token;
}

// Chama um endpoint da SP-API já autenticado para o usuário. `path` é o
// caminho completo (ex.: '/orders/v0/orders?...'); renova e tenta de novo uma
// vez se a Amazon responder 401 (token expirou entre a leitura do banco e a
// chamada).
async function amazonFetch(userId, path, opts = {}) {
    let token = await getAmazonToken(userId);

    const fazer = (tok) => fetch(`${AMAZON_SPAPI_HOST}${path}`, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            'x-amz-access-token': tok,
            'content-type': 'application/json',
        },
    });

    let resp = await fazer(token);
    if (resp.status === 401) {
        const { data: perfil } = await supabaseAdmin
            .from('profiles')
            .select('amazon_refresh_token')
            .eq('id', userId)
            .maybeSingle();
        if (perfil && perfil.amazon_refresh_token) {
            token = await refreshAmazonToken(userId, perfil.amazon_refresh_token);
            resp = await fazer(token);
        }
    }
    return resp;
}

module.exports = {
    AMAZON_SPAPI_HOST, AMAZON_MARKETPLACE_ID,
    trocarRefreshTokenPorAccessToken, refreshAmazonToken, getAmazonToken, amazonFetch,
    getVerifiedUserId, requireAccess, supabaseAdmin,
};
