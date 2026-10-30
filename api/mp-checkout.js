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

    // Nada de `payer` na preference, de propósito. Chegamos a mandar o e-mail da
    // sessão aqui achando que o botão "Criar Pix" travava por falta de dado do
    // pagador. O teste mostrou o contrário: a preference SEM payer funciona, e a
    // COM payer trava quando esse e-mail é o da própria conta vendedora —
    // ninguém pode pagar para si mesmo. Quem coleta os dados do comprador é a
    // tela do Mercado Pago, e ela faz isso sozinha.

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
                        // O título aparece na tela de checkout e no comprovante.
                        // Levar a marca aqui garante que o cliente veja
                        // "Impoclick" mesmo que algum ponto do fluxo caia para o
                        // nome da conta.
                        title: 'Impoclick PRO — 1 mês',
                        description: 'Assinatura mensal do Impoclick',
                        quantity: 1,
                        unit_price: 29.90,
                        currency_id: 'BRL',
                    }
                ],
                // Texto que aparece na FATURA DO CARTÃO do cliente. Sem isso, a
                // operadora usa o nome cadastrado na conta do Mercado Pago —
                // que, em conta de pessoa física, é o nome civil do titular.
                // Máx. 22 caracteres; só letras, números e espaço.
                statement_descriptor: 'IMPOCLICK',
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
