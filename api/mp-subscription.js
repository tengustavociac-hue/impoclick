const { MercadoPagoConfig, PreApproval } = require('mercadopago');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Faltando userId.' });
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preApproval = new PreApproval(client);

    try {
        const result = await preApproval.create({
            body: {
                reason: 'Assinatura Mensal PRO',
                external_reference: userId,
                // O email do pagador é obrigatório no SDK antigo, mas no novo geralmente não, 
                // porém vamos colocar um placeholder caso o MP exija.
                payer_email: "cliente@impoclick.com", 
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: 29.90,
                    currency_id: 'BRL'
                },
                back_url: 'https://impoclick-b4mys5bbs-tengustavociac-hues-projects.vercel.app/index.html'
            }
        });

        return res.status(200).json({ init_point: result.init_point });
    } catch (error) {
        console.error('Erro ao gerar assinatura do Mercado Pago:', error);
        return res.status(500).json({ error: 'Erro interno ao gerar assinatura.' });
    }
};
