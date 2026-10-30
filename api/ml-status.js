const crypto = require('crypto');
const { mlFetch, supabaseAdmin, getVerifiedUserId, requireAccess } = require('./_ml-helper');
const { amazonFetch, AMAZON_MARKETPLACE_ID } = require('./_amazon-helper');
const { conferirRelatorioGasto } = require('./_amazon-ads-helper');
const { shopeeFetch } = require('./_shopee-helper');

// Amazon (?provider=amazon) mora aqui pelo mesmo motivo do comentário acima:
// teto de 12 funções da Vercel. Nada do Mercado Livre abaixo foi alterado —
// este branch sai antes de qualquer lógica do ML.
//
// GET  sem action        -> status da conexão (confirma o token chamando
//                            /sellers/v1/marketplaceParticipations, o único
//                            endpoint "leve" da SP-API que não exige filtro
//                            de pedido/produto nenhum)
// GET  action=pedidos     -> Orders API, paginado (nextToken)
// GET  action=financas    -> taxas cobradas pela Amazon num pedido (Finances
//                             API), para a margem pós-Amazon
// POST                    -> desconecta (apaga os tokens salvos)
async function statusAmazon(req, res) {
    const userId = await requireAccess(req, res, true);
    if (!userId) return;

    if (!supabaseAdmin) {
        return res.status(500).json({ connected: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
    }
    const { data: perfil, error: erroPerfil } = await supabaseAdmin
        .from('profiles')
        .select('amazon_refresh_token')
        .eq('id', userId)
        .maybeSingle();
    if (erroPerfil) return res.status(500).json({ connected: false, error: erroPerfil.message });
    if (!perfil || !perfil.amazon_refresh_token) return res.json({ connected: false, motivo: 'nao_conectado' });

    try {
        const resp = await amazonFetch(userId, '/sellers/v1/marketplaceParticipations');
        if (resp.status === 401) return res.json({ connected: false, motivo: 'expirado' });
        if (!resp.ok) return res.status(resp.status).json({ connected: false });

        const data = await resp.json();
        const participacoes = Array.isArray(data.payload) ? data.payload : [];
        res.json({
            connected: true,
            marketplaces: participacoes.map((p) => ({
                marketplaceId: p.marketplace && p.marketplace.id,
                nome: p.marketplace && p.marketplace.name,
                participando: !!(p.participation && p.participation.isParticipating),
            })),
        });
    } catch (err) {
        const msg = (err && err.message) || '';
        if (/não conectada|Falha ao renovar token da Amazon/.test(msg)) {
            return res.json({ connected: false, motivo: 'expirado' });
        }
        res.status(500).json({ connected: false, error: msg });
    }
}

async function disconnectAmazon(req, res) {
    const userId = await getVerifiedUserId(req);
    if (!userId) return res.status(401).json({ connected: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });
    if (!supabaseAdmin) {
        return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
    }
    try {
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({
                amazon_access_token: null,
                amazon_refresh_token: null,
                amazon_token_expires_at: null,
                amazon_selling_partner_id: null,
            })
            .eq('id', userId);

        if (error) {
            console.error('Erro ao desconectar conta Amazon:', error);
            return res.status(500).json({ error: 'Erro ao desconectar a conta da Amazon.' });
        }
        return res.json({ disconnected: true });
    } catch (err) {
        console.error('Erro no amazon-disconnect:', err);
        return res.status(500).json({ error: err.message });
    }
}

// Pedidos dos últimos 30 dias por padrão (?createdAfter troca a janela).
// NextToken devolvido é repassado pelo chamador em ?nextToken para a página
// seguinte — sem looping aqui dentro: ao contrário do resumo do ML, ainda não
// sabemos o volume típico de pedidos Amazon do usuário, então não faz sentido
// arriscar estourar o tempo da função varrendo tudo de uma vez.
async function handleAmazonPedidos(req, res, userId) {
    const params = new URLSearchParams({ MarketplaceIds: AMAZON_MARKETPLACE_ID });
    params.set('CreatedAfter', req.query.createdAfter || new Date(Date.now() - 30 * 86400000).toISOString());
    if (req.query.nextToken) params.set('NextToken', req.query.nextToken);

    const resp = await amazonFetch(userId, `/orders/v0/orders?${params.toString()}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    const payload = data.payload || {};
    const pedidos = (payload.Orders || []).map((o) => ({
        id: o.AmazonOrderId,
        status: o.OrderStatus,
        criadoEm: o.PurchaseDate,
        atualizadoEm: o.LastUpdateDate,
        total: o.OrderTotal ? Number(o.OrderTotal.Amount) : null,
        moeda: o.OrderTotal ? o.OrderTotal.CurrencyCode : null,
        canal: o.SalesChannel || null,
        itensEnviados: o.NumberOfItemsShipped != null ? o.NumberOfItemsShipped : null,
        itensPendentes: o.NumberOfItemsUnshipped != null ? o.NumberOfItemsUnshipped : null,
    }));

    res.json({ pedidos, nextToken: payload.NextToken || null });
}

// Taxas que a Amazon cobrou num pedido específico — o dado que falta para
// fechar a margem pós-Amazon (preço de venda já vem no /orders). O payload da
// Finances API tem MUITOS tipos de evento possíveis (reembolso, cupom,
// serviço...); somamos aqui só as tarifas por item vendido (ItemFeeList, a
// comissão + tarifa de armazenagem/logística do pedido) e devolvemos também o
// payload bruto, para o que ainda não cobrimos não ficar escondido.
async function handleAmazonFinancas(req, res, userId) {
    const orderId = req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'Parâmetro orderId é obrigatório.' });

    const resp = await amazonFetch(userId, `/finances/v0/orders/${encodeURIComponent(orderId)}/financialEvents`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    const eventos = (data.payload && data.payload.FinancialEvents) || {};

    let taxas = 0;
    let moeda = null;
    (eventos.ShipmentEventList || []).forEach((shipment) => {
        (shipment.ShipmentItemList || []).forEach((item) => {
            (item.ItemFeeList || []).forEach((fee) => {
                if (fee.FeeAmount && typeof fee.FeeAmount.Amount !== 'undefined') {
                    taxas += Math.abs(Number(fee.FeeAmount.Amount) || 0);
                    moeda = moeda || fee.FeeAmount.CurrencyCode;
                }
            });
        });
    });

    res.json({ orderId, taxasCobradas: taxas, moeda, bruto: eventos });
}

async function tratarAmazon(req, res) {
    if (req.method === 'POST') return await disconnectAmazon(req, res);

    if (req.query.action === 'pedidos' || req.query.action === 'financas') {
        const userId = await requireAccess(req, res);
        if (!userId) return;
        try {
            if (req.query.action === 'pedidos') return await handleAmazonPedidos(req, res, userId);
            return await handleAmazonFinancas(req, res, userId);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return await statusAmazon(req, res);
}

// Status da conexão com a Shopee: confere de verdade (shop/get_shop_info é o
// endpoint mais leve que existe) em vez de só olhar se a coluna está
// preenchida — mesmo raciocínio da Amazon, token guardado não garante que a
// loja ainda está autorizada (o vendedor pode ter revogado do lado da Shopee).
async function statusShopee(req, res, userId) {
    if (!supabaseAdmin) return res.status(500).json({ connected: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });

    const { data: perfil, error: erroPerfil } = await supabaseAdmin
        .from('profiles')
        .select('shopee_access_token')
        .eq('id', userId)
        .maybeSingle();
    if (erroPerfil) return res.status(500).json({ connected: false, error: erroPerfil.message });
    if (!perfil || !perfil.shopee_access_token) return res.json({ connected: false, motivo: 'nao_conectado' });

    try {
        const resp = await shopeeFetch(userId, '/api/v2/shop/get_shop_info');
        if (!resp.ok) return res.json({ connected: false, motivo: 'expirado' });
        const data = await resp.json();
        if (data.error) return res.json({ connected: false, motivo: 'expirado' });
        res.json({ connected: true, shopName: data.shop_name || null, status: data.status || null });
    } catch (err) {
        const msg = (err && err.message) || '';
        if (/não conectada|Falha ao renovar token da Shopee/.test(msg)) {
            return res.json({ connected: false, motivo: 'expirado' });
        }
        res.status(500).json({ connected: false, error: msg });
    }
}

async function disconnectShopee(req, res, userId) {
    if (!supabaseAdmin) return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
    const { error } = await supabaseAdmin
        .from('profiles')
        .update({ shopee_shop_id: null, shopee_access_token: null, shopee_refresh_token: null, shopee_token_expires_at: null })
        .eq('id', userId);
    if (error) return res.status(500).json({ error: 'Erro ao desconectar a conta da Shopee.' });
    res.json({ disconnected: true });
}

// Converte para número ou null. Preço/estoque 0 são valores legítimos.
function numShopee(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// A doc v2 da Shopee limita get_order_list a no máximo 15 dias por chamada
// (time_from/time_to). Em vez de arriscar um número errado, varremos o
// período pedido em janelas de 15 dias — se o limite real for outro (ou
// maior), isso continua funcionando, só faz menos chamadas.
const SHOPEE_JANELA_PEDIDOS_DIAS = 15;
const SHOPEE_PEDIDOS_PAGE_SIZE = 50;
// Teto de páginas por janela, para nunca estourar os 60s da function.
const SHOPEE_PEDIDOS_MAX_PAGINAS = 10;
// Lote máximo aceito por get_order_detail.
const SHOPEE_DETALHE_LOTE = 50;

// Pedidos da Shopee entre dois instantes (epoch segundos), já com o detalhe
// (total, status, itens) resolvido via get_order_detail em lotes de 50.
async function listarPedidosShopee(userId, deSeg, ateSeg) {
    const pedidos = [];
    let cursor = '';
    for (let pagina = 0; pagina < SHOPEE_PEDIDOS_MAX_PAGINAS; pagina += 1) {
        const qs = new URLSearchParams({
            time_range_field: 'create_time',
            time_from: String(deSeg),
            time_to: String(ateSeg),
            page_size: String(SHOPEE_PEDIDOS_PAGE_SIZE),
        });
        if (cursor) qs.set('cursor', cursor);

        const resp = await shopeeFetch(userId, `/api/v2/order/get_order_list?${qs.toString()}`);
        if (!resp.ok) break;
        const data = await resp.json();
        if (data.error) throw new Error(`Shopee recusou get_order_list: ${data.error} — ${data.message || ''}`);

        const lista = (data.response && data.response.order_list) || [];
        for (const o of lista) if (o.order_sn) pedidos.push(o.order_sn);

        if (!data.response || !data.response.more) break;
        cursor = data.response.next_cursor || '';
        if (!cursor) break;
    }
    return pedidos;
}

// response_optional_fields documentados: pedir só o que a tela usa, para a
// resposta vir mais leve.
const SHOPEE_CAMPOS_PEDIDO = 'order_status,total_amount,currency,create_time,update_time,item_list,buyer_username';

async function detalharPedidosShopee(userId, orderSnList) {
    const detalhes = [];
    for (let i = 0; i < orderSnList.length; i += SHOPEE_DETALHE_LOTE) {
        const lote = orderSnList.slice(i, i + SHOPEE_DETALHE_LOTE);
        const qs = new URLSearchParams({
            order_sn_list: lote.join(','),
            response_optional_fields: SHOPEE_CAMPOS_PEDIDO,
        });
        const resp = await shopeeFetch(userId, `/api/v2/order/get_order_detail?${qs.toString()}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.error) continue;
        detalhes.push(...((data.response && data.response.order_list) || []));
    }
    return detalhes;
}

// Pedidos dos últimos N dias (?dias=, padrão 30), mesmo formato de resposta
// que o bloco da Amazon usa (id/status/criadoEm/atualizadoEm/total/moeda),
// para o painel reaproveitar os mesmos componentes de tela.
async function handleShopeePedidos(req, res, userId) {
    const dias = Math.min(90, Math.max(1, numShopee(req.query.dias) || 30));
    const agora = Math.floor(Date.now() / 1000);
    const desde = agora - dias * 86400;

    const orderSns = [];
    for (let fim = agora; fim > desde; fim -= SHOPEE_JANELA_PEDIDOS_DIAS * 86400) {
        const inicioJanela = Math.max(desde, fim - SHOPEE_JANELA_PEDIDOS_DIAS * 86400);
        const sns = await listarPedidosShopee(userId, inicioJanela, fim);
        orderSns.push(...sns);
    }

    const unicos = [...new Set(orderSns)];
    const detalhes = await detalharPedidosShopee(userId, unicos);

    const STATUS_TRADUZIDO = {
        UNPAID: 'Aguardando pagamento',
        READY_TO_SHIP: 'Pronto para enviar',
        PROCESSED: 'Em processamento',
        SHIPPED: 'Enviado',
        COMPLETED: 'Concluído',
        CANCELLED: 'Cancelado',
        IN_CANCEL: 'Cancelamento em andamento',
        TO_RETURN: 'Em devolução',
    };

    const pedidos = detalhes
        .map((o) => ({
            id: o.order_sn,
            status: STATUS_TRADUZIDO[o.order_status] || o.order_status || '—',
            statusBruto: o.order_status || null,
            criadoEm: o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
            atualizadoEm: o.update_time ? new Date(o.update_time * 1000).toISOString() : null,
            total: numShopee(o.total_amount),
            moeda: o.currency || null,
            canal: null,
            itens: (o.item_list || []).map((it) => ({
                itemId: it.item_id,
                nome: it.item_name || null,
                quantidade: numShopee(it.model_quantity_purchased) || 0,
            })),
        }))
        .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));

    res.json({ pedidos, dias });
}

// Teto de produtos lidos por chamada — telas maiores pedem mais páginas na
// sequência (?offset=), igual à paginação do Mercado Livre.
const SHOPEE_PRODUTOS_PAGE_SIZE = 50;

async function handleShopeeProdutos(req, res, userId) {
    const offset = Math.max(0, numShopee(req.query.offset) || 0);

    const qsLista = new URLSearchParams({
        offset: String(offset),
        page_size: String(SHOPEE_PRODUTOS_PAGE_SIZE),
        item_status: 'NORMAL',
    });
    const respLista = await shopeeFetch(userId, `/api/v2/product/get_item_list?${qsLista.toString()}`);
    if (!respLista.ok) return res.status(respLista.status).json({ error: await respLista.text() });
    const dataLista = await respLista.json();
    if (dataLista.error) return res.status(502).json({ error: `Shopee recusou get_item_list: ${dataLista.error} — ${dataLista.message || ''}` });

    const itemIds = ((dataLista.response && dataLista.response.item) || []).map((i) => i.item_id).filter(Boolean);
    if (itemIds.length === 0) {
        return res.json({ produtos: [], total: (dataLista.response && dataLista.response.total_count) || 0, temMais: false, proximoOffset: null });
    }

    const qsInfo = new URLSearchParams({ item_id_list: itemIds.join(',') });
    const respInfo = await shopeeFetch(userId, `/api/v2/product/get_item_base_info?${qsInfo.toString()}`);
    if (!respInfo.ok) return res.status(respInfo.status).json({ error: await respInfo.text() });
    const dataInfo = await respInfo.json();
    if (dataInfo.error) return res.status(502).json({ error: `Shopee recusou get_item_base_info: ${dataInfo.error} — ${dataInfo.message || ''}` });

    const produtos = ((dataInfo.response && dataInfo.response.item_list) || []).map((it) => {
        const precos = Array.isArray(it.price_info) ? it.price_info[0] : null;
        const estoque = it.stock_info_v2 && it.stock_info_v2.summary_info;
        return {
            id: it.item_id,
            nome: it.item_name || null,
            sku: it.item_sku || null,
            imagem: (it.image && Array.isArray(it.image.image_url_list) && it.image.image_url_list[0]) || null,
            preco: precos ? numShopee(precos.current_price) : null,
            precoOriginal: precos ? numShopee(precos.original_price) : null,
            moeda: (precos && precos.currency) || null,
            estoque: estoque ? numShopee(estoque.total_available_stock) : null,
            status: it.item_status || null,
        };
    });

    res.json({
        produtos,
        total: (dataLista.response && dataLista.response.total_count) || produtos.length,
        temMais: !!(dataLista.response && dataLista.response.has_next_page),
        proximoOffset: dataLista.response && dataLista.response.has_next_page ? offset + SHOPEE_PRODUTOS_PAGE_SIZE : null,
    });
}

// Taxas cobradas pela Shopee num pedido específico (Payment API), a peça que
// falta para a margem pós-Shopee — mesmo papel de handleAmazonFinancas.
async function handleShopeeFinancas(req, res, userId) {
    const orderSn = req.query.orderSn;
    if (!orderSn) return res.status(400).json({ error: 'Parâmetro orderSn é obrigatório.' });

    const resp = await shopeeFetch(userId, `/api/v2/payment/get_escrow_detail?order_sn=${encodeURIComponent(orderSn)}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: `Shopee recusou get_escrow_detail: ${data.error} — ${data.message || ''}` });

    const renda = (data.response && data.response.order_income) || {};
    // Soma as tarifas conhecidas (comissão, serviço, transação, cartão) — os
    // nomes de campo seguem a documentação pública da Payment API v2; se a
    // Shopee usar outro nome aqui, a diferença fica visível como "bruto" na
    // resposta em vez de ficar escondida.
    const campos = ['commission_fee', 'service_fee', 'seller_transaction_fee', 'credit_card_transaction_fee'];
    let taxas = 0;
    for (const campo of campos) taxas += Math.abs(numShopee(renda[campo]) || 0);

    res.json({
        orderSn,
        taxasCobradas: Math.round(taxas * 100) / 100,
        moeda: renda.currency || null,
        bruto: renda,
    });
}

const SHOPEE_RESUMO_DIAS_PADRAO = 30;

// Resumo do período: faturamento, unidades, pedidos e os produtos que mais
// venderam — a mesma pergunta que o Painel do Mercado Livre responde, só que
// sem os recursos que a API da Shopee não tem (visitas, estoque-dias,
// clientes recorrentes). Taxas por produto saem por amostragem: 1
// get_escrow_detail por pedido do top de produtos, não de todos os pedidos —
// senão o período de 30 dias não cabe nos 60s da function.
const SHOPEE_RESUMO_TOP_PRODUTOS = 10;
const SHOPEE_RESUMO_AMOSTRAS_TAXA = 5;

async function handleShopeeResumo(req, res, userId) {
    const dias = Math.min(90, Math.max(7, numShopee(req.query.dias) || SHOPEE_RESUMO_DIAS_PADRAO));
    const agora = Math.floor(Date.now() / 1000);
    const de = agora - dias * 86400;
    const deAnterior = de - dias * 86400;

    const [orderSnsAtual, orderSnsAnterior] = await Promise.all([
        (async () => {
            const sns = [];
            for (let fim = agora; fim > de; fim -= SHOPEE_JANELA_PEDIDOS_DIAS * 86400) {
                const inicio = Math.max(de, fim - SHOPEE_JANELA_PEDIDOS_DIAS * 86400);
                sns.push(...(await listarPedidosShopee(userId, inicio, fim)));
            }
            return [...new Set(sns)];
        })(),
        (async () => {
            const sns = [];
            for (let fim = de; fim > deAnterior; fim -= SHOPEE_JANELA_PEDIDOS_DIAS * 86400) {
                const inicio = Math.max(deAnterior, fim - SHOPEE_JANELA_PEDIDOS_DIAS * 86400);
                sns.push(...(await listarPedidosShopee(userId, inicio, fim)));
            }
            return [...new Set(sns)];
        })(),
    ]);

    const [detalhesAtual, detalhesAnterior] = await Promise.all([
        detalharPedidosShopee(userId, orderSnsAtual),
        detalharPedidosShopee(userId, orderSnsAnterior),
    ]);

    // Só pedidos que de fato viraram venda (pagos ou já concluídos/enviados) —
    // cancelado/não pago não é faturamento.
    const CONTAM_COMO_VENDA = new Set(['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED']);
    const somar = (detalhes) => {
        const porDia = new Map();
        const porProduto = new Map();
        let receita = 0;
        let unidades = 0;
        let pedidosValidos = 0;

        for (const o of detalhes) {
            if (!CONTAM_COMO_VENDA.has(o.order_status)) continue;
            pedidosValidos += 1;
            const totalPedido = numShopee(o.total_amount) || 0;
            receita += totalPedido;

            const dia = o.create_time ? new Date(o.create_time * 1000).toISOString().slice(0, 10) : null;
            if (dia) porDia.set(dia, (porDia.get(dia) || 0) + totalPedido);

            for (const it of o.item_list || []) {
                const qtd = numShopee(it.model_quantity_purchased) || 0;
                unidades += qtd;
                const precoUn = numShopee(it.model_discounted_price) ?? numShopee(it.model_original_price) ?? 0;
                if (!it.item_id) continue;
                const linha = porProduto.get(it.item_id) || { id: it.item_id, nome: it.item_name || it.item_id, unidades: 0, receita: 0, amostraOrderSns: [] };
                linha.unidades += qtd;
                linha.receita += precoUn * qtd;
                if (linha.amostraOrderSns.length < SHOPEE_RESUMO_AMOSTRAS_TAXA) linha.amostraOrderSns.push(o.order_sn);
                porProduto.set(it.item_id, linha);
            }
        }
        return { receita, unidades, pedidos: pedidosValidos, porDia, porProduto };
    };

    const atual = somar(detalhesAtual);
    const anterior = somar(detalhesAnterior);

    const topProdutos = [...atual.porProduto.values()].sort((a, b) => b.receita - a.receita).slice(0, SHOPEE_RESUMO_TOP_PRODUTOS);

    // Taxa média por produto, por amostragem dos pedidos que o venderam —
    // mesma ideia do "fretesDosItens" do Mercado Livre: mediana/ média de uma
    // amostra pequena, não exaustiva.
    await Promise.all(topProdutos.map(async (item) => {
        const amostras = [];
        for (const sn of item.amostraOrderSns) {
            try {
                const resp = await shopeeFetch(userId, `/api/v2/payment/get_escrow_detail?order_sn=${encodeURIComponent(sn)}`);
                if (!resp.ok) continue;
                const data = await resp.json();
                if (data.error) continue;
                const renda = (data.response && data.response.order_income) || {};
                const taxa = ['commission_fee', 'service_fee', 'seller_transaction_fee', 'credit_card_transaction_fee']
                    .reduce((acc, campo) => acc + Math.abs(numShopee(renda[campo]) || 0), 0);
                if (taxa > 0) amostras.push(taxa);
            } catch (e) { /* amostra perdida não derruba o resumo */ }
        }
        item.taxaMediaPorPedido = amostras.length ? amostras.reduce((a, b) => a + b, 0) / amostras.length : null;
        delete item.amostraOrderSns;
    }));

    const serie = [];
    for (let i = 0; i < dias; i += 1) {
        const dia = new Date((de + i * 86400) * 1000).toISOString().slice(0, 10);
        serie.push({ dia, receita: atual.porDia.get(dia) || 0 });
    }

    const variacao = (agoraV, antesV) => (antesV > 0 ? (agoraV - antesV) / antesV : null);
    const ticketAtual = atual.pedidos > 0 ? atual.receita / atual.pedidos : null;

    res.json({
        periodo: { dias },
        vendas: {
            receita: Math.round(atual.receita * 100) / 100,
            unidades: atual.unidades,
            pedidos: atual.pedidos,
            ticket: ticketAtual,
            porDia: serie,
            topProdutos: topProdutos.map((p) => ({
                id: p.id, nome: p.nome, unidades: p.unidades,
                receita: Math.round(p.receita * 100) / 100,
                taxaMediaPorPedido: p.taxaMediaPorPedido,
            })),
        },
        comparacao: {
            receita: variacao(atual.receita, anterior.receita),
            unidades: variacao(atual.unidades, anterior.unidades),
            pedidos: variacao(atual.pedidos, anterior.pedidos),
        },
    });
}

async function tratarShopee(req, res) {
    if (req.method === 'POST') {
        const userId = await getVerifiedUserId(req);
        if (!userId) return res.status(401).json({ connected: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });
        return await disconnectShopee(req, res, userId);
    }

    if (['pedidos', 'produtos', 'financas', 'resumo'].includes(req.query.action)) {
        const userId = await requireAccess(req, res);
        if (!userId) return;
        try {
            if (req.query.action === 'pedidos') return await handleShopeePedidos(req, res, userId);
            if (req.query.action === 'produtos') return await handleShopeeProdutos(req, res, userId);
            if (req.query.action === 'financas') return await handleShopeeFinancas(req, res, userId);
            return await handleShopeeResumo(req, res, userId);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    const userId = await requireAccess(req, res, true);
    if (!userId) return;
    return await statusShopee(req, res, userId);
}

function safeEqualAds(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

async function statusAmazonAds(req, res, userId) {
    const { data: perfil, error } = await supabaseAdmin
        .from('profiles')
        .select('amazon_ads_refresh_token, amazon_ads_relatorio_atualizado_em')
        .eq('id', userId)
        .maybeSingle();
    if (error) return res.status(500).json({ connected: false, error: error.message });
    if (!perfil || !perfil.amazon_ads_refresh_token) return res.json({ connected: false, motivo: 'nao_conectado' });
    res.json({ connected: true, relatorioAtualizadoEm: perfil.amazon_ads_relatorio_atualizado_em || null });
}

async function dadosAmazonAds(req, res, userId) {
    const { data: linhas, error } = await supabaseAdmin
        .from('amazon_ads_relatorio')
        .select('*')
        .eq('user_id', userId)
        .order('gasto', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ produtos: linhas || [] });
}

async function disconnectAmazonAds(req, res, userId) {
    const { error } = await supabaseAdmin
        .from('profiles')
        .update({
            amazon_ads_access_token: null,
            amazon_ads_refresh_token: null,
            amazon_ads_token_expires_at: null,
            amazon_ads_profile_id: null,
            amazon_ads_relatorio_pendente_id: null,
            amazon_ads_relatorio_pedido_em: null,
            amazon_ads_relatorio_atualizado_em: null,
        })
        .eq('id', userId);
    if (error) return res.status(500).json({ error: 'Erro ao desconectar os anúncios da Amazon.' });
    await supabaseAdmin.from('amazon_ads_relatorio').delete().eq('user_id', userId);
    res.json({ disconnected: true });
}

// Chamado pelo GitHub Actions (header x-cron-secret) 1x por dia — não precisa
// dos 15 min do ML, já que o relatório de anúncios é diário e cada rodada só
// confere/avança o estado (ver conferirRelatorioGasto). Varre todos os
// usuários com conexão de anúncios ativa.
async function cronAmazonAds(req, res) {
    const { data: perfis, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('amazon_ads_refresh_token', 'is', null);
    if (error) return res.status(500).json({ error: error.message });

    const resultados = [];
    for (const perfil of perfis || []) {
        try {
            const msg = await conferirRelatorioGasto(perfil.id);
            resultados.push({ userId: perfil.id, ok: true, msg });
        } catch (err) {
            resultados.push({ userId: perfil.id, ok: false, erro: err.message });
        }
    }
    res.json({ checados: resultados.length, resultados });
}

async function tratarAmazonAds(req, res) {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== undefined) {
        if (!process.env.CRON_SECRET || !safeEqualAds(cronSecret, process.env.CRON_SECRET)) {
            return res.status(403).json({ error: 'Invalid cron secret.' });
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
        return await cronAmazonAds(req, res);
    }

    if (req.method === 'POST') {
        const userId = await getVerifiedUserId(req);
        if (!userId) return res.status(401).json({ connected: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });
        return await disconnectAmazonAds(req, res, userId);
    }

    const userId = await requireAccess(req, res);
    if (!userId) return;

    if (req.query.action === 'dados') return await dadosAmazonAds(req, res, userId);
    return await statusAmazonAds(req, res, userId);
}

// GET  -> status da conexao com o Mercado Livre
// POST -> desconecta (apaga os tokens salvos)
// Junto num arquivo so porque o plano Hobby da Vercel limita a 12 funcoes
// serverless por deploy, e sao dois endpoints pequenos e relacionados.
module.exports = async (req, res) => {
    // Sem isso, o navegador pode validar a requisição com o servidor e receber
    // um 304 (Not Modified) sem corpo — e `!resp.ok` no front trata 304 como
    // falha, fazendo a tela achar que não está conectado mesmo estando.
    res.setHeader('Cache-Control', 'no-store');

    if (req.query && req.query.provider === 'shopee') {
        return await tratarShopee(req, res);
    }

    if (req.query && req.query.provider === 'amazon-ads') {
        return await tratarAmazonAds(req, res);
    }

    if (req.query && req.query.provider === 'amazon') {
        return await tratarAmazon(req, res);
    }

    // O POST (desconectar a conta do ML) exige só login: quem está com o plano
    // vencido continua podendo desfazer a conexão — é controle dos próprios
    // dados, não recurso pago. Já o GET consulta a API do ML e passa pela trava
    // de plano logo abaixo.
    if (req.method === 'POST') {
        const userId = await getVerifiedUserId(req);
        if (!userId) return res.status(401).json({ connected: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });

        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
        }
        try {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    ml_access_token: null,
                    ml_refresh_token: null,
                    ml_token_expires_at: null,
                    ml_user_id: null,
                })
                .eq('id', userId);

            if (error) {
                console.error('Erro ao desconectar conta ML:', error);
                return res.status(500).json({ error: 'Erro ao desconectar a conta do Mercado Livre.' });
            }

            return res.json({ disconnected: true });
        } catch (err) {
            console.error('Erro no ml-disconnect:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    const userId = await requireAccess(req, res, true);
    if (!userId) return;

    // "Não conectado" é uma resposta, não um erro: as abas do Mercado Livre só
    // mostram o aviso de conectar com esta certeza. Falha do ML ou da rede
    // continua erro, e aí a tela não afirma nada — um vendedor conectado não
    // pode ver "conecte sua conta" por causa de uma instabilidade.
    // `motivo`: nao_conectado (nunca conectou ou desconectou) · expirado (o ML
    // encerrou a autorização; só reconectando).
    if (!supabaseAdmin) {
        return res.status(500).json({ connected: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.' });
    }
    const { data: perfil, error: erroPerfil } = await supabaseAdmin
        .from('profiles')
        .select('ml_access_token')
        .eq('id', userId)
        .maybeSingle();
    if (erroPerfil) return res.status(500).json({ connected: false, error: erroPerfil.message });
    if (!perfil || !perfil.ml_access_token) return res.json({ connected: false, motivo: 'nao_conectado' });

    try {
        const resp = await mlFetch(userId, '/users/me');
        // 401 mesmo depois da tentativa de renovar o token no mlFetch.
        if (resp.status === 401) return res.json({ connected: false, motivo: 'expirado' });
        if (!resp.ok) return res.status(resp.status).json({ connected: false });

        const data = await resp.json();
        res.json({
            connected: true,
            nickname: data.nickname,
            sellerLevel: data.seller_reputation ? data.seller_reputation.level_id : null,
            powerSellerStatus: data.seller_reputation ? data.seller_reputation.power_seller_status : null,
        });
    } catch (err) {
        // Renovação recusada pelo ML (400/401 no /oauth/token) ou sem refresh
        // token: o vendedor revogou o acesso ou a autorização venceu.
        const msg = (err && err.message) || '';
        if (/renovar token do Mercado Livre \((400|401)\)|Refresh token não encontrado/.test(msg)) {
            return res.json({ connected: false, motivo: 'expirado' });
        }
        res.status(500).json({ connected: false, error: msg });
    }
};

// O cron de anúncios da Amazon (?provider=amazon-ads com x-cron-secret) varre
// todos os usuários conectados em série — 60s (o padrão) é curto demais se
// a lista crescer.
module.exports.config = { maxDuration: 60 };
