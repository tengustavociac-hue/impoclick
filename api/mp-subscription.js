const { getVerifiedUser, supabaseAdmin } = require('./_ml-helper');

const VALOR_MENSAL = 29.90;

// Mensagens que o Mercado Pago devolve quando a autorização do cartão falha.
// Sem esse mapa o catch genérico respondia "Erro interno ao gerar assinatura"
// para tudo — inclusive para cartão sem limite, que é o caso mais comum e o
// único que o cliente consegue resolver sozinho.
const ERROS_CONHECIDOS = [
    [/insufficient|saldo|limite/i, 'Cartão sem limite disponível. Tente outro cartão.'],
    [/security_code|cvv|codigo de seguran/i, 'Código de segurança (CVV) incorreto.'],
    [/expiration|vencimento|expired/i, 'Data de validade incorreta ou cartão vencido.'],
    [/invalid.*(card|token)|card.*invalid/i, 'Dados do cartão inválidos. Confira e tente de novo.'],
    [/identification|document|cpf/i, 'CPF do titular inválido.'],
    [/blocked|disabled|bloquead/i, 'Cartão bloqueado pelo emissor. Fale com o banco ou use outro cartão.'],
    [/high_risk|fraud|rejected/i, 'O banco emissor recusou a cobrança. Tente outro cartão.'],
];

function traduzErro(texto) {
    const encontrado = ERROS_CONHECIDOS.find(([padrao]) => padrao.test(texto || ''));
    return encontrado
        ? encontrado[1]
        : 'Não foi possível autorizar o cartão. Confira os dados ou tente outro cartão.';
}

async function mpFetch(caminho, opcoes = {}) {
    const resp = await fetch('https://api.mercadopago.com' + caminho, {
        ...opcoes,
        headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            ...(opcoes.headers || {}),
        },
    });
    const corpo = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, corpo };
}

// Libera o PRO na hora. O webhook (api/mp-webhook.js) continua sendo a fonte da
// verdade para renovação e cancelamento, mas ele chega alguns segundos depois —
// e esperar por ele era exatamente a sensação de "paguei e não liberou".
//
// Nunca derruba a requisição: quando este ponto é alcançado a assinatura já está
// autorizada no MP, então falhar aqui não pode transformar uma cobrança bem
// sucedida em erro na tela. O webhook corrige em seguida.
async function liberarPro(userId) {
    if (!supabaseAdmin) {
        console.error('[mp-subscription] supabaseAdmin indisponível — PRO não gravado para', userId);
        return;
    }
    const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_pro: true, subscription_expires_at: null })
        .eq('id', userId);
    if (error) {
        console.error('[mp-subscription] assinatura autorizada mas falhou ao gravar is_pro:', error);
    }
}

module.exports = async (req, res) => {
    // O CardForm do MercadoPago.js precisa da public key no navegador. Ela é
    // pública por definição, mas continua vivendo nas env vars da Vercel em vez
    // de hardcoded no app.js — e é servida por aqui, e não por um endpoint novo,
    // porque api/ já está no teto de 12 funções da Vercel.
    if (req.method === 'GET') {
        if (!process.env.MP_PUBLIC_KEY) {
            console.error('MP_PUBLIC_KEY não configurada na Vercel — o formulário de cartão não sobe.');
            return res.status(500).json({ error: 'Pagamento por cartão indisponível no momento.' });
        }
        return res.status(200).json({ publicKey: process.env.MP_PUBLIC_KEY });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // userId e e-mail vêm da sessão verificada contra o Supabase Auth, nunca do
    // corpo da requisição: é o external_reference que o webhook lê para liberar
    // o PRO da conta certa.
    const user = await getVerifiedUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    // O token nasce no navegador (MercadoPago.js v2), representa o cartão de
    // forma segura, vale um único uso e expira em 7 dias. Número e CVV do cartão
    // não passam por este servidor em momento nenhum.
    const cardToken = String((req.body && req.body.cardToken) || '').trim();
    if (!cardToken) {
        return res.status(400).json({ error: 'Não foi possível validar os dados do cartão. Tente novamente.' });
    }

    // Opcional de propósito: se o security.js não tiver carregado, é melhor
    // tentar a cobrança sem o device id do que barrar a assinatura por isso.
    const deviceId = String((req.body && req.body.deviceId) || '').trim() || null;
    if (!deviceId) {
        console.warn('[mp-subscription] requisição sem deviceId — o antifraude do MP vai pontuar pior. Conferir se o security.js carregou no navegador.');
    }

    if (!process.env.MP_ACCESS_TOKEN) {
        console.error('MP_ACCESS_TOKEN não configurado na Vercel.');
        return res.status(500).json({ error: 'Pagamento indisponível no momento.' });
    }

    const baseUrl = process.env.SITE_URL || `https://${req.headers.host}`;

    // Em credenciais de teste (TEST-...) a documentação do MP diz que
    // test@testuser.com é o único e-mail de pagador aceito — com o endereço real
    // da conta a cobrança de teste é recusada sem motivo claro. Em produção
    // (APP_USR-...) este ramo não roda e vale o e-mail da sessão.
    const ehAmbienteDeTeste = String(process.env.MP_ACCESS_TOKEN).startsWith('TEST-');
    const payerEmail = ehAmbienteDeTeste ? 'test@testuser.com' : user.email;

    try {
        // Guarda contra cobrança dupla: se a pessoa clicar duas vezes, voltar no
        // navegador ou já tiver assinado antes, o MP criaria uma segunda
        // assinatura ativa e passaria a cobrar R$ 29,90 duas vezes por mês, sem
        // nada no sistema apontando o problema.
        const existente = await mpFetch(
            '/preapproval/search?status=authorized&external_reference=' + encodeURIComponent(user.id)
        );
        const retornadas = existente.ok && existente.corpo && Array.isArray(existente.corpo.results)
            ? existente.corpo.results
            : [];

        // O filtro tem que ser refeito aqui. Confiar no que o /preapproval/search
        // devolveu fez o endpoint tratar TODO mundo como assinante antigo: a
        // busca voltava assinaturas que não eram do usuário, o código respondia
        // "já é assinante", ninguém era cobrado, ninguém ganhava acesso, e a tela
        // de sucesso aparecia mesmo assim. Comparar o external_reference na mão
        // é o que garante que a assinatura encontrada é mesmo desta conta.
        const minhas = retornadas.filter(
            (a) => a && a.external_reference === user.id && a.status === 'authorized'
        );

        console.log(
            `[mp-subscription] busca de assinatura ativa: ${retornadas.length} retornada(s) pelo MP, ` +
            `${minhas.length} realmente do usuário ${user.id}` +
            (retornadas.length ? ` | ext_refs=${retornadas.map((a) => a && a.external_reference).join(',')}` : '')
        );

        if (minhas.length) {
            // Já assinante: não cobra de novo. Mas só devolve o acesso se essa
            // assinatura realmente já cobrou alguma vez — `charged_quantity` é o
            // número de faturas pagas. Uma assinatura autorizada com zero
            // cobranças é exatamente o caso de cartão autorizado e pagamento
            // recusado, e liberar por ela seria repetir o mesmo erro.
            const jaCobrou = Number(
                (minhas[0].summarized && minhas[0].summarized.charged_quantity) || 0
            ) > 0;

            if (jaCobrou) await liberarPro(user.id);

            console.log(
                `[mp-subscription] usuário ${user.id} já tinha a assinatura ${minhas[0].id} ` +
                `(faturas pagas: ${(minhas[0].summarized && minhas[0].summarized.charged_quantity) ?? '?'}) — ` +
                `${jaCobrou ? 'acesso restaurado' : 'sem cobrança confirmada, acesso NÃO liberado'}, sem nova cobrança.`
            );
            return res.status(200).json({ status: 'authorized', jaAssinante: true, acessoLiberado: jaCobrou });
        }

        const criacao = await mpFetch('/preapproval', {
            method: 'POST',
            // Se a resposta se perder no caminho e o front repetir o POST, o MP
            // devolve a assinatura já criada em vez de criar outra.
            headers: {
                'X-Idempotency-Key': `${user.id}:${cardToken}`,
                // Impressão digital do dispositivo, gerada pelo security.js do
                // MP no navegador. Entra no score do antifraude deles: sem esse
                // header, duas cobranças legítimas de R$ 29,90, de cartões e
                // titulares diferentes, foram recusadas com cc_rejected_high_risk.
                ...(deviceId ? { 'X-meli-session-id': deviceId } : {}),
            },
            body: JSON.stringify({
                // Texto que o assinante vê como identificação da cobrança
                // recorrente: na fatura, no e-mail do MP e no extrato.
                reason: 'Impoclick PRO — assinatura mensal',
                external_reference: user.id,
                payer_email: payerEmail,
                // Estes dois campos são o que tira o checkout hospedado do
                // caminho: com o cartão já tokenizado e status authorized, o MP
                // autoriza a assinatura direto na API. O cliente não é
                // redirecionado, não faz login no MP e nem precisa ter conta lá
                // — e por isso a tela "Seu e-mail não corresponde ao da
                // assinatura" deixa de ter como acontecer.
                card_token_id: cardToken,
                status: 'authorized',
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: VALOR_MENSAL,
                    currency_id: 'BRL',
                },
                back_url: baseUrl + '/index.html',
            }),
        });

        if (!criacao.ok) {
            const corpo = criacao.corpo || {};
            const detalhe = corpo.message
                || (Array.isArray(corpo.cause) && corpo.cause[0] && corpo.cause[0].description)
                || corpo.error;
            console.error(`[mp-subscription] MP recusou (${criacao.status}):`, JSON.stringify(corpo));
            return res.status(400).json({ error: traduzErro(detalhe) });
        }

        const assinatura = criacao.corpo || {};

        if (assinatura.status !== 'authorized') {
            // Nasceu, mas não autorizada (normalmente cartão recusado). Sem este
            // ramo o front comemoraria um pagamento que não aconteceu.
            console.error(`[mp-subscription] assinatura ${assinatura.id} criada com status=${assinatura.status}`);
            return res.status(400).json({
                error: 'O cartão não foi autorizado. Confira os dados ou tente outro cartão.',
            });
        }

        // NÃO libera o acesso aqui. `status: authorized` quer dizer que o CARTÃO
        // foi autorizado para cobranças recorrentes — não que o dinheiro entrou.
        // O MP gera e processa a primeira fatura depois, de forma assíncrona, e
        // ela pode ser recusada. Liberando na autorização, cliente com cobrança
        // recusada ficava com acesso liberado.
        //
        // Quem libera agora é o webhook, quando a cobrança é efetivamente
        // aprovada (tópicos `payment` e `subscription_authorized_payment`), e é
        // ele também que revoga se a fatura for recusada ou devolvida.
        console.log(`[mp-subscription] assinatura ${assinatura.id} autorizada para o usuário ${user.id} — aguardando a confirmação do pagamento para liberar o acesso.`);
        return res.status(200).json({ status: 'authorized', id: assinatura.id, acessoLiberado: false });
    } catch (error) {
        console.error('Erro ao gerar assinatura do Mercado Pago:', error);
        return res.status(500).json({ error: 'Erro interno ao processar a assinatura. Tente novamente.' });
    }
};
