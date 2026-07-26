const { mlFetch } = require('./_ml-helper');

const SITE_ID = 'MLB';

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required.' });

    const category = req.query.category;
    if (!category) return res.status(400).json({ error: 'Parâmetro category é obrigatório.' });

    try {
        const resp = await mlFetch(userId, `/highlights/${SITE_ID}/category/${encodeURIComponent(category)}`);
        if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
        
        const data = await resp.json();
        const top = data.content && data.content[0];
        if (!top) return res.status(404).json({ error: 'Nenhum produto em destaque para esta categoria.' });

        let name = null;
        if (top.type === 'PRODUCT' || top.type === 'USER_PRODUCT') {
            const prodResp = await mlFetch(userId, `/products/${top.id}`);
            if (prodResp.ok) {
                const prod = await prodResp.json();
                name = prod.name || null;
            }
        } else if (top.type === 'ITEM') {
            const itemResp = await mlFetch(userId, `/items/${top.id}`);
            if (itemResp.ok) {
                const item = await itemResp.json();
                name = item.title || null;
            }
        }

        res.json({
            id: top.id,
            type: top.type,
            position: top.position,
            name,
            permalink: `https://www.mercadolivre.com.br/p/${top.id}`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
