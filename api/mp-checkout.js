const { MercadoPagoConfig, Preference } = require('mercadopago');
const { getVerifiedUserId } = require('./_ml-helper');

module.exports = async (req, res) => {
    // Apenas requisições POST são aceitas
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // O userId vinha cru do corpo da requisição — qualquer um podia gerar um
    // link de pagamento com o external_reference de outra pessoa. Agora exige
    // o mesmo Authorization: Bearer verificado contra o Supabase Auth usado no
    // resto da API (ver getVerifiedUserId em _ml-helper.js).
    const userId = await getVerifiedUserId(req);

    if (!userId) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    // Inicializa o Mercado Pago
    // IMPORTANTE: Adicione MP_ACCESS_TOKEN nas variáveis de ambiente da Vercel
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    // Usa o domínio estável configurado, ou cai para o host da própria requisição
    // (evita depender da URL de deployment que muda a cada deploy na Vercel).
    const baseUrl = process.env.SITE_URL || `https://${req.headers.host}`;

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
                    success: baseUrl,
                    failure: baseUrl,
                    pending: baseUrl
                },
                auto_return: 'approved',
                // O webhook url deve ser HTTPS público (a vercel fornece isso)
                notification_url: `${baseUrl}/api/mp-webhook`
            }
        });

        // Retorna o link de pagamento gerado!
        return res.status(200).json({ init_point: result.init_point });
    } catch (error) {
        console.error('Erro ao gerar link do Mercado Pago:', error);
        return res.status(500).json({ error: 'Erro interno ao gerar o checkout.' });
    }
};
