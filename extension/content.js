(function () {
    // Páginas de catálogo (/p/MLB...) juntam ofertas de vários vendedores
    // numa página só — não têm um preço/anúncio único, então não dá pra
    // calcular viabilidade direto nelas (por enquanto). Só ativamos o painel
    // em páginas de anúncio individual (MLB-123456789, com hífen).
    function getPageType() {
        const href = window.location.href;
        if (/\/p\/MLB\d+/i.test(href)) return { type: 'catalog' };
        const match = href.match(/MLB-(\d{6,})/i);
        if (match) return { type: 'item', itemId: `MLB${match[1]}` };
        return { type: 'none' };
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

    function renderError(container, msg) {
        container.innerHTML = `<p class="impoclick-text impoclick-error">${msg}</p>`;
    }

    async function renderCalculator(container, item) {
        container.innerHTML = `
            <p class="impoclick-item-title">${item.title}</p>
            <div class="impoclick-row"><span>Preço do anúncio</span><strong>${formatBRL(item.price)}</strong></div>
            <div class="impoclick-row" id="impoclick-fee-row"><span>Taxa de venda (sua conta)</span><strong id="impoclick-fee-value">calculando...</strong></div>
            <label class="impoclick-label" for="impoclick-cost-input">Seu custo final de importação (R$/un.)</label>
            <input type="number" id="impoclick-cost-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 45.00">
            <button id="impoclick-calc-btn" class="impoclick-btn">Calcular viabilidade</button>
            <div id="impoclick-result"></div>
        `;

        const feeResp = await sendMessage({ type: 'GET_FEE', price: item.price, categoryId: item.categoryId });
        const feeValueEl = document.getElementById('impoclick-fee-value');
        let feePct = null;

        if (feeResp.error === 'not_logged_in') {
            feeValueEl.textContent = '—';
        } else if (feeResp.error) {
            const isNotConnected = /não conectada/i.test(feeResp.error);
            feeValueEl.textContent = '—';
            const feeRow = document.getElementById('impoclick-fee-row');
            const note = document.createElement('div');
            note.className = 'impoclick-note';
            note.textContent = isNotConnected
                ? 'Conecte sua conta do Mercado Livre em Configurações no site Impoclick para ver a taxa real.'
                : feeResp.error;
            feeRow.after(note);
        } else {
            feePct = feeResp.fee.percentageFee;
            feeValueEl.textContent = `${feePct}%`;
        }

        document.getElementById('impoclick-calc-btn').addEventListener('click', () => {
            const cost = parseFloat(document.getElementById('impoclick-cost-input').value);
            const resultEl = document.getElementById('impoclick-result');
            if (!cost || cost <= 0) {
                resultEl.innerHTML = '<p class="impoclick-text impoclick-error">Informe seu custo final de importação.</p>';
                return;
            }
            const effectiveFeePct = feePct !== null ? feePct : 13; // fallback: taxa clássica média
            const feeAmount = item.price * (effectiveFeePct / 100);
            const netRevenue = item.price - feeAmount;
            const diff = netRevenue - cost;
            const marginPct = item.price > 0 ? (diff / item.price) * 100 : 0;

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
        });
    }

    async function init() {
        const page = getPageType();
        if (page.type === 'none') return;

        const container = buildPanel();

        if (page.type === 'catalog') {
            container.innerHTML = `
                <p class="impoclick-text">Esta é uma página de catálogo (vários vendedores juntos). Abra a oferta específica de um vendedor (clique em "Ver outras opções de compra" ou no vendedor desejado) para calcular a viabilidade.</p>
            `;
            return;
        }

        const session = await sendMessage({ type: 'GET_SESSION' });
        if (!session.session) {
            renderNotLoggedIn(container);
            return;
        }

        const itemResp = await sendMessage({ type: 'LOOKUP_ITEM', itemId: page.itemId });
        if (itemResp.error) {
            const isNotConnected = /não conectada/i.test(itemResp.error);
            renderError(
                container,
                isNotConnected
                    ? 'Conecte sua conta do Mercado Livre em Configurações no site Impoclick para usar o painel de viabilidade.'
                    : itemResp.error
            );
            return;
        }

        await renderCalculator(container, itemResp.item);
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
