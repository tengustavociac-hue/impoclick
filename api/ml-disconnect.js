const { supabaseAdmin } = require('./_ml-helper');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required in headers.' });

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

        res.json({ disconnected: true });
    } catch (err) {
        console.error('Erro no ml-disconnect:', err);
        res.status(500).json({ error: err.message });
    }
};
