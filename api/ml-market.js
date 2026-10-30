const { mlFetch, requireAccess } = require('./_ml-helper');
const { metricasDoItem } = require('./_ads-painel');
const { shopeeFetch } = require('./_shopee-helper');

function numShopeeMarket(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// Análise de UM produto da Shopee: ficha (preço, estoque, imagens) +
// avaliações (média, total, últimos comentários). Versão enxuta da "análise
// completa" do Mercado Livre — sem concorrentes, visitas ou catálogo, que não
// têm equivalente na API da Shopee.
async function handleShopeeAnalise(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const respInfo = await shopeeFetch(userId, `/api/v2/product/get_item_base_info?item_id_list=${encodeURIComponent(itemId)}`);
    if (!respInfo.ok) return res.status(respInfo.status).json({ error: await respInfo.text() });
    const dataInfo = await respInfo.json();
    if (dataInfo.error) return res.status(502).json({ error: `Shopee recusou get_item_base_info: ${dataInfo.error} — ${dataInfo.message || ''}` });

    const item = ((dataInfo.response && dataInfo.response.item_list) || [])[0];
    if (!item) return res.status(404).json({ error: 'not_found', message: 'Produto não encontrado nesta loja da Shopee.' });

    const precos = Array.isArray(item.price_info) ? item.price_info[0] : null;
    const estoque = item.stock_info_v2 && item.stock_info_v2.summary_info;

    let reviews = null;
    try {
        const respCom = await shopeeFetch(userId, `/api/v2/product/get_comment?item_id=${encodeURIComponent(itemId)}&page_size=20`);
        if (respCom.ok) {
            const dataCom = await respCom.json();
            if (!dataCom.error) {
                const lista = (dataCom.response && dataCom.response.item_comment_list) || [];
                const notas = lista.map((c) => numShopeeMarket(c.rating_star)).filter((n) => n != null);
                reviews = {
                    average: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100 : null,
                    total: lista.length,
                    latest: lista.slice(0, 5).map((c) => ({
                        rate: c.rating_star, comment: c.comment || null, date: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
                    })),
                };
            }
        }
    } catch (e) { /* avaliação ausente não derruba a análise */ }

    res.json({
        item: {
            id: item.item_id,
            nome: item.item_name || null,
            sku: item.item_sku || null,
            imagem: (item.image && Array.isArray(item.image.image_url_list) && item.image.image_url_list[0]) || null,
            preco: precos ? numShopeeMarket(precos.current_price) : null,
            precoOriginal: precos ? numShopeeMarket(precos.original_price) : null,
            moeda: (precos && precos.currency) || null,
            estoque: estoque ? numShopeeMarket(estoque.total_available_stock) : null,
            status: item.item_status || null,
            categoriaId: item.category_id || null,
        },
        reviews,
    });
}

const SITE_ID = 'MLB';

async function handleCategory(req, res, userId) {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Parâmetro q (nome do produto) é obrigatório.' });

    const resp = await mlFetch(userId, `/sites/${SITE_ID}/domain_discovery/search?limit=1&q=${encodeURIComponent(q)}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    const match = Array.isArray(data) ? data[0] : null;
    if (!match) return res.status(404).json({ error: 'Nenhuma categoria encontrada para esse termo.' });

    res.json({
        categoryId: match.category_id,
        categoryName: match.category_name,
        domainId: match.domain_id,
        domainName: match.domain_name,
    });
}

async function handleFee(req, res, userId) {
    const { price, category, listingType, logisticType, billableWeight } = req.query;
    if (!price || !category) {
        return res.status(400).json({ error: 'Parâmetros price e category são obrigatórios.' });
    }

    // logistic_type e shipping_mode são obrigatórios para o fixed_fee sair
    // certo. A documentação avisa: "Se você não enviar os parâmetros
    // logistic_type, shipping_mode e billable_weight, o fixed fee calculado
    // não coincidirá com o que realmente será cobrado."
    //
    // Isso importa porque o fixed_fee é a tarifa por unidade que o ML cobra em
    // item abaixo do limite de frete grátis — e ela some ou aparece conforme a
    // logística: em ME2 só o Flex paga; em ME1/custom sempre paga.
    const params = new URLSearchParams({
        price: String(price),
        category_id: String(category),
        logistic_type: logisticType || 'drop_off',
        shipping_mode: 'me2',
    });
    if (billableWeight) params.set('billable_weight', String(billableWeight));

    const resp = await mlFetch(userId, `/sites/${SITE_ID}/listing_prices?${params.toString()}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ error: 'Nenhuma tarifa retornada para essa categoria/preço.' });
    }

    const wantedType = listingType || 'gold_special'; // "Clássico"
    const match = data.find(d => d.listing_type_id === wantedType) || data[0];

    const detalhes = match.sale_fee_details || {};
    res.json({
        listingTypeId: match.listing_type_id,
        listingTypeName: match.listing_type_name,
        percentageFee: detalhes.percentage_fee,
        // Tarifa por unidade cobrada em itens de baixo valor. Vinha sendo
        // descartada, e era justamente o custo que faltava no cálculo.
        fixedFee: typeof detalhes.fixed_fee === 'number' ? detalhes.fixed_fee : 0,
        // Custo total por vender = percentual + fixo, já somado pelo ML.
        saleFeeAmount: match.sale_fee_amount,
        options: data.map(d => ({
            id: d.listing_type_id,
            name: d.listing_type_name,
            percentageFee: d.sale_fee_details.percentage_fee,
            saleFeeAmount: d.sale_fee_amount,
        })),
    });
}

async function handleItem(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const resp = await mlFetch(userId, `/items/${encodeURIComponent(itemId)}`);
    if (!resp.ok) {
        let message = 'Não foi possível consultar este anúncio.';
        try {
            const errData = await resp.json();
            if (errData.message) message = errData.message;
        } catch (e) { /* corpo não era JSON, mantém a mensagem padrão */ }
        return res.status(resp.status).json({ error: message });
    }

    const data = await resp.json();
    res.json({
        id: data.id,
        title: data.title,
        price: data.price,
        currencyId: data.currency_id,
        categoryId: data.category_id,
        permalink: data.permalink,
    });
}

async function handleBestSeller(req, res, userId) {
    const category = req.query.category;
    if (!category) return res.status(400).json({ error: 'Parâmetro category é obrigatório.' });

    const resp = await mlFetch(userId, `/highlights/${SITE_ID}/category/${encodeURIComponent(category)}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    const top = data.content && data.content[0];
    if (!top) return res.status(404).json({ error: 'Nenhum produto em destaque para esta categoria.' });

    let name = null;
    if (top.type === 'PRODUCT' || top.type === 'USER_PRODUCT') {
        const prodResp = await mlFetch(userId, `/products/${top.id}`);
        if (prodResp.ok) {
            const prod = await prodResp.json();
            name = prod.name || null;
        }
    } else if (top.type === 'ITEM') {
        const itemResp = await mlFetch(userId, `/items/${top.id}`);
        if (itemResp.ok) {
            const item = await itemResp.json();
            name = item.title || null;
        }
    }

    res.json({
        id: top.id,
        type: top.type,
        position: top.position,
        name,
        permalink: `https://www.mercadolivre.com.br/p/${top.id}`,
    });
}

// Qualidade do anúncio, direto da API oficial do Mercado Livre. É a mesma
// checagem que o ML mostra ao vendedor no painel dele: pontuação de 0 a 100,
// nível (Básica/Satisfatória/Profissional) e a lista de ações pendentes,
// separadas entre WARNING (problema que derruba a pontuação) e OPPORTUNITY
// (melhoria possível). Cada ação já vem com o link do ML para corrigir.
//
// Só funciona nos anúncios da PRÓPRIA conta conectada — a API responde 401
// "Caller must be the seller of the item" para anúncios de terceiros, por
// desenho. Não dá para auditar anúncio de concorrente por aqui.
//
// Substitui a antiga /health, descontinuada pelo ML em 07/02/2025.
// A API de qualidade devolve o nível em espanhol mesmo no site brasileiro
// ("Profesional"), e às vezes como identificador ("professional"). Traduzimos
// para não exibir palavra errada na tela do vendedor.
const NIVEIS_QUALIDADE = {
    profesional: 'Profissional',
    professional: 'Profissional',
    satisfactoria: 'Satisfatória',
    satisfactory: 'Satisfatória',
    standard: 'Satisfatória',
    basica: 'Básica',
    basic: 'Básica',
    incompleta: 'Incompleta',
    incomplete: 'Incompleta',
};

function nivelEmPortugues(level) {
    if (!level) return null;
    const chave = String(level).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    return NIVEIS_QUALIDADE[chave] || level;
}

async function handlePerformance(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const isUserProduct = /^MLB?U/i.test(itemId) || /^[A-Z]{3}U\d+$/i.test(itemId);
    const path = isUserProduct
        ? `/user-product/${encodeURIComponent(itemId)}/performance`
        : `/item/${encodeURIComponent(itemId)}/performance`;

    const resp = await mlFetch(userId, path);

    if (!resp.ok) {
        const raw = await resp.text();
        let message = raw;
        try { message = (JSON.parse(raw).message) || raw; } catch (e) { /* resposta não-JSON */ }

        if (resp.status === 401) {
            return res.status(403).json({
                error: 'not_own_item',
                message: 'Este anúncio não pertence à conta do Mercado Livre conectada. A análise de qualidade só está disponível para os seus próprios anúncios.',
            });
        }
        if (resp.status === 404) {
            return res.status(404).json({
                error: 'no_data',
                message: 'O Mercado Livre ainda não gerou os dados de qualidade deste anúncio. Isso costuma acontecer com anúncios recém-criados.',
            });
        }
        return res.status(resp.status).json({ error: message });
    }

    const data = await resp.json();

    // Achata buckets -> variables -> rules numa lista única de ações, que é
    // o formato que o painel da extensão realmente precisa exibir.
    const actions = [];
    (data.buckets || []).forEach((bucket) => {
        (bucket.variables || []).forEach((variable) => {
            (variable.rules || []).forEach((rule) => {
                const wordings = rule.wordings || {};
                actions.push({
                    group: bucket.title || null,
                    topic: variable.title || null,
                    key: rule.key,
                    status: rule.status,
                    mode: rule.mode,
                    progress: typeof rule.progress === 'number' ? rule.progress : null,
                    text: wordings.title || null,
                    label: wordings.label || null,
                    link: wordings.link || null,
                });
            });
        });
    });

    const pending = actions.filter((a) => a.status === 'PENDING');

    res.json({
        itemId: data.entity_id || itemId,
        entityType: data.entity_type || null,
        score: typeof data.score === 'number' ? data.score : null,
        level: nivelEmPortugues(data.level_wording || data.level),
        calculatedAt: data.calculated_at || null,
        totals: {
            actions: actions.length,
            completed: actions.length - pending.length,
            warnings: pending.filter((a) => a.mode === 'WARNING').length,
            opportunities: pending.filter((a) => a.mode === 'OPPORTUNITY').length,
        },
        // Problemas primeiro, depois oportunidades — a ordem em que o
        // vendedor deve atacar a lista.
        warnings: pending.filter((a) => a.mode === 'WARNING'),
        opportunities: pending.filter((a) => a.mode === 'OPPORTUNITY'),
        completed: actions.filter((a) => a.status === 'COMPLETED'),
    });
}

// ---------------------------------------------------------------------
// ANÁLISE COMPLETA DO ANÚNCIO
//
// Junta numa resposta só tudo que o painel da extensão precisa pra auditar
// um anúncio: dados do item, descrição, campos que a categoria espera,
// visitas por dia, avaliações e vendas do período. São 6 recursos
// diferentes da API do ML — buscar um a um a partir da extensão daria 6
// idas e voltas até a Vercel, então agregamos aqui.
//
// Vale só para anúncios da PRÓPRIA conta conectada: desde 2024 o ML recusa
// /items/{id} de terceiros com o token de outro vendedor. A análise que
// funciona em anúncio de qualquer um (título, marca, modelo) continua sendo
// feita no content script, lendo a página.
// ---------------------------------------------------------------------

// Nenhuma das consultas abaixo é essencial sozinha — se avaliações ou
// visitas falharem, a análise ainda vale pelo resto. Por isso cada uma
// devolve null em vez de derrubar a resposta inteira.
async function fetchJsonOrNull(userId, path) {
    try {
        const resp = await mlFetch(userId, path);
        if (!resp.ok) return null;
        return await resp.json();
    } catch (err) {
        return null;
    }
}

// O ML expõe os campos que a categoria espera numa árvore
// grupos → componentes → atributos. Pro painel só interessa a lista plana
// de campos preenchíveis, então achatamos e descartamos os ocultos (que o
// vendedor não tem como preencher pela interface).
function flattenCategoryFields(specs) {
    const fields = [];
    const seen = new Set();

    (specs.groups || []).forEach((group) => {
        (group.components || []).forEach((component) => {
            (component.attributes || []).forEach((attr) => {
                if (!attr.id || seen.has(attr.id)) return;

                // technical_specs/input devolve tags como array; o recurso
                // antigo /attributes devolve como objeto. Aceitamos os dois.
                const rawTags = attr.tags || [];
                const tagList = Array.isArray(rawTags) ? rawTags : Object.keys(rawTags).filter((k) => rawTags[k]);
                if (tagList.includes('hidden') || tagList.includes('read_only')) return;

                seen.add(attr.id);
                fields.push({
                    id: attr.id,
                    name: attr.name || component.label || attr.id,
                    required: tagList.includes('required') || tagList.includes('catalog_required'),
                });
            });
        });
    });

    return fields;
}

// Quantas unidades DESTE anúncio saíram na janela.
//
// O /orders/search aceita filtro por item, então a busca já vem restrita aos
// pedidos deste anúncio em vez de varrer todos os pedidos do vendedor — o
// que antes obrigava a parar no meio do caminho e devolver um número
// parcial. Com o filtro, o conjunto é pequeno e dá pra somar tudo.
//
// Se mesmo assim não der pra percorrer todas as páginas, devolvemos null: um
// número de vendas incompleto não serve pra decidir nada, e a partir dele
// saem a projeção de estoque e a conversão. Melhor não mostrar do que
// mostrar errado.
const ORDERS_MAX_PAGES = 20;
const ORDERS_PAGE_SIZE = 50;

async function fetchItemSales(userId, mlUserId, itemId, days) {
    if (!mlUserId) return null;

    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const halfway = new Date(to.getTime() - (days / 2) * 86400000);
    const fmt = (d) => d.toISOString().replace('Z', '-00:00');

    let sold = 0;
    let soldRecentHalf = 0;
    let orders = 0;
    let offset = 0;

    for (let page = 0; page < ORDERS_MAX_PAGES; page += 1) {
        const qs = new URLSearchParams({
            seller: mlUserId,
            item: itemId,
            'order.date_created.from': fmt(from),
            'order.date_created.to': fmt(to),
            limit: String(ORDERS_PAGE_SIZE),
            offset: String(offset),
        });

        const data = await fetchJsonOrNull(userId, `/orders/search?${qs.toString()}`);
        if (!data || !Array.isArray(data.results)) return null;

        data.results.forEach((order) => {
            if (order.status === 'cancelled' || order.status === 'invalid') return;
            const createdAt = new Date(order.date_created);
            // O filtro item também casa por título, então conferimos o id
            // linha a linha antes de somar.
            (order.order_items || []).forEach((line) => {
                if (!line.item || line.item.id !== itemId) return;
                const qty = line.quantity || 0;
                sold += qty;
                orders += 1;
                if (createdAt >= halfway) soldRecentHalf += qty;
            });
        });

        const total = (data.paging && data.paging.total) || 0;
        offset += ORDERS_PAGE_SIZE;

        if (offset >= total) {
            return { days, sold, soldRecentHalf, halfDays: days / 2, orders };
        }
    }

    return null;
}

// Métricas de Product Ads do anúncio. Os endpoints antigos de Product Ads
// foram desligados pelo ML em 26/02/2026 — este é o atual, por item, e exige
// o header api-version: 2.
//
// Um 404 aqui quer dizer que a conta não tem Publicidade habilitada (o ML
// pede reputação amarela, 15 dias de cadastro e um mínimo de vendas). Já um
// anúncio com status "idle" existe para publicidade mas não está em campanha
// nenhuma — coisas diferentes, e a tela explica cada uma.
const ADS_METRICS = [
    'clicks', 'prints', 'ctr', 'cost', 'cpc', 'acos', 'cvr', 'roas', 'sov',
    'organic_units_quantity', 'direct_units_quantity', 'indirect_units_quantity',
    'units_quantity', 'total_amount',
].join(',');

async function fetchAdsMetrics(userId, itemId, days) {
    // As métricas POR ANÚNCIO (/product_ads/ads/{item}) foram removidas pelo
    // ML em 30/05/2026 — desde então a consulta antiga falhava e o painel dizia
    // "conta sem publicidade" para quem tinha publicidade. O caminho atual passa
    // pelo Ad Group do item (ver _ads-painel.js). O formato devolvido é o mesmo
    // de antes, para quem chama não mudar.
    try {
        const r = await metricasDoItem(userId, itemId, days);
        if (r.habilitada === false) return { enabled: false, reason: 'sem_publicidade' };
        if (r.habilitada == null) return null;
        return {
            enabled: true,
            days,
            status: r.motivo === 'fora_de_campanha' ? 'idle' : (r.status || null),
            campaignId: r.campanhaId || null,
            recommended: false,
            metrics: r.metricas || {},
        };
    } catch (err) {
        return null;
    }
}

// Em anúncio com variação, o título que a API devolve vem com os valores da
// variação colados no fim ("...Ciclismo Moto Branco Liso Único"). Isso não é
// texto que o vendedor escreveu — é Cor, Tamanho e afins — e não deveria
// contar contra o limite de 60 caracteres do título. Devolvemos os valores
// para o painel poder descontá-los.
// Atributos de identidade do produto ou de dados técnicos: o ML nunca cola
// nenhum deles no fim do título. Tudo o que NÃO está aqui é candidato a ser
// parte do sufixo de variação.
//
// A primeira versão fazia o contrário — mantinha a lista dos ids QUE SÃO
// variação (COLOR, SIZE...) — e isso não tem fim, porque cada categoria tem
// os seus. Num colete tático o tamanho vem como "Tamanho do colete táctico",
// ficava de fora da lista, e como o corte vai do fim para dentro ele travava
// nesse primeiro valor desconhecido e nem chegava no "Preto" seguinte.
const IDENTITY_ATTR_IDS = new Set([
    'BRAND', 'MODEL', 'MANUFACTURER', 'MPN', 'PART_NUMBER',
    'GTIN', 'EAN', 'UPC', 'SELLER_SKU', 'EMPTY_GTIN_REASON',
    'ITEM_CONDITION', 'IS_KIT', 'SALES_UNIT', 'YIELD_OF_SALES_UNIT',
    'WARRANTY_TYPE', 'WARRANTY_TIME', 'PRODUCT_FEATURES',
    'PACKAGE_LENGTH', 'PACKAGE_WIDTH', 'PACKAGE_HEIGHT', 'PACKAGE_WEIGHT',
]);

// Valor de variação é sempre curto ("Preto", "M", "Único"). Texto longo é
// descrição, não variação.
const VARIATION_VALUE_MAX_CHARS = 25;

// Tira do fim do título os valores da variação, pra busca de concorrentes
// não sair com "Branco Liso Único" no meio da consulta.
function titleWithoutVariation(title, values) {
    let text = String(title || '').normalize('NFC').trim();
    const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Cada valor é colado uma vez só — ver a mesma regra no content.js.
    const disponiveis = (values || []).map((v) => String(v || '').normalize('NFC').trim()).filter(Boolean);

    let cortou = true;
    while (cortou) {
        cortou = false;
        for (let i = 0; i < disponiveis.length; i += 1) {
            const valor = disponiveis[i];
            if (text.length <= valor.length) continue;
            if (fold(text.slice(-(valor.length + 1))) === fold(` ${valor}`)) {
                text = text.slice(0, -(valor.length + 1)).trim();
                disponiveis.splice(i, 1);
                cortou = true;
                break;
            }
        }
    }
    return text;
}

// Concorrentes do MESMO produto que aparecem na primeira página da busca.
// A ordenação padrão do /sites/{site}/search é a de relevância — a mesma que
// o comprador vê —, então o que vem aqui são os anúncios que o ML já está
// premiando. É de onde saem as sugestões de palavra-chave: o que a
// concorrência que vende usa no título e o seu anúncio não usa.
//
// Isto substituiu as tendências da categoria, que devolviam termos genéricos
// do site (numa balaclava vinha "capa jbl flip 7").
const COMPETITOR_SEARCH_LIMIT = 50;

async function fetchCompetitors(userId, mlUserId, title, categoryId) {
    if (!title) return null;

    const qs = new URLSearchParams({ q: title, limit: String(COMPETITOR_SEARCH_LIMIT) });
    if (categoryId) qs.set('category', categoryId);

    const data = await fetchJsonOrNull(userId, `/sites/${SITE_ID}/search?${qs.toString()}`);
    if (!data || !Array.isArray(data.results)) return null;

    const items = data.results
        .map((r) => ({
            id: r.id,
            title: r.title || '',
            sellerId: (r.seller && r.seller.id) || r.seller_id || null,
            soldQuantity: typeof r.sold_quantity === 'number' ? r.sold_quantity : null,
            price: r.price != null ? r.price : null,
        }))
        // Os seus próprios anúncios não são referência de concorrente.
        .filter((r) => r.title && String(r.sellerId) !== String(mlUserId));

    return { total: items.length, items };
}

function collectVariationValues(item) {
    // Quando o anúncio traz o array de variações, ele é a fonte exata: são
    // literalmente os valores que o ML usou para montar o sufixo.
    const fromCombinations = new Set();
    (item.variations || []).forEach((variation) => {
        (variation.attribute_combinations || []).forEach((combo) => {
            if (combo.value_name) fromCombinations.add(combo.value_name);
        });
    });
    if (fromCombinations.size) return [...fromCombinations];

    // Sem esse array, o que existe é só o título já montado. Isso acontece
    // nos itens ligados a um user product — e é exatamente nesses que o ML
    // monta o título com o sufixo. Fora daí não mexemos em nada, para nunca
    // comer uma palavra que o vendedor escreveu.
    if (!item.user_product_id) return [];

    const values = new Set();
    (item.attributes || []).forEach((attr) => {
        if (IDENTITY_ATTR_IDS.has(attr.id)) return;
        const value = attr.value_name;
        if (value && value.length <= VARIATION_VALUE_MAX_CHARS) values.add(value);
    });

    return [...values];
}

// Soma as visitas de uma fatia do fim da série (os N dias mais recentes),
// pra comparar período contra período — é isso que diz se o anúncio está
// ganhando ou perdendo tração, coisa que o total sozinho não mostra.
function sumLastDays(daily, count, skipFromEnd = 0) {
    const end = daily.length - skipFromEnd;
    const start = Math.max(0, end - count);
    if (end <= 0) return 0;
    return daily.slice(start, end).reduce((acc, d) => acc + (d.total || 0), 0);
}

async function handleAnalise(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const { resp: itemResp, mlUserId } = await mlFetch(userId, `/items/${encodeURIComponent(itemId)}`, {}, true);

    if (!itemResp.ok) {
        if (itemResp.status === 401 || itemResp.status === 403) {
            return res.status(403).json({
                error: 'not_own_item',
                message: 'Este anúncio não é da conta do Mercado Livre conectada. A análise completa só funciona nos seus próprios anúncios — a API do ML não libera os dados de anúncios de terceiros.',
            });
        }
        if (itemResp.status === 404) {
            return res.status(404).json({ error: 'not_found', message: 'Anúncio não encontrado.' });
        }
        return res.status(itemResp.status).json({ error: await itemResp.text() });
    }

    const item = await itemResp.json();

    const [description, visitsRaw, reviewsRaw] = await Promise.all([
        fetchJsonOrNull(userId, `/items/${encodeURIComponent(itemId)}/description`),
        fetchJsonOrNull(userId, `/items/${encodeURIComponent(itemId)}/visits/time_window?last=30&unit=day`),
        fetchJsonOrNull(userId, `/reviews/item/${encodeURIComponent(itemId)}`),
    ]);

    const variationValues = collectVariationValues(item);
    const tituloParaBusca = titleWithoutVariation(item.title, variationValues);

    const [categorySpecs, sales, competitors, ads] = await Promise.all([
        item.category_id ? fetchJsonOrNull(userId, `/categories/${encodeURIComponent(item.category_id)}/technical_specs/input`) : Promise.resolve(null),
        fetchItemSales(userId, mlUserId, itemId, 30),
        fetchCompetitors(userId, mlUserId, tituloParaBusca, item.category_id),
        fetchAdsMetrics(userId, itemId, 30),
    ]);

    // Atributos preenchidos no anúncio, já sem os que o ML preenche sozinho
    // e o vendedor não controla.
    const itemAttributes = (item.attributes || [])
        .filter((a) => a.value_name || (a.values && a.values.length))
        .map((a) => ({
            id: a.id,
            name: a.name || a.id,
            value: a.value_name || (a.values || []).map((v) => v.name).filter(Boolean).join(', '),
        }))
        .filter((a) => a.value);

    const filledIds = new Set(itemAttributes.map((a) => a.id));

    let categoryFields = null;
    if (categorySpecs) {
        const all = flattenCategoryFields(categorySpecs);
        categoryFields = {
            total: all.length,
            filled: all.filter((f) => filledIds.has(f.id)).length,
            missing: all.filter((f) => !filledIds.has(f.id)),
        };
    }

    let visits = null;
    if (visitsRaw && Array.isArray(visitsRaw.results)) {
        const daily = visitsRaw.results.map((r) => ({ date: r.date, total: r.total || 0 }));
        visits = {
            daily,
            total30: daily.reduce((acc, d) => acc + d.total, 0),
            last7: sumLastDays(daily, 7),
            prev7: sumLastDays(daily, 7, 7),
            last15: sumLastDays(daily, 15),
            prev15: sumLastDays(daily, 15, 15),
        };
    }

    let reviews = null;
    if (reviewsRaw && (reviewsRaw.rating_average != null || Array.isArray(reviewsRaw.reviews))) {
        const levels = reviewsRaw.rating_levels || {};
        reviews = {
            average: reviewsRaw.rating_average != null ? reviewsRaw.rating_average : null,
            total: Object.values(levels).reduce((acc, n) => acc + (n || 0), 0),
            levels,
            latest: (reviewsRaw.reviews || [])
                .slice(0, 3)
                .map((r) => ({ rate: r.rate, title: r.title || null, content: r.content || null, date: r.date_created || null })),
        };
    }

    // Vídeo não vem sempre em item.video_id. Em anúncio de CATÁLOGO o vídeo
    // costuma pertencer ao produto (página comum a todos os vendedores), e o
    // item individual sai sem o campo — foi assim que a análise passou a
    // dizer "Sem vídeo" para anúncio que visivelmente tinha vídeo na página.
    // Alguns anúncios também guardam o vídeo como atributo.
    function detectarVideo(it) {
        if (it.video_id) return true;
        if (Array.isArray(it.videos) && it.videos.length > 0) return true;
        // Atributos CRUS: itemAttributes acima já foi filtrado e renomeado, e
        // procurar value_name nele nunca acharia nada.
        return (it.attributes || []).some(a => {
            if (!a || typeof a.id !== 'string') return false;
            if (!a.id.toUpperCase().includes('VIDEO')) return false;
            const v = a.value_name || (a.values || []).map(x => x && x.name).filter(Boolean).join('');
            return v && String(v).trim() !== '';
        });
    }

    // Vídeo pode estar no USER PRODUCT, não no anúncio.
    //
    // Confirmado com dado real: para MLB4467695837 o item vem com video_id null
    // e nenhum atributo de vídeo, mesmo com a página exibindo vídeo. A URL do
    // anúncio revela o motivo — /up/MLBU3786690788?pdp_filters=item_id:MLB...
    // São duas entidades: o anúncio (MLB) e o produto do vendedor (MLBU), e o
    // conteúdo de produto (incluindo vídeo) mora no segundo.
    let videoNoProduto = false;
    if (!detectarVideo(item) && item.user_product_id) {
        for (const caminho of [`/user-products/${encodeURIComponent(item.user_product_id)}`,
                               `/user-product/${encodeURIComponent(item.user_product_id)}`]) {
            try {
                const r = await mlFetch(userId, caminho);
                if (!r.ok) continue;
                const up = await r.json();
                videoNoProduto = detectarVideo(up);
                console.log(`[diag-video] user_product=${item.user_product_id} via=${caminho} temVideo=${videoNoProduto} chaves=[${Object.keys(up).filter(k => /video|multimedia|media/i.test(k)).join(',')}]`);
                break;
            } catch (e) { /* tenta o próximo caminho */ }
        }
    }

    const descriptionText = description ? (description.plain_text || description.text || '') : '';

    res.json({
        item: {
            id: item.id,
            title: item.title || '',
            price: item.price,
            categoryId: item.category_id || null,
            permalink: item.permalink || null,
            thumbnail: item.secure_thumbnail || item.thumbnail || null,
            condition: item.condition || null,
            listingTypeId: item.listing_type_id || null,
            availableQuantity: item.available_quantity != null ? item.available_quantity : null,
            soldQuantity: item.sold_quantity != null ? item.sold_quantity : null,
            warranty: item.warranty || null,
            pictureCount: (item.pictures || []).length,
            hasVideo: detectarVideo(item) || videoNoProduto,
            freeShipping: !!(item.shipping && item.shipping.free_shipping),
            catalogListing: !!item.catalog_listing,
            tags: item.tags || [],
            variationValues,
        },
        description: { present: descriptionText.trim().length > 0, length: descriptionText.trim().length },
        attributes: itemAttributes,
        categoryFields,
        visits,
        reviews,
        sales,
        competitors,
        ads,
    });
}

// Cidade e estado do vendedor de um anúncio qualquer.
//
// A página do anúncio NÃO traz esse dado: ela é renderizada sem ele e o
// preenche depois por JavaScript. Baixei a página de um anúncio e confirmei —
// "Guarulhos" não aparece em lugar nenhum dos 693 KB de HTML.
//
// Tentar adivinhar no DOM produziu o pior resultado possível: a extensão
// mostrava a cidade de ENTREGA do próprio usuário como se fosse a do vendedor.
//
// /users/{id} autenticado devolve { address: { city, state } }. Anônimo dá 403,
// por isso a consulta passa por aqui, onde fica o token da conta.
async function handleSeller(req, res, userId) {
    const sellerId = String(req.query.sellerId || '').replace(/D/g, '');
    if (!sellerId) return res.status(400).json({ error: 'Parâmetro sellerId é obrigatório.' });

    const resp = await mlFetch(userId, `/users/${sellerId}`);
    if (!resp.ok) return res.json({ seller: null, motivo: 'nao_consultado' });

    const u = await resp.json().catch(() => null);
    const end = u && u.address;
    if (!u) return res.json({ seller: null, motivo: 'resposta_invalida' });

    // O estado vem como "BR-SP"; quem lê quer "SP".
    const uf = end && typeof end.state === 'string' ? end.state.replace(/^BR-/, '') : null;

    return res.json({
        seller: {
            nickname: u.nickname || null,
            cidade: (end && end.city) || null,
            uf,
            local: end && end.city && uf ? end.city + ' - ' + uf : null,
            reputacao: (u.seller_reputation && u.seller_reputation.level_id) || null,
        },
    });
}

// Data de criação dos anúncios que aparecem numa página de busca.
//
// O Mercado Livre responde isto SÓ para os anúncios do próprio vendedor:
// pedir um anúncio de terceiro devolve 403 access_denied com o token da conta,
// e 403 do PolicyAgent sem token nenhum — testei os dois. Por isso a resposta
// é um mapa do que deu certo, e não uma lista na mesma ordem dos pedidos:
// quem não veio é anúncio de outro vendedor, e a tela simplesmente não mostra
// data para ele.
async function handleDates(req, res, userId) {
    const ids = String(req.query.ids || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 60);

    if (ids.length === 0) return res.status(400).json({ error: 'Parâmetro ids é obrigatório.' });

    const datas = {};
    // 20 por chamada é o limite do multiget.
    for (let i = 0; i < ids.length; i += 20) {
        const lote = ids.slice(i, i + 20);
        const resp = await mlFetch(userId, `/items?ids=${lote.join(',')}&attributes=id,date_created,catalog_listing`);
        if (!resp.ok) continue;

        const linhas = await resp.json().catch(() => []);
        for (const linha of Array.isArray(linhas) ? linhas : []) {
            if (linha.code === 200 && linha.body && linha.body.date_created) {
                datas[linha.body.id] = {
                    criadoEm: linha.body.date_created,
                    catalogo: !!linha.body.catalog_listing,
                };
            }
        }
    }

    res.json({ datas });
}

// Só as métricas de publicidade do anúncio. O painel de viabilidade precisa
// exatamente disto para calcular o TACOS, e chamar action=performance para
// obter só isso arrastava junto concorrentes, vendas e ficha da categoria —
// muitas chamadas ao ML para uma resposta que cabe em uma.
//
// O motivo da ausência de dados volta explícito: "conta sem publicidade" e
// "anúncio fora de campanha" são coisas diferentes, e a tela precisa saber
// qual delas está mostrando.
async function handleAds(req, res, userId) {
    const itemId = req.query.itemId;
    if (!itemId) return res.status(400).json({ error: 'Parâmetro itemId é obrigatório.' });

    const ads = await fetchAdsMetrics(userId, itemId, 30);

    if (!ads) return res.json({ ads: null, motivo: 'erro_consulta' });
    if (!ads.enabled) return res.json({ ads: null, motivo: 'sem_publicidade' });

    const m = ads.metrics || {};
    const vendasAds = (m.direct_units_quantity || 0) + (m.indirect_units_quantity || 0);
    const organicas = m.organic_units_quantity || 0;
    const total = vendasAds + organicas;
    const roas = typeof m.roas === 'number' && m.roas > 0
        ? m.roas
        : ((m.cost > 0 && m.total_amount > 0) ? m.total_amount / m.cost : 0);

    if (!(roas > 0) || !(total > 0)) {
        return res.json({ ads: null, motivo: ads.status === 'idle' ? 'fora_de_campanha' : 'sem_dados' });
    }

    return res.json({
        ads: {
            roas: Math.round(roas * 100) / 100,
            participacao: Math.round((vendasAds / total) * 1000) / 10,
            vendasAds,
            organicas,
            custo: m.cost || 0,
            dias: ads.days,
            status: ads.status,
        },
    });
}

// Visitas de um anúncio — inclusive de OUTRO vendedor.
//
// Ao contrário de /items/{id}, que responde 403 para anúncio alheio, o recurso
// de visitas é aberto a qualquer token válido. Foi o que destravou visitas/dia
// e participação real no catálogo.
const JANELA_VISITAS = 30;

async function visitasDoItem(userId, itemId) {
    try {
        const r = await mlFetch(userId, `/items/${encodeURIComponent(itemId)}/visits/time_window?last=${JANELA_VISITAS}&unit=day`);
        if (!r.ok) return null;
        const d = await r.json();
        const total = Number(d.total_visits);
        if (!Number.isFinite(total)) return null;
        return {
            total,
            dias: JANELA_VISITAS,
            // Divide pela JANELA, não pelo número de registros: a série vem com
            // buracos (23 dias de 30 num teste real) e dividir pelos registros
            // inflaria a média em quase 30%.
            porDia: total / JANELA_VISITAS,
        };
    } catch (e) {
        return null;
    }
}

async function handleVisitas(req, res, userId) {
    const itemId = String(req.query.itemId || '').trim().toUpperCase();
    if (!/^MLB\d+$/.test(itemId)) {
        return res.status(400).json({ error: 'Parâmetro itemId inválido.' });
    }
    const v = await visitasDoItem(userId, itemId);
    if (!v) return res.status(404).json({ error: 'Sem dados de visita para este anúncio.' });
    return res.status(200).json(v);
}

// Concorrentes e ganhador de uma página de catálogo.
//
// /products/{id}/items NÃO está na documentação pública do Mercado Livre, mas
// responde 200 com o token OAuth do vendedor e devolve todos os anúncios que
// competem naquele catálogo. É a única fonte da lista — a doc só expõe o
// ganhador, pelo buy_box_winner de /products/{id}.
//
// Estoque, vendas/dia e visitas/dia NÃO vêm em nenhum dos dois. Quem mostra
// esses números tem coleta própria; aqui eles ficam de fora em vez de serem
// estimados e passarem por dado oficial.
async function handleCatalogo(req, res, userId) {
    const produtoId = String(req.query.product_id || '').trim().toUpperCase();
    if (!/^MLB\d+$/.test(produtoId)) {
        return res.status(400).json({ error: 'Parâmetro product_id inválido. Use o id do catálogo (MLB seguido de números).' });
    }

    const [respItens, respProduto] = await Promise.all([
        mlFetch(userId, `/products/${produtoId}/items`),
        mlFetch(userId, `/products/${produtoId}`),
    ]);

    if (!respItens.ok) {
        return res.status(respItens.status).json({ error: 'Não foi possível ler os concorrentes deste catálogo.' });
    }

    const dadosItens = await respItens.json();
    const produto = respProduto.ok ? await respProduto.json() : {};
    const ganhador = produto.buy_box_winner || null;

    const resultados = Array.isArray(dadosItens.results) ? dadosItens.results : [];

    // Um GET por vendedor, sem repetir: numa disputa é comum o mesmo vendedor
    // ter mais de um anúncio no catálogo.
    const idsVendedores = [...new Set(resultados.map((r) => r.seller_id).filter(Boolean))];
    const vendedores = {};
    await Promise.all(idsVendedores.map(async (id) => {
        try {
            const r = await mlFetch(userId, `/users/${id}`);
            if (!r.ok) return;
            const u = await r.json();
            vendedores[id] = {
                nome: u.nickname || null,
                uf: (u.address && u.address.state) ? String(u.address.state).replace(/^BR-/, '') : null,
                reputacao: u.seller_reputation ? u.seller_reputation.level_id : null,
                nivel: u.seller_reputation ? u.seller_reputation.power_seller_status : null,
            };
        } catch (e) {
            // Vendedor sem perfil legível não derruba a lista inteira.
        }
    }));

    // Visitas de cada concorrente. Uma chamada por anúncio — o recurso recusa
    // lote (`maximum amount of items to query is 1`) —, todas em paralelo.
    const visitasPorItem = {};
    await Promise.all(resultados.map(async (r) => {
        if (!r.item_id) return;
        visitasPorItem[r.item_id] = await visitasDoItem(userId, r.item_id);
    }));

    const totalVisitas = Object.values(visitasPorItem)
        .reduce((soma, v) => soma + (v ? v.total : 0), 0);

    const concorrentes = resultados.map((r) => {
        const v = vendedores[r.seller_id] || {};
        const envio = (r.shipping && r.shipping.logistic_type) || null;
        return {
            itemId: r.item_id,
            vendedorId: r.seller_id,
            vendedor: v.nome || ('Vendedor ' + r.seller_id),
            uf: v.uf || (r.seller_address && r.seller_address.state && r.seller_address.state.id
                ? String(r.seller_address.state.id).replace(/^BR-/, '')
                : null),
            preco: r.price,
            precoDe: r.original_price || null,
            envio,
            full: envio === 'fulfillment',
            freteGratis: !!(r.shipping && r.shipping.free_shipping),
            condicao: r.condition,
            // gold_pro é o Premium; gold_special é o Clássico.
            tipoAnuncio: r.listing_type_id === 'gold_pro' ? 'Premium'
                : (r.listing_type_id === 'gold_special' ? 'Clássico' : r.listing_type_id),
            lojaOficial: !!r.official_store_id,
            reputacao: v.reputacao || null,
            nivel: v.nivel || null,
            ganhador: !!(ganhador && ganhador.item_id === r.item_id),
            visitasDia: visitasPorItem[r.item_id] ? visitasPorItem[r.item_id].porDia : null,
            visitasTotal: visitasPorItem[r.item_id] ? visitasPorItem[r.item_id].total : null,
            // Participação real nas visitas do catálogo, não estimativa: é a
            // soma das visitas de todos os concorrentes que forma o
            // denominador. Só faz sentido se conseguimos ler todos.
            fatiaVisitas: (totalVisitas > 0 && visitasPorItem[r.item_id])
                ? visitasPorItem[r.item_id].total / totalVisitas
                : null,
        };
    }).sort((a, b) => (a.preco || 0) - (b.preco || 0));

    return res.status(200).json({
        produtoId,
        nome: produto.name || null,
        // Explícito de propósito: em página de catálogo "tradicional" o MP não
        // declara ganhador, e inventar um a partir da ordem da lista seria
        // apresentar palpite como fato.
        temGanhador: !!ganhador,
        ganhador: ganhador ? {
            itemId: ganhador.item_id,
            vendedorId: ganhador.seller_id,
            preco: ganhador.price,
            estoque: ganhador.available_quantity ?? null,
            envio: (ganhador.shipping && ganhador.shipping.logistic_type) || null,
            freteGratis: !!(ganhador.shipping && ganhador.shipping.free_shipping),
            lojaOficial: !!ganhador.official_store_id,
            reputacao: (ganhador.seller && ganhador.seller.reputation_level_id) || null,
            tipoAnuncio: ganhador.listing_type_id === 'gold_pro' ? 'Premium'
                : (ganhador.listing_type_id === 'gold_special' ? 'Clássico' : ganhador.listing_type_id),
        } : null,
        janelaVisitasDias: JANELA_VISITAS,
        totalVisitasCatalogo: totalVisitas || null,
        total: concorrentes.length,
        concorrentes,
    });
}

// ── Painel do Mercado Livre ─────────────────────────────────────────────
//
// O resumo da conta numa chamada só: o que o vendedor quer ver ao abrir o
// sistema (faturamento, vendas, conversão, reputação) e o que exige ação hoje
// (perguntas sem resposta, estoque acabando).
//
// Cada bloco é independente e devolve null quando o Mercado Livre não
// responde: uma consulta que falha não pode levar o painel inteiro junto. A
// tela mostra "—" só naquele número.

// Sobe quando o formato da resposta muda: a tela descarta o que guardou de
// versões anteriores.
const RESUMO_VERSAO = 3;

const RESUMO_DIAS_PADRAO = 30;
const RESUMO_PEDIDOS_POR_PAGINA = 50;
// 1.000 pedidos por período (20 páginas de 50). Cada período tem esse limite
// para si; acima disso o resumo avisa na tela que é amostra, em vez de estourar
// o tempo da função.
const RESUMO_PEDIDOS_PAGINAS = 20;
// Estoque em risco: dias que o estoque atual dura no ritmo de venda do período.
const RESUMO_DIAS_ESTOQUE_RISCO = 7;
// Quantos anúncios entram na tabela (e recebem comissão, frete e visitas) e
// quantos são examinados para o risco de ruptura.
const RESUMO_TOP_ITENS = 10;
const RESUMO_ITENS_PARA_ESTOQUE = 20;
// Envios de cada anúncio lidos para estimar o frete que o vendedor paga.
const RESUMO_ENVIOS_POR_ITEM = 3;

const numeroMl = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Dia no calendário de Brasília ("AAAA-MM-DD"): o vendedor conta o dia dele. */
function diaBrasilia(quando) {
    return new Date(quando).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function somarDiasIso(dia, n) {
    return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** Consulta ao ML que pode faltar: devolve null em vez de derrubar o resumo. */
async function jsonDoMl(userId, caminho, opcoes) {
    try {
        const resp = await mlFetch(userId, caminho, opcoes);
        if (!resp.ok) return null;
        return await resp.json();
    } catch (err) {
        return null;
    }
}

/**
 * Pedidos pagos de UM período. Cada período tem a sua própria leitura, com o
 * seu próprio limite de páginas: lendo os dois de uma vez, quem vende muito
 * estourava o limite ainda dentro do período atual e o anterior vinha zerado —
 * a tela dizia "não houve faturamento antes", o que é diferente de "não li".
 *
 * `detalhado` liga os cortes que só o período atual usa (por dia, por anúncio,
 * por dia da semana, por hora e compradores).
 */
async function pedidosDoPeriodo(userId, mlUserId, de, ate, detalhado) {
    const porDia = new Map();
    const porItem = new Map();
    const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
    const porHora = Array.from({ length: 24 }, () => 0);
    const compradores = new Map();
    let unidades = 0;
    let receita = 0;
    let pedidos = 0;
    let parcial = false;
    // A comissão vem em sale_fee, e a documentação não diz se é por unidade ou
    // da linha toda. O pagamento traz a tarifa total (marketplace_fee): nos
    // pedidos de um item com mais de uma unidade dá para ver qual leitura bate.
    // Mesma conferência do painel de Patrocinados.
    let votosPorUnidade = 0;
    let votosPorLinha = 0;
    const linhasDeTaxa = [];

    for (let pagina = 0; pagina < RESUMO_PEDIDOS_PAGINAS; pagina += 1) {
        const qs = `seller=${mlUserId}&order.status=paid`
            + `&order.date_created.from=${de}T00:00:00.000-03:00&order.date_created.to=${ate}T23:59:59.000-03:00`
            + `&sort=date_desc&limit=${RESUMO_PEDIDOS_POR_PAGINA}&offset=${pagina * RESUMO_PEDIDOS_POR_PAGINA}`;
        const dados = await jsonDoMl(userId, `/orders/search?${qs}`);
        if (!dados) break;

        for (const p of dados.results || []) {
            pedidos += 1;
            const dia = diaBrasilia(p.date_created);
            const itensDoPedido = p.order_items || [];

            if (detalhado && itensDoPedido.length === 1 && numeroMl(itensDoPedido[0].quantity) > 1) {
                const taxaPaga = (p.payments || []).reduce((acc, pg) => acc + numeroMl(pg.marketplace_fee), 0);
                if (taxaPaga > 0) {
                    const l = itensDoPedido[0];
                    const erroUnidade = Math.abs(numeroMl(l.sale_fee) * numeroMl(l.quantity) - taxaPaga);
                    const erroLinha = Math.abs(numeroMl(l.sale_fee) - taxaPaga);
                    if (erroUnidade < erroLinha) votosPorUnidade += 1; else if (erroLinha < erroUnidade) votosPorLinha += 1;
                }
            }

            if (detalhado) {
                // Dia da semana e hora no fuso de Brasília: o vendedor pensa no
                // relógio dele, não no do servidor.
                const local = new Date(new Date(p.date_created).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                porDiaSemana[local.getDay()] += 1;
                porHora[local.getHours()] += 1;
                const comprador = p.buyer && p.buyer.id;
                if (comprador) compradores.set(comprador, (compradores.get(comprador) || 0) + 1);
            }

            for (const l of p.order_items || []) {
                const qtd = numeroMl(l.quantity);
                const valor = numeroMl(l.unit_price) * qtd;
                unidades += qtd;
                receita += valor;
                if (!detalhado) continue;

                porDia.set(dia, (porDia.get(dia) || 0) + valor);
                const id = l.item && l.item.id;
                if (!id) continue;
                const linha = porItem.get(id) || { id, titulo: (l.item && l.item.title) || id, unidades: 0, receita: 0, tarifa: 0, envios: [] };
                linha.unidades += qtd;
                linha.receita += valor;
                porItem.set(id, linha);
                linhasDeTaxa.push({ id, qtd, taxa: numeroMl(l.sale_fee) });
                // Frete: só de compra avulsa. Carrinho (pack_id) divide o custo
                // do envio entre vários anúncios, de um jeito que o pedido não mostra.
                const envio = p.shipping && p.shipping.id;
                if (envio && itensDoPedido.length === 1 && !p.pack_id && linha.envios.length < RESUMO_ENVIOS_POR_ITEM) {
                    linha.envios.push({ id: envio, qtd });
                }
            }
        }

        const total = numeroMl(dados.paging && dados.paging.total);
        if ((pagina + 1) * RESUMO_PEDIDOS_POR_PAGINA >= total) break;
        if (pagina === RESUMO_PEDIDOS_PAGINAS - 1) parcial = true;
    }

    // Empate ou sem amostra: por unidade, que é o que a tarifa percentual faz.
    const taxaEhPorLinha = votosPorLinha > votosPorUnidade;
    for (const l of linhasDeTaxa) {
        const linha = porItem.get(l.id);
        if (linha) linha.tarifa += taxaEhPorLinha ? l.taxa : l.taxa * l.qtd;
    }

    const recorrentes = [...compradores.values()].filter((n) => n > 1).length;
    return {
        receita, unidades, pedidos, parcial, porDia, porItem, porDiaSemana, porHora,
        clientes: { total: compradores.size, recorrentes },
    };
}

/**
 * Visitas e logística dos anúncios que mais venderam. Visita por anúncio é o
 * que transforma "vendeu 3" em "vendeu 3 em 900 visitas" — a pergunta que
 * separa anúncio ruim de anúncio sem público.
 */
async function detalheDosItens(userId, ids, de, ate, dias) {
    if (!ids.length) return {};
    const desde = `${de}T00:00:00.000-03:00`;
    const limite = `${ate}T23:59:59.000-03:00`;

    const [visitas, fichas] = await Promise.all([
        // O multiget de visitas é /visits/items (não /items/visits, que era o
        // endereço errado e devolvia nada). Se ele falhar, cada anúncio é
        // consultado pela janela de tempo: mais chamadas, mas o número aparece.
        jsonDoMl(userId, `/visits/items?ids=${ids.join(',')}&date_from=${desde}&date_to=${limite}`),
        jsonDoMl(userId, `/items?ids=${ids.join(',')}&attributes=id,shipping,available_quantity,permalink`),
    ]);

    const saida = {};
    const anotar = (id, total) => {
        if (!id || !Number.isFinite(Number(total))) return;
        saida[id] = Object.assign(saida[id] || {}, { visitas: Number(total) });
    };

    if (Array.isArray(visitas)) {
        // Formato de lista: [{ item_id, total_visits }]
        for (const v of visitas) anotar(v.item_id || v.id, v.total_visits);
    } else if (visitas && typeof visitas === 'object') {
        // Formato de mapa: { MLB123: 480, MLB456: 91 }
        for (const [id, total] of Object.entries(visitas)) {
            anotar(id, total && typeof total === 'object' ? total.total_visits : total);
        }
    }

    // Reserva: nenhum anúncio veio com visita, então tenta um a um.
    if (!Object.values(saida).some((d) => d.visitas != null)) {
        const janela = Math.max(1, Math.min(150, dias));
        const um = await Promise.all(ids.map((id) => jsonDoMl(userId, `/items/${id}/visits/time_window?last=${janela}&unit=day`)));
        um.forEach((v, i) => { if (v) anotar(ids[i], v.total_visits); });
    }

    for (const f of Array.isArray(fichas) ? fichas : []) {
        if (f.code !== 200 || !f.body) continue;
        const envio = f.body.shipping || {};
        saida[f.body.id] = Object.assign(saida[f.body.id] || {}, {
            full: envio.logistic_type === 'fulfillment',
            freteGratis: !!envio.free_shipping,
            estoque: numeroMl(f.body.available_quantity),
            link: f.body.permalink || null,
        });
    }
    return saida;
}

/** Anúncios ativos que NÃO venderam no período: estoque parado com custo. */
async function anunciosSemVenda(userId, mlUserId, vendidos) {
    const ids = [];
    // 4 páginas de 100 cobrem a conta típica sem estourar o tempo da função.
    for (let pagina = 0; pagina < 4; pagina += 1) {
        const dados = await jsonDoMl(userId, `/users/${mlUserId}/items/search?status=active&limit=100&offset=${pagina * 100}`);
        const lote = (dados && dados.results) || [];
        ids.push(...lote);
        if (lote.length < 100) break;
    }
    const parados = ids.filter((id) => !vendidos.has(id));
    if (!parados.length) return { quantos: 0, exemplos: [], lidos: ids.length };

    const fichas = await jsonDoMl(userId, `/items?ids=${parados.slice(0, 20).join(',')}&attributes=id,title,price,available_quantity,permalink`);
    const exemplos = (Array.isArray(fichas) ? fichas : [])
        .filter((f) => f.code === 200 && f.body)
        .map((f) => ({ id: f.body.id, titulo: f.body.title, preco: numeroMl(f.body.price), estoque: numeroMl(f.body.available_quantity), link: f.body.permalink || null }))
        .slice(0, 8);
    return { quantos: parados.length, exemplos, lidos: ids.length };
}

/**
 * Frete que o vendedor pagou de fato, por unidade, de cada anúncio: mediana dos
 * últimos envios avulsos. senders[].cost é o valor final cobrado, já com os
 * descontos (documentação "Gerenciamento de envios"). Mediana e não média: um
 * destino distante não puxa o valor típico.
 */
async function fretesDosItens(userId, mlUserId, itens) {
    const cabecalho = { headers: { 'x-format-new': 'true' } };
    await Promise.all(itens.map(async (item) => {
        const custos = await Promise.all(item.envios.map(async (e) => {
            const c = await jsonDoMl(userId, `/shipments/${e.id}/costs`, cabecalho);
            const remetentes = (c && c.senders) || [];
            // A linha deste vendedor; a primeira da lista, quando ela não
            // aparece, podia ser o frete de outro vendedor do mesmo envio.
            const meu = remetentes.find((x) => String(x.user_id) === String(mlUserId))
                || (remetentes.length === 1 ? remetentes[0] : null);
            return meu && typeof meu.cost === 'number' && e.qtd > 0 ? meu.cost / e.qtd : null;
        }));
        const validos = custos.filter((v) => v != null).sort((a, b) => a - b);
        const meio = Math.floor(validos.length / 2);
        item.freteUn = !validos.length ? null : validos.length % 2 ? validos[meio] : (validos[meio - 1] + validos[meio]) / 2;
        item.freteAmostras = validos.length;
    }));
}

/**
 * Quanto tempo o estoque dura no ritmo de venda do período. Um alerta de
 * "menos de 5 unidades" não diz se acaba amanhã ou daqui a dois meses: quem
 * vende 10 por dia com 30 em estoque está a 3 dias da ruptura, e quem vende 1
 * por mês com 3 está tranquilo.
 */
async function estoqueDosMaisVendidos(userId, itens, dias) {
    const alvo = itens.slice(0, RESUMO_ITENS_PARA_ESTOQUE);
    if (!alvo.length) return [];
    const fichas = await jsonDoMl(userId, `/items?ids=${alvo.map((i) => i.id).join(',')}&attributes=id,title,available_quantity,permalink`);
    const porId = new Map();
    for (const f of Array.isArray(fichas) ? fichas : []) {
        if (f.code === 200 && f.body) porId.set(f.body.id, f.body);
    }
    return alvo
        .map((i) => {
            const ficha = porId.get(i.id);
            if (!ficha) return null;
            const velocidade = i.unidades / dias;
            const estoque = numeroMl(ficha.available_quantity);
            return {
                id: i.id, titulo: ficha.title || i.titulo, estoque, velocidade,
                diasRestantes: velocidade > 0 ? estoque / velocidade : null,
                link: ficha.permalink || null,
            };
        })
        .filter((i) => i && i.diasRestantes != null && i.diasRestantes <= RESUMO_DIAS_ESTOQUE_RISCO)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)
        .slice(0, 8);
}

async function handleResumo(req, res, userId) {
    const dias = Math.min(90, Math.max(7, numeroMl(req.query.dias) || RESUMO_DIAS_PADRAO));
    const ate = diaBrasilia(Date.now());
    const de = somarDiasIso(ate, -(dias - 1));
    // O período anterior, do mesmo tamanho, entra na mesma leitura de pedidos.
    const deAnterior = somarDiasIso(de, -dias);

    // Sem conta do ML conectada não existe resumo: devolver zeros faria a tela
    // afirmar "faturamento R$ 0,00", que é diferente de "não sei".
    const r = await mlFetch(userId, '/users/me', {}, true);
    if (!r.resp.ok) {
        return res.status(409).json({ error: 'Conecte a sua conta do Mercado Livre em Configurações para ver o painel.' });
    }
    const mlUserId = r.mlUserId;
    const conta = await r.resp.json().catch(() => null);

    const [vendas, anterior, perguntas, ativos, pausados, visitas, cancelados] = await Promise.all([
        pedidosDoPeriodo(userId, mlUserId, de, ate, true),
        pedidosDoPeriodo(userId, mlUserId, deAnterior, somarDiasIso(de, -1), false),
        jsonDoMl(userId, `/questions/search?seller_id=${mlUserId}&status=UNANSWERED&limit=1&api_version=4`),
        jsonDoMl(userId, `/users/${mlUserId}/items/search?status=active&limit=1`),
        jsonDoMl(userId, `/users/${mlUserId}/items/search?status=paused&limit=1`),
        jsonDoMl(userId, `/users/${mlUserId}/items_visits?date_from=${de}T00:00:00.000-03:00&date_to=${ate}T23:59:59.000-03:00`),
        jsonDoMl(userId, `/orders/search?seller=${mlUserId}&order.status=cancelled`
            + `&order.date_created.from=${de}T00:00:00.000-03:00&order.date_created.to=${ate}T23:59:59.000-03:00&limit=1`),
    ]);

    // Série do gráfico: todo dia do período aparece, inclusive os sem venda —
    // um buraco no meio da linha diria "sem dado" quando o certo é "sem venda".
    const serie = [];
    for (let i = 0; i < dias; i += 1) {
        const dia = somarDiasIso(de, i);
        serie.push({ dia, receita: vendas.porDia.get(dia) || 0 });
    }

    const ordenados = [...vendas.porItem.values()].sort((a, b) => b.receita - a.receita);
    const topItens = ordenados.slice(0, RESUMO_TOP_ITENS);
    const [detalhes, parados, estoqueEmRisco] = await Promise.all([
        detalheDosItens(userId, topItens.map((i) => i.id), de, ate, dias),
        anunciosSemVenda(userId, mlUserId, new Set(vendas.porItem.keys())),
        estoqueDosMaisVendidos(userId, ordenados, dias),
        fretesDosItens(userId, mlUserId, topItens),
    ]);
    for (const item of topItens) {
        const d = detalhes[item.id] || {};
        item.visitas = d.visitas != null ? d.visitas : null;
        item.conversao = d.visitas ? item.unidades / d.visitas : null;
        item.full = d.full != null ? d.full : null;
        item.freteGratis = d.freteGratis != null ? d.freteGratis : null;
        item.estoque = d.estoque != null ? d.estoque : null;
        item.link = d.link || null;
        // O que a conta de lucro precisa: preço, comissão e frete reais das
        // vendas do período. O custo do produto e o imposto são do vendedor e
        // ficam na tela, que refaz a conta a cada custo digitado.
        item.precoMedio = item.unidades > 0 ? item.receita / item.unidades : null;
        item.comissaoUn = item.unidades > 0 ? item.tarifa / item.unidades : null;
        item.velocidade = item.unidades / dias;
        item.diasDeEstoque = item.estoque != null && item.velocidade > 0 ? item.estoque / item.velocidade : null;
        // Não vão para a tela: são insumo de cálculo.
        delete item.tarifa;
        delete item.envios;
    }

    // Curva ABC: quantos anúncios fazem 80% do faturamento. Concentração alta
    // é risco (um anúncio suspenso derruba o mês) e também é onde mexer primeiro.
    let acumulado = 0;
    let anunciosPara80 = 0;
    for (const item of ordenados) {
        if (acumulado >= vendas.receita * 0.8) break;
        acumulado += item.receita;
        anunciosPara80 += 1;
    }

    const variacao = (agora, antes) => (antes > 0 ? (agora - antes) / antes : null);
    const ticketAtual = vendas.pedidos > 0 ? vendas.receita / vendas.pedidos : null;
    const ticketAnterior = anterior.pedidos > 0 ? anterior.receita / anterior.pedidos : null;
    const totalVisitas = visitas && Number.isFinite(Number(visitas.total_visits)) ? Number(visitas.total_visits) : null;
    const reputacao = (conta && conta.seller_reputation) || null;
    const canceladosNoPeriodo = cancelados && cancelados.paging ? numeroMl(cancelados.paging.total) : null;

    // Projeção do MÊS corrente, no ritmo dos dias já corridos dele.
    const hoje = new Date(`${ate}T12:00:00Z`);
    const diaDoMes = hoje.getUTCDate();
    const diasNoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)).getUTCDate();
    const inicioDoMes = `${ate.slice(0, 7)}-01`;
    const receitaDoMes = serie.filter((d) => d.dia >= inicioDoMes).reduce((acc, d) => acc + d.receita, 0);
    const cobreOMes = de <= inicioDoMes;

    res.json({
        // Versão do formato. A tela guarda o resumo por 30 minutos; sem este
        // carimbo, um resumo antigo em cache fazia os blocos novos sumirem sem
        // dizer por quê.
        versao: RESUMO_VERSAO,
        periodo: { de, ate, dias },
        anterior: { de: deAnterior, ate: somarDiasIso(de, -1) },
        conta: conta
            ? {
                nickname: conta.nickname || null,
                reputacao: (reputacao && reputacao.level_id) || null,
                mercadoLider: (reputacao && reputacao.power_seller_status) || null,
                vendasConcluidas: (reputacao && reputacao.transactions && numeroMl(reputacao.transactions.completed)) || null,
                reclamacoes: reputacao && reputacao.metrics && reputacao.metrics.claims ? reputacao.metrics.claims.rate : null,
                atrasos: reputacao && reputacao.metrics && reputacao.metrics.delayed_handling_time ? reputacao.metrics.delayed_handling_time.rate : null,
                cancelamentos: reputacao && reputacao.metrics && reputacao.metrics.cancellations ? reputacao.metrics.cancellations.rate : null,
            }
            : null,
        vendas: {
            receita: vendas.receita,
            unidades: vendas.unidades,
            pedidos: vendas.pedidos,
            ticket: ticketAtual,
            porDia: serie,
            porDiaSemana: vendas.porDiaSemana,
            porHora: vendas.porHora,
            topItens,
            parcial: vendas.parcial || anterior.parcial,
            cancelados: canceladosNoPeriodo,
            clientes: vendas.clientes,
            anunciosPara80: vendas.receita > 0 ? anunciosPara80 : null,
            anunciosQueVenderam: vendas.porItem.size,
        },
        comparacao: {
            receita: variacao(vendas.receita, anterior.receita),
            unidades: variacao(vendas.unidades, anterior.unidades),
            pedidos: variacao(vendas.pedidos, anterior.pedidos),
            ticket: ticketAnterior != null && ticketAtual != null ? variacao(ticketAtual, ticketAnterior) : null,
            receitaAnterior: anterior.receita,
        },
        projecao: cobreOMes && diaDoMes > 2
            ? { mes: (receitaDoMes / diaDoMes) * diasNoMes, ateAgora: receitaDoMes, diaDoMes, diasNoMes }
            : null,
        visitas: totalVisitas,
        conversao: totalVisitas && totalVisitas > 0 ? vendas.unidades / totalVisitas : null,
        anuncios: {
            ativos: ativos && ativos.paging ? numeroMl(ativos.paging.total) : null,
            pausados: pausados && pausados.paging ? numeroMl(pausados.paging.total) : null,
            semVenda: parados.quantos,
            semVendaExemplos: parados.exemplos,
        },
        perguntasSemResposta: perguntas && perguntas.total != null ? numeroMl(perguntas.total) : null,
        estoqueEmRisco,
    });
}


module.exports = async (req, res) => {
    const userId = await requireAccess(req, res);
    if (!userId) return;

    // Shopee usa o mesmo arquivo pelo motivo de sempre (teto de 12 funções da
    // Vercel) — namespace de action próprio, sem tocar no switch do ML abaixo.
    if (req.query.provider === 'shopee') {
        try {
            if (req.query.action === 'analise') return await handleShopeeAnalise(req, res, userId);
            return res.status(400).json({ error: 'Parâmetro action inválido para a Shopee. Use analise.' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    try {
        switch (req.query.action) {
            case 'category': return await handleCategory(req, res, userId);
            case 'fee': return await handleFee(req, res, userId);
            case 'item': return await handleItem(req, res, userId);
            case 'bestseller': return await handleBestSeller(req, res, userId);
            case 'ads': return await handleAds(req, res, userId);
            case 'dates': return await handleDates(req, res, userId);
            case 'seller': return await handleSeller(req, res, userId);
            case 'performance': return await handlePerformance(req, res, userId);
            case 'analise': return await handleAnalise(req, res, userId);
            case 'catalogo': return await handleCatalogo(req, res, userId);
            case 'visitas': return await handleVisitas(req, res, userId);
            case 'resumo': return await handleResumo(req, res, userId);
            default: return res.status(400).json({ error: 'Parâmetro action inválido. Use category, fee, item, bestseller, performance, analise, catalogo, visitas ou resumo.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// O resumo do painel faz várias consultas ao Mercado Livre (pedidos em
// páginas, perguntas, visitas, estoque). O padrão de 10s não cobre.
module.exports.config = { maxDuration: 60 };
