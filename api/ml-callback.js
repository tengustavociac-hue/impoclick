const { ML_BASE, supabaseAdmin } = require('./_ml-helper');
const { COOKIE, COOKIE_SHOPEE, COOKIE_AMAZON_ADS, verificarState, cookieApagado, lerCookie, nonceConfere } = require('./_ml-oauth');
const { trocarCodigoPorToken } = require('./_shopee-helper');
const { trocarCodigoPorToken: trocarCodigoPorTokenAmazonAds } = require('./_amazon-ads-helper');

// NADA vindo de fora pode ser devolvido no corpo da resposta.
//
// O `res.send(string)` deste runtime responde com Content-Type text/html, e
// este endpoint fica em www.impoclick.com.br — mesma origem do app. Ecoar o
// parâmetro ?error= aqui era XSS refletido: bastava mandar ao usuário logado um
// link com <script> no parâmetro para executar JS na origem do site, ler o
// localStorage e roubar o token de sessão do Supabase (sb-*-auth-token), o que
// dá controle total da conta da vítima.
//
// A correção é não refletir: erro vira redirect com um código fixo, e detalhe
// técnico vai só para o log do servidor. Respostas de texto saem como
// text/plain para que markup nunca seja interpretado, mesmo se algum dia
// escapar alguma interpolação aqui.
function responderTexto(res, status, mensagem) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(status).send(mensagem);
}

// Callback da Shopee (?provider=shopee). Diferente do Mercado Livre, aqui não
// existe um "state" devolvido pela Shopee pra conferir — o token de state
// assinado (usuário + nonce) ficou só no cookie, gravado por ml-auth.js. A
// prova de que é o MESMO navegador que começou o fluxo está em o cookie
// existir e ser válido, não em bater com algo que voltou na URL — a Shopee só
// garante devolver "code" e "shop_id". Ver o comentário do branch Shopee em
// ml-auth.js.
async function tratarCallbackShopee(req, res) {
    const { code, shop_id: shopId, error } = req.query;

    if (error) {
        console.warn('Shopee recusou a autorização:', String(error).slice(0, 200));
        return res.redirect('/?shopee_connected=false');
    }
    if (!code || !shopId) {
        return responderTexto(res, 400, 'Parâmetros "code" e "shop_id" são obrigatórios.');
    }

    const estadoDoCookie = lerCookie(req, COOKIE_SHOPEE);
    const estado = verificarState(estadoDoCookie, process.env.SHOPEE_PARTNER_KEY || '');
    if (!estado) {
        return responderTexto(res, 400, 'Esta conexão não foi iniciada neste navegador, ou expirou. Abra o Impoclick, neste mesmo navegador, e clique em Conectar Shopee de novo.');
    }
    res.setHeader('Set-Cookie', cookieApagado(COOKIE_SHOPEE));
    const userId = estado.userId;

    try {
        if (!supabaseAdmin) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');

        const dados = await trocarCodigoPorToken(code, shopId);

        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + dados.expire_in - 300); // 5 min de margem, igual ao ML

        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                shopee_access_token: dados.access_token,
                shopee_refresh_token: dados.refresh_token,
                shopee_token_expires_at: expiresAt.toISOString(),
                shopee_shop_id: String(shopId),
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Erro ao salvar tokens da Shopee no banco:', dbError);
            return responderTexto(res, 500, 'Erro interno ao vincular sua conta da Shopee ao perfil.');
        }

        return res.redirect('/?shopee_connected=true');
    } catch (err) {
        console.error('Erro no callback da Shopee:', err);
        return responderTexto(res, 500, 'Erro interno ao processar o retorno da Shopee. Tente novamente pelo Impoclick.');
    }
}

// Callback da Amazon Advertising API (?provider=amazon-ads). Diferente da
// Shopee, a Amazon devolve um "state" de verdade — mesmo esquema de
// state+nonce+cookie do Mercado Livre (ver COOKIE_AMAZON_ADS em _ml-oauth.js).
async function tratarCallbackAmazonAds(req, res) {
    const { code, state, error } = req.query;

    if (error) {
        console.warn('Amazon Ads recusou a autorização:', String(error).slice(0, 200));
        return res.redirect('/?amazon_ads_connected=false');
    }
    if (!code || !state) {
        return responderTexto(res, 400, 'Parâmetros "code" e "state" são obrigatórios.');
    }

    const estado = verificarState(state, process.env.AMAZON_ADS_CLIENT_SECRET || '');
    if (!estado) {
        return responderTexto(res, 400, 'State inválido ou expirado. Inicie a conexão de anúncios da Amazon novamente a partir do Impoclick.');
    }
    if (!nonceConfere(estado.nonce, lerCookie(req, COOKIE_AMAZON_ADS))) {
        console.warn(`Conexão de anúncios da Amazon recusada: navegador diferente do que iniciou o fluxo (usuário ${estado.userId}).`);
        return responderTexto(res, 400, 'Esta conexão não foi iniciada neste navegador. Abra o Impoclick, neste mesmo navegador, e clique em Conectar anúncios da Amazon de novo.');
    }
    res.setHeader('Set-Cookie', cookieApagado(COOKIE_AMAZON_ADS));
    const userId = estado.userId;

    try {
        if (!supabaseAdmin) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');

        const redirectUri = process.env.AMAZON_ADS_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback?provider=amazon-ads`;
        const dados = await trocarCodigoPorTokenAmazonAds(code, redirectUri);

        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + dados.expires_in - 300);

        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                amazon_ads_access_token: dados.access_token,
                amazon_ads_refresh_token: dados.refresh_token,
                amazon_ads_token_expires_at: expiresAt.toISOString(),
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Erro ao salvar tokens de anúncios da Amazon no banco:', dbError);
            return responderTexto(res, 500, 'Erro interno ao vincular sua conta de anúncios da Amazon ao perfil.');
        }

        return res.redirect('/?amazon_ads_connected=true');
    } catch (err) {
        console.error('Erro no callback de anúncios da Amazon:', err);
        return responderTexto(res, 500, 'Erro interno ao processar o retorno da Amazon. Tente novamente pelo Impoclick.');
    }
}

module.exports = async (req, res) => {
    if (req.query && req.query.provider === 'amazon-ads') {
        return await tratarCallbackAmazonAds(req, res);
    }

    if (req.query && req.query.provider === 'shopee') {
        return await tratarCallbackShopee(req, res);
    }

    const { code, state, error } = req.query;

    if (error) {
        // O motivo real fica no log; o usuário só é devolvido ao app com uma
        // marcação fixa, sem nenhum trecho vindo da query string.
        console.warn('Mercado Livre recusou a autorização:', String(error).slice(0, 200));
        return res.redirect('/?ml_connected=false');
    }

    if (!code || !state) {
        return responderTexto(res, 400, 'Parâmetros "code" e "state" são obrigatórios.');
    }

    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;

    const estado = verificarState(state, clientSecret);
    if (!estado) {
        return responderTexto(res, 400, 'State inválido ou expirado. Inicie a conexão com o Mercado Livre novamente a partir do Impoclick.');
    }

    // O fluxo tem que terminar no MESMO navegador que o começou: o cookie
    // gravado por ml-auth.js precisa bater com o nonce do state. Sem isso, um
    // link de autorização gerado por outra pessoa e entregue a esta vincularia
    // o Mercado Livre desta pessoa à conta de quem gerou o link. Ver
    // _ml-oauth.js. O cookie é de uso único: sai de cena assim que confere.
    if (!nonceConfere(estado.nonce, lerCookie(req, COOKIE))) {
        console.warn(`Conexão do Mercado Livre recusada: o navegador que voltou do ML não é o que iniciou o fluxo (usuário ${estado.userId}).`);
        return responderTexto(res, 400, 'Esta conexão não foi iniciada neste navegador. Abra o Impoclick, neste mesmo navegador, e clique em Conectar Mercado Livre de novo.');
    }
    res.setHeader('Set-Cookie', cookieApagado());
    const userId = estado.userId;

    const redirectUri = process.env.ML_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback`;

    try {
        if (!supabaseAdmin) {
            throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
        }

        // Trocar o código de autorização pelos tokens de acesso
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            redirect_uri: redirectUri
        });

        const resp = await fetch(`${ML_BASE}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body,
        });

        if (!resp.ok) {
            // Corpo do erro só no log: além do risco de reflexão, resposta de
            // OAuth pode carregar detalhe de configuração que não interessa ao
            // usuário final.
            console.error('Falha ao obter token ML:', await resp.text());
            return responderTexto(res, 500, 'Não foi possível concluir a conexão com o Mercado Livre. Tente novamente pelo Impoclick.');
        }

        const data = await resp.json();
        
        // Obter também o ml_user_id a partir do endpoint /users/me
        const meResp = await fetch(`${ML_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` }
        });
        
        let mlUserId = null;
        if (meResp.ok) {
            const meData = await meResp.json();
            mlUserId = meData.id;
        }

        // Calcula o tempo de expiração
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in - 300); // 5 min de margem

        // Salvar no banco Supabase
        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                ml_access_token: data.access_token,
                ml_refresh_token: data.refresh_token,
                ml_token_expires_at: expiresAt.toISOString(),
                ml_user_id: mlUserId ? String(mlUserId) : null
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Erro ao salvar tokens no banco:', dbError);
            return responderTexto(res, 500, 'Erro interno ao vincular sua conta do Mercado Livre ao perfil.');
        }

        // mlUserId nulo significa que /users/me falhou. A conexão até é salva,
        // mas o ml-freight monta o path com esse id e passaria a falhar sem
        // explicação — melhor registrar alto.
        if (!mlUserId) {
            console.error(`Conta ML vinculada ao usuário ${userId} SEM ml_user_id (/users/me falhou). Recursos que dependem do id do vendedor não vão funcionar até reconectar.`);
        }

        // Redireciona de volta para a plataforma (Página de Configurações ou Painel)
        res.redirect('/?ml_connected=true');
        
    } catch (err) {
        console.error('Erro no callback do ML:', err);
        responderTexto(res, 500, 'Erro interno ao processar o retorno do Mercado Livre. Tente novamente pelo Impoclick.');
    }
};
