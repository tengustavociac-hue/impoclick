(function () {
    // O Mercado Livre usa vários formatos de URL pra página de produto (o
    // permalink clássico "MLB-123456789", páginas de catálogo "/p/MLB...",
    // e páginas "unificadas" mais novas "/up/MLBU..." — e isso muda com o
    // tempo). Em vez de tentar prever todo formato de URL, detectamos pelo
    // próprio conteúdo da página: se tem título e preço de produto visíveis,
    // é uma página de compra, não importa a URL.
    function looksLikeProductPage() {
        // Páginas de RESULTADOS (busca, lista) também têm um <h1> genérico
        // (breadcrumb, ex: "Mop x10") e várias ".andes-money-amount__fraction"
        // (uma por card), então esses dois sozinhos davam falso positivo e
        // confundiam página de busca com página de produto. O contêiner da
        // grade de resultados só existe em página de busca — se ele existir,
        // definitivamente NÃO é uma página de produto único, não importa
        // o que mais tenha na página.
        if (document.querySelector('.ui-search-results, ol.ui-search-layout, [class*="ui-search-layout"]')) {
            return false;
        }
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

        return { title, price, shipping: extractShippingInfo(), dims: extractSpecDimensions() };
    }

    function parseWeightToGrams(text) {
        const m = text.match(/([\d.,]+)\s*(kg|g|gramas?|quilos?)/i);
        if (!m) return null;
        let value = parseFloat(m[1].replace(',', '.'));
        if (isNaN(value)) return null;
        if (/kg|quilo/i.test(m[2])) value *= 1000;
        return value;
    }

    function parseLengthToCm(text) {
        const m = text.match(/([\d.,]+)\s*(cm|mm|metros?|m)\b/i);
        if (!m) return null;
        let value = parseFloat(m[1].replace(',', '.'));
        if (isNaN(value)) return null;
        if (/mm/i.test(m[2])) value /= 10;
        else if (/^(m|metros?)$/i.test(m[2])) value *= 100;
        return value;
    }

    // Não dá pra saber quanto o VENDEDOR daquele anúncio paga de frete (é
    // dado privado da conta dele, e nem seria o número certo — depende da
    // reputação/nível de cada vendedor). O que dá pra fazer é ler o peso e
    // as dimensões que o próprio anúncio declara na ficha técnica, e usar
    // isso com a taxa de frete da SUA conta — que é o número que importa
    // pra sua decisão.
    function extractSpecDimensions() {
        const specs = {};
        document.querySelectorAll('table tr, .andes-table__row').forEach((row) => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length >= 2) {
                const key = cells[0].textContent.trim().toLowerCase();
                const value = cells[1].textContent.trim();
                if (key && value) specs[key] = value;
            }
        });

        const findValue = (patterns) => {
            for (const [key, value] of Object.entries(specs)) {
                if (patterns.some((p) => key.includes(p))) return value;
            }
            return null;
        };

        let weightText = findValue(['peso']);
        let lengthText = findValue(['comprimento']);
        let widthText = findValue(['largura']);
        let heightText = findValue(['altura']);

        const bodyText = document.body.innerText;
        if (!weightText) {
            const m = bodyText.match(/peso[^\d\n]{0,15}([\d.,]+\s*(?:kg|g|gramas?))/i);
            if (m) weightText = m[1];
        }
        if (!lengthText) {
            const m = bodyText.match(/comprimento[^\d\n]{0,15}([\d.,]+\s*(?:cm|mm|metros?|m)\b)/i);
            if (m) lengthText = m[1];
        }
        if (!widthText) {
            const m = bodyText.match(/largura[^\d\n]{0,15}([\d.,]+\s*(?:cm|mm|metros?|m)\b)/i);
            if (m) widthText = m[1];
        }
        if (!heightText) {
            const m = bodyText.match(/altura[^\d\n]{0,15}([\d.,]+\s*(?:cm|mm|metros?|m)\b)/i);
            if (m) heightText = m[1];
        }

        const weight = weightText ? parseWeightToGrams(weightText) : null;
        const length = lengthText ? parseLengthToCm(lengthText) : null;
        const width = widthText ? parseLengthToCm(widthText) : null;
        const height = heightText ? parseLengthToCm(heightText) : null;

        if (weight && length && width && height) {
            return { weight, length, width, height };
        }
        return null;
    }

    // Lê o frete mostrado no próprio anúncio (o que o COMPRADOR vê), como
    // atalho pra não precisar digitar peso/dimensões. Isso não é
    // necessariamente igual ao custo real de frete pra você como vendedor —
    // "frete grátis" no anúncio normalmente significa que o vendedor está
    // banca a Mercado Envios, não que ela custe zero. Por isso mostramos
    // isso separado do cálculo com peso/dimensões reais.
    function extractShippingInfo() {
        const bodyText = document.body.innerText;
        if (/frete\s*gr[aá]tis|chegar[aá]\s*gr[aá]tis|envio\s*gr[aá]tis/i.test(bodyText)) {
            return { cost: 0, isFree: true };
        }
        const match = bodyText.match(/(?:frete|envio|chegar[aá][^.\n]{0,25}?)\D{0,10}R\$\s*([\d.]+),(\d{2})/i);
        if (match) {
            return { cost: parseFloat(match[1].replace(/\./g, '') + '.' + match[2]), isFree: false };
        }
        return null;
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

    function computeAndRenderVerdict(resultEl, price, feePct, cost, freightCost, freightNote) {
        const effectiveFeePct = feePct !== null ? feePct : 13; // fallback: taxa clássica média
        const feeAmount = price * (effectiveFeePct / 100);
        const freight = freightCost || 0;
        const netRevenue = price - feeAmount - freight;
        const diff = netRevenue - cost;
        const marginPct = price > 0 ? (diff / price) * 100 : 0;
        const freightSuffix = freightCost ? ` (já com ${formatBRL(freight)} de frete)` : ', sem contar o frete da plataforma';

        let verdict, verdictClass, detail;
        if (diff <= 0) {
            verdict = 'NÃO COMPENSA';
            verdictClass = 'impoclick-bad';
            detail = `Faltariam ${formatBRL(Math.abs(diff))} para cobrir seu custo, considerando taxa de venda${freightSuffix}.`;
        } else if (marginPct < 15) {
            verdict = 'MARGEM APERTADA';
            verdictClass = 'impoclick-warn';
            detail = `Sobraria ${formatBRL(diff)} líquidos por unidade (${marginPct.toFixed(1)}%)${freightSuffix}.`;
        } else {
            verdict = 'COMPENSA';
            verdictClass = 'impoclick-good';
            detail = `Sobraria ${formatBRL(diff)} líquidos por unidade (${marginPct.toFixed(1)}%)${freightSuffix}.`;
        }

        resultEl.innerHTML = `
            <div class="impoclick-verdict ${verdictClass}">${verdict}</div>
            <p class="impoclick-text">${detail}</p>
            <p class="impoclick-note">${freightNote || 'Estimativa rápida. Para o cálculo completo, abra o Impoclick.'}</p>
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
            <div class="impoclick-row" id="impoclick-shipping-row"><span>Frete mostrado no anúncio</span><strong id="impoclick-shipping-value">${
                pageData.shipping
                    ? (pageData.shipping.isFree ? 'Grátis' : formatBRL(pageData.shipping.cost))
                    : 'não identificado'
            }</strong></div>
            ${pageData.shipping && pageData.shipping.isFree ? `<p class="impoclick-note">"Grátis" é o que aparece pro comprador — normalmente o vendedor ainda paga o frete real pra Mercado Envios. Preencha peso/dimensões abaixo pra ver esse custo real.</p>` : ''}
            <label class="impoclick-label" for="impoclick-cost-input">Seu custo final de importação (R$/un.)</label>
            <input type="number" id="impoclick-cost-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 45.00">

            <label class="impoclick-label">Peso e dimensões do produto (pra calcular o frete real da sua conta)</label>
            ${pageData.dims ? '<p class="impoclick-note">Lido automaticamente da ficha técnica do anúncio — confira antes de calcular.</p>' : ''}
            <div class="impoclick-dim-grid">
                <input type="number" id="impoclick-weight-input" class="impoclick-input impoclick-input-sm" step="1" min="0" placeholder="Peso (g)" value="${pageData.dims ? Math.round(pageData.dims.weight) : ''}">
                <input type="number" id="impoclick-length-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Compr. (cm)" value="${pageData.dims ? pageData.dims.length : ''}">
                <input type="number" id="impoclick-width-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Larg. (cm)" value="${pageData.dims ? pageData.dims.width : ''}">
                <input type="number" id="impoclick-height-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Alt. (cm)" value="${pageData.dims ? pageData.dims.height : ''}">
            </div>
            <div class="impoclick-toggle-group" id="impoclick-freeshipping-toggle">
                <span class="impoclick-toggle-label">Você oferece frete grátis?</span>
                <label><input type="radio" name="impoclick-free-shipping" value="false" checked> Não</label>
                <label><input type="radio" name="impoclick-free-shipping" value="true"> Sim</label>
            </div>

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

        document.getElementById('impoclick-calc-btn').addEventListener('click', async () => {
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

            const weight = parseFloat(document.getElementById('impoclick-weight-input').value);
            const length = parseFloat(document.getElementById('impoclick-length-input').value);
            const width = parseFloat(document.getElementById('impoclick-width-input').value);
            const height = parseFloat(document.getElementById('impoclick-height-input').value);
            const hasAllDims = weight > 0 && length > 0 && width > 0 && height > 0;
            const freeShippingChecked = document.querySelector('input[name="impoclick-free-shipping"]:checked');
            const freeShipping = freeShippingChecked ? freeShippingChecked.value === 'true' : false;

            let freightCost = 0;
            let freightNote = null;

            if (hasAllDims) {
                // Peso/dimensões preenchidos: usa o cálculo real da sua conta
                // (mais preciso, respeita a modalidade escolhida acima).
                resultEl.innerHTML = '<p class="impoclick-text">Calculando frete real...</p>';
                const freightResp = await sendMessage({ type: 'GET_FREIGHT', price, weight, length, width, height, freeShipping });
                if (freightResp.freight && typeof freightResp.freight.cost === 'number') {
                    freightCost = freightResp.freight.cost;
                } else {
                    freightNote = 'Não foi possível calcular o frete real agora — resultado abaixo sem frete.';
                }
            } else if (pageData.shipping && !pageData.shipping.isFree) {
                // Sem peso/dimensões, mas o anúncio mostra um frete com valor
                // — usa esse valor lido da página como aproximação.
                freightCost = pageData.shipping.cost;
                freightNote = 'Usando o frete mostrado no anúncio como aproximação. Preencha peso/dimensões acima pra um valor mais preciso.';
            } else if (pageData.shipping && pageData.shipping.isFree) {
                freightNote = 'O anúncio mostra "frete grátis" pro comprador, mas isso não é o custo real pro vendedor — preencha peso/dimensões acima pra ver o valor real.';
            } else {
                freightNote = 'Preencha peso e dimensões acima pra incluir o frete no cálculo.';
            }

            computeAndRenderVerdict(resultEl, price, feePct, cost, freightCost, freightNote);
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

    // Marca visualmente os produtos de CATÁLOGO (/p/MLB...) direto nos
    // resultados de busca, listas, carrosséis etc — pra identificar sem
    // precisar clicar em cada um. Catálogo = produto com vários vendedores
    // concorrendo na mesma página (geralmente os mais procurados).
    //
    // O crachá é posicionado com coordenadas absolutas da PÁGINA (não do
    // link) e anexado direto no <body> — colocar como filho do link corria
    // o risco de "grudar" num elemento interno do card do ML que também
    // tem position relative/absolute (ex: o container da imagem), fazendo
    // o crachá aparecer no meio do card em vez do canto.
    const catalogBadges = new Map(); // link -> elemento do crachá

    // Canto superior DIREITO do link (não esquerdo) — usa a borda direita
    // como referência e desloca o próprio crachá pra trás com transform,
    // assim não precisa saber a largura do crachá de antemão.
    function positionBadge(link, badge) {
        const rect = link.getBoundingClientRect();
        badge.style.top = `${rect.top + window.scrollY + 6}px`;
        badge.style.left = `${rect.right + window.scrollX - 6}px`;
        badge.style.transform = 'translateX(-100%)';
    }

    // Cards do ML costumam ter mais de um link pro mesmo produto (imagem,
    // título, carrossel de miniaturas...) — sem agrupar por produto, isso
    // cria um crachá por link. Agrupamos por ID do produto e ficamos com o
    // link de MAIOR ÁREA visível — na prática, é sempre o que envolve a
    // foto principal do card, não importa a estrutura exata do HTML.
    function markCatalogLinks() {
        const links = Array.from(document.querySelectorAll('a[href*="/p/MLB"]:not([data-impoclick-marked])'));
        const byProductId = new Map();
        links.forEach((link) => {
            const idMatch = link.href.match(/\/p\/(MLB\d+)/i);
            const productId = idMatch ? idMatch[1] : link.href;
            const rect = link.getBoundingClientRect();
            const area = rect.width * rect.height;
            const existing = byProductId.get(productId);
            if (!existing || area > existing.area) {
                byProductId.set(productId, { link, area });
            }
        });

        links.forEach((link) => { link.dataset.impoclickMarked = '1'; });

        byProductId.forEach(({ link }) => {
            const badge = document.createElement('span');
            badge.className = 'impoclick-catalog-badge';
            badge.textContent = 'CATÁLOGO';
            document.body.appendChild(badge);
            positionBadge(link, badge);
            catalogBadges.set(link, badge);
        });
    }

    // Limpa qualquer crachá remanescente de uma marcação anterior (ex: uma
    // corrida em que markCatalogLinks rodou antes do h1/preço existirem no
    // DOM e looksLikeProductPage() ainda não detectava a página de produto).
    function removeCatalogBadges() {
        catalogBadges.forEach((badge) => badge.remove());
        catalogBadges.clear();
        document.querySelectorAll('a[data-impoclick-marked]').forEach((link) => {
            delete link.dataset.impoclickMarked;
        });
    }

    function repositionCatalogBadges() {
        catalogBadges.forEach((badge, link) => {
            if (!link.isConnected) {
                badge.remove();
                catalogBadges.delete(link);
                return;
            }
            positionBadge(link, badge);
        });
    }

    window.addEventListener('resize', repositionCatalogBadges);

    function start() {
        removePanel();
        init();
        // Marcar links de catálogo só faz sentido em páginas de RESULTADOS
        // (busca, listas, carrosséis) — numa página de produto/catálogo
        // individual (a que o usuário já está vendo), a própria página tem
        // vários links "/p/MLB..." pra coisas como título, cor, tamanho, que
        // não são cards de busca e confundiam a marcação (ex: o link do
        // título é uma barra larga e baixa, com mais área que a miniatura
        // da foto, e "ganhava" o crachá por engano).
        if (looksLikeProductPage()) {
            removeCatalogBadges();
        } else {
            markCatalogLinks();
        }
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

    // Resultados de busca carregam aos poucos (scroll infinito, paginação
    // via SPA) — observamos novos links aparecendo no DOM pra marcar os
    // produtos de catálogo que ainda não tinham sido renderizados.
    let markDebounce = null;
    const observer = new MutationObserver(() => {
        clearTimeout(markDebounce);
        markDebounce = setTimeout(() => {
            if (!looksLikeProductPage()) {
                markCatalogLinks();
            }
            repositionCatalogBadges();
        }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
