const { ML_BASE, supabaseAdmin } = require('./_ml-helper');

module.exports = async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send(`Erro na autorização do Mercado Livre: ${error}`);
    }

    if (!code || !state) {
        return res.status(400).send('Parâmetros "code" e "state" (userId) são obrigatórios.');
    }

    const userId = state;
    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
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
            const errText = await resp.text();
            console.error('Falha ao obter token ML:', errText);
            return res.status(500).send(`Falha ao obter token do Mercado Livre: ${errText}`);
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
            return res.status(500).send('Erro interno ao vincular sua conta do Mercado Livre ao perfil.');
        }

        // Redireciona de volta para a plataforma (Página de Configurações ou Painel)
        res.redirect('/?ml_connected=true');
        
    } catch (err) {
        console.error('Erro no callback do ML:', err);
        res.status(500).send('Erro interno no servidor ao processar o callback do Mercado Livre: ' + err.message);
    }
};
