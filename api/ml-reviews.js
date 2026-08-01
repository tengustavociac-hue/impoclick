const crypto = require('crypto');
const { mlFetch, supabaseAdmin, getVerifiedUserId } = require('./_ml-helper');

const ITEMS_PER_USER_CAP = 100; // 1 página de /items/search (máx permitido pela API); evita estourar o tempo de execução da function
const ITEM_CHECK_CONCURRENCY = 8; // chamadas simultâneas à API do ML por item, pra caber no limite de 60s da function

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// Roda fn(item) para cada item da lista, com no máximo `limit` chamadas em paralelo.
// Sem isso, checar reviews + catálogo + promoções item por item em série estoura os
// 60s da function assim que a base de itens/usuários cresce um pouco.
async function mapWithConcurrency(items, limit, fn) {
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const current = idx++;
            await fn(items[current], current);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Também traz catalog_product_id: em anúncios de catálogo, as opiniões ficam
// atreladas ao produto do catálogo, não à publicação — sem esse id na chamada
// de /reviews/item, a API devolve a lista vazia mesmo quando o produto tem avaliações.
async function fetchItemMeta(userId, itemIds) {
    const meta = {};
    for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const resp = await mlFetch(userId, `/items?ids=${batch.join(',')}&attributes=id,title,thumbnail,catalog_product_id,user_product_id`);
        if (!resp.ok) continue;
        const data = await resp.json();
        for (const entry of data) {
            if (entry.code === 200 && entry.body) {
                meta[entry.body.id] = {
                    title: entry.body.title,
                    thumbnail: entry.body.thumbnail || null,
                    catalogProductId: entry.body.catalog_product_id || null,
                    userProductId: entry.body.user_product_id || null,
                };
            }
        }
    }
    return meta;
}

// Status de competição de catálogo (GET /items/{id}/price_to_win?version=v2) só se
// aplica a anúncios com catalog_product_id. "is_read=false" marca só transições reais
// de ganhando -> perdendo (perder é a notificação; recuperar resolve sozinho) — não
// alerta na primeira vez que o item é visto, pra não inundar com status que já existia.
async function checkCatalogCompetition(userId, itemIds, meta) {
    const catalogItemIds = itemIds.filter(id => meta[id] && meta[id].catalogProductId);
    if (catalogItemIds.length === 0) return { catalogChecked: 0, catalogLost: 0 };

    const { data: existingRows, error: existingError } = await supabaseAdmin
        .from('ml_catalog_status')
        .select('ml_item_id, status, is_read, previous_status')
        .eq('user_id', userId)
        .in('ml_item_id', catalogItemIds);
    if (existingError) throw new Error(existingError.message);

    const oldByItemId = {};
    for (const row of existingRows || []) oldByItemId[row.ml_item_id] = row;

    const rows = [];
    let catalogLost = 0;

    await mapWithConcurrency(catalogItemIds, ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const resp = await mlFetch(userId, `/items/${itemId}/price_to_win?version=v2`);
        if (!resp.ok) return;

        const data = await resp.json();
        const status = data.status;
        const old = oldByItemId[itemId];

        // previousStatus guarda o status de ANTES da transição que gerou o alerta
        // atual (ex: "winning" antes de virar "competing") — carregado adiante sem
        // mudar enquanto o alerta seguir sem leitura, pra o card conseguir mostrar
        // "estava Ganhando, passou a Perder" mesmo em checagens seguintes, não só
        // na primeira em que a mudança foi detectada.
        let isRead;
        let previousStatus = old ? old.previous_status : null;
        if (!old) {
            isRead = true; // primeira vez que vemos este item — não é uma transição
        } else if (old.status === 'winning' && status !== 'winning') {
            isRead = false;
            previousStatus = old.status;
            catalogLost++;
        } else if (old.status !== 'winning' && status === 'winning') {
            isRead = true; // recuperou a posição, resolve o alerta sozinho
            previousStatus = null;
        } else {
            isRead = old.is_read;
        }

        rows.push({
            user_id: userId,
            ml_item_id: itemId,
            item_title: meta[itemId].title || null,
            item_thumbnail: meta[itemId].thumbnail || null,
            catalog_product_id: meta[itemId].catalogProductId,
            user_product_id: meta[itemId].userProductId,
            status,
            previous_status: previousStatus,
            current_price: data.current_price ?? null,
            price_to_win: data.price_to_win ?? null,
            winner_item_id: (data.winner && data.winner.item_id) || null,
            winner_price: (data.winner && data.winner.price) ?? null,
            reason: Array.isArray(data.reason) && data.reason.length > 0 ? data.reason.join(', ') : null,
            is_read: isRead,
            updated_at: new Date().toISOString(),
        });
    });

    if (rows.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_catalog_status')
            .upsert(rows, { onConflict: 'user_id,ml_item_id' });
        if (error) throw new Error(error.message);
    }

    return { catalogChecked: catalogItemIds.length, catalogLost };
}

// Promoções (GET /seller-promotions/items/{id}?app_version=v2) se dividem em dois
// conceitos bem diferentes, guardados em tabelas separadas:
//   - ml_promotions: promoções REAIS com prazo definido (finish_date sempre presente).
//     Dois gatilhos de alerta, via soon_alerted salvo (pra não re-notificar a cada
//     checagem depois que o usuário já viu):
//       1) faltam <= 3 dias pro fim
//       2) a promoção estava ativa e sumiu da lista da API = terminou
//   - ml_lightning_candidates: anúncios elegíveis pra Oferta Relâmpago (status=candidate,
//     type=LIGHTNING) — modalidade sem prazo fixo, então é só uma lista informativa de
//     oportunidade, sem alerta e sem is_read.
async function checkPromotions(userId, itemIds, meta) {
    const [activeRes, candidateRes] = await Promise.all([
        supabaseAdmin
            .from('ml_promotions')
            .select('ml_item_id, promotion_id, item_title, item_thumbnail, promotion_type, promotion_name, finish_date, soon_alerted, is_read')
            .eq('user_id', userId)
            .eq('status', 'active'),
        supabaseAdmin
            .from('ml_lightning_candidates')
            .select('ml_item_id')
            .eq('user_id', userId),
    ]);
    if (activeRes.error) throw new Error(activeRes.error.message);
    if (candidateRes.error) throw new Error(candidateRes.error.message);

    const oldByKey = {};
    for (const row of activeRes.data || []) oldByKey[`${row.ml_item_id}|${row.promotion_id}`] = row;
    const oldCandidateItemIds = new Set((candidateRes.data || []).map(r => r.ml_item_id));

    const seenKeys = new Set();
    const seenCandidateItemIds = new Set();
    const promotionRows = [];
    const candidateRows = [];
    let endingSoon = 0;

    await mapWithConcurrency(itemIds, ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const resp = await mlFetch(userId, `/seller-promotions/items/${itemId}?app_version=v2`);
        if (!resp.ok) return;

        const promos = await resp.json();
        const list = Array.isArray(promos) ? promos : [];

        // Relâmpago é tratado uma vez por item, olhando TODAS as entradas LIGHTNING
        // juntas: a API pode devolver "candidate" (nova oportunidade) e "pending"/
        // "started" (já agendada/rodando) ao mesmo tempo pro mesmo anúncio. Só entra
        // como candidato de verdade quem não tem nada agendado nem ativo ainda.
        const hasLightningCandidate = list.some(p => p.type === 'LIGHTNING' && p.status === 'candidate');
        const hasLightningScheduledOrActive = list.some(p => p.type === 'LIGHTNING' && (p.status === 'pending' || p.status === 'started'));
        if (hasLightningCandidate && !hasLightningScheduledOrActive) {
            seenCandidateItemIds.add(itemId);
            candidateRows.push({
                user_id: userId,
                ml_item_id: itemId,
                item_title: (meta[itemId] && meta[itemId].title) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].thumbnail) || null,
                updated_at: new Date().toISOString(),
            });
        }

        for (const p of list) {
            if (p.type === 'LIGHTNING') continue; // já resolvido acima — Relâmpago não entra como promoção "com prazo"

            if (p.status !== 'started' || !p.finish_date || !p.id) continue;

            const key = `${itemId}|${p.id}`;
            seenKeys.add(key);
            const old = oldByKey[key];
            const daysLeft = (new Date(p.finish_date).getTime() - Date.now()) / 86400000;
            const withinWindow = daysLeft <= 3;

            let soonAlerted = old ? old.soon_alerted : false;
            let isRead = old ? old.is_read : true;
            if (withinWindow && !soonAlerted) {
                isRead = false;
                soonAlerted = true;
                endingSoon++;
            } else if (!withinWindow) {
                soonAlerted = false; // data foi estendida pra frente — reseta pra poder alertar de novo depois
            }

            promotionRows.push({
                user_id: userId,
                ml_item_id: itemId,
                item_title: (meta[itemId] && meta[itemId].title) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].thumbnail) || null,
                promotion_id: p.id,
                promotion_type: p.type || null,
                promotion_name: p.name || null,
                finish_date: p.finish_date,
                status: 'active',
                soon_alerted: soonAlerted,
                is_read: isRead,
                updated_at: new Date().toISOString(),
            });
        }
    });

    // Promoções que estavam ativas e sumiram da resposta da API = terminaram. finish_date
    // agora é NOT NULL na tabela, então reaproveita o último valor conhecido (old) em vez
    // de omitir a coluna — cada linha do upsert sempre tem o mesmo formato completo.
    let justEnded = 0;
    for (const key of Object.keys(oldByKey)) {
        if (seenKeys.has(key)) continue;
        const [itemId, promotionId] = key.split('|');
        const old = oldByKey[key];
        promotionRows.push({
            user_id: userId,
            ml_item_id: itemId,
            item_title: old.item_title,
            item_thumbnail: old.item_thumbnail,
            promotion_id: promotionId,
            promotion_type: old.promotion_type,
            promotion_name: old.promotion_name,
            finish_date: old.finish_date,
            status: 'ended',
            soon_alerted: old.soon_alerted,
            is_read: false,
            updated_at: new Date().toISOString(),
        });
        justEnded++;
    }

    if (promotionRows.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_promotions')
            .upsert(promotionRows, { onConflict: 'user_id,ml_item_id,promotion_id' });
        if (error) throw new Error(error.message);
    }

    if (candidateRows.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_lightning_candidates')
            .upsert(candidateRows, { onConflict: 'user_id,ml_item_id' });
        if (error) throw new Error(error.message);
    }

    // Itens que eram candidatos a Relâmpago e não são mais (já foram inscritos,
    // deixaram de ser elegíveis, etc.) — remove pra não mostrar oportunidade que já passou.
    const staleCandidateItemIds = [...oldCandidateItemIds].filter(id => !seenCandidateItemIds.has(id));
    if (staleCandidateItemIds.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_lightning_candidates')
            .delete()
            .eq('user_id', userId)
            .in('ml_item_id', staleCandidateItemIds);
        if (error) throw new Error(error.message);
    }

    return { promotionsChecked: seenKeys.size, endingSoon, justEnded, lightningCandidates: seenCandidateItemIds.size };
}

// Verifica as avaliações, o status de catálogo e as promoções de um usuário conectado,
// gravando tudo que for novo/mudou no Supabase. A dedupe de avaliações acontece via
// upsert com a constraint unique(user_id, ml_item_id, ml_review_id) — inclui user_id
// porque duas contas Impoclick podem estar ligadas à mesma conta do Mercado Livre
// (mesmos itens).
async function checkUser(userId) {
    const searchResp = await mlFetch(userId, mlUserId => `/users/${mlUserId}/items/search?status=active&limit=${ITEMS_PER_USER_CAP}`);
    if (!searchResp.ok) throw new Error(`items/search falhou (${searchResp.status})`);

    const searchData = await searchResp.json();
    const itemIds = searchData.results || [];
    const totalActiveItems = (searchData.paging && searchData.paging.total) || itemIds.length;
    if (itemIds.length === 0) return { itemsChecked: 0, newReviews: 0, catalogChecked: 0, catalogLost: 0, promotionsChecked: 0, endingSoon: 0, justEnded: 0, lightningCandidates: 0, totalActiveItems };

    const meta = await fetchItemMeta(userId, itemIds);

    const rows = [];
    await mapWithConcurrency(itemIds, ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const catalogProductId = meta[itemId] && meta[itemId].catalogProductId;
        const reviewsPath = catalogProductId
            ? `/reviews/item/${itemId}?catalog_product_id=${encodeURIComponent(catalogProductId)}`
            : `/reviews/item/${itemId}`;

        const resp = await mlFetch(userId, reviewsPath);
        if (!resp.ok) return; // item sem reviews habilitadas ou erro pontual — segue para o próximo

        const data = await resp.json();
        const levels = data.rating_levels || {};
        const itemRatingCount = ['one_star', 'two_star', 'three_star', 'four_star', 'five_star']
            .reduce((sum, key) => sum + (levels[key] || 0), 0);

        for (const r of data.reviews || []) {
            rows.push({
                user_id: userId,
                ml_item_id: itemId,
                ml_review_id: String(r.id),
                item_title: (meta[itemId] && meta[itemId].title) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].thumbnail) || null,
                item_rating_average: data.rating_average ?? null,
                item_rating_count: itemRatingCount,
                rating: r.rate,
                comment: r.content || null,
                reviewed_at: r.date_created || null,
            });
        }
    });

    let newReviews = 0;
    if (rows.length > 0) {
        // ignoreDuplicates:false (padrão) faz DO UPDATE em vez de DO NOTHING — assim
        // item_title/item_thumbnail/item_rating_average/item_rating_count ficam sempre
        // atualizados, mesmo pra reviews já vistas antes. is_read não entra no payload,
        // então continua preservado pelas linhas que já existiam. Por isso "newReviews"
        // aqui vira uma contagem de "avaliações processadas nesta rodada", não só as
        // genuinamente novas (o upsert não distingue mais insert de update no retorno).
        const { data: processed, error } = await supabaseAdmin
            .from('ml_reviews')
            .upsert(rows, { onConflict: 'user_id,ml_item_id,ml_review_id' })
            .select('id');
        if (error) throw new Error(error.message);
        newReviews = processed ? processed.length : 0;
    }

    const catalogResult = await checkCatalogCompetition(userId, itemIds, meta);
    const promotionsResult = await checkPromotions(userId, itemIds, meta);

    return { itemsChecked: itemIds.length, newReviews, ...catalogResult, ...promotionsResult, totalActiveItems };
}

const PROMOTION_RETENTION_DAYS = 180;

// ml_reviews e ml_catalog_status não crescem sem limite (reviews têm valor
// histórico, catálogo é upsert por item) — só ml_promotions acumula uma linha
// por promoção encerrada pra sempre. Uma limpeza leve, 1x por rodada (não por
// usuário), evita a tabela crescer indefinidamente com campanhas antigas.
async function cleanupOldPromotions() {
    const cutoff = new Date(Date.now() - PROMOTION_RETENTION_DAYS * 86400000).toISOString();
    const { error } = await supabaseAdmin
        .from('ml_promotions')
        .delete()
        .eq('status', 'ended')
        .lt('updated_at', cutoff);
    if (error) console.error('Erro na limpeza de promoções antigas:', error.message);
}

async function runCheck(res) {
    await cleanupOldPromotions();

    const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('ml_access_token', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    let itemsChecked = 0;
    let newReviews = 0;
    let catalogChecked = 0;
    let catalogLost = 0;
    let promotionsChecked = 0;
    let endingSoon = 0;
    let justEnded = 0;
    let lightningCandidates = 0;
    const errors = [];

    for (const profile of profiles || []) {
        try {
            const result = await checkUser(profile.id);
            itemsChecked += result.itemsChecked;
            newReviews += result.newReviews;
            catalogChecked += result.catalogChecked;
            catalogLost += result.catalogLost;
            promotionsChecked += result.promotionsChecked;
            endingSoon += result.endingSoon;
            justEnded += result.justEnded;
            lightningCandidates += result.lightningCandidates;

            await supabaseAdmin.from('ml_check_status').upsert({
                user_id: profile.id,
                last_checked_at: new Date().toISOString(),
                last_items_checked: result.itemsChecked,
                total_active_items: result.totalActiveItems,
                last_error: null,
            });
        } catch (err) {
            errors.push({ userId: profile.id, error: err.message });
            try {
                await supabaseAdmin.from('ml_check_status').upsert({
                    user_id: profile.id,
                    last_checked_at: new Date().toISOString(),
                    last_error: err.message,
                });
            } catch (e2) { /* não deixa um erro ao registrar o status derrubar o lote inteiro */ }
        }
    }

    return res.json({
        usersChecked: (profiles || []).length,
        itemsChecked, newReviews,
        catalogChecked, catalogLost,
        promotionsChecked, endingSoon, justEnded, lightningCandidates,
        errors,
    });
}

// Anúncios sem Patrocinados ligado.
//
// Diferente das outras abas do monitoramento, esta não lê tabela do Supabase
// nem depende do cron: é uma pergunta sobre o estado de AGORA ("quais dos
// meus anúncios estão fora de campanha"), não um alerta de mudança. Então
// consulta a API de publicidade na hora.
//
// Os status que interessam:
//   idle   — o anúncio pode ser patrocinado, mas não está em campanha nenhuma
//   paused — está numa campanha, porém pausado
// Ambos significam "não está rodando". O status hold fica de fora: ali o
// anúncio está sem estoque ou pausado no marketplace, não é uma decisão de
// publicidade.
const ADS_OFF_STATUSES = 'idle,paused';
const ADS_PAGE_SIZE = 50;
const ADS_MAX_PAGES = 10;

async function handleAdsOff(req, res, userId) {
    const advResp = await mlFetch(userId, '/advertising/advertisers?product_id=PADS', {
        headers: { 'Api-Version': '1' },
    });

    if (advResp.status === 404) {
        return res.json({
            enabled: false,
            reason: 'sem_publicidade',
            message: 'Esta conta não tem Publicidade habilitada no Mercado Livre. O ML exige reputação amarela ou melhor, 15 dias de cadastro e um mínimo de vendas.',
            items: [],
        });
    }
    if (!advResp.ok) {
        return res.status(advResp.status).json({ error: 'Não foi possível consultar a conta de publicidade.' });
    }

    const advData = await advResp.json();
    const advertiser = (advData.advertisers || []).find((a) => a.site_id === 'MLB') || (advData.advertisers || [])[0];
    if (!advertiser) {
        return res.json({ enabled: false, reason: 'sem_anunciante', message: 'Nenhuma conta de anunciante encontrada.', items: [] });
    }

    const items = [];
    let offset = 0;
    let total = 0;

    for (let page = 0; page < ADS_MAX_PAGES; page += 1) {
        const qs = new URLSearchParams({ limit: String(ADS_PAGE_SIZE), offset: String(offset) });
        qs.set('filters[statuses]', ADS_OFF_STATUSES);

        const resp = await mlFetch(
            userId,
            `/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/ads/search?${qs.toString()}`,
            { headers: { 'api-version': '2' } }
        );
        if (!resp.ok) break;

        const data = await resp.json();
        (data.results || []).forEach((ad) => {
            items.push({
                itemId: ad.item_id,
                title: ad.title || ad.item_id,
                thumbnail: ad.thumbnail || null,
                permalink: ad.permalink || null,
                price: ad.price != null ? ad.price : null,
                status: ad.status || null,
                // Anúncio de catálogo disputa a mesma página com outros
                // vendedores, então ligar Patrocinados ali tem peso diferente
                // — por isso a tela marca esses separadamente.
                catalogListing: !!ad.catalog_listing,
                buyBoxWinner: !!ad.buy_box_winner,
                // O próprio ML sinaliza quais anúncios responderiam bem ao
                // investimento, segundo o modelo deles.
                recommended: !!ad.recommended,
            });
        });

        total = (data.paging && data.paging.total) || items.length;
        offset += ADS_PAGE_SIZE;
        if (offset >= total) break;
    }

    // Recomendados pelo ML primeiro, depois catálogo — é a ordem em que
    // ligar o patrocinado tende a render mais.
    items.sort((a, b) => (b.recommended - a.recommended) || (b.catalogListing - a.catalogListing));

    return res.json({
        enabled: true,
        advertiserId: advertiser.advertiser_id,
        total,
        truncated: total > items.length,
        items,
    });
}

async function handleUserGet(req, res, userId) {
    if (req.query.resource === 'ads') {
        return await handleAdsOff(req, res, userId);
    }

    if (req.query.resource === 'status') {
        const { data, error } = await supabaseAdmin
            .from('ml_check_status')
            .select('last_checked_at, last_items_checked, total_active_items, last_error')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        return res.json(data || { last_checked_at: null, last_items_checked: null, total_active_items: null, last_error: null });
    }

    if (req.query.resource === 'catalog') {
        const { data: items, error } = await supabaseAdmin
            .from('ml_catalog_status')
            .select('id, ml_item_id, user_product_id, item_title, item_thumbnail, status, previous_status, current_price, price_to_win, winner_item_id, winner_price, reason, is_read, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(100);

        if (error) return res.status(500).json({ error: error.message });

        const { count, error: countError } = await supabaseAdmin
            .from('ml_catalog_status')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (countError) return res.status(500).json({ error: countError.message });

        return res.json({ items: items || [], unreadCount: count || 0 });
    }

    if (req.query.resource === 'promotions') {
        const [promotionsRes, candidatesRes, countRes] = await Promise.all([
            supabaseAdmin
                .from('ml_promotions')
                .select('id, ml_item_id, item_title, item_thumbnail, promotion_id, promotion_type, promotion_name, finish_date, status, is_read, updated_at')
                .eq('user_id', userId)
                .order('finish_date', { ascending: true })
                .limit(300),
            supabaseAdmin
                .from('ml_lightning_candidates')
                .select('id, ml_item_id, item_title, item_thumbnail, updated_at')
                .eq('user_id', userId)
                .limit(300),
            supabaseAdmin
                .from('ml_promotions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false),
        ]);

        if (promotionsRes.error) return res.status(500).json({ error: promotionsRes.error.message });
        if (candidatesRes.error) return res.status(500).json({ error: candidatesRes.error.message });
        if (countRes.error) return res.status(500).json({ error: countRes.error.message });

        const promotions = (promotionsRes.data || []).map(p => ({ ...p, kind: 'promotion' }));
        const candidates = (candidatesRes.data || []).map(c => ({ ...c, kind: 'lightning_candidate' }));

        return res.json({ items: [...promotions, ...candidates], unreadCount: countRes.count || 0 });
    }

    const [reviewsRes, countRes] = await Promise.all([
        supabaseAdmin
            .from('ml_reviews')
            .select('id, ml_item_id, ml_review_id, item_title, item_thumbnail, item_rating_average, item_rating_count, rating, comment, reviewed_at, is_read')
            .eq('user_id', userId)
            .order('reviewed_at', { ascending: false })
            .limit(60),
        supabaseAdmin
            .from('ml_reviews')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false),
    ]);

    if (reviewsRes.error) return res.status(500).json({ error: reviewsRes.error.message });
    if (countRes.error) return res.status(500).json({ error: countRes.error.message });

    // Painel mostra só o último produto avaliado, um card por produto (não por
    // review), pra não pesar com muita foto/lista — o unreadCount acima continua
    // contando TODAS as avaliações não lidas, não só as 10 mostradas.
    const latestPerItem = [];
    const seenItemIds = new Set();
    for (const r of reviewsRes.data || []) {
        if (seenItemIds.has(r.ml_item_id)) continue;
        seenItemIds.add(r.ml_item_id);
        latestPerItem.push(r);
        if (latestPerItem.length >= 10) break;
    }

    res.json({ reviews: latestPerItem, unreadCount: countRes.count || 0 });
}

async function handleUserMarkRead(req, res, userId) {
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    // ml_lightning_candidates não tem is_read (é só lista informativa, sem alerta)
    const tableByResource = { catalog: 'ml_catalog_status', promotions: 'ml_promotions' };
    const table = tableByResource[req.query.resource] || 'ml_reviews';
    let query = supabaseAdmin.from(table).update({ is_read: true }).eq('user_id', userId);
    if (!body.all) {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return res.status(400).json({ error: 'Informe "ids" ou "all: true".' });
        query = query.in('id', ids);
    }

    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
}

// Um único arquivo cobre dois usos (limite de 12 functions do plano Hobby da Vercel,
// mesmo motivo documentado em ml-status.js):
// - chamado pelo GitHub Actions (header x-cron-secret) para varrer todos os usuários
// - chamado pelo site/extensão (header user-token) para ler/marcar como lida
module.exports = async (req, res) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== undefined) {
        if (!process.env.CRON_SECRET || !safeEqual(cronSecret, process.env.CRON_SECRET)) {
            return res.status(403).json({ error: 'Invalid cron secret.' });
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
        try {
            return await runCheck(res);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    const userId = await getVerifiedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

    // Sem isso a Vercel gera ETag e responde 304 em GETs repetidos com os mesmos
    // headers, e como 304 não é "ok" pro fetch do navegador, o painel via o
    // request como falho e mostrava a lista sempre vazia.
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method === 'GET') return await handleUserGet(req, res, userId);
        if (req.method === 'PATCH') return await handleUserMarkRead(req, res, userId);
        return res.status(405).json({ error: 'Method not allowed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports.config = { maxDuration: 60 };
