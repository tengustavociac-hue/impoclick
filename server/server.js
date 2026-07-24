require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const ML_BASE = 'https://api.mercadolibre.com';
const ENV_PATH = path.join(__dirname, '.env');
const SITE_ID = 'MLB';

let accessToken = process.env.ML_ACCESS_TOKEN;
let refreshToken = process.env.ML_REFRESH_TOKEN;
const clientId = process.env.ML_CLIENT_ID;
const clientSecret = process.env.ML_CLIENT_SECRET;
const userId = process.env.ML_USER_ID;

if (!clientId || !clientSecret || !refreshToken || !userId) {
    console.error('Faltam variáveis ML_CLIENT_ID / ML_CLIENT_SECRET / ML_REFRESH_TOKEN / ML_USER_ID no server/.env');
    process.exit(1);
}

function persistTokens(tokens) {
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token || refreshToken;

    let content = fs.readFileSync(ENV_PATH, 'utf8');
    content = content.replace(/^ML_ACCESS_TOKEN=.*$/m, `ML_ACCESS_TOKEN=${accessToken}`);
    content = content.replace(/^ML_REFRESH_TOKEN=.*$/m, `ML_REFRESH_TOKEN=${refreshToken}`);
    fs.writeFileSync(ENV_PATH, content, 'utf8');
}

async function refreshAccessToken() {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    const resp = await fetch(`${ML_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
    });

    if (!resp.ok) {
        throw new Error(`Falha ao renovar token do Mercado Livre (${resp.status}): ${await resp.text()}`);
    }

    const data = await resp.json();
    persistTokens(data);
    console.log('Access token do Mercado Livre renovado com sucesso.');
    return data.access_token;
}

// Chama a API do ML com o access_token atual; se expirou (401), renova uma vez e tenta de novo.
async function mlFetch(pathAndQuery, opts = {}) {
    const attempt = (token) => fetch(`${ML_BASE}${pathAndQuery}`, {
        ...opts,
        headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
    });

    let resp = await attempt(accessToken);
    if (resp.status === 401) {
        await refreshAccessToken();
        resp = await attempt(accessToken);
    }
    return resp;
}

const app = express();
app.use(cors());

// --- Status: confirma que o backend está conectado à conta do Mercado Livre ---
app.get('/api/ml/status', async (req, res) => {
    try {
        const resp = await mlFetch('/users/me');
        if (!resp.ok) return res.status(resp.status).json({ connected: false });
        const data = await resp.json();
        res.json({
            connected: true,
            nickname: data.nickname,
            sellerLevel: data.seller_reputation ? data.seller_reputation.level_id : null,
            powerSellerStatus: data.seller_reputation ? data.seller_reputation.power_seller_status : null,
        });
    } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
    }
});

// --- Previsão de categoria a partir do nome/tipo do produto ---
app.get('/api/ml/category', async (req, res) => {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Parâmetro q (nome do produto) é obrigatório.' });

    try {
        const resp = await mlFetch(`/sites/${SITE_ID}/domain_discovery/search?limit=1&q=${encodeURIComponent(q)}`);
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Produto mais vendido de uma categoria (ranking real via /highlights) ---
app.get('/api/ml/best-seller', async (req, res) => {
    const category = req.query.category;
    if (!category) return res.status(400).json({ error: 'Parâmetro category é obrigatório.' });

    try {
        const resp = await mlFetch(`/highlights/${SITE_ID}/category/${encodeURIComponent(category)}`);
        if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
        const data = await resp.json();
        const top = data.content && data.content[0];
        if (!top) return res.status(404).json({ error: 'Nenhum produto em destaque para esta categoria.' });

        let name = null;
        if (top.type === 'PRODUCT' || top.type === 'USER_PRODUCT') {
            const prodResp = await mlFetch(`/products/${top.id}`);
            if (prodResp.ok) {
                const prod = await prodResp.json();
                name = prod.name || null;
            }
        } else if (top.type === 'ITEM') {
            const itemResp = await mlFetch(`/items/${top.id}`);
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
            // Página pública do produto no Mercado Livre — a API não libera o preço de
            // concorrentes para este app (buy_box_winner vem vazio), então o preço
            // precisa ser conferido manualmente nesse link.
            permalink: `https://www.mercadolivre.com.br/p/${top.id}`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Taxa de venda real por categoria/preço (calculadora oficial /listing_prices) ---
app.get('/api/ml/fee', async (req, res) => {
    const { price, category, listingType } = req.query;
    if (!price || !category) {
        return res.status(400).json({ error: 'Parâmetros price e category são obrigatórios.' });
    }

    try {
        const resp = await mlFetch(`/sites/${SITE_ID}/listing_prices?price=${encodeURIComponent(price)}&category_id=${encodeURIComponent(category)}`);
        if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(404).json({ error: 'Nenhuma tarifa retornada para essa categoria/preço.' });
        }

        const wantedType = listingType || 'gold_special'; // "Clássico" — o tipo mais usado por vendedores
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Frete real por peso/dimensões (calculadora oficial /shipping_options/free) ---
app.get('/api/ml/freight', async (req, res) => {
    const { weight, length, width, height, price, listingType } = req.query;
    if (!weight || !length || !width || !height || !price) {
        return res.status(400).json({ error: 'Parâmetros weight, length, width, height e price são obrigatórios.' });
    }

    try {
        // Formato exigido pela API: altura x largura x comprimento, peso(g)
        const dimensions = `${height}x${width}x${length},${Math.round(Number(weight))}`;
        const qs = new URLSearchParams({
            dimensions,
            item_price: price,
            listing_type_id: listingType || 'gold_special',
            mode: 'me2',
            condition: 'new',
            logistic_type: 'drop_off',
            free_shipping: 'true',
            verbose: 'true',
        });

        const resp = await mlFetch(`/users/${userId}/shipping_options/free?${qs.toString()}`);
        if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
        const data = await resp.json();
        const coverage = data.coverage && data.coverage.all_country;
        if (!coverage) return res.status(404).json({ error: 'A API não retornou cobertura de frete para esses dados.' });

        res.json({
            cost: coverage.list_cost,
            billableWeightG: coverage.billable_weight,
            currency: coverage.currency_id,
            discount: data.coverage.discount || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Servidor ML do IMPOCLICK rodando em http://localhost:${PORT}`);
});
