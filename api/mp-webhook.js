const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

// Verificação de assinatura oficial do MP (x-signature: "ts=...,v1=..."), manifest
// "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado com HMAC-SHA256 usando
// o secret do painel de Webhooks do MP. Fica com skipped=true (não bloqueia) enquanto
// MP_WEBHOOK_SECRET não estiver configurado, pra não quebrar o que já funciona hoje —
// assim que configurar o secret, a verificação passa a valer sozinha.
function verifyMpSignature(req) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) return { verified: false, skipped: true };

    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (!xSignature) return { verified: false, skipped: false };

    const parts = {};
    xSignature.split(',').forEach((p) => {
        const [k, v] = p.split('=');
        if (k) parts[k.trim()] = (v || '').trim();
    });
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return { verified: false, skipped: false };

    const dataId = String((req.query && (req.query['data.id'] || req.query.id)) || '').toLowerCase();

    let manifest = '';
    if (dataId) manifest += `id:${dataId};`;
    if (xRequestId) manifest += `request-id:${xRequestId};`;
    manifest += `ts:${ts};`;

    const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { verified: matches, skipped: false };
}

module.exports = async (req, res) => {
    // Mercado Pago pode mandar notificações GET para testes, mas pagamentos são POST
    if (req.method !== 'POST') {
        return res.status(200).send('OK');
    }

    const sigCheck = verifyMpSignature(req);
    if (sigCheck.skipped) {
        console.warn('MP_WEBHOOK_SECRET não configurado — verificação de assinatura do webhook MP está desativada. Configure o secret no painel de Webhooks do Mercado Pago pra ativar.');
    } else if (!sigCheck.verified) {
        console.error('Assinatura do webhook MP inválida — rejeitando notificação.');
        return res.status(401).json({ error: 'invalid signature' });
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
