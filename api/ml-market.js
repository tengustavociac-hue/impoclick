const { mlFetch, getVerifiedUserId } = require('./_ml-helper');

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
    if (!resp.ok) {
        let message = 'Não foi possível consultar este anúncio.';
        try {
            const errData = await resp.json();
            if (errData.message) message = errData.message;
        } catch (e) { /* corpo não era JSON, mantém a mensagem padrão */ }
        return res.status(resp.status).json({ error: message });
    }

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

// Qualidade do anúncio, direto da API oficial do Mercado Livre. É a mesma
// checagem que o ML mostra ao vendedor no painel dele: pontuação de 0 a 100,
// nível (Básica/Satisfatória/Profissional) e a lista de ações pendentes,
// separadas entre WARNING (problema que derruba a pontuação) e OPPORTUNITY
// (melhoria possível). Cada ação já vem com o link do ML para corrigir.
//
// Só funciona nos anúncios da PRÓPRIA conta conectada — a API responde 401
// "Caller must be the seller of the item" para anúncios de terceiros, por
// desenho. Não dá para auditar anúncio de concorrente por aqui.
//
// Substitui a antiga /health, descontinuada pelo ML em 07/02/2025.
async function handlePerformance(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const isUserProduct = /^MLB?U/i.test(itemId) || /^[A-Z]{3}U\d+$/i.test(itemId);
    const path = isUserProduct
        ? `/user-product/${encodeURIComponent(itemId)}/performance`
        : `/item/${encodeURIComponent(itemId)}/performance`;

    const resp = await mlFetch(userId, path);

    if (!resp.ok) {
        const raw = await resp.text();
        let message = raw;
        try { message = (JSON.parse(raw).message) || raw; } catch (e) { /* resposta não-JSON */ }

        if (resp.status === 401) {
            return res.status(403).json({
                error: 'not_own_item',
                message: 'Este anúncio não pertence à conta do Mercado Livre conectada. A análise de qualidade só está disponível para os seus próprios anúncios.',
            });
        }
        if (resp.status === 404) {
            return res.status(404).json({
                error: 'no_data',
                message: 'O Mercado Livre ainda não gerou os dados de qualidade deste anúncio. Isso costuma acontecer com anúncios recém-criados.',
            });
        }
        return res.status(resp.status).json({ error: message });
    }

    const data = await resp.json();

    // Achata buckets -> variables -> rules numa lista única de ações, que é
    // o formato que o painel da extensão realmente precisa exibir.
    const actions = [];
    (data.buckets || []).forEach((bucket) => {
        (bucket.variables || []).forEach((variable) => {
            (variable.rules || []).forEach((rule) => {
                const wordings = rule.wordings || {};
                actions.push({
                    group: bucket.title || null,
                    topic: variable.title || null,
                    key: rule.key,
                    status: rule.status,
                    mode: rule.mode,
                    progress: typeof rule.progress === 'number' ? rule.progress : null,
                    text: wordings.title || null,
                    label: wordings.label || null,
                    link: wordings.link || null,
                });
            });
        });
    });

    const pending = actions.filter((a) => a.status === 'PENDING');

    res.json({
        itemId: data.entity_id || itemId,
        entityType: data.entity_type || null,
        score: typeof data.score === 'number' ? data.score : null,
        level: data.level_wording || data.level || null,
        calculatedAt: data.calculated_at || null,
        totals: {
            actions: actions.length,
            completed: actions.length - pending.length,
            warnings: pending.filter((a) => a.mode === 'WARNING').length,
            opportunities: pending.filter((a) => a.mode === 'OPPORTUNITY').length,
        },
        // Problemas primeiro, depois oportunidades — a ordem em que o
        // vendedor deve atacar a lista.
        warnings: pending.filter((a) => a.mode === 'WARNING'),
        opportunities: pending.filter((a) => a.mode === 'OPPORTUNITY'),
        completed: actions.filter((a) => a.status === 'COMPLETED'),
    });
}

module.exports = async (req, res) => {
    const userId = await getVerifiedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

    try {
        switch (req.query.action) {
            case 'category': return await handleCategory(req, res, userId);
            case 'fee': return await handleFee(req, res, userId);
            case 'item': return await handleItem(req, res, userId);
            case 'bestseller': return await handleBestSeller(req, res, userId);
            case 'performance': return await handlePerformance(req, res, userId);
            default: return res.status(400).json({ error: 'Parâmetro action inválido. Use category, fee, item, bestseller ou performance.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
