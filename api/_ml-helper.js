const { createClient } = require('@supabase/supabase-js');

const ML_BASE = 'https://api.mercadolibre.com';
const clientId = process.env.ML_CLIENT_ID;
const clientSecret = process.env.ML_CLIENT_SECRET;

let supabaseAdmin = null;
if (process.env.SUPABASE_URL) {
    supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
} else {
    console.error('SUPABASE_URL não configurado nas variáveis de ambiente da Vercel.');
}

async function refreshMlToken(userId, refreshToken) {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    }
    if (!clientId || !clientSecret) {
        throw new Error("Variáveis ML_CLIENT_ID e ML_CLIENT_SECRET não configuradas na Vercel.");
    }

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    const resp = await fetch(`${ML_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
    });

    if (!resp.ok) {
        throw new Error(`Falha ao renovar token do Mercado Livre (${resp.status}): ${await resp.text()}`);
    }

    const data = await resp.json();
    
    // Calcula o tempo de expiração
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in - 300); // 5 min de margem

    // Salva no banco
    await supabaseAdmin
        .from('profiles')
        .update({
            ml_access_token: data.access_token,
            ml_refresh_token: data.refresh_token || refreshToken,
            ml_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', userId);

    return data.access_token;
}

async function getMlToken(userId) {
    if (!supabaseAdmin) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    }
    const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('ml_access_token, ml_refresh_token, ml_token_expires_at, ml_user_id')
        .eq('id', userId)
        .single();

    if (error || !profile || !profile.ml_access_token) {
        throw new Error('Conta do Mercado Livre não conectada para este usuário.');
    }

    let token = profile.ml_access_token;

    // Verifica se expirou
    if (profile.ml_token_expires_at && new Date(profile.ml_token_expires_at) < new Date()) {
        if (!profile.ml_refresh_token) {
            throw new Error('Refresh token não encontrado. Faça o login no Mercado Livre novamente.');
        }
        token = await refreshMlToken(userId, profile.ml_refresh_token);
    }

    return { token, mlUserId: profile.ml_user_id };
}

// Chama a API do ML com o token do usuário. Se falhar por autenticação (401), tenta renovar.
// Passar returnMlUserId = true fará retornar { response, mlUserId }
async function mlFetch(userId, pathAndQuery, opts = {}, returnMlUserId = false) {
    let { token, mlUserId } = await getMlToken(userId);
    
    let attempt = (t) => fetch(`${ML_BASE}${typeof pathAndQuery === 'function' ? pathAndQuery(mlUserId) : pathAndQuery}`, {
        ...opts,
        headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` },
    });

    let resp = await attempt(token);
    
    if (resp.status === 401) {
        // Pega o refresh token do banco e renova
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('ml_refresh_token, ml_user_id')
            .eq('id', userId)
            .single();
            
        if (profile && profile.ml_refresh_token) {
            token = await refreshMlToken(userId, profile.ml_refresh_token);
            mlUserId = profile.ml_user_id;
            resp = await attempt(token);
        }
    }
    
    if (returnMlUserId) return { resp, mlUserId };
    return resp;
}

module.exports = {
    ML_BASE,
    mlFetch,
    supabaseAdmin
};
