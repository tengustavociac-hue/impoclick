const crypto = require('crypto');
const { mlFetch, supabaseAdmin } = require('./_ml-helper');

const ITEMS_PER_USER_CAP = 100; // 1 página de /items/search (máx permitido pela API); evita estourar o tempo de execução da function

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// Também traz catalog_product_id: em anúncios de catálogo, as opiniões ficam
// atreladas ao produto do catálogo, não à publicação — sem esse id na chamada
// de /reviews/item, a API devolve a lista vazia mesmo quando o produto tem avaliações.
async function fetchItemMeta(userId, itemIds) {
    const meta = {};
    for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const resp = await mlFetch(userId, `/items?ids=${batch.join(',')}&attributes=id,title,catalog_product_id`);
        if (!resp.ok) continue;
        const data = await resp.json();
        for (const entry of data) {
            if (entry.code === 200 && entry.body) {
                meta[entry.body.id] = { title: entry.body.title, catalogProductId: entry.body.catalog_product_id || null };
            }
        }
    }
    return meta;
}

// Verifica as avaliações de um usuário conectado e grava as novas no Supabase.
// A dedupe acontece via upsert com a constraint unique(ml_item_id, ml_review_id) —
// não precisamos guardar "última avaliação vista" separadamente.
async function checkUser(userId) {
    const searchResp = await mlFetch(userId, mlUserId => `/users/${mlUserId}/items/search?status=active&limit=${ITEMS_PER_USER_CAP}`);
    if (!searchResp.ok) throw new Error(`items/search falhou (${searchResp.status})`);

    const searchData = await searchResp.json();
    const itemIds = searchData.results || [];
    if (itemIds.length === 0) return { itemsChecked: 0, newReviews: 0 };

    const meta = await fetchItemMeta(userId, itemIds);

    const rows = [];
    for (const itemId of itemIds) {
        const catalogProductId = meta[itemId] && meta[itemId].catalogProductId;
        const reviewsPath = catalogProductId
            ? `/reviews/item/${itemId}?catalog_product_id=${encodeURIComponent(catalogProductId)}`
            : `/reviews/item/${itemId}`;

        const resp = await mlFetch(userId, reviewsPath);
        if (!resp.ok) continue; // item sem reviews habilitadas ou erro pontual — segue para o próximo

        const data = await resp.json();
        for (const r of data.reviews || []) {
            rows.push({
                user_id: userId,
                ml_item_id: itemId,
                ml_review_id: String(r.id),
                item_title: (meta[itemId] && meta[itemId].title) || null,
                rating: r.rate,
                comment: r.content || null,
                reviewed_at: r.date_created || null,
            });
        }
    }

    let newReviews = 0;
    if (rows.length > 0) {
        const { data: inserted, error } = await supabaseAdmin
            .from('ml_reviews')
            .upsert(rows, { onConflict: 'ml_item_id,ml_review_id', ignoreDuplicates: true })
            .select('id');
        if (error) throw new Error(error.message);
        newReviews = inserted ? inserted.length : 0;
    }

    return { itemsChecked: itemIds.length, newReviews };
}

async function runCheck(res) {
    const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('ml_access_token', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    let itemsChecked = 0;
    let newReviews = 0;
    const errors = [];
    const perUser = [];

    for (const profile of profiles || []) {
        try {
            const result = await checkUser(profile.id);
            itemsChecked += result.itemsChecked;
            newReviews += result.newReviews;
            perUser.push({ userId: profile.id, ...result });
        } catch (err) {
            errors.push({ userId: profile.id, error: err.message });
        }
    }

    return res.json({ usersChecked: (profiles || []).length, itemsChecked, newReviews, errors, perUser });
}

async function handleUserGet(req, res, userId) {
    const { data: reviews, error } = await supabaseAdmin
        .from('ml_reviews')
        .select('id, ml_item_id, item_title, rating, comment, reviewed_at, is_read')
        .eq('user_id', userId)
        .order('reviewed_at', { ascending: false })
        .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    const { count, error: countError } = await supabaseAdmin
        .from('ml_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

    if (countError) return res.status(500).json({ error: countError.message });

    res.json({ reviews: reviews || [], unreadCount: count || 0 });
}

async function handleUserMarkRead(req, res, userId) {
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    let query = supabaseAdmin.from('ml_reviews').update({ is_read: true }).eq('user_id', userId);
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

    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required in headers.' });

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
