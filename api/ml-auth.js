const { getVerifiedUserId } = require('./_ml-helper');
const { criarState, cookieDoNonce, COOKIE_SHOPEE, COOKIE_AMAZON_ADS } = require('./_ml-oauth');
const { urlDeAutorizacao: urlDeAutorizacaoShopee } = require('./_shopee-helper');
const { urlDeAutorizacao: urlDeAutorizacaoAmazonAds } = require('./_amazon-ads-helper');

// Começa a conexão da conta do Mercado Livre OU da Shopee (?provider=shopee).
// Devolve { url }, e o navegador vai até ela. Um arquivo só por causa do
// teto de 12 funções da Vercel — mesmo motivo documentado em ml-status.js.
//
// Só quem está logado no Impoclick chega aqui: o userId sai da sessão
// verificada (Authorization: Bearer), nunca da URL. Antes este endpoint
// aceitava ?userId= de qualquer um e assinava o state para ele — ver o
// comentário de _ml-oauth.js sobre por que isso permitia vincular o Mercado
// Livre de uma vítima à conta de um atacante. O mesmo raciocínio vale pra
// Shopee: por isso o fluxo dela usa a MESMA proteção de state+nonce+cookie,
// só que com um cookie próprio (COOKIE_SHOPEE) pra não se misturar se o
// vendedor tiver as duas conexões em andamento em abas diferentes.
//
// Por isso a chamada é um fetch com o token, e não mais uma navegação direta.
// A resposta também grava o cookie que amarra o fluxo a este navegador.
module.exports = async (req, res) => {
    const userId = await getVerifiedUserId(req);
    if (!userId) {
        // Aba antiga, aberta antes desta mudança, ainda navega direto com
        // ?userId=. Melhor dizer o que fazer do que mostrar um JSON.
        if (req.query && req.query.userId) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(401).send('Atualize a página do Impoclick (Ctrl+F5) e clique em Conectar de novo.');
        }
        return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    if (req.query && req.query.provider === 'amazon-ads') {
        try {
            // Redirect de verdade (diferente da SP-API privada): precisa bater
            // EXATAMENTE com a "Allowed Return URL" cadastrada no Security
            // Profile "Impoclick Ads" (developer.amazon.com).
            const REDIRECT_URI = process.env.AMAZON_ADS_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback?provider=amazon-ads`;
            const { state, nonce } = criarState(userId, process.env.AMAZON_ADS_CLIENT_SECRET || '');
            const url = urlDeAutorizacaoAmazonAds(REDIRECT_URI, state);

            res.setHeader('Set-Cookie', cookieDoNonce(nonce, COOKIE_AMAZON_ADS));
            res.setHeader('Cache-Control', 'no-store');
            return res.json({ url });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.query && req.query.provider === 'shopee') {
        try {
            // A URL de callback (deve estar registrada igual no app do Open
            // Platform da Shopee). Diferente do Mercado Livre, o auth_partner
            // da Shopee não tem um parâmetro "state" nativo confirmado — em
            // vez de depender dela devolver algo nosso de volta, o token de
            // state assinado (usuário + nonce) fica só no cookie, e o
            // callback lê o PRÓPRIO cookie pra saber quem iniciou o fluxo.
            // A Shopee só precisa devolver "code" e "shop_id", que são os
            // únicos campos documentados do redirect dela.
            const REDIRECT_URI = process.env.SHOPEE_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback?provider=shopee`;
            const APP_SECRET = process.env.SHOPEE_PARTNER_KEY;
            const { state } = criarState(userId, APP_SECRET || '');
            const url = urlDeAutorizacaoShopee(REDIRECT_URI);

            res.setHeader('Set-Cookie', cookieDoNonce(state, COOKIE_SHOPEE));
            res.setHeader('Cache-Control', 'no-store');
            return res.json({ url });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    const APP_ID = process.env.ML_CLIENT_ID;
    const APP_SECRET = process.env.ML_CLIENT_SECRET;
    if (!APP_ID || !APP_SECRET) {
        return res.status(500).json({ error: 'ML_CLIENT_ID / ML_CLIENT_SECRET não configurados no servidor.' });
    }

    // A URL de callback (deve estar registrada no painel do Mercado Livre exatamente igual)
    const REDIRECT_URI = process.env.ML_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback`;

    const { state, nonce } = criarState(userId, APP_SECRET);
    const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(state)}`;

    res.setHeader('Set-Cookie', cookieDoNonce(nonce));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ url });
};
