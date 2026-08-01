const { mlFetch, getVerifiedUserId } = require('./_ml-helper');

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
    const { price, category, listingType } = req.query;
    if (!price || !category) {
        return res.status(400).json({ error: 'Parâmetros price e category são obrigatórios.' });
    }

    const resp = await mlFetch(userId, `/sites/${SITE_ID}/listing_prices?price=${encodeURIComponent(price)}&category_id=${encodeURIComponent(category)}`);
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });

    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ error: 'Nenhuma tarifa retornada para essa categoria/preço.' });
    }

    const wantedType = listingType || 'gold_special'; // "Clássico"
    const match = data.find(d => d.listing_type_id === wantedType) || data[0];

    res.json({
        listingTypeId: match.listing_type_id,
        listingTypeName: match.listing_type_name,
        percentageFee: match.sale_fee_details.percentage_fee,
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
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const asDate = (d) => d.toISOString().slice(0, 10);

    const qs = new URLSearchParams({
        date_from: asDate(from),
        date_to: asDate(to),
        metrics: ADS_METRICS,
    });

    try {
        const resp = await mlFetch(
            userId,
            `/advertising/${SITE_ID}/product_ads/ads/${encodeURIComponent(itemId)}?${qs.toString()}`,
            { headers: { 'api-version': '2' } }
        );

        if (resp.status === 404) return { enabled: false, reason: 'sem_publicidade' };
        if (!resp.ok) return null;

        const data = await resp.json();
        return {
            enabled: true,
            days,
            status: data.status || null,
            campaignId: data.campaign_id || null,
            recommended: !!data.recommended,
            metrics: data.metrics_summary || data.metrics || {},
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
const VARIATION_ATTR_IDS = new Set([
    'COLOR', 'MAIN_COLOR', 'SECONDARY_COLOR', 'SIZE', 'FABRIC_DESIGN',
    'GENDER', 'FLAVOR', 'VOLTAGE', 'CAPACITY', 'FORMAT', 'PACKAGE_QUANTITY',
]);

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
    const values = new Set();

    (item.variations || []).forEach((variation) => {
        (variation.attribute_combinations || []).forEach((combo) => {
            if (combo.value_name) values.add(combo.value_name);
        });
    });

    // Anúncio sem array de variações (caso dos user products) ainda traz os
    // mesmos dados como atributos comuns — mas aí só aceitamos os ids que
    // sabemos ser de variação, pra não descontar do título uma palavra que o
    // vendedor escreveu de propósito.
    if (values.size === 0) {
        (item.attributes || []).forEach((attr) => {
            if (VARIATION_ATTR_IDS.has(attr.id) && attr.value_name) values.add(attr.value_name);
        });
    }

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
            hasVideo: !!item.video_id,
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

module.exports = async (req, res) => {
    const userId = await getVerifiedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

    try {
        switch (req.query.action) {
            case 'category': return await handleCategory(req, res, userId);
            case 'fee': return await handleFee(req, res, userId);
            case 'item': return await handleItem(req, res, userId);
            case 'bestseller': return await handleBestSeller(req, res, userId);
            case 'performance': return await handlePerformance(req, res, userId);
            case 'analise': return await handleAnalise(req, res, userId);
            default: return res.status(400).json({ error: 'Parâmetro action inválido. Use category, fee, item, bestseller, performance ou analise.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
