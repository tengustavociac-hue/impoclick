const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');
const { revogarAcesso } = require('./_ml-helper');

// Status de pagamento do Mercado Pago em que o dinheiro voltou para o cliente e
// o acesso tem que sair junto. 'refunded' é a devolução feita por nós no painel,
// 'charged_back' é o estorno pedido pelo cliente ao banco, e 'cancelled' é o
// pagamento anulado antes de compensar.
const STATUS_QUE_REVOGAM = ['refunded', 'charged_back', 'cancelled'];

async function mpGet(caminho) {
    const resp = await fetch('https://api.mercadopago.com' + caminho, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
        console.error(`[mp-webhook] GET ${caminho.split('?')[0]} respondeu ${resp.status}`);
        return null;
    }
    return resp.json().catch(() => null);
}

// Degrau 2 da identificação: a cobrança pode apontar para a assinatura que a
// gerou, e é a assinatura que guarda o nosso external_reference.
async function usuarioPelaAssinatura(paymentInfo) {
    const preapprovalId =
        (paymentInfo.metadata && (paymentInfo.metadata.preapproval_id || paymentInfo.metadata.preapprovalId))
        || paymentInfo.preapproval_id;
    if (!preapprovalId) return null;

    const assinatura = await mpGet(`/preapproval/${preapprovalId}`);
    if (assinatura && assinatura.external_reference) {
        console.log(`[mp-webhook] pagamento ligado à assinatura ${preapprovalId} → usuário ${assinatura.external_reference}`);
        return assinatura.external_reference;
    }
    return null;
}

// Degrau 3: o payer_email da cobrança é o e-mail da conta Impoclick, porque é
// dele que o /api/mp-subscription monta o payer_email. Serve de rede quando o MP
// não devolve nenhuma referência à assinatura.
async function usuarioPeloEmail(email) {
    if (!email || !supabaseAdminGlobal) return null;
    const { data, error } = await supabaseAdminGlobal
        .from('profiles')
        .select('id')
        .eq('email', String(email).trim().toLowerCase())
        .limit(2);

    if (error) {
        console.error('[mp-webhook] falha ao procurar perfil pelo e-mail do pagador:', error.message);
        return null;
    }
    if (!data || data.length !== 1) {
        // Zero é desconhecido; mais de um seria ambíguo e liberar/revogar a
        // conta errada é pior do que não fazer nada.
        console.error(`[mp-webhook] e-mail do pagador casou com ${data ? data.length : 0} perfis — não dá para decidir.`);
        return null;
    }
    console.log(`[mp-webhook] pagamento identificado pelo e-mail do pagador → usuário ${data[0].id}`);
    return data[0].id;
}

// O supabaseAdmin é criado dentro do handler (para falhar tratado se faltar env
// var), mas os resolvedores acima rodam fora dele. Esta referência é preenchida
// no início de cada requisição.
let supabaseAdminGlobal = null;

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
        // Rejeitar é o certo, mas rejeitar em silêncio custa caro: cada
        // notificação barrada aqui é um evento perdido, e depois da correção do
        // reembolso isso significa cliente devolvido seguindo com acesso. O log
        // abaixo diz QUAL evento foi barrado e por quê, para dar pra distinguir
        // ataque de secret errado/URL duplicada no painel do MP.
        const corpo = req.body || {};
        console.error(
            '[mp-webhook] assinatura inválida — notificação REJEITADA e PERDIDA. ' +
            `type=${corpo.type} action=${corpo.action} data.id=${corpo.data && corpo.data.id} ` +
            `| data.id na query=${req.query && (req.query['data.id'] || req.query.id) ? 'sim' : 'NÃO'} ` +
            `| x-request-id=${req.headers['x-request-id'] ? 'presente' : 'ausente'}. ` +
            'Se estes eventos forem legítimos, confira se o secret da Vercel é o da MESMA aplicação do painel de Webhooks do MP.'
        );
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
        supabaseAdminGlobal = supabaseAdmin;

        const { type, data, action } = req.body || {};

        // Diagnóstico: sem isto, uma notificação que não casa com nenhum dos
        // ramos abaixo simplesmente responde 200 e some, sem deixar rastro —
        // que foi exatamente o sintoma de "paguei e não liberou". Registra o
        // suficiente para identificar o caso (tipo/ação/id), sem dado sensível.
        console.log(`[mp-webhook] recebido type=${type} action=${action} id=${data && data.id}`);

        // PAGAMENTO ÚNICO (PIX OU CARTÃO - 1 MÊS)
        if ((type === 'payment' || action === 'payment.created') && data && data.id) {
            const paymentInfo = await payment.get({ id: data.id });
            const status = paymentInfo.status; // 'approved', 'pending', etc.

            // Ao montar uma assinatura o Mercado Pago aprova uma cobrança de
            // R$ 0 só para validar o cartão. Ela chega aqui como `approved` e
            // liberava acesso sem um centavo ter entrado. Dinheiro de verdade
            // tem valor maior que zero.
            //
            // Declarado aqui, no topo: estava lá embaixo e era usado antes,
            // então toda notificação de pagamento morria em ReferenceError
            // (TDZ) e o MP recebia 500 no lugar do processamento.
            const valorPago = Number(paymentInfo.transaction_amount) || 0;

            // As cobranças geradas por uma assinatura NÃO carregam o
            // external_reference que mandamos na criação do preapproval — o log
            // de produção mostrou "PAGAMENTO APROVADO SEM external_reference"
            // para a primeira mensalidade. Sem resolver isso, nenhuma cobrança
            // recorrente liberava acesso, e nenhum reembolso de mensalidade
            // conseguia tirar. Por isso a identificação agora tem três degraus.
            const userId = paymentInfo.external_reference
                || (await usuarioPelaAssinatura(paymentInfo))
                || (await usuarioPeloEmail(paymentInfo.payer && paymentInfo.payer.email));

            console.log(`[mp-webhook] pagamento ${data.id}: status=${status} usuário=${userId || 'NÃO IDENTIFICADO'} (external_reference=${paymentInfo.external_reference ? 'presente' : 'ausente'}) metodo=${paymentInfo.payment_method_id}`);

            // Reembolso, chargeback e cancelamento significam que o dinheiro
            // voltou. Antes o código só olhava para 'approved' e caía no log de
            // "aguardando aprovação", então devolver um pagamento no painel do
            // Mercado Pago não tirava o acesso de ninguém: o cliente era
            // reembolsado e continuava PRO para sempre.
            if (STATUS_QUE_REVOGAM.includes(status)) {
                if (!userId) {
                    console.error(`[mp-webhook] pagamento ${data.id} virou ${status} SEM external_reference — impossível saber de quem tirar o acesso. Conferir manualmente no painel do MP.`);
                } else {
                    console.log(`[mp-webhook] pagamento ${data.id} virou ${status} — revogando o acesso do usuário ${userId}.`);
                    await revogarAcesso(userId, `pagamento ${data.id} ${status}`);
                }
            } else if (status === 'rejected' && !paymentInfo.external_reference && userId) {
                // Mensalidade recusada pelo banco. Só vale para cobrança de
                // assinatura (que chega sem external_reference): num avulso, uma
                // tentativa recusada não pode derrubar o acesso que a pessoa
                // já tenha por outro pagamento.
                console.log(`[mp-webhook] mensalidade ${data.id} RECUSADA — revogando o acesso de ${userId}.`);
                await revogarAcesso(userId, `mensalidade ${data.id} rejected`);
            } else if (status === 'approved' && Number(paymentInfo.transaction_amount_refunded) > 0) {
                // Reembolso parcial mantém o status 'approved'. Não revogamos
                // sozinhos porque devolver R$ 5 de R$ 29,90 não é cancelar o
                // acesso — mas fica registrado para não passar despercebido.
                console.warn(`[mp-webhook] pagamento ${data.id} teve reembolso PARCIAL de ${paymentInfo.transaction_amount_refunded} e segue aprovado. Acesso mantido — revise à mão se a intenção era cancelar.`);
            } else if (status !== 'approved') {
                // PIX nasce 'pending' e só vira 'approved' quando o cliente
                // efetivamente paga — o MP manda notificação nos dois momentos.
                // Este ramo é o normal na primeira notificação.
                console.log(`[mp-webhook] ainda não aprovado (${status}) — aguardando a notificação de aprovação.`);
            }

            if (status === 'approved' && valorPago > 0 && !userId) {
                // Chegou dinheiro e não sabemos de quem. Os três degraus de
                // identificação falharam — precisa de olho humano.
                console.error(`[mp-webhook] PAGAMENTO APROVADO SEM DONO (id=${data.id}, e-mail=${(paymentInfo.payer && paymentInfo.payer.email) || '—'}). Ninguém foi liberado — conferir no painel do MP.`);
            }

            if (status === 'approved' && valorPago <= 0) {
                console.log(`[mp-webhook] pagamento ${data.id} aprovado com valor R$ ${valorPago} — é validação de cartão, não cobrança. Acesso NÃO liberado.`);
            } else if (status === 'approved' && userId) {
                // Cobrança de assinatura não tem prazo de 30 dias: quem manda é
                // o preapproval, e ele já grava expires_at = null. Marcar 30 dias
                // aqui derrubaria o acesso de um assinante ativo em um mês.
                const ehMensalidade = !paymentInfo.external_reference;
                const patch = ehMensalidade
                    ? { is_pro: true, subscription_expires_at: null }
                    : { is_pro: true, subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };

                console.log(`[mp-webhook] pagamento aprovado (${ehMensalidade ? 'mensalidade da assinatura' : 'avulso 30 dias'}) para o usuário: ${userId}`);
                const { error } = await supabaseAdmin
                  .from('profiles')
                  .update(patch)
                  .eq('id', userId);
                if (error) console.error('Erro no Supabase MP Webhook:', error);
            }
        }
        
        // ASSINATURA RECORRENTE (CARTÃO - PREAPPROVAL)
        // Escuta qualquer ação de preapproval, não só a .created: antes o
        // cancelamento (.updated com status cancelled) era ignorado e a conta
        // seguia PRO pra sempre depois de cancelar a assinatura no MP.
        if ((type === 'subscription_preapproval' || String(action || '').startsWith('subscription_preapproval')) && data && data.id) {
            // No SDK v2, podemos fazer um fetch direto ou usar a API preapproval
            // Para simplificar, como o ID da subscription (data.id) vem no corpo,
            // e infelizmente o SDK v2 do node não expõe facilmente get() de preapproval,
            // vamos fazer fetch direto na API REST do MP (fetch nativo do Node 18+)
            const response = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
                headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
            });
            const subData = await response.json();
            
            const userId = subData.external_reference;
            const status = subData.status; // 'pending' | 'authorized' | 'paused' | 'cancelled'

            console.log(`[mp-webhook] assinatura ${data.id}: status=${status} external_reference=${userId ? 'presente' : 'AUSENTE'}`);

            if (userId) {
                if (status === 'authorized') {
                    // NÃO libera acesso aqui. `authorized` é o cartão aprovado
                    // para cobranças recorrentes, não dinheiro recebido — o MP
                    // ainda vai gerar a fatura, e ela pode ser recusada.
                    //
                    // Este ramo era o último a liberar no escuro: tirei a
                    // liberação do /api/mp-subscription e ela continuou saindo
                    // por aqui, então o acesso seguia sendo dado na autorização.
                    // Quem libera é a cobrança com valor maior que zero, no ramo
                    // de pagamento acima.
                    const pagas = Number((subData.summarized && subData.summarized.charged_quantity) || 0);
                    console.log(`[mp-webhook] assinatura ${data.id} autorizada para ${userId} (faturas pagas: ${pagas}) — acesso NÃO liberado aqui; aguardando cobrança com valor.`);
                } else if (status === 'cancelled' || status === 'paused') {
                    // Passou a usar o revogarAcesso: antes zerava só o is_pro, e
                    // como o getAccessStatus() libera com `is_pro || is_subscribed`,
                    // quem tivesse a coluna legada preenchida continuava com
                    // acesso mesmo depois de cancelar a assinatura.
                    console.log(`Assinatura MP ${status} — removendo o acesso do usuário: ${userId}`);
                    await revogarAcesso(userId, `assinatura ${data.id} ${status}`);
                }
            }
        }

        // MENSALIDADE DA ASSINATURA (subscription_authorized_payment)
        //
        // É o tópico que o MP usa para cada fatura gerada por um preapproval —
        // separado do tópico 'payment'. Ele traz o preapproval_id, que é o
        // caminho confiável de volta até o nosso external_reference. Sem tratar
        // isto, uma mensalidade recusada ou devolvida passava batida e o
        // assinante seguia com acesso.
        if ((type === 'subscription_authorized_payment' || String(action || '').startsWith('subscription_authorized_payment')) && data && data.id) {
            const fatura = await mpGet(`/authorized_payments/${data.id}`);
            const statusFatura = fatura && (fatura.status || (fatura.payment && fatura.payment.status));
            const preapprovalId = fatura && fatura.preapproval_id;

            let userId = null;
            if (preapprovalId) {
                const assinatura = await mpGet(`/preapproval/${preapprovalId}`);
                userId = assinatura && assinatura.external_reference;
            }

            console.log(`[mp-webhook] mensalidade ${data.id}: status=${statusFatura} assinatura=${preapprovalId || '—'} usuário=${userId || 'NÃO IDENTIFICADO'}`);

            if (!userId) {
                console.error(`[mp-webhook] mensalidade ${data.id} sem dono identificável — conferir no painel do MP.`);
            } else if (statusFatura === 'approved' || statusFatura === 'processed') {
                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({ is_pro: true, subscription_expires_at: null })
                    .eq('id', userId);
                if (error) console.error('[mp-webhook] falha ao renovar o acesso pela mensalidade:', error);
                else console.log(`[mp-webhook] mensalidade paga — acesso renovado para ${userId}.`);
            } else if (STATUS_QUE_REVOGAM.includes(statusFatura) || statusFatura === 'rejected') {
                console.log(`[mp-webhook] mensalidade ${data.id} com status ${statusFatura} — revogando o acesso de ${userId}.`);
                await revogarAcesso(userId, `mensalidade ${data.id} ${statusFatura}`);
            }
        }

        // MP exige status 200 rápido
        res.status(200).json({ received: true });
    } catch (err) {
        console.error('Erro no Webhook MP:', err);
        res.status(500).send('Erro interno');
    }
};
