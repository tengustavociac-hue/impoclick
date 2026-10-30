const { createClient } = require('@supabase/supabase-js');

const ML_BASE = 'https://api.mercadolibre.com';
const clientId = process.env.ML_CLIENT_ID;
const clientSecret = process.env.ML_CLIENT_SECRET;

// Exige a service role key de verdade. Antes havia um fallback
// `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY`: se a service role sumisse
// da Vercel, o cliente era criado com a chave anônima, o `if (!supabaseAdmin)`
// dos endpoints continuava passando, e as escritas em profiles (salvar/renovar
// token do ML) passavam a falhar por RLS uma a uma, sem erro claro. Falhar aqui
// e alto é melhor do que degradar em silêncio por semanas.
let supabaseAdmin = null;
if (!process.env.SUPABASE_URL) {
    console.error('SUPABASE_URL não configurado nas variáveis de ambiente da Vercel.');
} else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        'SUPABASE_SERVICE_ROLE_KEY não configurado na Vercel. Os endpoints vão responder 500 ' +
        'até isso ser corrigido — de propósito: com a chave anônima eles falhariam por RLS em silêncio.'
    );
} else {
    supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
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

// Antes, todo endpoint confiava cegamente no header user-token (o próprio
// front-end mandava o UUID do usuário sem provar que era ele mesmo) — bastava
// alguém saber/adivinhar o UUID de outra pessoa pra ler os dados dela. Agora
// exigimos o access_token real da sessão Supabase (Authorization: Bearer) e
// validamos contra o Supabase Auth antes de confiar em qualquer user_id.
async function getVerifiedUserId(req) {
    if (!supabaseAdmin) return null;

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user.id;
}

// Igual ao getVerifiedUserId, mas devolve também o e-mail da conta.
//
// O POST /preapproval do Mercado Pago exige payer_email. Enquanto a assinatura
// era confirmada no checkout hospedado do MP, esse endereço tinha que bater com
// a conta que o cliente logava lá — e quando não batia, ele via "Seu e-mail não
// corresponde ao da assinatura" e o pagamento morria ali. Por isso o front
// chegou a pedir o e-mail digitado, o que só transferiu o erro para o cliente.
//
// Com o cartão tokenizado no navegador não existe mais login no MP, então o
// payer_email virou um rótulo: sai daqui, da sessão já verificada, e o cliente
// nunca digita nem erra o endereço.
async function getVerifiedUser(req) {
    if (!supabaseAdmin) return null;

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return { id: data.user.id, email: data.user.email };
}

// Colunas que concedem acesso pago. O getAccessStatus() abaixo libera com
// `is_pro || is_subscribed`, então zerar só uma delas mantinha a conta ativa —
// foi exatamente o que deixou pagamento devolvido continuar com acesso.
const COLUNAS_DE_ACESSO = ['is_pro', 'is_subscribed'];

// Tira o acesso pago de uma conta. Usado por qualquer evento que signifique
// "esse dinheiro não é mais nosso": reembolso, chargeback, pagamento cancelado,
// assinatura cancelada ou pausada.
//
// Lê o perfil antes de escrever porque o UPDATE do Supabase falha por inteiro se
// nomear uma coluna que não existe no schema — e o efeito de falhar aqui seria
// não revogar nada e não avisar ninguém. Montando o patch só com as colunas que
// o perfil realmente tem, a revogação funciona com ou sem a coluna legada.
async function revogarAcesso(userId, motivo) {
    if (!supabaseAdmin) {
        console.error(`[acesso] supabaseAdmin indisponível — NÃO foi possível revogar o acesso de ${userId} (${motivo}).`);
        return false;
    }
    if (!userId) {
        console.error(`[acesso] revogação pedida sem userId (${motivo}) — nada a fazer.`);
        return false;
    }

    const { data: perfil, error: erroLeitura } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (erroLeitura && erroLeitura.code !== 'PGRST116') {
        console.error(`[acesso] falha ao ler o perfil ${userId} para revogar (${motivo}):`, erroLeitura);
        return false;
    }
    if (!perfil) {
        console.error(`[acesso] perfil ${userId} não encontrado — revogação (${motivo}) não aplicada.`);
        return false;
    }

    const patch = {};
    for (const coluna of COLUNAS_DE_ACESSO) {
        if (coluna in perfil) patch[coluna] = false;
    }
    if ('subscription_expires_at' in perfil) patch.subscription_expires_at = null;

    if (!Object.keys(patch).length) {
        console.error(`[acesso] perfil ${userId} não tem nenhuma coluna de acesso conhecida — revisar o schema.`);
        return false;
    }

    const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', userId);
    if (error) {
        console.error(`[acesso] falha ao revogar o acesso de ${userId} (${motivo}):`, error);
        return false;
    }

    console.log(`[acesso] acesso revogado de ${userId} — motivo: ${motivo} | colunas: ${Object.keys(patch).join(', ')}`);
    return true;
}

// Espelha o checkSubscriptionStatus() do app.js, mas no servidor. O paywall do
// front sozinho é só aparência: bastava chamar estes endpoints direto (ou mexer
// no is_pro pelo console) pra usar tudo de graça, porque aqui só se conferia se
// havia login — nunca se a conta tinha plano válido.
//
// Regras, idênticas às do front:
//   - is_pro/is_subscribed valem enquanto subscription_expires_at não passou
//     (nulo = assinatura recorrente; com data = pagamento avulso de 30 dias)
//   - senão, trial de 7 dias contado da criação da conta no Supabase Auth
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

async function getAccessStatus(req) {
    if (!supabaseAdmin) return { userId: null, hasAccess: false, reason: 'config' };

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return { userId: null, hasAccess: false, reason: 'unauthenticated' };

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) return { userId: null, hasAccess: false, reason: 'unauthenticated' };

    const user = data.user;

    // Dono/admin do app (tabela app_admins) tem acesso infinito, sem depender
    // de is_pro/subscription_expires_at — essa conta não é cliente pagante.
    const { data: adminRow } = await supabaseAdmin
        .from('app_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
    if (adminRow) return { userId: user.id, hasAccess: true, reason: 'admin' };

    // select('*') de propósito: nomear colunas faria a query inteira falhar se
    // alguma não existisse no schema, e o efeito seria barrar quem pagou.
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = nenhuma linha
        console.error('Erro ao ler profiles para checar plano:', profileError);
        return { userId: user.id, hasAccess: false, reason: 'error' };
    }

    if (profile && (profile.is_pro || profile.is_subscribed)) {
        const expiresAt = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null;
        const hasValidExpiry = expiresAt && !isNaN(expiresAt.getTime());
        // Data ausente ou ilegível conta como "sem vencimento" — na dúvida não
        // derrubamos o acesso de quem pagou.
        if (!hasValidExpiry || expiresAt.getTime() > Date.now()) {
            return { userId: user.id, hasAccess: true, reason: 'pro' };
        }
    }

    const createdAt = user.created_at ? new Date(user.created_at).getTime() : NaN;
    if (!isNaN(createdAt) && Date.now() < createdAt + TRIAL_MS) {
        return { userId: user.id, hasAccess: true, reason: 'trial' };
    }

    return { userId: user.id, hasAccess: false, reason: 'expired' };
}

// Use no lugar do getVerifiedUserId nos endpoints pagos: devolve o userId se a
// conta pode usar o recurso e, se não puder, já responde o erro certo e devolve
// null (o endpoint só precisa dar `return`).
//
// NÃO usar em mp-checkout/mp-subscription: são as rotas de pagamento, quem está
// sem plano precisa justamente conseguir chamá-las.
async function requireAccess(req, res, notConnectedShape = false) {
    const status = await getAccessStatus(req);
    if (status.hasAccess) return status.userId;

    const extra = notConnectedShape ? { connected: false } : {};

    if (status.reason === 'config') {
        res.status(500).json({ ...extra, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
    } else if (status.reason === 'error') {
        res.status(500).json({ ...extra, error: 'Não foi possível verificar sua assinatura. Tente de novo em instantes.' });
    } else if (status.reason === 'unauthenticated') {
        res.status(401).json({ ...extra, error: 'Sessão inválida ou expirada. Faça login novamente.' });
    } else {
        res.status(402).json({ ...extra, error: 'Seu período de teste terminou. Assine o Impoclick PRO para continuar usando este recurso.' });
    }
    return null;
}

module.exports = {
    ML_BASE,
    mlFetch,
    supabaseAdmin,
    getVerifiedUserId,
    getVerifiedUser,
    revogarAcesso,
    getAccessStatus,
    requireAccess,
};
