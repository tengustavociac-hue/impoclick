const { mlFetch, supabaseAdmin } = require('./_ml-helper');

// GET  -> status da conexao com o Mercado Livre
// POST -> desconecta (apaga os tokens salvos)
// Junto num arquivo so porque o plano Hobby da Vercel limita a 12 funcoes
// serverless por deploy, e sao dois endpoints pequenos e relacionados.
module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ connected: false, error: 'User token is required in headers.' });

    if (req.method === 'POST') {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
        }
        try {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    ml_access_token: null,
                    ml_refresh_token: null,
                    ml_token_expires_at: null,
                    ml_user_id: null,
                })
                .eq('id', userId);

            if (error) {
                console.error('Erro ao desconectar conta ML:', error);
                return res.status(500).json({ error: 'Erro ao desconectar a conta do Mercado Livre.' });
            }

            return res.json({ disconnected: true });
        } catch (err) {
            console.error('Erro no ml-disconnect:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    try {
        const resp = await mlFetch(userId, '/users/me');
        if (!resp.ok) return res.status(resp.status).json({ connected: false });

        const data = await resp.json();
        res.json({
            connected: true,
            nickname: data.nickname,
            sellerLevel: data.seller_reputation ? data.seller_reputation.level_id : null,
            powerSellerStatus: data.seller_reputation ? data.seller_reputation.power_seller_status : null,
        });
    } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
    }
};
