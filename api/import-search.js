const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Estimativa aproximada CNY->BRL para o protótipo (não usa cotação em tempo real).
const CNY_BRL_RATE = 0.79;

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'Faça login para usar a busca por imagem.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'Envie uma imagem em base64 no campo imageBase64.' });

    const base64Data = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'Imagem inválida.' });
    if (buffer.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Imagem muito grande (máx. 4MB).' });

    const tmpPath = path.join(os.tmpdir(), `import-search-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`);
    fs.writeFileSync(tmpPath, buffer);

    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 900 });

        const rawResults = [];
        page.on('response', async (response) => {
            const url = response.url();
            if (!url.includes('str=searchGoods')) return;
            try {
                const json = await response.json();
                const content = json && json.data && json.data.content;
                if (Array.isArray(content)) rawResults.push(...content);
            } catch (e) {
                // resposta não-JSON ou já consumida — ignora
            }
        });

        await page.goto('https://www.rakumart.com.br', { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const fileInput = await page.$('input[type=file]');
        if (!fileInput) {
            throw new Error('Campo de busca por imagem não encontrado no site do Rakumart (o layout pode ter mudado).');
        }

        await fileInput.uploadFile(tmpPath);
        await new Promise((resolve) => setTimeout(resolve, 8000));

        if (rawResults.length === 0) {
            return res.json({ results: [], disclaimer: 'Protótipo experimental — nenhum resultado retornado para essa imagem.' });
        }

        const seen = new Set();
        const results = rawResults
            .filter((r) => r && r.iid && !seen.has(r.iid) && seen.add(r.iid))
            .map((r) => {
                const priceCNY = parseFloat(r.price) || 0;
                return {
                    title: r.title || null,
                    priceCNY,
                    priceBRLEstimate: Math.round(priceCNY * CNY_BRL_RATE * 100) / 100,
                    monthSold: r.monthSold || 0,
                    imageUrl: r.picurl || null,
                    productUrl: `https://detail.1688.com/offer/${r.iid}.html`,
                };
            })
            .sort((a, b) => a.priceCNY - b.priceCNY)
            .slice(0, 12);

        res.json({
            results,
            disclaimer: 'Protótipo experimental via busca de imagem de terceiros (Rakumart/1688). Câmbio aproximado, sujeito a variação e a mínimos de pedido (MOQ) por fornecedor.',
        });
    } catch (err) {
        console.error('import-search error:', err);
        res.status(500).json({ error: 'Busca por imagem indisponível no momento. Tente novamente em instantes.' });
    } finally {
        if (browser) await browser.close().catch(() => {});
        fs.unlink(tmpPath, () => {});
    }
};

module.exports.config = { maxDuration: 60 };
