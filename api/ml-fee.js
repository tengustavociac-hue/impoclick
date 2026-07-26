const { mlFetch } = require('./_ml-helper');

const SITE_ID = 'MLB';

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required.' });

    const { price, category, listingType } = req.query;
    if (!price || !category) {
        return res.status(400).json({ error: 'Parâmetros price e category são obrigatórios.' });
    }

    try {
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
