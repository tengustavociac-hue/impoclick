const { mlFetch } = require('./_ml-helper');

const SITE_ID = 'MLB';

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required.' });

    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Parâmetro q (nome do produto) é obrigatório.' });

    try {
        const resp = await mlFetch(userId, `/sites/${SITE_ID}/domain_discovery/search?limit=1&q=${encodeURIComponent(q)}`);
        if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
        
        const data = await resp.json();
        const match = Array.isArray(data) ? data[0] : null;
        if (!match) return res.status(404).json({ error: 'Nenhuma categoria encontrada para esse termo.' });

        res.json({
            categoryId: match.category_id,
            categoryName: match.category_name,
            domainId: match.domain_id,
            domainName: match.domain_name,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
