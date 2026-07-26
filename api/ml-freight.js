const { mlFetch } = require('./_ml-helper');

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required.' });

    const { weight, length, width, height, price, listingType } = req.query;
    if (!weight || !length || !width || !height || !price) {
        return res.status(400).json({ error: 'Parâmetros weight, length, width, height e price são obrigatórios.' });
    }

    try {
        const dimensions = `${height}x${width}x${length},${Math.round(Number(weight))}`;
        const qs = new URLSearchParams({
            dimensions,
            item_price: price,
            listing_type_id: listingType || 'gold_special',
            mode: 'me2',
            condition: 'new',
            logistic_type: 'drop_off',
            free_shipping: 'true',
            verbose: 'true',
        });

        // Passamos uma função para montar o path já que precisamos do mlUserId
        const result = await mlFetch(userId, (mlUserId) => `/users/${mlUserId}/shipping_options/free?${qs.toString()}`, {}, true);
        
        const resp = result.resp;
        if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
        
        const data = await resp.json();
        const coverage = data.coverage && data.coverage.all_country;
        if (!coverage) return res.status(404).json({ error: 'A API não retornou cobertura de frete para esses dados.' });

        res.json({
            cost: coverage.list_cost,
            billableWeightG: coverage.billable_weight,
            currency: coverage.currency_id,
            discount: data.coverage.discount || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
