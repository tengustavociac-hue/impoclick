const { mlFetch } = require('./_ml-helper');

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ connected: false, error: 'User token is required in headers.' });

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
