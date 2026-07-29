const { mlFetch } = require('./_ml-helper');

const SITE_ID = 'MLB';

async function handleCategory(req, res, userId) {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Parâmetro q (nome do produto) é obrigatório.' });

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
}

async function handleFee(req, res, userId) {
    const { price, category, listingType } = req.query;
    if (!price || !category) {
        return res.status(400).json({ error: 'Parâmetros price e category são obrigatórios.' });
    }

    const resp = await mlFetch(userId, `/sites/${SITE_ID}/listing_prices?price=${encodeURIComponent(price)}&category_id=${encodeURIComponent(category)}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ error: 'Nenhuma tarifa retornada para essa categoria/preço.' });
    }

    const wantedType = listingType || 'gold_special'; // "Clássico"
    const match = data.find(d => d.listing_type_id === wantedType) || data[0];

    res.json({
        listingTypeId: match.listing_type_id,
        listingTypeName: match.listing_type_name,
        percentageFee: match.sale_fee_details.percentage_fee,
        saleFeeAmount: match.sale_fee_amount,
        options: data.map(d => ({
            id: d.listing_type_id,
            name: d.listing_type_name,
            percentageFee: d.sale_fee_details.percentage_fee,
            saleFeeAmount: d.sale_fee_amount,
        })),
    });
}

async function handleItem(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const resp = await mlFetch(userId, `/items/${encodeURIComponent(itemId)}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    res.json({
        id: data.id,
        title: data.title,
        price: data.price,
        currencyId: data.currency_id,
        categoryId: data.category_id,
        permalink: data.permalink,
    });
}

async function handleBestSeller(req, res, userId) {
    const category = req.query.category;
    if (!category) return res.status(400).json({ error: 'Parâmetro category é obrigatório.' });

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
}

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required.' });

    try {
        switch (req.query.action) {
            case 'category': return await handleCategory(req, res, userId);
            case 'fee': return await handleFee(req, res, userId);
            case 'item': return await handleItem(req, res, userId);
            case 'bestseller': return await handleBestSeller(req, res, userId);
            default: return res.status(400).json({ error: 'Parâmetro action inválido. Use category, fee, item ou bestseller.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
