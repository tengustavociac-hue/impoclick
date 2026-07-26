module.exports = (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).send('userId é obrigatório.');
    }

    const APP_ID = process.env.ML_CLIENT_ID;
    if (!APP_ID) {
        return res.status(500).send('ML_CLIENT_ID não configurado no servidor.');
    }

    // A URL de callback (deve estar registrada no painel do Mercado Livre exatamente igual)
    const REDIRECT_URI = process.env.ML_REDIRECT_URI || `https://${req.headers.host}/api/ml-callback`;

    // Redireciona o usuário para a tela de permissão do Mercado Livre
    const mlUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${userId}`;
    
    res.redirect(mlUrl);
};
