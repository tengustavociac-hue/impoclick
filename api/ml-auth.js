const crypto = require('crypto');

module.exports = (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).send('userId é obrigatório.');
    }

    const APP_ID = process.env.ML_CLIENT_ID;
    const APP_SECRET = process.env.ML_CLIENT_SECRET;
    if (!APP_ID || !APP_SECRET) {
        return res.status(500).send('ML_CLIENT_ID / ML_CLIENT_SECRET não configurados no servidor.');
    }

    // A URL de callback (deve estar registrada no painel do Mercado Livre exatamente igual)
    const REDIRECT_URI = process.env.ML_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback`;

    // state assinado (HMAC com o mesmo ML_CLIENT_SECRET) em vez do userId cru:
    // sem isso, qualquer um podia forjar ?userId=<uuid de outra conta Impoclick>
    // e enganar uma vítima real do Mercado Livre pra vincular o token DELA à
    // conta do atacante (CSRF de account-linking). ml-callback.js valida essa
    // assinatura e a validade (10 min) antes de confiar no userId.
    const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString('base64url');
    const sig = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('base64url');
    const state = `${payload}.${sig}`;

    // Redireciona o usuário para a tela de permissão do Mercado Livre
    const mlUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(state)}`;

    res.redirect(mlUrl);
};
