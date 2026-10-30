const { mlFetch, requireAccess } = require('./_ml-helper');

// A partir deste preço o Mercado Livre obriga frete grátis, e o envio sai do
// vendedor — com o desconto da reputação, que a documentação da API diz já vir
// aplicado no list_cost. Abaixo dele o envio só é do vendedor se ele OPTAR por
// oferecer frete grátis.
// Fonte: mercadolivre.com.br/landing/custos-de-venda. Confira se o ML mudar.
const LIMITE_FRETE_GRATIS_OBRIGATORIO = 79;

// Logísticas do Mercado Envios 2 que a cotação aceita. Qualquer outro valor
// vindo da tela cai no padrão, em vez de ir cru para a URL do ML.
const LOGISTICAS = new Set(['drop_off', 'cross_docking', 'xd_drop_off', 'self_service', 'fulfillment', 'turbo']);

// Histórico: quantos envios ler e quantos de cada vez. Cada envio custa duas
// chamadas ao ML (custos e pacote); em lotes de 8, quarenta envios cabem com
// folga no tempo da função.
const HISTORICO_MAX_ENVIOS = 40;
const HISTORICO_LOTE = 8;

// Desde 12/10/2025 o ML exige este cabeçalho em toda consulta de /shipments.
const FORMATO_NOVO = { headers: { 'x-format-new': 'true' } };

module.exports = async (req, res) => {
    const userId = await requireAccess(req, res);
    if (!userId) return;

    if (req.query.action === 'historico') return historico(userId, res);
    return cotacao(userId, req.query, res);
};

// Até 30 s: o histórico faz dezenas de chamadas ao Mercado Livre.
module.exports.config = { maxDuration: 30 };

async function cotacao(userId, query, res) {
    const { weight, length, width, height, price, listingType, freeShipping, itemId, logisticType } = query;

    // A documentação do ML é explícita: "os obrigatórios são ITEM_ID ou
    // DIMENSIONS". Com o itemId o próprio Mercado Livre usa o peso e as
    // medidas que o anúncio tem cadastrados — o que resolve o caso, muito
    // comum, do anúncio que não declara dimensões na ficha técnica visível.
    const temDimensoes = weight && length && width && height;
    if (!price || (!itemId && !temDimensoes)) {
        return res.status(400).json({
            error: 'Informe price e, além dele, itemId OU o conjunto weight/length/width/height.',
        });
    }

    // A logística muda o preço do envio. Estava fixa em drop_off (Correios), e
    // quem despacha por Coleta, Agência ou Full recebia a cotação de outra
    // modalidade. A tela manda a que o vendedor usa de fato (tirada do
    // histórico de envios dele); sem ela, drop_off continua o padrão.
    const logistica = LOGISTICAS.has(logisticType) ? logisticType : 'drop_off';

    try {
        const dimensions = temDimensoes
            ? `${height}x${width}x${length},${Math.round(Number(weight))}`
            : null;

        // A documentação pede as duas consultas — com e sem frete grátis —
        // "para obter as duas opções de custos corretas e possíveis para o
        // vendedor". A tela mostra a diferença em vez de um número solto.
        const cotar = async (comFreteGratis) => {
            const qs = new URLSearchParams({
                item_price: price,
                listing_type_id: listingType || 'gold_special',
                mode: 'me2',
                condition: 'new',
                logistic_type: logistica,
                free_shipping: comFreteGratis ? 'true' : 'false',
                verbose: 'true',
            });

            // Dimensões quando as temos; senão o itemId, e o ML busca as do
            // próprio anúncio. Mandar os dois seria redundante.
            if (dimensions) qs.set('dimensions', dimensions);
            else qs.set('item_id', String(itemId));
            const r = await mlFetch(userId, (mlUserId) => `/users/${mlUserId}/shipping_options/free?${qs.toString()}`, {}, true);
            if (!r.resp.ok) return { erro: r.resp.status };
            const d = await r.resp.json();
            const cob = d.coverage && d.coverage.all_country;
            if (!cob) return { erro: 404 };
            return {
                cost: cob.list_cost,
                billableWeightG: cob.billable_weight,
                currency: cob.currency_id,
                discount: (d.coverage && d.coverage.discount) || null,
            };
        };

        const [ofertando, semOfertar] = await Promise.all([cotar(true), cotar(false)]);

        if (ofertando.erro && semOfertar.erro) {
            return res.status(502).json({ error: 'A API do Mercado Livre não retornou cobertura de frete para esses dados.' });
        }

        // Quem paga o frete sai do PREÇO, não do zero da cotação.
        //
        // A regra anterior concluía "frete grátis obrigatório" sempre que a
        // cotação sem frete grátis dava zero e a com frete grátis dava valor. Só
        // que zero sem frete grátis é exatamente o caso NORMAL abaixo do limite:
        // o vendedor não paga o envio. Todo produto barato era marcado como
        // obrigatório e recebia o custo cheio do frete grátis.
        const obrigatorio = Number(price) >= LIMITE_FRETE_GRATIS_OBRIGATORIO;

        const escolhido = obrigatorio || freeShipping === 'true' ? ofertando : semOfertar;
        const base = escolhido.erro ? (ofertando.erro ? semOfertar : ofertando) : escolhido;

        res.json({
            cost: base.cost,
            billableWeightG: base.billableWeightG,
            currency: base.currency,
            discount: base.discount,
            logistica,
            custoOferecendoFreteGratis: ofertando.erro ? null : ofertando.cost,
            custoSemOferecer: semOfertar.erro ? null : semOfertar.cost,
            freteGratisObrigatorio: obrigatorio,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// ── Histórico de envios ─────────────────────────────────────────────────
// O frete que o vendedor PAGOU de fato nos últimos envios, com o peso de
// cada pacote. É a base da estimativa por "itens semelhantes".
//
// A cotação do ML é aproximada por definição — a própria documentação diz
// "preço aproximado" — e vale para o país todo (all_country). A cobrança real
// depende da rota de cada venda, da logística e dos descontos do momento, e
// para quem vende mais perto sai sistematicamente abaixo da cotação. Olhar o
// que já foi cobrado desta conta, em pacotes de peso parecido, responde à
// pergunta certa: quanto ESTE vendedor paga.
async function historico(userId, res) {
    try {
        const r = await mlFetch(
            userId,
            (id) => `/orders/search?seller=${id}&order.status=paid&sort=date_desc&limit=50`,
            {},
            true,
        );
        if (!r.resp.ok) return res.status(r.resp.status).json({ error: 'Não foi possível ler os seus pedidos no Mercado Livre.' });
        const mlUserId = r.mlUserId;
        const pedidos = (await r.resp.json()).results || [];

        // Um envio pode juntar vários pedidos (carrinho); o valor que importa é
        // o do pacote inteiro, então soma por envio.
        const valorPorEnvio = new Map();
        for (const p of pedidos) {
            const id = p.shipping && p.shipping.id;
            if (!id) continue;
            const valor = Number(p.total_amount) || 0;
            valorPorEnvio.set(id, (valorPorEnvio.get(id) || 0) + valor);
        }
        const ids = Array.from(valorPorEnvio.keys()).slice(0, HISTORICO_MAX_ENVIOS);

        const envios = [];
        for (let i = 0; i < ids.length; i += HISTORICO_LOTE) {
            const lote = await Promise.all(ids.slice(i, i + HISTORICO_LOTE).map((id) => lerEnvio(userId, mlUserId, id)));
            lote.forEach((e, j) => {
                if (e) envios.push({ ...e, valorPedido: valorPorEnvio.get(ids[i + j]) });
            });
        }

        const contagem = {};
        envios.forEach((e) => { if (e.logistica) contagem[e.logistica] = (contagem[e.logistica] || 0) + 1; });
        const logisticaPrincipal = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0] || null;

        res.json({ envios, logisticaPrincipal, consultados: ids.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function lerEnvio(userId, mlUserId, id) {
    try {
        const [rc, rs] = await Promise.all([
            mlFetch(userId, `/shipments/${id}/costs`, FORMATO_NOVO),
            mlFetch(userId, `/shipments/${id}`, FORMATO_NOVO),
        ]);
        if (!rc.ok || !rs.ok) return null;
        const custos = await rc.json();
        const envio = await rs.json();

        // senders é quem pagou o envio; num carrinho com vários vendedores a
        // lista tem mais de um, então vale a linha deste vendedor.
        const remetentes = Array.isArray(custos.senders) ? custos.senders : [];
        const meu = remetentes.find((s) => String(s.user_id) === String(mlUserId)) || remetentes[0];
        if (!meu || typeof meu.cost !== 'number') return null;

        const medidas = lerMedidas(envio.dimensions);
        if (!medidas) return null;

        return {
            custo: meu.cost,
            cheio: typeof custos.gross_amount === 'number' ? custos.gross_amount : null,
            pesoG: medidas.pesoG,
            faturavelG: pesoFaturavel(medidas),
            logistica: (envio.logistic && envio.logistic.type) || envio.logistic_type || null,
        };
    } catch (err) {
        return null;
    }
}

// Medidas do pacote em dois formatos: "10x20x30,500" (antigo) ou
// { height, width, length, weight } (formato novo). Centímetros e gramas.
function lerMedidas(d) {
    if (!d) return null;
    let a;
    let l;
    let c;
    let p;
    if (typeof d === 'string') {
        const m = d.match(/^([\d.]+)x([\d.]+)x([\d.]+),([\d.]+)$/);
        if (!m) return null;
        [a, l, c, p] = m.slice(1).map(Number);
    } else {
        a = Number(d.height);
        l = Number(d.width);
        c = Number(d.length);
        p = Number(d.weight);
    }
    if (![a, l, c, p].every((n) => Number.isFinite(n) && n > 0)) return null;
    return { alturaCm: a, larguraCm: l, comprimentoCm: c, pesoG: p };
}

// O ML cobra pelo maior entre o peso real e o cúbico: cm³ ÷ 6.000 dá kg, ou
// cm³ ÷ 6 dá gramas.
function pesoFaturavel(m) {
    return Math.round(Math.max(m.pesoG, (m.alturaCm * m.larguraCm * m.comprimentoCm) / 6));
}

module.exports.pesoFaturavel = pesoFaturavel;
module.exports.lerMedidas = lerMedidas;
