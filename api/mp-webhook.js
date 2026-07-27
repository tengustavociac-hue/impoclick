const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // Mercado Pago pode mandar notificações GET para testes, mas pagamentos são POST
    if (req.method !== 'POST') {
        return res.status(200).send('OK');
    }

    try {
        // Inicializa clientes aqui dentro: se faltar alguma env var (ex:
        // SUPABASE_URL), isso agora vira um 500 tratado em vez de derrubar a
        // função inteira sem log (mesma classe de bug já corrigida em
        // api/_ml-helper.js).
        const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        const payment = new Payment(client);

        const supabaseAdmin = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { type, data, action } = req.body;

        // PAGAMENTO ÚNICO (PIX OU CARTÃO - 1 MÊS)
        if ((type === 'payment' || action === 'payment.created') && data && data.id) {
            const paymentInfo = await payment.get({ id: data.id });
            const userId = paymentInfo.external_reference;
            const status = paymentInfo.status; // 'approved', 'pending', etc.

            if (status === 'approved' && userId) {
                console.log(`Pagamento MP (Único) aprovado para o usuário: ${userId}`);
                const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const { error } = await supabaseAdmin
                  .from('profiles')
                  .update({ is_pro: true, subscription_expires_at: expires })
                  .eq('id', userId);
                if (error) console.error('Erro no Supabase MP Webhook:', error);
            }
        }
        
        // ASSINATURA RECORRENTE (CARTÃO - PREAPPROVAL)
        if ((type === 'subscription_preapproval' || action === 'subscription_preapproval.created') && data && data.id) {
            // No SDK v2, podemos fazer um fetch direto ou usar a API preapproval
            // Para simplificar, como o ID da subscription (data.id) vem no corpo,
            // e infelizmente o SDK v2 do node não expõe facilmente get() de preapproval,
            // vamos fazer fetch direto na API REST do MP (fetch nativo do Node 18+)
            const response = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
                headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
            });
            const subData = await response.json();
            
            const userId = subData.external_reference;
            const status = subData.status; // 'authorized', etc
            
            if (status === 'authorized' && userId) {
                console.log(`Assinatura MP autorizada para o usuário: ${userId}`);
                const { error } = await supabaseAdmin
                  .from('profiles')
                  .update({ is_pro: true, subscription_expires_at: null })
                  .eq('id', userId);
                if (error) console.error('Erro no Supabase MP Webhook (Assinatura):', error);
            }
        }

        // MP exige status 200 rápido
        res.status(200).json({ received: true });
    } catch (err) {
        console.error('Erro no Webhook MP:', err);
        res.status(500).send('Erro interno');
    }
};
