const { MercadoPagoConfig, Preference } = require('mercadopago');

module.exports = async (req, res) => {
    // Apenas requisições POST são aceitas
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Faltando userId no corpo da requisição.' });
    }

    // Inicializa o Mercado Pago
    // IMPORTANTE: Adicione MP_ACCESS_TOKEN nas variáveis de ambiente da Vercel
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    try {
        const result = await preference.create({
            body: {
                items: [
                    {
                        title: 'Acesso PRO (1 Mês)',
                        quantity: 1,
                        unit_price: 29.90,
                        currency_id: 'BRL',
                    }
                ],
                // O external_reference é o nosso salva-vidas para saber quem pagou!
                external_reference: userId,
                back_urls: {
                    success: 'https://impoclick-b4mys5bbs-tengustavociac-hues-projects.vercel.app',
                    failure: 'https://impoclick-b4mys5bbs-tengustavociac-hues-projects.vercel.app',
                    pending: 'https://impoclick-b4mys5bbs-tengustavociac-hues-projects.vercel.app'
                },
                auto_return: 'approved',
                // O webhook url deve ser HTTPS público (a vercel fornece isso)
                notification_url: 'https://impoclick-b4mys5bbs-tengustavociac-hues-projects.vercel.app/api/mp-webhook'
            }
        });

        // Retorna o link de pagamento gerado!
        return res.status(200).json({ init_point: result.init_point });
    } catch (error) {
        console.error('Erro ao gerar link do Mercado Pago:', error);
        return res.status(500).json({ error: 'Erro interno ao gerar o checkout.' });
    }
};
