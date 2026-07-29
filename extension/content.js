(function () {
    // O Mercado Livre usa vários formatos de URL pra página de produto (o
    // permalink clássico "MLB-123456789", páginas de catálogo "/p/MLB...",
    // e páginas "unificadas" mais novas "/up/MLBU..." — e isso muda com o
    // tempo). Em vez de tentar prever todo formato de URL, detectamos pelo
    // próprio conteúdo da página: se tem título e preço de produto visíveis,
    // é uma página de compra, não importa a URL.
    function looksLikeProductPage() {
        const hasTitle = !!(document.querySelector('h1.ui-pdp-title') || document.querySelector('h1'));
        const hasPrice = !!document.querySelector('.andes-money-amount__fraction');
        return hasTitle && hasPrice;
    }

    // A API do Mercado Livre não permite consultar anúncios de outros
    // vendedores (nem anônima, nem autenticada — só os próprios itens do
    // token OAuth usado). Por isso título e preço são lidos direto da
    // página já renderizada no navegador, do mesmo jeito que o usuário está
    // vendo na tela. Os seletores são os do design system atual do ML
    // (Andes) — se o layout deles mudar, isso pode parar de encontrar o
    // preço automaticamente (por isso o campo manual como respaldo abaixo).
    function extractPageData() {
        let title = null;
        const titleEl = document.querySelector('h1.ui-pdp-title') || document.querySelector('h1');
        if (titleEl) title = titleEl.textContent.trim();
        if (!title) title = document.title.replace(/\s*[-|]\s*(MercadoLivre|Mercado Livre).*$/i, '').trim();

        let price = null;
        const priceContainer =
            document.querySelector('.ui-pdp-price__second-line .andes-money-amount') ||
            document.querySelector('.ui-pdp-price .andes-money-amount') ||
            document.querySelector('.andes-money-amount');
        if (priceContainer) {
            const fraction = priceContainer.querySelector('.andes-money-amount__fraction');
            const cents = priceContainer.querySelector('.andes-money-amount__cents');
            if (fraction) {
                const intPart = fraction.textContent.replace(/\D/g, '');
                const centPart = cents ? cents.textContent.replace(/\D/g, '').padEnd(2, '0').slice(0, 2) : '00';
                if (intPart) price = parseFloat(`${intPart}.${centPart}`);
            }
        }
        if (!price) {
            const match = document.body.innerText.match(/R\$\s*([\d.]+),(\d{2})/);
            if (match) price = parseFloat(match[1].replace(/\./g, '') + '.' + match[2]);
        }

        return { title, price };
    }

    function sendMessage(message) {
        return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
    }

    function formatBRL(v) {
        return `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'impoclick-panel';
        panel.innerHTML = `
            <div id="impoclick-panel-header">
                <span id="impoclick-panel-title">Viabilidade Impoclick</span>
                <button id="impoclick-panel-toggle" aria-label="Minimizar">–</button>
            </div>
            <div id="impoclick-panel-body">
                <div id="impoclick-panel-content">Carregando anúncio...</div>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('impoclick-panel-toggle').addEventListener('click', () => {
            const body = document.getElementById('impoclick-panel-body');
            const collapsed = body.classList.toggle('impoclick-hidden');
            document.getElementById('impoclick-panel-toggle').textContent = collapsed ? '+' : '–';
        });

        return document.getElementById('impoclick-panel-content');
    }

    function renderNotLoggedIn(container) {
        container.innerHTML = `
            <p class="impoclick-text">Clique no ícone da extensão <strong>Impoclick</strong> na barra do navegador para fazer login com sua conta.</p>
        `;
    }

    function computeAndRenderVerdict(resultEl, price, feePct, cost) {
        const effectiveFeePct = feePct !== null ? feePct : 13; // fallback: taxa clássica média
        const feeAmount = price * (effectiveFeePct / 100);
        const netRevenue = price - feeAmount;
        const diff = netRevenue - cost;
        const marginPct = price > 0 ? (diff / price) * 100 : 0;

        let verdict, verdictClass, detail;
        if (diff <= 0) {
            verdict = 'NÃO COMPENSA';
            verdictClass = 'impoclick-bad';
            detail = `Faltariam ${formatBRL(Math.abs(diff))} para cobrir seu custo, considerando só a taxa de venda (frete da plataforma não incluído aqui).`;
        } else if (marginPct < 15) {
            verdict = 'MARGEM APERTADA';
            verdictClass = 'impoclick-warn';
            detail = `Sobraria ${formatBRL(diff)} líquidos por unidade (${marginPct.toFixed(1)}%), sem contar o frete da plataforma.`;
        } else {
            verdict = 'COMPENSA';
            verdictClass = 'impoclick-good';
            detail = `Sobraria ${formatBRL(diff)} líquidos por unidade (${marginPct.toFixed(1)}%), sem contar o frete da plataforma.`;
        }

        resultEl.innerHTML = `
            <div class="impoclick-verdict ${verdictClass}">${verdict}</div>
            <p class="impoclick-text">${detail}</p>
            <p class="impoclick-note">Estimativa rápida (sem frete/peso). Para o cálculo completo, abra o Impoclick.</p>
        `;
    }

    async function renderCalculator(container, pageData) {
        const needsManualPrice = !pageData.price;
        const needsManualTitle = !pageData.title;

        container.innerHTML = `
            ${pageData.title ? `<p class="impoclick-item-title">${pageData.title}</p>` : ''}
            ${needsManualTitle ? `
                <label class="impoclick-label" for="impoclick-title-input">Não consegui ler o nome do produto — digite (usado só pra achar a categoria)</label>
                <input type="text" id="impoclick-title-input" class="impoclick-input" placeholder="ex: fone de ouvido bluetooth">
            ` : ''}
            ${pageData.price ? `
                <div class="impoclick-row"><span>Preço do anúncio</span><strong>${formatBRL(pageData.price)}</strong></div>
            ` : `
                <label class="impoclick-label" for="impoclick-price-input">Não consegui ler o preço — digite o preço do anúncio (R$)</label>
                <input type="number" id="impoclick-price-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 149.90">
            `}
            <div class="impoclick-row" id="impoclick-fee-row"><span>Taxa de venda (sua conta)</span><strong id="impoclick-fee-value">calculando...</strong></div>
            <label class="impoclick-label" for="impoclick-cost-input">Seu custo final de importação (R$/un.)</label>
            <input type="number" id="impoclick-cost-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 45.00">
            <button id="impoclick-calc-btn" class="impoclick-btn">Calcular viabilidade</button>
            <div id="impoclick-result"></div>
        `;

        let feePct = null;
        const feeValueEl = document.getElementById('impoclick-fee-value');
        const feeRow = document.getElementById('impoclick-fee-row');

        if (pageData.title) {
            const catResp = await sendMessage({ type: 'RESOLVE_CATEGORY', query: pageData.title });
            if (catResp.category) {
                const feeResp = await sendMessage({
                    type: 'GET_FEE',
                    price: pageData.price || 100,
                    categoryId: catResp.category.categoryId,
                });
                if (feeResp.fee) {
                    feePct = feeResp.fee.percentageFee;
                    feeValueEl.textContent = `${feePct}%`;
                } else {
                    feeValueEl.textContent = '—';
                    const isNotConnected = feeResp.error && /não conectada/i.test(feeResp.error);
                    const note = document.createElement('div');
                    note.className = 'impoclick-note';
                    note.textContent = isNotConnected
                        ? 'Conecte sua conta do Mercado Livre em Configurações no site Impoclick para ver a taxa real.'
                        : (feeResp.error || 'Não foi possível calcular a taxa real — usando estimativa de 13%.');
                    feeRow.after(note);
                }
            } else {
                feeValueEl.textContent = '—';
                const note = document.createElement('div');
                note.className = 'impoclick-note';
                note.textContent = 'Não foi possível identificar a categoria — usando estimativa de 13% na taxa.';
                feeRow.after(note);
            }
        } else {
            feeValueEl.textContent = '—';
        }

        document.getElementById('impoclick-calc-btn').addEventListener('click', () => {
            const resultEl = document.getElementById('impoclick-result');
            const priceInput = document.getElementById('impoclick-price-input');
            const price = pageData.price || parseFloat(priceInput ? priceInput.value : NaN);
            const cost = parseFloat(document.getElementById('impoclick-cost-input').value);

            if (!price || price <= 0) {
                resultEl.innerHTML = '<p class="impoclick-text impoclick-error">Informe o preço do anúncio.</p>';
                return;
            }
            if (!cost || cost <= 0) {
                resultEl.innerHTML = '<p class="impoclick-text impoclick-error">Informe seu custo final de importação.</p>';
                return;
            }
            computeAndRenderVerdict(resultEl, price, feePct, cost);
        });
    }

    async function init() {
        if (!looksLikeProductPage()) return;

        const container = buildPanel();

        const session = await sendMessage({ type: 'GET_SESSION' });
        if (!session.session) {
            renderNotLoggedIn(container);
            return;
        }

        const pageData = extractPageData();
        await renderCalculator(container, pageData);
    }

    function removePanel() {
        const existing = document.getElementById('impoclick-panel');
        if (existing) existing.remove();
    }

    function start() {
        removePanel();
        init();
    }

    start();

    // Login feito no popup atualiza o painel sem precisar recarregar a página.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.session) start();
    });

    // Mercado Livre é uma SPA — troca de anúncio nem sempre recarrega a
    // página, então observamos a URL e reconstruímos o painel quando muda.
    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            start();
        }
    }, 1000);
})();
