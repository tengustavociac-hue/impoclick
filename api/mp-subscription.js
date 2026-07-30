const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const { getVerifiedUserId } = require('./_ml-helper');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Mesma correção do mp-checkout.js: userId vinha cru do corpo da
    // requisição, sem provar que quem chamou é dono dele. Agora exige o
    // Authorization: Bearer verificado contra o Supabase Auth.
    const userId = await getVerifiedUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preApproval = new PreApproval(client);

    // Usa o domínio estável configurado, ou cai para o host da própria requisição
    // (evita depender da URL de deployment que muda a cada deploy na Vercel).
    const baseUrl = process.env.SITE_URL || `https://${req.headers.host}`;

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
                back_url: `${baseUrl}/index.html`
            }
        });

        return res.status(200).json({ init_point: result.init_point });
    } catch (error) {
        console.error('Erro ao gerar assinatura do Mercado Pago:', error);
        return res.status(500).json({ error: 'Erro interno ao gerar assinatura.' });
    }
};
