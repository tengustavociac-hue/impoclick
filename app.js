// STATE MANAGEMENT
let state = {
    products: [],
    exchangeRate: 5.50,
    currency: 'USD',
    freight: 0,
    freightInBRL: false,
    insurance: 0,
    insuranceInBRL: false,
    fees: 0,
    feesInBRL: true,
    taxMode: 'auto', // 'auto' or 'manual'
    taxRegime: 'remessa-conforme', // 'remessa-conforme', 'regra-geral', 'apenas-icms', 'personalizado'
    customII: 60,
    customICMS: 17,
    icmsRate: 17,
    manualII: 0,
    manualICMS: 0,
    freightSplit: 'weight', // 'weight', 'value'
    insuranceSplit: 'value', // 'value', 'weight'
    feesSplit: 'quantity', // 'quantity', 'value', 'weight'
    taxSplit: 'value', // 'value', 'weight'
    spread: 4.0, // spread bancário (%)
    iof: 2.38, // IOF (%)
    resaleMode: false,
    globalMargin: 40, // margem de lucro (%)
    exchangeMode: 'simple', // 'simple' or 'complete'
    ncmCache: {}
};

let editingProductId = null;

// Escapa texto livre digitado pelo usuário (nome/descrição de produto, nome do
// lote, etc.) antes de inserir via innerHTML — sem isso, algo como
// "<img src=x onerror=...>" digitado como nome executaria ao renderizar.
// Notificação não bloqueante (substitui alert()) — some sozinha depois de
// alguns segundos, não trava o resto da página como o alert() nativo.
function showToast(message, type = 'info', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) { console.log(message); return; }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-hide');
        setTimeout(() => el.remove(), 200);
    }, duration);
}

// Modal de confirmação assíncrono (substitui confirm()) — devolve uma
// Promise<boolean>, então quem chama precisa de "await".
function showConfirm(message, options = {}) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const okBtn = document.getElementById('confirm-modal-ok');
        const cancelBtn = document.getElementById('confirm-modal-cancel');
        if (!modal || !msgEl || !okBtn || !cancelBtn) { resolve(window.confirm(message)); return; }

        titleEl.textContent = options.title || 'Confirmar ação';
        msgEl.textContent = message;
        okBtn.textContent = options.confirmText || 'Confirmar';
        okBtn.className = options.danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

        modal.classList.remove('hidden');

        function cleanup(result) {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeydown);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onOverlayClick(e) { if (e.target === modal) cleanup(false); }
        function onKeydown(e) { if (e.key === 'Escape') cleanup(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeydown);
        okBtn.focus();
    });
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// LOAD PERSISTED STATE
async function loadState() {
    let savedState = null;
    if (state.currentUser) {
        try { 
            savedState = await window.db.getActiveSimulation();
            state.catalog = await window.db.getCatalog();
            state.company = await window.db.getCompany();
        } catch(e){}
    } else {
        state.catalog = [];
        state.company = null;
    }
    if (!savedState) savedState = localStorage.getItem('import_rateio_state');
    if (typeof savedState === 'string') {
        try { savedState = JSON.parse(savedState); } catch(e) { savedState = null; }
    }
    
    if (savedState) {
        try {
            const parsed = savedState;
            // O estado salvo (localStorage ou active_simulation) pode ter seu próprio
            // currentUser antigo (sem access_token, por exemplo) — nunca deixa essa
            // mesclagem sobrescrever a sessão recém-autenticada por checkAuthSession().
            const currentAuthUser = state.currentUser;
            state = { ...state, ...parsed };
            state.currentUser = currentAuthUser;

            // Populate form elements with saved state
            document.getElementById('select-currency').value = state.currency;
            document.getElementById('input-exchange-rate').value = state.exchangeRate;
            document.getElementById('input-freight').value = state.freight;
            document.getElementById('freight-in-brl').checked = state.freightInBRL;
            document.getElementById('input-insurance').value = state.insurance;
            document.getElementById('insurance-in-brl').checked = state.insuranceInBRL;
            document.getElementById('input-other-fees').value = state.fees;
            document.getElementById('fees-in-brl').checked = state.feesInBRL;
            
            // Tax radio
            document.querySelector(`input[name="tax-mode"][value="${state.taxMode}"]`).checked = true;
            if (document.getElementById('select-tax-regime')) {
                document.getElementById('select-tax-regime').value = state.taxRegime;
            }
            document.getElementById('input-custom-ii').value = state.customII;
            document.getElementById('input-custom-icms').value = state.customICMS;
            document.getElementById('input-icms-rate').value = state.icmsRate;
            document.getElementById('input-manual-ii').value = state.manualII;
            document.getElementById('input-manual-icms').value = state.manualICMS;
            
            // Splits
            document.getElementById('select-freight-split').value = state.freightSplit;
            document.getElementById('select-insurance-split').value = state.insuranceSplit;
            document.getElementById('select-fees-split').value = state.feesSplit;
            document.getElementById('select-tax-split').value = state.taxSplit;

            const customRates = document.getElementById('custom-tax-rates');
            const icmsRateGroup = document.getElementById('icms-rate-group');
            if (state.taxRegime === 'personalizado') {
                if (customRates) customRates.classList.remove('hidden');
                if (icmsRateGroup) icmsRateGroup.classList.add('hidden');
            } else {
                if (customRates) customRates.classList.add('hidden');
                if (icmsRateGroup) icmsRateGroup.classList.remove('hidden');
            }

 
            // New fields
            document.getElementById('input-spread').value = state.spread !== undefined ? state.spread : 4.0;
            document.getElementById('input-iof').value = state.iof !== undefined ? state.iof : 2.38;
            document.getElementById('toggle-resale-mode').checked = state.resaleMode || false;
            document.getElementById('input-global-margin').value = state.globalMargin !== undefined ? state.globalMargin : 40;
 
            // Load exchange mode selection
            state.exchangeMode = parsed.exchangeMode || 'simple';
            const exModeRadio = document.querySelector(`input[name="exchange-mode"][value="${state.exchangeMode}"]`);
            if (exModeRadio) {
                exModeRadio.checked = true;
            }
 
            const configFields = document.getElementById('resale-config-fields');
            if (state.resaleMode) {
                configFields.classList.remove('hidden');
            } else {
                configFields.classList.add('hidden');
            }
        } catch (e) {
            console.error('Erro ao ler estado do localStorage', e);
        }
    }
    
    // Load theme
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

// SAVE STATE
async function saveState() {
    // currentUser nunca deveria ir pro estado persistido (localStorage/Supabase) —
    // vira uma cópia desatualizada do access_token que depois sobrescreve a sessão
    // de verdade quando o estado é recarregado. A sessão sempre vem de checkAuthSession().
    const { currentUser, ...stateToPersist } = state;
    localStorage.setItem('import_rateio_state', JSON.stringify(stateToPersist));
    if (state.currentUser) {
        try { await window.db.saveActiveSimulation(stateToPersist); } catch(e){}
    }
}

// ==========================================
// AWESOMEAPI - REALTIME DOLLAR EXCHANGERATE
// ==========================================

async function fetchDollarRate() {
    const usdValEl = document.getElementById('ticker-usd-value');
    const usdChangeEl = document.getElementById('ticker-usd-change');
    const usdMinEl = document.getElementById('ticker-usd-min');
    const usdMaxEl = document.getElementById('ticker-usd-max');
    const sparklineEl = document.getElementById('ticker-usd-chart');
    const exRateInput = document.getElementById('input-exchange-rate');

    try {
        // 1. Fetch current price
        const resLast = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        if (!resLast.ok) throw new Error('Falha ao obter cotação atual');
        const dataLast = await resLast.json();
        const usdData = dataLast.USDBRL;
        
        const bid = parseFloat(usdData.bid);
        const pctChange = parseFloat(usdData.pctChange);

        state.lastDollarBid = bid;
        state.lastDollarPctChange = pctChange;

        // Alerta de câmbio favorável (uma vez por dia): dólar caiu de forma
        // relevante, pode ser um bom momento para fechar a importação.
        if (pctChange <= -1) {
            const todayKey = new Date().toISOString().slice(0, 10);
            if (localStorage.getItem('impoclick_rate_alert_shown') !== todayKey) {
                localStorage.setItem('impoclick_rate_alert_shown', todayKey);
                showToast(`Dólar caiu ${Math.abs(pctChange).toFixed(2)}% hoje (R$ ${bid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) — pode ser um bom momento para fechar câmbio.`, 'success', 8000);
            }
        }

        // Update current price UI
        if (usdValEl) {
            usdValEl.textContent = `R$ ${bid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
        }

        const dayLow = parseFloat(usdData.low);
        const dayHigh = parseFloat(usdData.high);
        if (usdMinEl && !isNaN(dayLow)) usdMinEl.textContent = `R$ ${dayLow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
        if (usdMaxEl && !isNaN(dayHigh)) usdMaxEl.textContent = `R$ ${dayHigh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

        if (usdChangeEl) {
            const isDown = pctChange < 0;
            usdChangeEl.className = `ticker-change ${isDown ? 'down' : 'up'}`;
            // If dollar went down, it's good (green arrow down), else it's bad (red arrow up)
            const arrow = isDown ? '▼' : '▲';
            const sign = pctChange > 0 ? '+' : '';
            usdChangeEl.textContent = `${arrow} ${sign}${pctChange.toFixed(2)}%`;
        }
        
        // Auto-fill calculator rate input if USD is selected
        if (state.currency === 'USD' && exRateInput) {
            const currentInputValue = parseFloat(exRateInput.value);
            if (currentInputValue === 5.50 || isNaN(currentInputValue) || currentInputValue === 0) {
                state.exchangeRate = parseFloat(bid.toFixed(2));
                exRateInput.value = state.exchangeRate;
                saveState();
                updateUI();
            }
        }
        
        // 2. Fetch daily history for last 7 days
        const resDaily = await fetch('https://economia.awesomeapi.com.br/json/daily/USD-BRL/7');
        if (!resDaily.ok) throw new Error('Falha ao obter histórico');
        const dataDaily = await resDaily.json();
        
        // Parse rates in chronological order (oldest to newest)
        const history = dataDaily.map(d => parseFloat(d.bid)).reverse();
        
        if (sparklineEl && history.length > 0) {
            drawSparkline(sparklineEl, history);
        }

        renderHomeDashboard();
    } catch (error) {
        console.error('Erro ao buscar cotação do dólar:', error);
        if (usdValEl) {
            usdValEl.textContent = 'Indisponível';
        }
        if (usdChangeEl) {
            usdChangeEl.className = 'ticker-change';
            usdChangeEl.textContent = 'Sem conexão';
        }
    }
}

function drawSparkline(container, data) {
    const width = 120;
    const height = 30;
    const padding = 3;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    // Generate points
    const points = data.map((val, idx) => {
        const x = (idx / (data.length - 1)) * (width - padding * 2) + padding;
        const y = height - padding - ((val - min) / range) * (height - padding * 2);
        return { x, y };
    });
    
    // Draw SVG path
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }
    
    // Area path for gradient fill
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
    
    // Decide color based on overall 7-day trend
    const firstVal = data[0];
    const lastVal = data[data.length - 1];
    const isDown = lastVal < firstVal;
    const color = isDown ? 'var(--success)' : 'var(--danger)';
    const gradStart = isDown ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
    const gradEnd = isDown ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)';
    
    const svgId = `spark-grad-${Math.random().toString(36).substr(2, 5)}`;
    
    const svgHtml = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="${svgId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${gradStart}" />
                    <stop offset="100%" stop-color="${gradEnd}" />
                </linearGradient>
            </defs>
            <path d="${areaD}" fill="url(#${svgId})" />
            <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="3" fill="${color}" />
        </svg>
    `;
    
    container.innerHTML = svgHtml;
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
    // Check if coming back from ML oauth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ml_connected') === 'true') {
        showToast('Conta do Mercado Livre conectada com sucesso!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
        // Switch to settings view
        setTimeout(() => {
            const btnSettings = document.querySelector('[data-view="view-settings"]');
            if (btnSettings) btnSettings.click();
        }, 500);
    }
    if (window.location.hash === '#view-reviews') {
        setTimeout(() => {
            const btnReviews = document.querySelector('[data-view="view-reviews"]');
            if (btnReviews) btnReviews.click();
        }, 500);
    }
    // Aceita link direto pra uma sub-aba específica: #view-catalog/winning ou
    // #view-catalog/losing (senão abre em "winning").
    if (window.location.hash.indexOf('#view-catalog') === 0) {
        const catalogSubTab = window.location.hash.split('/')[1];
        setTimeout(() => {
            const btnCatalog = document.querySelector('[data-view="view-catalog"]');
            if (btnCatalog) btnCatalog.click();
            if (catalogSubTab) {
                const btnSubTab = document.getElementById(`catalog-tab-btn-${catalogSubTab}`);
                if (btnSubTab) btnSubTab.click();
            }
        }, 500);
    }
    // Aceita link direto pra uma sub-aba específica: #view-promotions/soon,
    // #view-promotions/ended ou #view-promotions/lightning (senão abre em "active").
    if (window.location.hash.indexOf('#view-promotions') === 0) {
        const subTab = window.location.hash.split('/')[1];
        setTimeout(() => {
            const btnPromotions = document.querySelector('[data-view="view-promotions"]');
            if (btnPromotions) btnPromotions.click();
            if (subTab) {
                const btnSubTab = document.getElementById(`promo-tab-btn-${subTab}`);
                if (btnSubTab) btnSubTab.click();
            }
        }, 500);
    }
    initAuthArt();
    await checkAuthSession();

    // Se a sessão veio de um link de confirmação de e-mail (type=signup),
    // avisa a pessoa em vez de simplesmente abrir o app em silêncio.
    if (state.currentUser && /type=signup/.test(window.__authRedirectHash || '')) {
        showToast('E-mail confirmado com sucesso! Bem-vindo(a) ao Impoclick.', 'success', 6000);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    syncViabMlStatus();
    await loadState();
    registerEventListeners();
    registerAuthEventListeners();
    registerSubscriptionEventListeners();
    fetchDollarRate();
    preloadOfficialNcmDatabase();
    renderHomeDashboard();
    updateUI();
    initOnboardingTour();
});

// THEME TOGGLE
function updateThemeIcon(theme) {
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (theme === 'light') {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    }
}

// EVENT LISTENERS
function registerEventListeners() {
    // Theme toggle
    document.getElementById('btn-theme').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    document.getElementById('select-currency').addEventListener('change', (e) => {
        state.currency = e.target.value;
        const exGroup = document.getElementById('exchange-rate-group');
        const exMarkupGroup = document.getElementById('exchange-markup-group');
        if (state.currency === 'BRL') {
            exGroup.classList.add('hidden');
            exMarkupGroup.classList.add('hidden');
        } else {
            exGroup.classList.remove('hidden');
            if (state.exchangeMode === 'complete') {
                exMarkupGroup.classList.remove('hidden');
            } else {
                exMarkupGroup.classList.add('hidden');
            }
        }
        updateCurrencyPrefixes();
        saveState();
        updateUI();
    });

    // Exchange Mode Change (Simple / Complete)
    document.querySelectorAll('input[name="exchange-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.exchangeMode = e.target.value;
            saveState();
            updateUI();
        });
    });

    document.getElementById('input-exchange-rate').addEventListener('input', (e) => {
        state.exchangeRate = parseFloat(e.target.value) || 0.01;
        saveState();
        updateUI();
    });

    document.getElementById('input-spread').addEventListener('input', (e) => {
        state.spread = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('input-iof').addEventListener('change', (e) => {
        state.iof = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('input-freight').addEventListener('input', (e) => {
        state.freight = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('freight-in-brl').addEventListener('change', (e) => {
        state.freightInBRL = e.target.checked;
        document.getElementById('freight-prefix').textContent = state.freightInBRL ? 'R$' : getCurrencySymbol();
        saveState();
        updateUI();
    });

    document.getElementById('input-insurance').addEventListener('input', (e) => {
        state.insurance = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('insurance-in-brl').addEventListener('change', (e) => {
        state.insuranceInBRL = e.target.checked;
        document.getElementById('insurance-prefix').textContent = state.insuranceInBRL ? 'R$' : getCurrencySymbol();
        saveState();
        updateUI();
    });

    document.getElementById('input-other-fees').addEventListener('input', (e) => {
        state.fees = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('fees-in-brl').addEventListener('change', (e) => {
        state.feesInBRL = e.target.checked;
        document.getElementById('fees-prefix').textContent = state.feesInBRL ? 'R$' : getCurrencySymbol();
        saveState();
        updateUI();
    });

    // Tax Mode Change (Auto / Manual)
    document.querySelectorAll('input[name="tax-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.taxMode = e.target.value;
            const autoFields = document.getElementById('tax-auto-fields');
            const manualFields = document.getElementById('tax-manual-fields');
            const manualTaxSplitGroup = document.getElementById('manual-tax-split-group');
            
            if (state.taxMode === 'auto') {
                autoFields.classList.remove('hidden');
                manualFields.classList.add('hidden');
                manualTaxSplitGroup.classList.add('hidden');
            } else {
                autoFields.classList.add('hidden');
                manualFields.classList.remove('hidden');
                manualTaxSplitGroup.classList.remove('hidden');
            }
            saveState();
            updateUI();
        });
    });

    // Tax Regime Change
    document.getElementById('select-tax-regime').addEventListener('change', (e) => {
        state.taxRegime = e.target.value;
        const customRates = document.getElementById('custom-tax-rates');
        const icmsRateGroup = document.getElementById('icms-rate-group');
        
        if (state.taxRegime === 'personalizado') {
            customRates.classList.remove('hidden');
            icmsRateGroup.classList.add('hidden');
        } else {
            customRates.classList.add('hidden');
            icmsRateGroup.classList.remove('hidden');
        }
        saveState();
        updateUI();
    });

    document.getElementById('input-custom-ii').addEventListener('input', (e) => {
        state.customII = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('input-custom-icms').addEventListener('input', (e) => {
        state.customICMS = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('input-icms-rate').addEventListener('input', (e) => {
        state.icmsRate = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('input-manual-ii').addEventListener('input', (e) => {
        state.manualII = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('input-manual-icms').addEventListener('input', (e) => {
        state.manualICMS = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    // Splitting settings
    document.getElementById('select-freight-split').addEventListener('change', (e) => {
        state.freightSplit = e.target.value;
        saveState();
        updateUI();
    });

    document.getElementById('select-insurance-split').addEventListener('change', (e) => {
        state.insuranceSplit = e.target.value;
        saveState();
        updateUI();
    });

    document.getElementById('select-fees-split').addEventListener('change', (e) => {
        state.feesSplit = e.target.value;
        saveState();
        updateUI();
    });

    document.getElementById('select-tax-split').addEventListener('change', (e) => {
        state.taxSplit = e.target.value;
        saveState();
        updateUI();
    });

    // Resale Toggle
    document.getElementById('toggle-resale-mode').addEventListener('change', (e) => {
        state.resaleMode = e.target.checked;
        const configFields = document.getElementById('resale-config-fields');
        if (state.resaleMode) {
            configFields.classList.remove('hidden');
        } else {
            configFields.classList.add('hidden');
        }
        saveState();
        updateUI();
    });

    document.getElementById('input-global-margin').addEventListener('input', (e) => {
        state.globalMargin = parseFloat(e.target.value) || 0;
        saveState();
        updateUI();
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        exitEditMode();
    });

    document.getElementById('form-product').addEventListener('submit', (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('input-prod-name');
        const qtyInput = document.getElementById('input-prod-qty');
        const priceInput = document.getElementById('input-prod-price');
        const weightInput = document.getElementById('input-prod-weight');
        const weightUnitSelect = document.getElementById('select-prod-weight-unit');
        const taxationSelect = document.getElementById('select-prod-taxation');
        const descInput = document.getElementById('input-prod-description');
        const ncmInput = document.getElementById('input-prod-ncm');
        const imgBase64Input = document.getElementById('input-prod-image-base64');
        const fileInput = document.getElementById('input-prod-image');

        let unitWeight = parseFloat(weightInput.value) || 0;
        if (weightUnitSelect.value === 'g') {
            unitWeight = unitWeight / 1000;
        }

        if (editingProductId !== null) {
            const idx = state.products.findIndex(p => p.id === editingProductId);
            if (idx !== -1) {
                const existingImage = state.products[idx].image;
                state.products[idx] = {
                    id: editingProductId,
                    name: nameInput.value,
                    qty: parseInt(qtyInput.value) || 1,
                    unitPrice: parseFloat(priceInput.value) || 0,
                    unitWeight: unitWeight,
                    taxation: taxationSelect.value,
                    description: descInput ? descInput.value : '',
                    ncm: ncmInput ? ncmInput.value : '',
                    image: (imgBase64Input && imgBase64Input.value) ? imgBase64Input.value : existingImage
                };
            }
            exitEditMode();
        } else {
            const newProduct = {
                id: Date.now(),
                name: nameInput.value,
                qty: parseInt(qtyInput.value) || 1,
                unitPrice: parseFloat(priceInput.value) || 0,
                unitWeight: unitWeight,
                taxation: taxationSelect.value,
                description: descInput ? descInput.value : '',
                ncm: ncmInput ? ncmInput.value : '65050099',
                image: imgBase64Input ? imgBase64Input.value : ''
            };

            state.products.push(newProduct);

            nameInput.value = '';
            qtyInput.value = '1';
            priceInput.value = '';
            weightInput.value = '';
            if (descInput) descInput.value = '';
            if (imgBase64Input) imgBase64Input.value = '';
            if (fileInput) fileInput.value = '';

            const catSelect = document.getElementById('select-prod-catalog');
            if (catSelect) catSelect.value = '';

            nameInput.focus();
        }

        saveState();
        updateUI();
    });

    // Importação em lote (CSV) — baixar modelo
    const btnBulkTemplate = document.getElementById('btn-bulk-template');
    if (btnBulkTemplate) {
        btnBulkTemplate.addEventListener('click', () => {
            const header = 'nome;quantidade;preco_unitario;peso_unitario_kg;ncm;descricao;tributacao';
            const example = 'Fone de Ouvido Bluetooth;50;8,50;0,05;85183000;Fone de ouvido bluetooth intra-auricular;taxable';
            const csvContent = 'data:text/csv;charset=utf-8,﻿sep=;\n' + header + '\n' + example;
            const link = document.createElement('a');
            link.setAttribute('href', encodeURI(csvContent));
            link.setAttribute('download', 'modelo_importacao_produtos.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
    }

    // Importação em lote (CSV) — ler planilha e adicionar produtos de uma vez
    const inputBulkCsv = document.getElementById('input-bulk-csv');
    const bulkStatusEl = document.getElementById('bulk-import-status');
    function parseFlexibleNumber(str) {
        if (typeof str !== 'string') return NaN;
        return parseFloat(str.trim().replace(',', '.'));
    }
    if (inputBulkCsv) {
        inputBulkCsv.addEventListener('change', () => {
            const file = inputBulkCsv.files && inputBulkCsv.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                const text = String(reader.result || '').replace(/^﻿/, '');
                const lines = text.split(/\r\n|\n/).filter(l => l.trim() && !l.trim().toLowerCase().startsWith('sep='));
                lines.shift(); // remove cabeçalho

                let added = 0;
                let errors = 0;
                lines.forEach(line => {
                    const cols = line.split(';');
                    const name = (cols[0] || '').trim();
                    const qty = parseInt(cols[1], 10);
                    const unitPrice = parseFlexibleNumber(cols[2]);
                    const unitWeight = parseFlexibleNumber(cols[3]);
                    const ncm = (cols[4] || '').trim() || '65050099';
                    const description = (cols[5] || '').trim();
                    const taxationRaw = (cols[6] || '').trim();
                    const taxation = ['taxable', 'exempt-books', 'exempt-meds'].includes(taxationRaw) ? taxationRaw : 'taxable';

                    if (!name || !qty || qty <= 0 || !unitPrice || unitPrice <= 0 || isNaN(unitWeight) || unitWeight < 0) {
                        errors++;
                        return;
                    }

                    state.products.push({
                        id: Date.now() + added,
                        name,
                        qty,
                        unitPrice,
                        unitWeight,
                        taxation,
                        description,
                        ncm,
                        image: ''
                    });
                    added++;
                });

                if (bulkStatusEl) {
                    bulkStatusEl.classList.remove('hidden');
                    if (added > 0) {
                        bulkStatusEl.className = 'ncm-preview success';
                        bulkStatusEl.innerHTML = `<div>${added} produto(s) importado(s) com sucesso.${errors > 0 ? ` ${errors} linha(s) ignorada(s) por dados inválidos.` : ''}</div>`;
                    } else {
                        bulkStatusEl.className = 'ncm-preview warning';
                        bulkStatusEl.innerHTML = '<div>Nenhum produto válido encontrado na planilha. Confira o modelo e tente novamente.</div>';
                    }
                }

                if (added > 0) {
                    showToast(`${added} produto(s) importado(s) da planilha!`, 'success');
                    saveState();
                    updateUI();
                }
                inputBulkCsv.value = '';
            };
            reader.readAsText(file, 'UTF-8');
        });
    }

    // Clean all button
    document.getElementById('btn-clear-all').addEventListener('click', async () => {
        const ok = await showConfirm('Tem certeza de que deseja apagar todos os produtos e zerar as configurações?', { title: 'Limpar tudo', confirmText: 'Limpar', danger: true });
        if (ok) {
            state.products = [];
            state.freight = 0;
            state.insurance = 0;
            state.fees = 0;
            state.manualII = 0;
            state.manualICMS = 0;
            
            // Clear inputs visually
            document.getElementById('input-freight').value = '0.00';
            document.getElementById('input-insurance').value = '0.00';
            document.getElementById('input-other-fees').value = '0.00';
            document.getElementById('input-manual-ii').value = '0.00';
            document.getElementById('input-manual-icms').value = '0.00';
            
            saveState();
            updateUI();
        }
    });

    // Load example scenario
    document.getElementById('btn-load-example').addEventListener('click', () => {
        state.currency = 'USD';
        state.exchangeRate = 5.60;
        state.spread = 4.0;
        state.iof = 2.38;
        state.exchangeMode = 'complete';
        state.freight = 45;
        state.freightInBRL = false;
        state.insurance = 5.50;
        state.insuranceInBRL = false;
        state.fees = 15;
        state.feesInBRL = true;
        state.taxMode = 'auto';
        state.taxRegime = 'remessa-conforme';
        state.icmsRate = 17;
        state.resaleMode = true;
        state.globalMargin = 40;
        
        state.products = [
            { id: 1, name: 'SSD M.2 NVMe 1TB', qty: 2, unitPrice: 35.00, unitWeight: 0.08, taxation: 'taxable' },
            { id: 2, name: 'Teclado Mecânico Compacto', qty: 1, unitPrice: 48.00, unitWeight: 0.850, taxation: 'taxable' },
            { id: 3, name: 'Mouse Gamer Sem Fio', qty: 1, unitPrice: 24.50, unitWeight: 0.120, taxation: 'taxable' },
            { id: 4, name: 'Livro: Clean Code (Técnicas Limpas)', qty: 1, unitPrice: 29.90, unitWeight: 0.650, taxation: 'exempt-books' }
        ];
        
        // Sync HTML inputs
        document.getElementById('select-currency').value = state.currency;
        document.getElementById('input-exchange-rate').value = state.exchangeRate;
        document.getElementById('input-spread').value = state.spread;
        document.getElementById('input-iof').value = state.iof;
        document.getElementById('input-freight').value = state.freight;
        document.getElementById('freight-in-brl').checked = state.freightInBRL;
        document.getElementById('input-insurance').value = state.insurance;
        document.getElementById('insurance-in-brl').checked = state.insuranceInBRL;
        document.getElementById('input-other-fees').value = state.fees;
        document.getElementById('fees-in-brl').checked = state.feesInBRL;
        document.querySelector('input[name="tax-mode"][value="auto"]').checked = true;
        document.querySelector('input[name="exchange-mode"][value="complete"]').checked = true;
        document.getElementById('select-tax-regime').value = state.taxRegime;
        document.getElementById('input-icms-rate').value = state.icmsRate;
        document.getElementById('toggle-resale-mode').checked = state.resaleMode;
        document.getElementById('input-global-margin').value = state.globalMargin;
        
        document.getElementById('tax-auto-fields').classList.remove('hidden');
        document.getElementById('tax-manual-fields').classList.add('hidden');
        document.getElementById('exchange-rate-group').classList.remove('hidden');
        document.getElementById('exchange-markup-group').classList.remove('hidden');
        document.getElementById('resale-config-fields').classList.remove('hidden');
        
        updateCurrencyPrefixes();
        saveState();
        updateUI();
    });

    // Print
    document.getElementById('btn-print').addEventListener('click', () => {
        window.print();
    });

    // Export CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        exportToCSV();
    });

    // Export Excel
    document.getElementById('btn-export-excel').addEventListener('click', () => {
        exportToExcel();
    });


    // Results Tabs Click Handling
    const btnTabCosts = document.getElementById('tab-btn-costs');
    const btnTabFiscal = document.getElementById('tab-btn-fiscal');
    const contentCosts = document.getElementById('content-tab-costs');
    const contentFiscal = document.getElementById('content-tab-fiscal');

    if (btnTabCosts && btnTabFiscal && contentCosts && contentFiscal) {
        btnTabCosts.addEventListener('click', () => {
            btnTabCosts.classList.add('active');
            btnTabFiscal.classList.remove('active');
            contentCosts.classList.remove('hidden');
            contentFiscal.classList.add('hidden');
        });

        btnTabFiscal.addEventListener('click', () => {
            btnTabFiscal.classList.add('active');
            btnTabCosts.classList.remove('active');
            contentFiscal.classList.remove('hidden');
            contentCosts.classList.add('hidden');
        });
    }

    // NCM typing / preview listening on product entry form
    const inputProdNcm = document.getElementById('input-prod-ncm');
    if (inputProdNcm) {
        inputProdNcm.addEventListener('input', (e) => {
            handleNcmPreview(e.target.value);
        });
        inputProdNcm.addEventListener('blur', (e) => {
            handleNcmPreview(e.target.value);
        });
    }
}

// UTIL: CURRENCY HELPER
function getCurrencySymbol() {
    if (state.currency === 'USD') return 'US$';
    if (state.currency === 'EUR') return '€';
    return 'R$';
}

function updateCurrencyPrefixes() {
    const symbol = getCurrencySymbol();
    document.querySelectorAll('.currency-label').forEach(el => {
        el.textContent = symbol;
    });
    
    if (!state.freightInBRL) {
        document.getElementById('freight-prefix').textContent = symbol;
    }
    if (!state.insuranceInBRL) {
        document.getElementById('insurance-prefix').textContent = symbol;
    }
    if (!state.feesInBRL) {
        document.getElementById('fees-prefix').textContent = symbol;
    }
}

function enterEditMode(product) {
    editingProductId = product.id;

    document.getElementById('input-prod-name').value = product.name;
    document.getElementById('input-prod-qty').value = product.qty;
    document.getElementById('input-prod-price').value = product.unitPrice;

    const weightInput = document.getElementById('input-prod-weight');
    const weightUnitSelect = document.getElementById('select-prod-weight-unit');
    if (product.unitWeight < 1) {
        weightInput.value = (product.unitWeight * 1000).toFixed(0);
        weightUnitSelect.value = 'g';
    } else {
        weightInput.value = product.unitWeight.toFixed(3);
        weightUnitSelect.value = 'kg';
    }

    document.getElementById('select-prod-taxation').value = product.taxation || 'taxable';

    const descInput = document.getElementById('input-prod-description');
    if (descInput) descInput.value = product.description || '';

    const ncmInput = document.getElementById('input-prod-ncm');
    if (ncmInput) {
        ncmInput.value = product.ncm || '';
        handleNcmPreview(product.ncm || '');
    }

    const imgBase64Input = document.getElementById('input-prod-image-base64');
    if (imgBase64Input) imgBase64Input.value = product.image || '';

    const catSelect = document.getElementById('select-prod-catalog');
    if (catSelect) catSelect.value = '';

    document.getElementById('btn-submit-product').classList.remove('btn-primary');
    document.getElementById('btn-submit-product').classList.add('btn-warning');
    document.getElementById('btn-submit-label').textContent = 'Salvar Alterações';
    document.getElementById('btn-submit-icon-add').classList.add('hidden');
    document.getElementById('btn-submit-icon-edit').classList.remove('hidden');
    document.getElementById('btn-cancel-edit').classList.remove('hidden');

    document.getElementById('form-product').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('input-prod-name').focus();
}

function exitEditMode() {
    editingProductId = null;

    document.getElementById('input-prod-name').value = '';
    document.getElementById('input-prod-qty').value = '1';
    document.getElementById('input-prod-price').value = '';
    document.getElementById('input-prod-weight').value = '';
    document.getElementById('select-prod-weight-unit').value = 'kg';

    const descInput = document.getElementById('input-prod-description');
    if (descInput) descInput.value = '';

    const ncmInput = document.getElementById('input-prod-ncm');
    if (ncmInput) {
        ncmInput.value = '65050099';
        handleNcmPreview('65050099');
    }

    const imgBase64Input = document.getElementById('input-prod-image-base64');
    if (imgBase64Input) imgBase64Input.value = '';

    const fileInput = document.getElementById('input-prod-image');
    if (fileInput) fileInput.value = '';

    const catSelect = document.getElementById('select-prod-catalog');
    if (catSelect) catSelect.value = '';

    document.getElementById('btn-submit-product').classList.add('btn-primary');
    document.getElementById('btn-submit-product').classList.remove('btn-warning');
    document.getElementById('btn-submit-label').textContent = 'Adicionar';
    document.getElementById('btn-submit-icon-add').classList.remove('hidden');
    document.getElementById('btn-submit-icon-edit').classList.add('hidden');
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

// ==========================================
// PRE-CARREGAMENTO DA BASE OFICIAL DE NCMS
// ==========================================

const NCM_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

async function preloadOfficialNcmDatabase() {
    // Evita rebaixar a base inteira de NCMs (às vezes vários MB) toda vez que
    // o app abre — só refaz o download se o cache local estiver vazio ou
    // tiver mais de 7 dias.
    const cacheSize = state.ncmCache ? Object.keys(state.ncmCache).length : 0;
    const cacheAge = state.ncmCacheUpdatedAt ? (Date.now() - state.ncmCacheUpdatedAt) : Infinity;
    if (cacheSize > 100 && cacheAge < NCM_CACHE_MAX_AGE_MS) {
        console.log(`Base de NCMs já em cache (${cacheSize} códigos, atualizada há ${Math.round(cacheAge / 86400000)} dia(s)) — pulando novo download.`);
        return;
    }

    // 1. Tenta carregar a base oficial do Portal Único Siscomex
    try {
        const response = await fetch('https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json');
        if (response.ok) {
            const data = await response.json();
            if (data && data.Nomenclaturas) {
                state.ncmCache = state.ncmCache || {};
                data.Nomenclaturas.forEach(item => {
                    const cleanCode = item.Codigo.replace(/[^0-9]/g, '');
                    if (cleanCode.length === 8 && item.Descricao) {
                        state.ncmCache[cleanCode] = item.Descricao;
                    }
                });
                state.ncmCacheUpdatedAt = Date.now();
                saveState();
                console.log("Base de NCMs oficial do Siscomex pré-carregada e mesclada ao cache.");
                return;
            }
        }
    } catch (err) {
        console.warn("Falha ao carregar NCMs via Siscomex (CORS ou rede). Tentando GitHub...");
    }

    // 2. Fallback: Tenta carregar o espelho CSV oficial hospedado no GitHub (que tem CORS liberado)
    try {
        const response = await fetch('https://raw.githubusercontent.com/jansenfelipe/ncm/1.0/ncm.csv');
        if (response.ok) {
            const text = await response.text();
            const lines = text.split('\n');
            state.ncmCache = state.ncmCache || {};
            lines.forEach(line => {
                const parts = line.split(';');
                if (parts.length >= 2) {
                    const code = parts[0].replace(/[^0-9]/g, '');
                    const desc = parts[1] ? parts[1].replace(/"/g, '').trim() : '';
                    if (code.length === 8 && desc) {
                        state.ncmCache[code] = desc;
                    }
                }
            });
            state.ncmCacheUpdatedAt = Date.now();
            saveState();
            console.log("Base de NCMs do GitHub CSV pré-carregada e mesclada ao cache.");
        }
    } catch (err) {
        console.warn("Não foi possível carregar a base de dados do GitHub:", err);
    }
}

// ==========================================
// NCM TAX LOOKUP & CÁLCULOS TRIBUTÁRIOS
// ==========================================

// Consulta a API do IBPT (mesma ja usada para descricao de NCM) e guarda em
// cache o campo "importadosfederal" — carga tributaria federal aproximada
// para produtos importados (metodologia da Lei da Transparencia Fiscal,
// calculada pelo IBPT a partir das tabelas oficiais TEC/TIPI/PIS-COFINS).
// Nao e a mesma coisa que a quebra exata II/IPI/PIS/COFINS: e uma
// estimativa agregada, usada so quando o NCM nao esta na base curada
// (ncm_db.js) nem tem alíquotas manuais cadastradas.
async function fetchIbptTaxEstimate(cleanNcm) {
    if (!cleanNcm || cleanNcm.length !== 8) return null;
    state.ncmRateEstimateCache = state.ncmRateEstimateCache || {};
    if (Object.prototype.hasOwnProperty.call(state.ncmRateEstimateCache, cleanNcm)) {
        return state.ncmRateEstimateCache[cleanNcm];
    }
    try {
        // A API do IBPT não envia cabeçalhos CORS, então o navegador não pode
        // chamá-la direto — passa por um proxy do próprio backend (Vercel).
        const resp = await fetch(`/api/ncm-tax-estimate?ncm=${cleanNcm}`);
        if (resp.ok) {
            const data = await resp.json();
            const value = (data && typeof data.importadosFederalPct === 'number') ? data.importadosFederalPct : null;
            state.ncmRateEstimateCache[cleanNcm] = value;
            if (data && data.descricao) {
                state.ncmCache = state.ncmCache || {};
                state.ncmCache[cleanNcm] = data.descricao;
            }
            saveState();
            return value;
        }
    } catch (err) {
        console.warn('Falha ao consultar estimativa de alíquota IBPT:', err);
    }
    state.ncmRateEstimateCache[cleanNcm] = null;
    return null;
}

function getProductTaxRates(ncmCode) {
    const cleanNcm = ncmCode ? ncmCode.toString().replace(/[^0-9]/g, '') : '';
    // Busca na base local de NCMs (de ncm_db.js)
    if (typeof lookupLocalNcm === 'function') {
        const localData = lookupLocalNcm(cleanNcm);
        if (localData) {
            return {
                name: localData.name,
                ii: localData.ii,
                ipi: localData.ipi,
                pis: localData.pis,
                cofins: localData.cofins,
                source: 'local'
            };
        }
    }

    // Estimativa do IBPT (populada de forma assíncrona por fetchIbptTaxEstimate,
    // disparada pelas telas de preview de NCM). Aplicada como II para refletir
    // o custo total aproximado, já que o IBPT não discrimina por tributo.
    if (state.ncmRateEstimateCache && state.ncmRateEstimateCache[cleanNcm] != null) {
        return {
            name: (state.ncmCache && state.ncmCache[cleanNcm]) || 'NCM fora da base curada (estimativa IBPT)',
            ii: state.ncmRateEstimateCache[cleanNcm],
            ipi: 0,
            pis: 0,
            cofins: 0,
            source: 'ibpt-estimate'
        };
    }

    // Busca na base cacheada online pesquisada anteriormente
    if (state.ncmCache && state.ncmCache[cleanNcm]) {
        return {
            name: state.ncmCache[cleanNcm],
            ii: 0,
            ipi: 0,
            pis: 0,
            cofins: 0,
            source: 'online'
        };
    }

    // NCM não cadastrado na base local: retorna alíquotas zeradas
    return {
        name: "NCM Não Cadastrado na Base",
        ii: 0,
        ipi: 0,
        pis: 0,
        cofins: 0,
        source: 'fallback'
    };
}

function calculateItemTaxes(itemVABRL, itemFeesBRL, ncm, taxation, totalVAUSD, totalTaxableOfficialVABRL, totalWeight, itemWeight, totalOfficialVABRL, qty, totalQty) {
    let iiBRL = 0;
    let ipiBRL = 0;
    let pisBRL = 0;
    let cofinsBRL = 0;
    let icmsBRL = 0;
    let ratesUsed = null;

    const icmsRatePercent = state.icmsRate / 100;

    if (state.taxMode === 'auto') {
        if (taxation === 'exempt-books') {
            return { iiBRL: 0, ipiBRL: 0, pisBRL: 0, cofinsBRL: 0, icmsBRL: 0, ratesUsed: null };
        } else if (taxation === 'exempt-meds') {
            const baseICMS = itemVABRL / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
            return { iiBRL: 0, ipiBRL: 0, pisBRL: 0, cofinsBRL: 0, icmsBRL: icmsBRL, ratesUsed: null };
        }

        if (state.taxRegime === 'remessa-conforme') {
            const exchangeFactor = (state.currency === 'BRL' ? 1 : state.exchangeRate);
            if (totalVAUSD <= 50) {
                iiBRL = itemVABRL * 0.20;
            } else {
                const rawII = itemVABRL * 0.60;
                const itemDeductionBRL = (20 * exchangeFactor) * (itemVABRL / totalTaxableOfficialVABRL);
                iiBRL = Math.max(0, rawII - itemDeductionBRL);
            }
            const baseICMS = (itemVABRL + iiBRL) / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        } else if (state.taxRegime === 'regra-geral') {
            iiBRL = itemVABRL * 0.60;
            const baseICMS = (itemVABRL + iiBRL) / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        } else if (state.taxRegime === 'apenas-icms') {
            iiBRL = 0;
            const baseICMS = itemVABRL / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        } else if (state.taxRegime === 'personalizado') {
            const customIIRatePercent = state.customII / 100;
            const customICMSRatePercent = state.customICMS / 100;
            iiBRL = itemVABRL * customIIRatePercent;
            const baseICMS = (itemVABRL + iiBRL) / (1 - customICMSRatePercent);
            icmsBRL = baseICMS * customICMSRatePercent;
        } else if (state.taxRegime === 'importacao-formal') {
            const rates = getProductTaxRates(ncm);
            ratesUsed = rates;
            iiBRL = itemVABRL * (rates.ii / 100);
            ipiBRL = (itemVABRL + iiBRL) * (rates.ipi / 100);
            pisBRL = itemVABRL * (rates.pis / 100);
            cofinsBRL = itemVABRL * (rates.cofins / 100);
            const baseICMS = (itemVABRL + iiBRL + ipiBRL + pisBRL + cofinsBRL + itemFeesBRL) / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        }
    } else {
        // Manual mode
        let taxShare = 0;
        if (state.taxSplit === 'weight' && totalWeight > 0) {
            taxShare = itemWeight / totalWeight;
        } else if (totalOfficialVABRL > 0) {
            taxShare = itemVABRL / totalOfficialVABRL;
        } else {
            taxShare = qty / totalQty;
        }
        iiBRL = state.manualII * taxShare;
        icmsBRL = state.manualICMS * taxShare;
    }

    return { iiBRL, ipiBRL, pisBRL, cofinsBRL, icmsBRL, ratesUsed };
}

function renderNcmRateFooter(estimatedPct) {
    if (estimatedPct == null) {
        return `
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                NCM sem alíquotas locais cadastradas. Alíquotas aplicadas: II = 0% | IPI = 0% | PIS = 0% | COFINS = 0%
            </div>`;
    }
    return `
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
            Carga tributária federal aproximada (estimativa IBPT): <strong>${estimatedPct.toFixed(2)}%</strong>, aplicada como Imposto de Importação (IPI/PIS/COFINS não discriminados nesta estimativa).
        </div>`;
}

async function handleNcmPreview(ncmValue) {
    const previewEl = document.getElementById('ncm-lookup-preview');
    if (!previewEl) return;

    if (!ncmValue) {
        previewEl.classList.add('hidden');
        return;
    }

    const cleanNcm = ncmValue.toString().replace(/[^0-9]/g, '');

    if (cleanNcm.length < 4) {
        previewEl.classList.add('hidden');
        return;
    }

    previewEl.classList.remove('hidden');

    // 1. Busca Local
    if (typeof lookupLocalNcm === 'function') {
        const localMatch = lookupLocalNcm(cleanNcm);
        if (localMatch) {
            previewEl.className = "ncm-preview success";
            previewEl.innerHTML = `
                <div><strong>NCM Detectado (Local):</strong> <span class="ncm-badge">${cleanNcm}</span> - ${localMatch.name}</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                    Alíquotas estimadas: II = ${localMatch.ii}% | IPI = ${localMatch.ipi}% | PIS = ${localMatch.pis}% | COFINS = ${localMatch.cofins}%
                </div>
                <div style="font-size:0.68rem; color:var(--success); margin-top:0.35rem; font-weight: 500; display: flex; align-items: center; gap: 0.25rem;">
                    <span>ℹ️</span> <span><strong>Fonte do Dado:</strong> Base interna de impostos coletada das Tabelas da Tarifa Externa Comum (TEC) e TIPI da Receita Federal.</span>
                </div>
            `;
            return;
        }
    }

    if (cleanNcm.length !== 8) {
        previewEl.className = "ncm-preview error";
        previewEl.innerHTML = `
            <div><strong>NCM Incompleto:</strong> O NCM deve possuir 8 dígitos para consulta (ex: 85235190).</div>
        `;
        return;
    }

    // 1.5. Já temos descrição e/ou estimativa de alíquota em cache?
    let desc = (state.ncmCache && state.ncmCache[cleanNcm]) || null;
    let rateSourceLabel = 'Base oficial pré-carregada do Portal Único Siscomex / GitHub.';

    if (!desc) {
        // 2. Consulta API Siscomex/BrasilAPI (só descrição)
        previewEl.className = "ncm-preview warning";
        previewEl.innerHTML = `<div>Consultando NCM <span class="ncm-badge">${cleanNcm}</span> na base da Receita Federal (BrasilAPI)...</div>`;
        try {
            const response = await fetch(`https://brasilapi.com.br/api/ncm/v1/${cleanNcm}`);
            if (response.status === 200) {
                const data = await response.json();
                desc = data.descricao;
                state.ncmCache = state.ncmCache || {};
                state.ncmCache[cleanNcm] = desc;
                saveState();
                rateSourceLabel = 'Base descritiva oficial da Receita Federal do Brasil (consulta via API Siscomex / BrasilAPI).';
            }
        } catch (err) {
            console.warn('Falha ao consultar BrasilAPI:', err);
        }
    }

    // 3. Estimativa de alíquota (IBPT) — busca (ou usa cache) independente de
    // onde veio a descrição, já que a API IBPT também devolve a descrição.
    previewEl.className = "ncm-preview warning";
    previewEl.innerHTML = `<div>Consultando alíquota estimada de NCM <span class="ncm-badge">${cleanNcm}</span> (IBPT)...</div>`;
    const estimatedPct = await fetchIbptTaxEstimate(cleanNcm);
    if (!desc && state.ncmCache && state.ncmCache[cleanNcm]) {
        desc = state.ncmCache[cleanNcm];
        rateSourceLabel = 'Base descritiva do IBPT (consulta em tempo real via API Seu Negócio na Nuvem).';
    }

    if (!desc) {
        previewEl.className = "ncm-preview error";
        previewEl.innerHTML = `
            <div><strong>NCM Não Encontrado:</strong> <span class="ncm-badge">${cleanNcm}</span> não localizado em nenhuma das bases (BrasilAPI / IBPT).</div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                Nenhum imposto de importação formal será aplicado para este item (alíquotas zeradas).
            </div>
        `;
        return;
    }

    previewEl.className = "ncm-preview success";
    previewEl.innerHTML = `
        <div><strong>NCM Encontrado:</strong> <span class="ncm-badge">${cleanNcm}</span> - ${desc}</div>
        ${renderNcmRateFooter(estimatedPct)}
        <div style="font-size:0.68rem; color:var(--warning); margin-top:0.35rem; font-weight: 500; display: flex; align-items: center; gap: 0.25rem;">
            <span>ℹ️</span> <span><strong>Fonte do Dado:</strong> ${rateSourceLabel}</span>
        </div>
    `;
}

// MAIN CALCULATION & UI RE-RENDER
function updateUI() {
    const authContainer = document.getElementById('auth-container');
    const paywallScreen = document.getElementById('paywall-screen');
    const appContainer = document.querySelector('.app-container');
    const userDisplayName = document.getElementById('user-display-name');
    const trialBanner = document.getElementById('trial-banner');
    const trialDaysText = document.getElementById('trial-days-text');
    
    if (!state.currentUser) {
        if (authContainer) authContainer.classList.remove('hidden');
        if (paywallScreen) paywallScreen.classList.add('hidden');
        if (appContainer) appContainer.classList.add('hidden');
        return; 
    }
    
    // Check subscription / trial status
    const subStatus = checkSubscriptionStatus(state.currentUser);
    
    if (!subStatus.hasAccess) {
        // Block access, show paywall
        if (authContainer) authContainer.classList.add('hidden');
        if (paywallScreen) paywallScreen.classList.remove('hidden');
        if (appContainer) appContainer.classList.add('hidden');
        
        // Dynamically adjust paywall text based on expiration
        const paywallTitle = paywallScreen.querySelector('.auth-header h2');
        const paywallDesc = paywallScreen.querySelector('.auth-header p');
        if (state.currentUser && state.currentUser.subscriptionExpiresAt && Date.now() >= state.currentUser.subscriptionExpiresAt) {
            if (paywallTitle) paywallTitle.textContent = "Sua Assinatura Expirou";
            if (paywallDesc) paywallDesc.textContent = "Seus 30 dias de acesso terminaram. Renove sua assinatura para continuar usando o simulador.";
        } else {
            if (paywallTitle) paywallTitle.textContent = "Seu Teste Grátis Expirou";
            if (paywallDesc) paywallDesc.textContent = "Para continuar utilizando as planilhas, assine o plano completo.";
        }
        return;
    }
    
    // Grant access
    if (authContainer) authContainer.classList.add('hidden');
    if (paywallScreen) paywallScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    if (userDisplayName) userDisplayName.textContent = `Olá, ${state.currentUser.name}!`;
    
    // Handle trial or active subscription banner display
    const btnBannerSubscribe = document.getElementById('btn-banner-subscribe');
    if (subStatus.isTrial) {
        if (trialBanner) {
            trialBanner.classList.remove('hidden');
            trialBanner.style.backgroundColor = ''; // Reset custom style to default CSS warning look
            trialBanner.style.borderColor = '';
            if (trialDaysText) {
                trialDaysText.innerHTML = `<span style="font-weight: 700;">Período de teste grátis ativo.</span> Restam ${subStatus.daysRemaining} dia(s) de acesso.`;
            }
            if (btnBannerSubscribe) {
                btnBannerSubscribe.textContent = "Assinar por R$ 29,90/mês";
            }
        }
    } else if (subStatus.isSubscribed && subStatus.daysRemaining > 0) {
        if (trialBanner) {
            trialBanner.classList.remove('hidden');
            trialBanner.style.backgroundColor = ''; // Reset custom style to default CSS brand look
            trialBanner.style.borderColor = '';
            if (trialDaysText) {
                trialDaysText.innerHTML = `<span style="font-weight: 700; color: var(--success);">Assinatura ativa.</span> Restam ${subStatus.daysRemaining} dia(s) de acesso.`;
            }
            if (btnBannerSubscribe) {
                btnBannerSubscribe.textContent = "Renovar Acesso";
            }
        }
    } else {
        if (trialBanner) trialBanner.classList.add('hidden');
    }

    const tbodyProducts = document.getElementById('tbody-products');
    const tfootProducts = document.getElementById('tfoot-products');
    const badgeProductCount = document.getElementById('badge-product-count');
    const resultsArea = document.getElementById('results-area');
    
    const symbol = getCurrencySymbol();
    
    // Toggle resale columns and cards visibility
    document.querySelectorAll('.resale-only').forEach(el => {
        if (state.resaleMode) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
    
    // Calculate Câmbio Efetivo
    const spread = state.exchangeMode === 'complete' ? (state.spread || 0) : 0;
    const iof = state.exchangeMode === 'complete' ? (state.iof || 0) : 0;
    const effectiveRate = state.exchangeRate * (1 + spread / 100) * (1 + iof / 100);
    
    const displayEffectiveRate = document.getElementById('display-effective-rate');
    const effectiveRateContainer = document.getElementById('effective-rate-container');
    const exchangeMarkupGroup = document.getElementById('exchange-markup-group');
    const exchangeRateGroup = document.getElementById('exchange-rate-group');
    
    if (state.currency === 'BRL') {
        if (effectiveRateContainer) effectiveRateContainer.classList.add('hidden');
        if (exchangeMarkupGroup) exchangeMarkupGroup.classList.add('hidden');
        if (exchangeRateGroup) exchangeRateGroup.classList.add('hidden');
    } else {
        if (effectiveRateContainer) effectiveRateContainer.classList.remove('hidden');
        if (state.exchangeMode === 'complete') {
            if (exchangeMarkupGroup) exchangeMarkupGroup.classList.remove('hidden');
        } else {
            if (exchangeMarkupGroup) exchangeMarkupGroup.classList.add('hidden');
        }
        if (exchangeRateGroup) exchangeRateGroup.classList.remove('hidden');
        if (displayEffectiveRate) {
            displayEffectiveRate.textContent = `R$ ${effectiveRate.toLocaleString('pt-BR', {minimumFractionDigits: 4, maximumFractionDigits: 4})}`;
        }
    }
    
    // 1. Calculate Totals for package
    const totalQty = state.products.reduce((acc, p) => acc + p.qty, 0);
    const totalWeight = state.products.reduce((acc, p) => acc + (p.unitWeight * p.qty), 0);
    
    const factorEffectiveBRL = state.currency === 'BRL' ? 1 : effectiveRate;
    const factorOfficialBRL = state.currency === 'BRL' ? 1 : state.exchangeRate;
    
    const totalFobForeign = state.products.reduce((acc, p) => acc + (p.unitPrice * p.qty), 0);
    const totalFobBRL = totalFobForeign * factorEffectiveBRL; // Actual money spent
    const totalFobOfficialBRL = totalFobForeign * factorOfficialBRL; // Declared for taxes
    
    badgeProductCount.textContent = `${state.products.length} ${state.products.length === 1 ? 'produto' : 'produtos'}`;
    
    if (state.products.length === 0) {
        tbodyProducts.innerHTML = `
            <tr class="empty-state-row">
                <td colspan="8" class="text-center empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                    </div>
                    <p>Nenhum produto adicionado ainda.</p>
                    <p class="small">Preencha os dados acima ou clique em "Carregar Exemplo" para começar.</p>
                </td>
            </tr>
        `;
        tfootProducts.classList.add('hidden');
        resultsArea.classList.add('hidden');
        return;
    }
    
    tfootProducts.classList.remove('hidden');
    resultsArea.classList.remove('hidden');
    
    // Render Products Table
    tbodyProducts.innerHTML = '';
    state.products.forEach(p => {
        const tr = document.createElement('tr');
        const weightFormatted = p.unitWeight >= 1 
            ? `${p.unitWeight.toFixed(3)} kg` 
            : `${(p.unitWeight * 1000).toFixed(0)} g`;
            
        const itemFobForeign = p.unitPrice * p.qty;
        const itemFobBRL = itemFobForeign * factorEffectiveBRL;
        
        let taxBadgeHtml = '<span class="badge badge-taxable">Tributado</span>';
        if (p.taxation === 'exempt-books') {
            taxBadgeHtml = '<span class="badge badge-exempt-books">Livro (Isento)</span>';
        } else if (p.taxation === 'exempt-meds') {
            taxBadgeHtml = '<span class="badge badge-exempt-meds">Med (Isento II)</span>';
        }
        
        const photoHTML = p.image 
            ? `<img src="${p.image}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;">`
            : `<div style="width: 32px; height: 32px; background-color: var(--bg-hover); display: flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--text-muted); font-size: 0.75rem; border: 1px solid var(--border-color); flex-shrink: 0;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    ${photoHTML}
                    <div>
                        <div style="font-weight: 600; color: var(--text-color);">${escapeHtml(p.name)}</div>
                        ${p.description ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.description)}</div>` : ''}
                    </div>
                </div>
            </td>
            <td>${taxBadgeHtml}</td>
            <td class="text-center">${p.qty}</td>
            <td class="text-right">${formatCurrency(p.unitPrice, state.currency)}</td>
            <td class="text-right">${weightFormatted}</td>
            <td class="text-right" style="font-weight: 500;">${formatCurrency(itemFobForeign, state.currency)}</td>
            <td class="text-right">R$ ${itemFobBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-center" style="white-space: nowrap;">
                <button class="btn-icon-edit btn-edit-item" data-id="${p.id}" title="Editar produto" aria-label="Editar produto">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon-danger btn-delete-item" data-id="${p.id}" title="Excluir produto" aria-label="Excluir produto">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
            </td>
        `;
        tbodyProducts.appendChild(tr);
    });
    
    // Add edit event listeners
    document.querySelectorAll('.btn-edit-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseFloat(btn.getAttribute('data-id'));
            const product = state.products.find(p => p.id === id);
            if (product) enterEditMode(product);
        });
    });

    // Add delete event listeners
    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseFloat(btn.getAttribute('data-id'));
            if (editingProductId === id) exitEditMode();
            state.products = state.products.filter(p => p.id !== id);
            saveState();
            updateUI();
        });
    });
    
    // Render Footers
    document.getElementById('total-qty').textContent = totalQty;
    document.getElementById('total-weight').textContent = `${totalWeight.toFixed(3)} kg`;
    document.getElementById('total-fob-foreign').textContent = formatCurrency(totalFobForeign, state.currency);
    document.getElementById('total-fob-brl').textContent = `R$ ${totalFobBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // 2. RUN DISTRIBUTION MATHEMATICS
    const freightBRL = state.freightInBRL ? state.freight : state.freight * factorEffectiveBRL;
    const insuranceBRL = state.insuranceInBRL ? state.insurance : state.insurance * factorEffectiveBRL;
    const feesBRL = state.feesInBRL ? state.fees : state.fees * factorEffectiveBRL;
    
    // For official tax calculation (PTAX without spread/iof)
    const freightOfficialBRL = state.freightInBRL ? state.freight : state.freight * factorOfficialBRL;
    const insuranceOfficialBRL = state.insuranceInBRL ? state.insurance : state.insurance * factorOfficialBRL;
    
    // Pre-calculate shares
    let itemsCalculation = state.products.map(p => {
        const itemFobForeign = p.unitPrice * p.qty;
        const itemFobBRL = itemFobForeign * factorEffectiveBRL;
        const itemFobOfficialBRL = itemFobForeign * factorOfficialBRL;
        const itemWeightTotal = p.unitWeight * p.qty;
        
        // Freight apportionment share
        let freightShare = 0;
        if (state.freightSplit === 'weight' && totalWeight > 0) {
            freightShare = itemWeightTotal / totalWeight;
        } else if (totalFobBRL > 0) {
            freightShare = itemFobBRL / totalFobBRL;
        } else {
            freightShare = p.qty / totalQty;
        }
        
        // Insurance apportionment share
        let insuranceShare = 0;
        if (state.insuranceSplit === 'weight' && totalWeight > 0) {
            insuranceShare = itemWeightTotal / totalWeight;
        } else if (totalFobBRL > 0) {
            insuranceShare = itemFobBRL / totalFobBRL;
        } else {
            insuranceShare = p.qty / totalQty;
        }
        
        // Fees apportionment share
        let feesShare = 0;
        if (state.feesSplit === 'quantity' && totalQty > 0) {
            feesShare = p.qty / totalQty;
        } else if (state.feesSplit === 'weight' && totalWeight > 0) {
            feesShare = itemWeightTotal / totalWeight;
        } else if (totalFobBRL > 0) {
            feesShare = itemFobBRL / totalFobBRL;
        } else {
            feesShare = 1 / state.products.length;
        }
        
        // Actual costs paid by user
        const itemFreightBRL = freightBRL * freightShare;
        const itemInsuranceBRL = insuranceBRL * insuranceShare;
        const itemFeesBRL = feesBRL * feesShare;
        
        // Official values for tax base
        const itemFreightOfficialBRL = freightOfficialBRL * freightShare;
        const itemInsuranceOfficialBRL = insuranceOfficialBRL * insuranceShare;
        const itemVABRL = itemFobOfficialBRL + itemFreightOfficialBRL + itemInsuranceOfficialBRL; // Declared Customs Value (PTAX)
        
        return {
            product: p,
            fobForeign: itemFobForeign,
            fobBRL: itemFobBRL,
            weightTotal: itemWeightTotal,
            freightBRL: itemFreightBRL,
            insuranceBRL: itemInsuranceBRL,
            feesBRL: itemFeesBRL,
            vaBRL: itemVABRL, // Official tax base VA in R$
            iiBRL: 0,
            icmsBRL: 0
        };
    });
    
    // Calculate total VA (Valores Aduaneiros) BRL (Official)
    const totalOfficialVABRL = itemsCalculation.reduce((acc, item) => acc + item.vaBRL, 0);
    
    // Sum of taxable items VA (for pro-rating the $20 discount in Remessa Conforme)
    const totalTaxableOfficialVABRL = itemsCalculation
        .filter(item => (item.product.taxation || 'taxable') === 'taxable')
        .reduce((acc, item) => acc + item.vaBRL, 0);
        
    // Apply Taxes
    let totalIIBRL = 0;
    let totalICMSBRL = 0;
    
    const totalVAUSD = state.currency === 'USD' 
        ? totalOfficialVABRL / state.exchangeRate 
        : totalOfficialVABRL / 5.50;
        
    itemsCalculation.forEach(item => {
        const itemWeight = item.product.unitWeight * item.product.qty;
        const taxResults = calculateItemTaxes(
            item.vaBRL, 
            item.feesBRL, 
            item.product.ncm, 
            item.product.taxation || 'taxable', 
            totalVAUSD, 
            totalTaxableOfficialVABRL, 
            totalWeight, 
            itemWeight, 
            totalOfficialVABRL, 
            item.product.qty, 
            totalQty
        );
        
        item.iiBRL = taxResults.iiBRL;
        item.ipiBRL = taxResults.ipiBRL;
        item.pisBRL = taxResults.pisBRL;
        item.cofinsBRL = taxResults.cofinsBRL;
        item.icmsBRL = taxResults.icmsBRL;
        item.formalRatesUsed = taxResults.ratesUsed;
        
        totalIIBRL += item.iiBRL;
        totalICMSBRL += item.icmsBRL;
    });
    
    // 3. RENDER RESULTS TABLE
    const tbodyResults = document.getElementById('tbody-results');
    tbodyResults.innerHTML = '';
    
    let sumFinalCostTotalBRL = 0;
    let sumResaleRevenueBRL = 0;
    let sumResaleProfitBRL = 0;
    
    itemsCalculation.forEach(item => {
        const itemFinalCostTotalBRL = item.fobBRL + item.freightBRL + item.insuranceBRL + item.feesBRL + item.iiBRL + item.icmsBRL + (item.ipiBRL || 0) + (item.pisBRL || 0) + (item.cofinsBRL || 0);
        const itemFinalCostUnitBRL = itemFinalCostTotalBRL / item.product.qty;
        
        // Multiplier factor based on cost paid by user vs FOB converted
        const divisor = (item.product.unitPrice * (state.currency === 'BRL' ? 1 : state.exchangeRate));
        const multiplier = divisor > 0 ? itemFinalCostUnitBRL / divisor : 1;
        
        sumFinalCostTotalBRL += itemFinalCostTotalBRL;
        
        // Resale pricing math
        const marginPercent = state.globalMargin || 40;
        const priceVendaUnit = itemFinalCostUnitBRL / (1 - marginPercent / 100);
        const priceVendaTotal = priceVendaUnit * item.product.qty;
        const lucroUnit = priceVendaUnit - itemFinalCostUnitBRL;
        const lucroTotal = lucroUnit * item.product.qty;
        
        sumResaleRevenueBRL += priceVendaTotal;
        sumResaleProfitBRL += lucroTotal;
        
        // Define multiplier badge level
        let multiplierClass = 'low';
        if (multiplier > 1.8) {
            multiplierClass = 'high';
        } else if (multiplier > 1.4) {
            multiplierClass = 'mid';
        }
        
        const tr = document.createElement('tr');
        
        let resaleCells = '';
        if (state.resaleMode) {
            resaleCells = `
                <td class="text-right" style="font-weight: 700; color: var(--success);">
                    R$ ${priceVendaUnit.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">
                        Total: R$ ${priceVendaTotal.toLocaleString('pt-BR', {maximumFractionDigits: 0})}
                    </span>
                </td>
                <td class="text-right" style="font-weight: 600; color: var(--info);">
                    R$ ${lucroUnit.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">
                        Total: R$ ${lucroTotal.toLocaleString('pt-BR', {maximumFractionDigits: 0})}
                    </span>
                </td>
            `;
        }
        
        let taxesCellHtml = '';
        if (state.taxRegime === 'importacao-formal') {
            taxesCellHtml = `
                <div style="font-size:0.68rem; color:var(--text-muted); line-height: 1.35; text-align: right;">
                    II: R$ ${item.iiBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}<br>
                    IPI: R$ ${(item.ipiBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}<br>
                    PIS: R$ ${(item.pisBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}<br>
                    COF: R$ ${(item.cofinsBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}<br>
                    <strong>ICMS: R$ ${item.icmsBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                </div>
            `;
        } else {
            taxesCellHtml = `
                <span style="font-size:0.75rem; color:var(--text-muted); display:block;">
                    II: R$ ${item.iiBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
                ICMS: R$ ${item.icmsBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            `;
        }

        tr.innerHTML = `
            <td style="font-weight:600;">${escapeHtml(item.product.name)}</td>
            <td class="text-right">
                <span style="font-size:0.8rem; color:var(--text-muted); display:block;">
                    ${formatCurrency(item.product.unitPrice, state.currency)} un.
                </span>
                R$ ${item.fobBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} tot.
            </td>
            <td class="text-right">R$ ${item.freightBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-right">R$ ${item.insuranceBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-right">R$ ${item.feesBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-right" style="color:var(--warning); font-weight:500; vertical-align: middle;">
                ${taxesCellHtml}
            </td>
            <td class="text-right highlight-col" style="vertical-align: middle;">R$ ${itemFinalCostUnitBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            ${resaleCells}
            <td class="text-right" style="font-weight: 600; vertical-align: middle;">R$ ${itemFinalCostTotalBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-center" style="vertical-align: middle;">
                <span class="multiplier-badge ${multiplierClass}">${multiplier.toFixed(2)}x</span>
            </td>
        `;
        tbodyResults.appendChild(tr);
    });
    
    // Add Totals Footer Row to Results Table
    const totalFreightFeesBRL = freightBRL + insuranceBRL + feesBRL;
    
    let totalTaxesBRL = totalIIBRL + totalICMSBRL;
    let totalIPIBRL = 0;
    let totalPISBRL = 0;
    let totalCOFINSBRL = 0;
    
    itemsCalculation.forEach(item => {
        totalIPIBRL += item.ipiBRL || 0;
        totalPISBRL += item.pisBRL || 0;
        totalCOFINSBRL += item.cofinsBRL || 0;
    });
    
    if (state.taxRegime === 'importacao-formal') {
        totalTaxesBRL += totalIPIBRL + totalPISBRL + totalCOFINSBRL;
    }

    const avgMultiplier = totalFobBRL > 0 ? sumFinalCostTotalBRL / totalFobBRL : 1;
    
    const trFoot = document.createElement('tr');
    trFoot.style.backgroundColor = 'rgba(30, 41, 59, 0.5)';
    trFoot.style.fontWeight = '700';
    trFoot.style.borderTop = '2px solid var(--border-color)';
    
    let resaleFooterCells = '';
    if (state.resaleMode) {
        resaleFooterCells = `
            <td class="text-right" style="color:var(--success);">R$ ${sumResaleRevenueBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="text-right" style="color:var(--info);">R$ ${sumResaleProfitBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        `;
    }
    
    trFoot.innerHTML = `
        <td>Total Geral</td>
        <td class="text-right">R$ ${totalFobBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="text-right">R$ ${freightBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="text-right">R$ ${insuranceBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="text-right">R$ ${feesBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="text-right" style="color:var(--warning);">R$ ${totalTaxesBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="text-right highlight-col">-</td>
        ${resaleFooterCells}
        <td class="text-right">R$ ${sumFinalCostTotalBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td class="text-center">
            <span class="badge" style="background-color: var(--primary); color:white;">${avgMultiplier.toFixed(2)}x méd</span>
        </td>
    `;
    tbodyResults.appendChild(trFoot);

    // 3.2 RENDER FISCAL MEMORY TABLE (Importação Formal)
    const tbodyResultsFiscal = document.getElementById('tbody-results-fiscal');
    const tfootResultsFiscal = document.getElementById('tfoot-results-fiscal');
    
    if (tbodyResultsFiscal && tfootResultsFiscal) {
        tbodyResultsFiscal.innerHTML = '';
        
        let sumVaBRL = 0;
        let sumII = 0;
        let sumIPI = 0;
        let sumPIS = 0;
        let sumCOFINS = 0;
        let sumICMS = 0;
        let sumTotalImpostos = 0;
        
        itemsCalculation.forEach(item => {
            const rates = item.formalRatesUsed || getProductTaxRates(item.product.ncm);
            const totalItemTaxes = item.iiBRL + item.icmsBRL + (item.ipiBRL || 0) + (item.pisBRL || 0) + (item.cofinsBRL || 0);
            
            sumVaBRL += item.vaBRL;
            sumII += item.iiBRL;
            sumIPI += item.ipiBRL || 0;
            sumPIS += item.pisBRL || 0;
            sumCOFINS += item.cofinsBRL || 0;
            sumICMS += item.icmsBRL;
            sumTotalImpostos += totalItemTaxes;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600;">${escapeHtml(item.product.name)}</td>
                <td class="text-center"><span class="ncm-badge">${item.product.ncm || '-'}</span></td>
                <td class="text-right">R$ ${item.vaBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${rates.ii.toFixed(1)}%</span>
                    R$ ${item.iiBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${rates.ipi.toFixed(1)}%</span>
                    R$ ${(item.ipiBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${rates.pis.toFixed(2)}%</span>
                    R$ ${(item.pisBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${rates.cofins.toFixed(2)}%</span>
                    R$ ${(item.cofinsBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${state.icmsRate.toFixed(1)}%</span>
                    R$ ${item.icmsBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right highlight-col" style="font-weight:700;">
                    R$ ${totalItemTaxes.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
            `;
            tbodyResultsFiscal.appendChild(tr);
        });
        
        tfootResultsFiscal.innerHTML = `
            <tr style="background-color: rgba(30, 41, 59, 0.5); font-weight:700; border-top: 2px solid var(--border-color);">
                <td colspan="2">Totais Consolidados</td>
                <td class="text-right">R$ ${sumVaBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumII.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumIPI.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumPIS.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumCOFINS.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumICMS.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right highlight-col">R$ ${sumTotalImpostos.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
        `;
    }
    
    // 4. UPDATE KPI CARDS
    document.getElementById('kpi-fob-brl').textContent = `R$ ${totalFobBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (state.currency !== 'BRL') {
        document.getElementById('kpi-fob-foreign').textContent = formatCurrency(totalFobForeign, state.currency);
        document.getElementById('kpi-fob-foreign').classList.remove('hidden');
    } else {
        document.getElementById('kpi-fob-foreign').classList.add('hidden');
    }
    
    document.getElementById('kpi-freight-fees-brl').textContent = `R$ ${totalFreightFeesBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const freightFeesPercent = totalFobBRL > 0 ? (totalFreightFeesBRL / totalFobBRL) * 100 : 0;
    document.getElementById('kpi-freight-fees-percentage').textContent = `${freightFeesPercent.toFixed(1)}% do valor FOB`;
    
    document.getElementById('kpi-taxes-brl').textContent = `R$ ${totalTaxesBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const effectiveTaxRate = totalFobBRL > 0 ? (totalTaxesBRL / totalFobBRL) * 100 : 0;
    document.getElementById('kpi-effective-tax-rate').textContent = `Alíquota efetiva: ${effectiveTaxRate.toFixed(1)}%`;
    
    document.getElementById('kpi-final-total-brl').textContent = `R$ ${sumFinalCostTotalBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('kpi-multiplier-total').textContent = `Fator médio: ${avgMultiplier.toFixed(2)}x o custo FOB`;
    
    // Update Resale KPIs
    if (state.resaleMode) {
        document.getElementById('kpi-resale-revenue').textContent = `R$ ${sumResaleRevenueBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        const roi = sumFinalCostTotalBRL > 0 ? (sumResaleProfitBRL / sumFinalCostTotalBRL) * 100 : 0;
        document.getElementById('kpi-resale-profit').textContent = `R$ ${sumResaleProfitBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('kpi-resale-roi').textContent = `ROI estimado: ${roi.toFixed(1)}%`;
        document.getElementById('kpi-resale-margin-avg').textContent = `Margem definida: ${state.globalMargin}%`;
    }
    
    // 5. DRAW VISUALS
    // Chart A: Donut split
    const donutData = [
        { name: 'Custo FOB', value: totalFobBRL, color: '#6366f1' },
        { name: 'Frete', value: freightBRL, color: '#a855f7' },
        { name: 'Seguro', value: insuranceBRL, color: '#ec4899' },
        { name: 'Outras Taxas', value: feesBRL, color: '#14b8a6' },
        { name: 'Impostos', value: totalTaxesBRL, color: '#f59e0b' }
    ];
    renderDonutChart(donutData);
    
    // Chart B: Horizonal stacked bar meters per item
    const barsContainer = document.getElementById('product-cost-bars');
    barsContainer.innerHTML = '';
    
    itemsCalculation.forEach(item => {
        const itemTotal = item.fobBRL + item.freightBRL + item.insuranceBRL + item.feesBRL + item.iiBRL + item.icmsBRL;
        if (itemTotal === 0) return;
        
        const pctFOB = (item.fobBRL / itemTotal) * 100;
        const pctFreight = (item.freightBRL / itemTotal) * 100;
        const pctInsurance = (item.insuranceBRL / itemTotal) * 100;
        const pctFees = (item.feesBRL / itemTotal) * 100;
        const pctTaxes = ((item.iiBRL + item.icmsBRL) / itemTotal) * 100;
        
        const barItem = document.createElement('div');
        barItem.className = 'bar-item';
        
        const itemUnitFinal = itemTotal / item.product.qty;
        const itemUnitOriginal = item.fobBRL / item.product.qty;
        
        barItem.innerHTML = `
            <div class="bar-header">
                <span class="bar-name">${escapeHtml(item.product.name)} (x${item.product.qty})</span>
                <span class="bar-value">
                    <span class="original">R$ ${itemUnitOriginal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    R$ ${itemUnitFinal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} un.
                </span>
            </div>
            <div class="stacked-progress-bar">
                <div class="progress-segment color-product" style="width: ${pctFOB}%" data-tooltip="Custo FOB: ${pctFOB.toFixed(1)}% (R$ ${item.fobBRL.toFixed(0)})"></div>
                ${pctFreight > 0 ? `<div class="progress-segment color-freight" style="width: ${pctFreight}%" data-tooltip="Frete: ${pctFreight.toFixed(1)}% (R$ ${item.freightBRL.toFixed(0)})"></div>` : ''}
                ${pctInsurance > 0 ? `<div class="progress-segment color-insurance" style="width: ${pctInsurance}%" data-tooltip="Seguro: ${pctInsurance.toFixed(1)}% (R$ ${item.insuranceBRL.toFixed(0)})"></div>` : ''}
                ${pctFees > 0 ? `<div class="progress-segment color-fees" style="width: ${pctFees}%" data-tooltip="Taxas: ${pctFees.toFixed(1)}% (R$ ${item.feesBRL.toFixed(0)})"></div>` : ''}
                ${pctTaxes > 0 ? `<div class="progress-segment color-taxes" style="width: ${pctTaxes}%" data-tooltip="Impostos: ${pctTaxes.toFixed(1)}% (R$ ${(item.iiBRL + item.icmsBRL).toFixed(0)})"></div>` : ''}
            </div>
        `;
        barsContainer.appendChild(barItem);
    });
}

// RENDER DONUT
function renderDonutChart(data) {
    const container = document.getElementById('global-cost-donut');
    const legendContainer = document.getElementById('global-cost-legend');
    if (!container || !legendContainer) return;
    
    const r = 40;
    const cx = 50;
    const cy = 50;
    const strokeWidth = 10;
    const circumference = 2 * Math.PI * r;
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    
    if (total === 0) {
        container.innerHTML = `
            <svg viewBox="0 0 100 100" width="100%" height="100%">
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border-color)" stroke-width="${strokeWidth}" />
            </svg>
            <div class="donut-center-text">
                <span class="donut-center-val">R$ 0</span>
                <span class="donut-center-lbl">Total</span>
            </div>
        `;
        legendContainer.innerHTML = '';
        return;
    }
    
    let currentOffset = 0;
    let svgHtml = `<svg viewBox="0 0 100 100" width="100%" height="100%">`;
    let legendHtml = '';
    
    data.forEach(item => {
        if (item.value <= 0) return;
        const percentage = item.value / total;
        const dashArray = `${percentage * circumference} ${circumference}`;
        const dashOffset = -currentOffset;
        
        svgHtml += `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" 
                stroke="${item.color}" 
                stroke-width="${strokeWidth}" 
                stroke-dasharray="${dashArray}" 
                stroke-dashoffset="${dashOffset}"
                class="donut-segment"
                style="transition: var(--transition-smooth);" />
        `;
        
        legendHtml += `
            <div class="legend-item">
                <div class="legend-label-group">
                    <span class="legend-color-box" style="background-color: ${item.color}"></span>
                    <span class="legend-name">${item.name}</span>
                </div>
                <span class="legend-value">
                    R$ ${item.value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} 
                    <span style="color:var(--text-muted); font-size:0.75rem; margin-left:0.25rem;">(${(percentage * 100).toFixed(1)}%)</span>
                </span>
            </div>
        `;
        
        currentOffset += percentage * circumference;
    });
    
    svgHtml += `</svg>
        <div class="donut-center-text">
            <span class="donut-center-val">R$ ${total.toLocaleString('pt-BR', {maximumFractionDigits: 0})}</span>
            <span class="donut-center-lbl">Custo Total</span>
        </div>
    `;
    
    container.innerHTML = svgHtml;
    legendContainer.innerHTML = legendHtml;
}

// FORMAT CURRENCY HELPER
function formatCurrency(val, currency) {
    if (currency === 'USD') {
        return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
    if (currency === 'EUR') {
        return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// EXPORT TO CSV (DELIMITADOR PONTO-E-VÍRGULA COMPATÍVEL COM EXCEL BRASILEIRO)
function exportToCSV() {
    if (state.products.length === 0) return;
    
    const spread = state.exchangeMode === 'complete' ? (state.spread || 0) : 0;
    const iof = state.exchangeMode === 'complete' ? (state.iof || 0) : 0;
    const factorEffectiveBRL = state.currency === 'BRL' ? 1 : state.exchangeRate * (1 + spread/100) * (1 + iof/100);
    const factorOfficialBRL = state.currency === 'BRL' ? 1 : state.exchangeRate;
    
    const freightBRL = state.freightInBRL ? state.freight : state.freight * factorEffectiveBRL;
    const insuranceBRL = state.insuranceInBRL ? state.insurance : state.insurance * factorEffectiveBRL;
    const feesBRL = state.feesInBRL ? state.fees : state.fees * factorEffectiveBRL;
    
    const freightOfficialBRL = state.freightInBRL ? state.freight : state.freight * factorOfficialBRL;
    const insuranceOfficialBRL = state.insuranceInBRL ? state.insurance : state.insurance * factorOfficialBRL;
    
    const totalQty = state.products.reduce((acc, p) => acc + p.qty, 0);
    const totalWeight = state.products.reduce((acc, p) => acc + (p.unitWeight * p.qty), 0);
    const totalFobEffectiveBRL = state.products.reduce((acc, p) => acc + (p.unitPrice * p.qty * factorEffectiveBRL), 0);
    const totalFobOfficialBRL = state.products.reduce((acc, p) => acc + (p.unitPrice * p.qty * factorOfficialBRL), 0);
    const totalOfficialVABRL = totalFobOfficialBRL + freightOfficialBRL + insuranceOfficialBRL;
    
    const totalTaxableOfficialVABRL = state.products
        .filter(p => (p.taxation || 'taxable') === 'taxable')
        .reduce((acc, p) => {
            const itemFobOfficial = p.unitPrice * p.qty * factorOfficialBRL;
            const itemWeight = p.unitWeight * p.qty;
            const freightShare = state.freightSplit === 'weight' && totalWeight > 0 ? (itemWeight / totalWeight) : (itemFobOfficial / totalFobOfficialBRL);
            const insuranceShare = state.insuranceSplit === 'weight' && totalWeight > 0 ? (itemWeight / totalWeight) : (itemFobOfficial / totalFobOfficialBRL);
            return acc + itemFobOfficial + (freightOfficialBRL * freightShare) + (insuranceOfficialBRL * insuranceShare);
        }, 0);

    // Build the CSV rows with semicolon ";" delimiter
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
    csvContent += "sep=;\n"; // Excel indicator for delimiter
    
    let headerStr = "Produto;Tributação;Quantidade;Preço FOB Original;Peso Total (kg);Frete Diluído (R$);Seguro Diluído (R$);Taxas Diluídas (R$);";
    if (state.taxRegime === 'importacao-formal') {
        headerStr += "Imposto II (R$);Imposto IPI (R$);Imposto PIS (R$);Imposto COFINS (R$);Imposto ICMS (R$);";
    } else {
        headerStr += "Imposto II (R$);Imposto ICMS (R$);";
    }
    headerStr += "Custo Final Unitário (R$);Custo Final Total (R$);Fator Multiplicador";
    if (state.resaleMode) {
        headerStr += ";Margem (%);Preço Venda (R$);Lucro Unitário (R$);Lucro Total (R$)";
    }
    csvContent += headerStr + "\n";
    
    state.products.forEach(p => {
        const itemFobEffective = p.unitPrice * p.qty * factorEffectiveBRL;
        const itemFobOfficial = p.unitPrice * p.qty * factorOfficialBRL;
        const itemWeight = p.unitWeight * p.qty;
        
        let freightShare = state.freightSplit === 'weight' && totalWeight > 0 ? (itemWeight / totalWeight) : (itemFobEffective / totalFobEffectiveBRL);
        let insuranceShare = state.insuranceSplit === 'weight' && totalWeight > 0 ? (itemWeight / totalWeight) : (itemFobEffective / totalFobEffectiveBRL);
        
        let feesShare = 0;
        if (state.feesSplit === 'quantity' && totalQty > 0) feesShare = p.qty / totalQty;
        else if (state.feesSplit === 'weight' && totalWeight > 0) feesShare = itemWeight / totalWeight;
        else feesShare = itemFobEffective / totalFobEffectiveBRL;
        
        const itemFreightBRL = freightBRL * freightShare;
        const itemInsuranceBRL = insuranceBRL * insuranceShare;
        const itemFeesBRL = feesBRL * feesShare;
        
        const itemFreightOfficialBRL = freightOfficialBRL * freightShare;
        const itemInsuranceOfficialBRL = insuranceOfficialBRL * insuranceShare;
        const itemVABRL = itemFobOfficial + itemFreightOfficialBRL + itemInsuranceOfficialBRL;
        
        const taxType = p.taxation || 'taxable';
        const totalVAUSD = state.currency === 'USD' 
            ? totalOfficialVABRL / state.exchangeRate 
            : totalOfficialVABRL / 5.50;
            
        const taxResults = calculateItemTaxes(
            itemVABRL, 
            itemFeesBRL, 
            p.ncm, 
            taxType, 
            totalVAUSD, 
            totalTaxableOfficialVABRL, 
            totalWeight, 
            itemWeight, 
            totalOfficialVABRL, 
            p.qty, 
            totalQty
        );
        
        const itemII = taxResults.iiBRL;
        const itemICMS = taxResults.icmsBRL;
        const itemIPI = taxResults.ipiBRL || 0;
        const itemPIS = taxResults.pisBRL || 0;
        const itemCOFINS = taxResults.cofinsBRL || 0;
        
        const itemFinalCostTotal = itemFobEffective + itemFreightBRL + itemInsuranceBRL + itemFeesBRL + itemII + itemICMS + itemIPI + itemPIS + itemCOFINS;
        const itemFinalCostUnit = itemFinalCostTotal / p.qty;
        const multiplier = itemFinalCostUnit / (p.unitPrice * (state.currency === 'BRL' ? 1 : state.exchangeRate));
        
        let taxLabel = "Tributado";
        if (taxType === 'exempt-books') taxLabel = "Isento (Livro)";
        else if (taxType === 'exempt-meds') taxLabel = "Medicamento (Isento II)";
        
        // Convert periods to commas for numbers to open correctly in PT-BR Excel
        const dec = v => v.toFixed(2).replace('.', ',');
        const dec3 = v => v.toFixed(3).replace('.', ',');
        
        let taxesStr = '';
        if (state.taxRegime === 'importacao-formal') {
            taxesStr = `${dec(itemII)};${dec(itemIPI)};${dec(itemPIS)};${dec(itemCOFINS)};${dec(itemICMS)}`;
        } else {
            taxesStr = `${dec(itemII)};${dec(itemICMS)}`;
        }
        
        let rowStr = `"${p.name}";"${taxLabel}";${p.qty};${p.unitPrice.toFixed(2).replace('.', ',')};${dec3(itemWeight)};${dec(itemFreightBRL)};${dec(itemInsuranceBRL)};${dec(itemFeesBRL)};${taxesStr};${dec(itemFinalCostUnit)};${dec(itemFinalCostTotal)};${multiplier.toFixed(2).replace('.', ',')}`;
        if (state.resaleMode) {
            const margin = state.globalMargin || 40;
            const priceVenda = itemFinalCostUnit / (1 - margin / 100);
            const lucroUnit = priceVenda - itemFinalCostUnit;
            const lucroTotal = lucroUnit * p.qty;
            rowStr += `;${margin};${dec(priceVenda)};${dec(lucroUnit)};${dec(lucroTotal)}`;
        }
        csvContent += rowStr + "\n";
    });
    
    // Create download trigger
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "rateio_importacao_simplificada.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// NATIVE EXCEL (.XLSX) EXPORT VIA SHEETJS
function exportToExcel() {
    if (state.products.length === 0) return;
    
    const spread = state.exchangeMode === 'complete' ? (state.spread || 0) : 0;
    const iof = state.exchangeMode === 'complete' ? (state.iof || 0) : 0;
    const factorEffectiveBRL = state.currency === 'BRL' ? 1 : state.exchangeRate * (1 + spread/100) * (1 + iof/100);
    const factorOfficialBRL = state.currency === 'BRL' ? 1 : state.exchangeRate;
    
    const freightBRL = state.freightInBRL ? state.freight : state.freight * factorEffectiveBRL;
    const insuranceBRL = state.insuranceInBRL ? state.insurance : state.insurance * factorEffectiveBRL;
    const feesBRL = state.feesInBRL ? state.fees : state.fees * factorEffectiveBRL;
    
    const freightOfficialBRL = state.freightInBRL ? state.freight : state.freight * factorOfficialBRL;
    const insuranceOfficialBRL = state.insuranceInBRL ? state.insurance : state.insurance * factorOfficialBRL;
    
    const totalQty = state.products.reduce((acc, p) => acc + p.qty, 0);
    const totalWeight = state.products.reduce((acc, p) => acc + (p.unitWeight * p.qty), 0);
    const totalFobEffectiveBRL = state.products.reduce((acc, p) => acc + (p.unitPrice * p.qty * factorEffectiveBRL), 0);
    const totalFobOfficialBRL = state.products.reduce((acc, p) => acc + (p.unitPrice * p.qty * factorOfficialBRL), 0);
    const totalOfficialVABRL = totalFobOfficialBRL + freightOfficialBRL + insuranceOfficialBRL;
    
    const totalTaxableOfficialVABRL = state.products
        .filter(p => (p.taxation || 'taxable') === 'taxable')
        .reduce((acc, p) => {
            const itemFobOfficial = p.unitPrice * p.qty * factorOfficialBRL;
            const itemWeight = p.unitWeight * p.qty;
            const freightShare = state.freightSplit === 'weight' && totalWeight > 0 ? (itemWeight / totalWeight) : (itemFobOfficial / totalFobOfficialBRL);
            const insuranceShare = state.insuranceSplit === 'weight' && totalWeight > 0 ? (itemWeight / totalWeight) : (itemFobOfficial / totalFobOfficialBRL);
            return acc + itemFobOfficial + (freightOfficialBRL * freightShare) + (insuranceOfficialBRL * insuranceShare);
        }, 0);

    const rows = [];
    
    // Headers
    const headers = [
        "Produto",
        "Tributação",
        "Quantidade",
        `Preço Unit. FOB (${state.currency})`,
        "Peso Unit. (kg)",
        "Peso Total (kg)",
        "Custo FOB (R$)",
        "Frete Diluído (R$)",
        "Seguro Diluído (R$)",
        "Taxas Diluídas (R$)"
    ];
    
    if (state.taxRegime === 'importacao-formal') {
        headers.push("Imposto II (R$)");
        headers.push("Imposto IPI (R$)");
        headers.push("Imposto PIS (R$)");
        headers.push("Imposto COFINS (R$)");
        headers.push("Imposto ICMS (R$)");
    } else {
        headers.push("Imposto Importação II (R$)");
        headers.push("Imposto ICMS (R$)");
    }
    
    headers.push("Custo Final Unitário (R$)");
    headers.push("Custo Final Total (R$)");
    headers.push("Fator Multiplicador (x)");
    
    if (state.resaleMode) {
        headers.push("Margem Desejada (%)");
        headers.push("Preço de Venda Sugerido (R$)");
        headers.push("Lucro Unitário (R$)");
        headers.push("Lucro Total (R$)");
    }
    
    rows.push(headers);
    
    state.products.forEach(p => {
        const itemFobEffective = p.unitPrice * p.qty * factorEffectiveBRL;
        const itemFobOfficial = p.unitPrice * p.qty * factorOfficialBRL;
        const itemWeightTotal = p.unitWeight * p.qty;
        
        let freightShare = state.freightSplit === 'weight' && totalWeight > 0 ? (itemWeightTotal / totalWeight) : (itemFobEffective / totalFobEffectiveBRL);
        let insuranceShare = state.insuranceSplit === 'weight' && totalWeight > 0 ? (itemWeightTotal / totalWeight) : (itemFobEffective / totalFobEffectiveBRL);
        
        let feesShare = 0;
        if (state.feesSplit === 'quantity' && totalQty > 0) feesShare = p.qty / totalQty;
        else if (state.feesSplit === 'weight' && totalWeight > 0) feesShare = itemWeightTotal / totalWeight;
        else feesShare = itemFobEffective / totalFobEffectiveBRL;
        
        const itemFreightBRL = freightBRL * freightShare;
        const itemInsuranceBRL = insuranceBRL * insuranceShare;
        const itemFeesBRL = feesBRL * feesShare;
        
        const itemFreightOfficialBRL = freightOfficialBRL * freightShare;
        const itemInsuranceOfficialBRL = insuranceOfficialBRL * insuranceShare;
        const itemVABRL = itemFobOfficial + itemFreightOfficialBRL + itemInsuranceOfficialBRL;
        
        const taxType = p.taxation || 'taxable';
        const totalVAUSD = state.currency === 'USD' 
            ? totalOfficialVABRL / state.exchangeRate 
            : totalOfficialVABRL / 5.50;
            
        const taxResults = calculateItemTaxes(
            itemVABRL, 
            itemFeesBRL, 
            p.ncm, 
            taxType, 
            totalVAUSD, 
            totalTaxableOfficialVABRL, 
            totalWeight, 
            itemWeightTotal, 
            totalOfficialVABRL, 
            p.qty, 
            totalQty
        );
        
        const iiBRL = taxResults.iiBRL;
        const icmsBRL = taxResults.icmsBRL;
        const ipiBRL = taxResults.ipiBRL || 0;
        const pisBRL = taxResults.pisBRL || 0;
        const cofinsBRL = taxResults.cofinsBRL || 0;
        
        const itemFinalCostTotal = itemFobEffective + itemFreightBRL + itemInsuranceBRL + itemFeesBRL + iiBRL + icmsBRL + ipiBRL + pisBRL + cofinsBRL;
        const itemFinalCostUnit = itemFinalCostTotal / p.qty;
        const multiplier = itemFinalCostUnit / (p.unitPrice * (state.currency === 'BRL' ? 1 : state.exchangeRate));
        
        let taxLabel = "Tributado";
        if (taxType === 'exempt-books') taxLabel = "Isento (Livro)";
        else if (taxType === 'exempt-meds') taxLabel = "Medicamento (Isento II)";
        
        const row = [
            p.name,
            taxLabel,
            p.qty,
            p.unitPrice,
            p.unitWeight,
            itemWeightTotal,
            itemFobEffective,
            itemFreightBRL,
            itemInsuranceBRL,
            itemFeesBRL
        ];
        
        if (state.taxRegime === 'importacao-formal') {
            row.push(iiBRL);
            row.push(ipiBRL);
            row.push(pisBRL);
            row.push(cofinsBRL);
            row.push(icmsBRL);
        } else {
            row.push(iiBRL);
            row.push(icmsBRL);
        }
        
        row.push(itemFinalCostUnit);
        row.push(itemFinalCostTotal);
        row.push(parseFloat(multiplier.toFixed(2)));
        
        if (state.resaleMode) {
            const margin = state.globalMargin || 40;
            const priceVenda = itemFinalCostUnit / (1 - margin / 100);
            const lucroUnit = priceVenda - itemFinalCostUnit;
            const lucroTotal = lucroUnit * p.qty;
            row.push(margin);
            row.push(priceVenda);
            row.push(lucroUnit);
            row.push(lucroTotal);
        }
        
        rows.push(row);
    });
    
    // Convert array to worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rateio de Custos");
    
    // Auto-fit columns
    const max_cols = rows[0].length;
    const col_widths = [];
    for (let c = 0; c < max_cols; c++) {
        let max_len = 10;
        for (let r = 0; r < rows.length; r++) {
            const cell = rows[r][c];
            if (cell !== null && cell !== undefined) {
                const len = cell.toString().length;
                if (len > max_len) max_len = len;
            }
        }
        col_widths.push({ wch: max_len + 3 });
    }
    worksheet['!cols'] = col_widths;
    
    // Save workbook
    XLSX.writeFile(workbook, "rateio_custos_importacao.xlsx");
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================

async function checkAuthSession() {
    try {
        const sessionUser = await window.db.getSession();
        if (sessionUser) {
            state.currentUser = sessionUser;
        } else {
            state.currentUser = null;
        }
        
        // Atualiza a tabela de histórico assim que confirmar o status de login
        if (typeof renderHistoryTable === 'function') renderHistoryTable();
        if (state.currentUser && typeof loadReviews === 'function') loadReviews();
        if (state.currentUser && typeof loadCatalogStatus === 'function') loadCatalogStatus();
        if (state.currentUser && typeof loadPromotionsStatus === 'function') loadPromotionsStatus();
        if (state.currentUser && typeof loadCheckStatus === 'function') loadCheckStatus();
    } catch (e) {
        console.error('Erro ao verificar sessão de login no Supabase:', e);
        state.currentUser = null;
        if (typeof renderHistoryTable === 'function') renderHistoryTable();
    }
}

function registerAuthEventListeners() {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const btnLogout = document.getElementById('btn-logout');

    // Tab Switching
    if (tabLogin && tabRegister && formLogin && formRegister) {
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            formLogin.classList.remove('hidden');
            formRegister.classList.add('hidden');
            clearAuthAlerts();
        });

        tabRegister.addEventListener('click', () => {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            formRegister.classList.remove('hidden');
            formLogin.classList.add('hidden');
            clearAuthAlerts();
        });
    }

    // Login Form Submit
    const resendBtn = document.getElementById('btn-resend-confirmation');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim().toLowerCase();
            const password = document.getElementById('login-password').value;
            const alertEl = document.getElementById('login-alert');
            if (resendBtn) resendBtn.classList.add('hidden');

            try {
                showAuthAlert(alertEl, 'success', 'Conectando ao servidor...');

                const { data, error } = await window.db.signIn(email, password);

                if (error) {
                    let msg = 'E-mail ou senha incorretos.';
                    if (error.message && error.message.includes('Email not confirmed')) {
                        msg = 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada (e o spam).';
                        if (resendBtn) {
                            resendBtn.classList.remove('hidden');
                            resendBtn.dataset.email = email;
                        }
                    } else if (error.message) {
                        msg = error.message.includes('Invalid login') ? msg : error.message;
                    }
                    showAuthAlert(alertEl, 'error', msg);
                    return;
                }

                // Success
                await checkAuthSession();
                showAuthAlert(alertEl, 'success', `Acesso liberado! Bem-vindo(a)!`);
                
                setTimeout(() => {
                    formLogin.reset();
                    clearAuthAlerts();
                    updateUI();
                }, 1000);

            } catch (err) {
                console.error(err);
                showAuthAlert(alertEl, 'error', 'Erro: ' + err.message);
            }
        });
    }

    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            const email = resendBtn.dataset.email;
            const alertEl = document.getElementById('login-alert');
            if (!email) return;
            resendBtn.disabled = true;
            try {
                const { error } = await window.db.resendConfirmation(email);
                if (error) {
                    showAuthAlert(alertEl, 'error', 'Não foi possível reenviar agora: ' + error.message);
                } else {
                    showAuthAlert(alertEl, 'success', `E-mail de confirmação reenviado para ${email}. Verifique sua caixa de entrada (e o spam).`);
                    resendBtn.classList.add('hidden');
                }
            } catch (err) {
                showAuthAlert(alertEl, 'error', 'Erro ao reenviar o e-mail.');
            } finally {
                resendBtn.disabled = false;
            }
        });
    }

    // Register Form Submit
    if (formRegister) {
        formRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim().toLowerCase();
            const password = document.getElementById('reg-password').value;
            const alertEl = document.getElementById('register-alert');

            if (password.length < 6) {
                showAuthAlert(alertEl, 'error', 'A senha precisa ter pelo menos 6 caracteres.');
                return;
            }

            try {
                showAuthAlert(alertEl, 'success', 'Criando conta no servidor...');

                const { data, error } = await window.db.signUp(email, password, name);

                if (error) {
                    showAuthAlert(alertEl, 'error', error.message || 'Erro ao criar conta. O e-mail pode já estar em uso.');
                    return;
                }

                // Se a confirmação de e-mail estiver ativa no Supabase, a conta é
                // criada mas não vem com sessão — o acesso só libera depois que a
                // pessoa clicar no link enviado por e-mail.
                if (data.user && !data.session) {
                    formRegister.reset();
                    showAuthAlert(alertEl, 'success', `Conta criada! Enviamos um e-mail de confirmação para ${email}. Clique no link recebido para liberar o acesso (confira também a caixa de spam).`);
                    return;
                }

                // Confirmação de e-mail desativada — sessão já vem pronta, loga direto
                await checkAuthSession();

                showAuthAlert(alertEl, 'success', 'Conta criada com sucesso! Carregando...');

                setTimeout(() => {
                    formRegister.reset();
                    clearAuthAlerts();
                    tabLogin.click();
                    updateUI();
                }, 1500);

            } catch (err) {
                console.error(err);
                showAuthAlert(alertEl, 'error', 'Ocorreu um erro no cadastro.');
            }
        });
    }

    // Logout Button
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (await showConfirm('Tem certeza de que deseja sair?', { title: 'Sair do sistema', confirmText: 'Sair' })) {
                await window.db.signOut();
                state.currentUser = null;
                updateUI();
            }
        });
    }
}

function showAuthAlert(element, type, message) {
    if (!element) return;
    element.textContent = message;
    element.className = `auth-alert ${type}`;
    element.classList.remove('hidden');
}

function clearAuthAlerts() {
    const loginAlert = document.getElementById('login-alert');
    const registerAlert = document.getElementById('register-alert');
    const resendBtn = document.getElementById('btn-resend-confirmation');
    if (loginAlert) {
        loginAlert.className = 'auth-alert hidden';
        loginAlert.textContent = '';
    }
    if (registerAlert) {
        registerAlert.className = 'auth-alert hidden';
        registerAlert.textContent = '';
    }
    if (resendBtn) resendBtn.classList.add('hidden');
}

// Ilustração animada da tela de login: contêiner do logo sem o fundo branco,
// rotas marítimas pontilhadas com mini navios, e faíscas saindo da ponta da seta do logo.
function initAuthArt() {
    const canvas = document.getElementById('auth-art-canvas');
    const logoWrap = document.getElementById('auth-logo-wrap');
    const logoSource = document.getElementById('auth-logo-source');
    const logoCanvas = document.getElementById('auth-logo-canvas');
    if (!canvas || !logoWrap || !logoSource || !logoCanvas) return;

    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const TEAL_DEEP = '#0f5c58';
    const NEON_A = '255,90,140';  // neon pink core
    const NEON_B = '255,150,60';  // warm orange halo
    const BLUE = '70,150,255';    // ocean-blue accent mixed into the sparks

    function dpr() { return Math.max(1, window.devicePixelRatio || 1); }

    // Remove o fundo branco chapado do PNG do logo (chroma-key por luminosidade)
    function processLogo() {
        const iw = logoSource.naturalWidth, ih = logoSource.naturalHeight;
        if (!iw || !ih) return;
        const off = document.createElement('canvas');
        off.width = iw; off.height = ih;
        const octx = off.getContext('2d');
        octx.drawImage(logoSource, 0, 0, iw, ih);
        const imgData = octx.getImageData(0, 0, iw, ih);
        const d = imgData.data;
        const lo = 235, hi = 250; // faixa de transição para não deixar serrilhado
        for (let i = 0; i < d.length; i += 4) {
            const whiteness = Math.min(d[i], d[i+1], d[i+2]);
            if (whiteness >= hi) {
                d[i+3] = 0;
            } else if (whiteness > lo) {
                const f = (whiteness - lo) / (hi - lo);
                d[i+3] = d[i+3] * (1 - f);
            }
        }
        octx.putImageData(imgData, 0, 0);
        logoCanvas.width = iw; logoCanvas.height = ih;
        logoCanvas.getContext('2d').drawImage(off, 0, 0);
    }
    if (logoSource.complete && logoSource.naturalWidth) {
        processLogo();
    } else {
        logoSource.addEventListener('load', processLogo);
    }

    let W = 0, H = 0;
    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        W = rect.width; H = rect.height;
        const d = dpr();
        canvas.width = W * d; canvas.height = H * d;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    function anchors() {
        const stageRect = canvas.parentElement.getBoundingClientRect();
        const logoRect = logoWrap.getBoundingClientRect();
        // geometria aproximada da seta dentro da arte quadrada do logo
        const tip = {
            x: (logoRect.left - stageRect.left) + logoRect.width * 0.81,
            y: (logoRect.top - stageRect.top) + logoRect.height * 0.15
        };
        const base = {
            x: (logoRect.left - stageRect.left) + logoRect.width * 0.40,
            y: (logoRect.top - stageRect.top) + logoRect.height * 0.74
        };
        const dx = tip.x - base.x, dy = tip.y - base.y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        return { tip, dir: { x: dx/len, y: dy/len } };
    }

    function drawShip(x, y, scale, rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation || 0);
        ctx.scale(scale, scale);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(7, 6); ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.fillStyle = TEAL_DEEP;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-1, 0); ctx.lineTo(-1, -13); ctx.lineTo(8, -3);
        ctx.closePath();
        ctx.fillStyle = TEAL_DEEP;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.restore();
    }

    function drawDottedPath(pts, dashOffset, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([2, 8]);
        ctx.lineDashOffset = dashOffset;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
        ctx.stroke();
        ctx.restore();
    }

    function drawRoute(t) {
        const routeA = [{x:0,y:H*0.80},{x:W*0.28,y:H*0.58},{x:W*0.62,y:H*0.98},{x:W,y:H*0.30}];
        const routeB = [{x:0,y:H*0.18},{x:W*0.22,y:H*0.34},{x:W*0.58,y:H*0.02},{x:W,y:H*0.16}];
        drawDottedPath(routeA, -(t/45), TEAL_DEEP, 0.22);
        drawDottedPath(routeB, -(t/60), TEAL_DEEP, 0.15);

        [[0,0.80],[0.34,0.66],[0.68,0.86]].forEach(p => {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = TEAL_DEEP;
            ctx.beginPath();
            ctx.arc(W*p[0], H*p[1], 2.8, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        });
        drawShip(W*1, H*0.30, 1, -0.35);

        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = TEAL_DEEP;
        ctx.beginPath();
        ctx.arc(W*0.22, H*0.34, 2.4, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
        drawShip(W*0.58, H*0.10, 0.8, -0.12);
    }

    let particles = [];
    function spawnParticle(anchor) {
        const jitter = (Math.random()-0.5)*0.6;
        const perp = { x: -anchor.dir.y, y: anchor.dir.x };
        particles.push({
            x: anchor.tip.x + perp.x*jitter*10,
            y: anchor.tip.y + perp.y*jitter*10,
            dx: anchor.dir.x*(1.6+Math.random()*1.1) + perp.x*jitter*0.5,
            dy: anchor.dir.y*(1.6+Math.random()*1.1) + perp.y*jitter*0.5,
            life: 0,
            maxLife: 55+Math.random()*40,
            size: 2.2+Math.random()*2.8,
            blue: Math.random() < 0.35
        });
    }

    function drawParticles(anchor) {
        if (Math.random() < 0.4) spawnParticle(anchor);
        particles = particles.filter(p => p.life < p.maxLife);
        particles.forEach(p => {
            p.x += p.dx; p.y += p.dy; p.life++;
            const t = p.life / p.maxLife;
            const alpha = (1-t) * 0.5;
            const col = p.blue ? `rgb(${BLUE})` : (t < 0.45 ? `rgb(${NEON_A})` : `rgb(${NEON_B})`);
            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.fillStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size*0.7*(1-t*0.35), 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        });
    }

    function drawNeon(anchor, t) {
        ctx.save();
        [[46,0.10],[26,0.15],[12,0.20]].forEach(layer => {
            const g = ctx.createRadialGradient(anchor.tip.x, anchor.tip.y, 0, anchor.tip.x, anchor.tip.y, layer[0]);
            g.addColorStop(0, `rgba(${NEON_A},${layer[1]})`);
            g.addColorStop(0.6, `rgba(${NEON_B},${layer[1]*0.5})`);
            g.addColorStop(1, `rgba(${NEON_B},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(anchor.tip.x, anchor.tip.y, layer[0], 0, Math.PI*2);
            ctx.fill();
        });
        ctx.fillStyle = 'rgba(255,235,225,0.55)';
        ctx.shadowColor = `rgba(${NEON_A},0.6)`;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(anchor.tip.x, anchor.tip.y, 2.2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        const period = 3800;
        const phase = (t % period) / period;
        const eased = Math.sin(phase*Math.PI);
        const r = 18 + phase*70;
        const band = 24;
        const alpha = eased*0.18;
        ctx.save();
        const pg = ctx.createRadialGradient(anchor.tip.x, anchor.tip.y, Math.max(0,r-band), anchor.tip.x, anchor.tip.y, r+band);
        pg.addColorStop(0, `rgba(${NEON_A},0)`);
        pg.addColorStop(0.5, `rgba(${NEON_A},${alpha})`);
        pg.addColorStop(1, `rgba(${NEON_B},0)`);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(anchor.tip.x, anchor.tip.y, r+band, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }

    function render(t) {
        if (W === 0) resize();
        ctx.clearRect(0, 0, W, H);
        const anchor = anchors();
        drawRoute(t);
        drawNeon(anchor, t);
        drawParticles(anchor);
    }

    if (reduceMotion) {
        resize();
        render(0);
    } else {
        let start = null;
        function loop(ts) {
            if (start === null) start = ts;
            render(ts - start);
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
}

// ==========================================
// SUBSCRIPTION & TRIAL LOGIC
// ==========================================

const PAYMENT_LINK = "https://mpago.la/2vWGgwT";

async function updateUserInLocalStorage(user) {
    try {
        if (state.currentUser && state.currentUser.email === user.email) {
            state.currentUser = { ...state.currentUser, ...user };
        }
        await window.db.updateProfile({
            name: user.name,
            is_subscribed: user.isSubscribed,
            subscription_expires_at: user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toISOString() : null
        });
    } catch (e) {
        console.error('Erro ao atualizar usuário no Supabase:', e);
    }
}

function checkSubscriptionStatus(user) {
    if (!user) return { hasAccess: false, isTrial: false, daysRemaining: 0, isSubscribed: false };
    
    // Novo padrão: Webhook do Stripe atualiza a coluna is_pro no banco
    if (user.is_pro) {
        return { hasAccess: true, isTrial: false, daysRemaining: 30, isSubscribed: true };
    }
    
    // Retrocompatibilidade
    if (user.is_subscribed || user.isSubscribed) {
        return { hasAccess: true, isTrial: false, daysRemaining: 30, isSubscribed: true };
    }
    
    // Trial check (7 days = 604800000 ms) for new accounts
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : Date.now();
    const expiryTime = createdAt + (7 * 24 * 60 * 60 * 1000);
    const timeLeft = expiryTime - Date.now();
    
    if (timeLeft > 0) {
        const days = Math.ceil(timeLeft / (1000 * 24 * 60 * 60));
        return { hasAccess: true, isTrial: true, daysRemaining: days, isSubscribed: false };
    }
    
    return { hasAccess: false, isTrial: false, daysRemaining: 0, isSubscribed: false };
}

function registerSubscriptionEventListeners() {
    const btnOpenPayment = document.getElementById('btn-open-payment');
    const btnBannerSubscribe = document.getElementById('btn-banner-subscribe');
    const btnClosePayment = document.getElementById('btn-close-payment');
    const paymentModal = document.getElementById('payment-modal');
    
    const btnConfirmRealPayment = document.getElementById('btn-confirm-real-payment');
    const paymentLoading = document.getElementById('payment-loading');
    const btnPaywallLogout = document.getElementById('btn-paywall-logout');

    // Modal control utility
    const openModal = () => {
        if (paymentModal) {
            paymentModal.classList.remove('hidden');
        }
    };

    // Open Payment Modal
    if (btnOpenPayment) {
        btnOpenPayment.addEventListener('click', openModal);
    }
    if (btnBannerSubscribe) {
        btnBannerSubscribe.addEventListener('click', openModal);
    }

    // Close Payment Modal
    if (btnClosePayment) {
        btnClosePayment.addEventListener('click', () => {
            if (paymentModal) paymentModal.classList.add('hidden');
        });
    }

    // Paywall Logout
    if (btnPaywallLogout) {
        btnPaywallLogout.addEventListener('click', () => {
            state.currentUser = null;
            localStorage.removeItem('import_rateio_logged_user');
            updateUI();
        });
    }

    const btnMpCheckout = document.getElementById('btn-mp-checkout');
    const btnMpSubscription = document.getElementById('btn-mp-subscription');
    const mpLoading = document.getElementById('mp-loading');

    const handleMpClick = async (apiEndpoint, btnElement) => {
        const session = await window.db.getSession();
        if (!session || !session.id) {
            showToast("Você precisa estar logado para assinar o plano.", 'error');
            return;
        }
        
        // UI Feedback
        if(btnMpCheckout) btnMpCheckout.disabled = true;
        if(btnMpSubscription) btnMpSubscription.disabled = true;
        if(mpLoading) mpLoading.style.display = 'block';
        
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ userId: session.id })
            });
            
            const data = await response.json();
            
            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                showToast('Erro ao gerar link de pagamento: ' + (data.error || 'Erro desconhecido'), 'error');
                if(btnMpCheckout) btnMpCheckout.disabled = false;
                if(btnMpSubscription) btnMpSubscription.disabled = false;
                if(mpLoading) mpLoading.style.display = 'none';
            }
        } catch (error) {
            console.error('Erro na chamada MP:', error);
            showToast('Erro de conexão ao gerar pagamento.', 'error');
            if(btnMpCheckout) btnMpCheckout.disabled = false;
            if(btnMpSubscription) btnMpSubscription.disabled = false;
            if(mpLoading) mpLoading.style.display = 'none';
        }
    };

    if (btnMpCheckout) {
        btnMpCheckout.addEventListener('click', () => handleMpClick('/api/mp-checkout', btnMpCheckout));
    }
    
    if (btnMpSubscription) {
        btnMpSubscription.addEventListener('click', () => handleMpClick('/api/mp-subscription', btnMpSubscription));
    }
}

// ==========================================
// DASHBOARD ROUTING & MULTI-MODULE LOGIC
// ==========================================

// Global state hooks
state.catalog = [];
state.history = [];
state.company = null;

// Initialize navigation on load
document.addEventListener('DOMContentLoaded', () => {
    initDashboardNavigation();
    initCatalogModule();
    initCompanyModule();
    initDocumentsModule();
    initFeasibilityModule();
    initHistoryModule();
    initReviewsModule();
    initCatalogStatusModule();
    initPromotionsModule();
    startNotificationPolling();
});

// ==========================================
// AVALIAÇÕES DO MERCADO LIVRE (checadas por api/ml-reviews.js via cron externo)
// ==========================================

function updateReviewsBadge(count) {
    const badge = document.getElementById('nav-badge-reviews');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (diffDays <= 0) return 'hoje';
    if (diffDays === 1) return 'há 1 dia';
    if (diffDays < 30) return `há ${diffDays} dias`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return 'há 1 mês';
    if (diffMonths < 12) return `há ${diffMonths} meses`;
    const diffYears = Math.floor(diffMonths / 12);
    return diffYears === 1 ? 'há 1 ano' : `há ${diffYears} anos`;
}

function starsText(rating) {
    const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// Foto pequena do produto, reaproveitada nos cards de Avaliações, Catálogo e
// Promoções — os três já recebem o mesmo item_thumbnail do backend.
function buildThumbnailImg(src, size) {
    const px = `${size || 48}px`;
    if (!src) {
        const placeholder = document.createElement('div');
        placeholder.style.width = px;
        placeholder.style.height = px;
        placeholder.style.borderRadius = 'var(--border-radius-md, 8px)';
        placeholder.style.flexShrink = '0';
        placeholder.style.background = 'var(--secondary)';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        return placeholder;
    }

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.style.width = px;
    img.style.height = px;
    img.style.objectFit = 'cover';
    img.style.borderRadius = 'var(--border-radius-md, 8px)';
    img.style.flexShrink = '0';
    return img;
}

// As avaliações vêm de compradores (texto livre) — nunca usar innerHTML com esses
// campos, sempre textContent, para não abrir XSS armazenado no painel. O backend já
// devolve só o produto avaliado mais recentemente, 1 card por produto (até 10).
// O Mercado Livre replica a mesma avaliação em todas as publicações vinculadas como
// variação de cor/tamanho — a API não informa qual variação foi realmente comprada,
// então agrupamos aqui pra não mostrar o mesmo comentário repetido em cada cor.
function groupDuplicateReviews(reviews) {
    const groups = [];
    const byKey = new Map();
    reviews.forEach(r => {
        const key = `${r.rating}|${r.reviewed_at}|${r.comment}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.alsoTitles.push(r.item_title || r.ml_item_id);
        } else {
            const group = { ...r, alsoTitles: [] };
            byKey.set(key, group);
            groups.push(group);
        }
    });
    return groups;
}

function buildReviewCard(r) {
    const card = document.createElement('section');
    card.className = 'card';
    card.style.marginBottom = '0.75rem';
    card.style.opacity = r.is_read ? '0.7' : '1';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.gap = '0.75rem';
    header.style.alignItems = 'flex-start';

    header.appendChild(buildThumbnailImg(r.item_thumbnail, 56));

    const infoDiv = document.createElement('div');
    infoDiv.style.flex = '1';
    infoDiv.style.minWidth = '0';

    const title = document.createElement('strong');
    title.textContent = r.item_title || r.ml_item_id;
    title.style.display = 'block';
    title.style.marginBottom = '0.2rem';
    infoDiv.appendChild(title);

    const statsP = document.createElement('p');
    statsP.className = 'small';
    statsP.style.color = 'var(--text-muted)';
    statsP.style.margin = '0';

    const avgStarsSpan = document.createElement('span');
    avgStarsSpan.style.color = 'var(--primary)';
    avgStarsSpan.textContent = starsText(r.item_rating_average) + ' ';
    statsP.appendChild(avgStarsSpan);

    const avgLabel = r.item_rating_average != null
        ? Number(r.item_rating_average).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : '—';
    const totalCount = r.item_rating_count || 0;
    statsP.appendChild(document.createTextNode(`${avgLabel} · ${totalCount} avaliaç${totalCount === 1 ? 'ão' : 'ões'}`));
    infoDiv.appendChild(statsP);

    header.appendChild(infoDiv);
    card.appendChild(header);

    const highlight = document.createElement('div');
    highlight.style.background = 'var(--secondary)';
    highlight.style.borderLeft = '3px solid var(--primary)';
    highlight.style.borderRadius = '6px';
    highlight.style.padding = '0.6rem 0.75rem';
    highlight.style.marginTop = '0.6rem';

    const reviewHeader = document.createElement('div');
    reviewHeader.style.display = 'flex';
    reviewHeader.style.justifyContent = 'space-between';
    reviewHeader.style.alignItems = 'center';
    reviewHeader.style.gap = '0.5rem';

    const reviewStars = document.createElement('span');
    reviewStars.style.color = 'var(--primary)';
    reviewStars.style.fontWeight = '700';
    reviewStars.textContent = starsText(r.rating);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'small';
    timeSpan.style.color = 'var(--text-muted)';
    timeSpan.textContent = timeAgo(r.reviewed_at);

    reviewHeader.appendChild(reviewStars);
    reviewHeader.appendChild(timeSpan);
    highlight.appendChild(reviewHeader);

    const commentP = document.createElement('p');
    commentP.style.margin = '0.35rem 0 0';
    commentP.textContent = r.comment || 'Sem comentário.';
    highlight.appendChild(commentP);

    card.appendChild(highlight);

    if (r.alsoTitles && r.alsoTitles.length > 0) {
        const alsoP = document.createElement('p');
        alsoP.className = 'small';
        alsoP.style.color = 'var(--text-muted)';
        alsoP.style.marginTop = '0.5rem';
        alsoP.textContent = `O Mercado Livre também mostra esta avaliação em: ${r.alsoTitles.join(', ')}`;
        card.appendChild(alsoP);
    }
    return card;
}

function renderReviewsList(reviews) {
    renderIntoList('reviews-list', 'reviews-empty', groupDuplicateReviews(reviews || []), buildReviewCard);
}

async function loadReviews() {
    if (!state.currentUser) {
        updateReviewsBadge(0);
        return;
    }
    const data = await mlApiFetch('/api/ml-reviews');
    updateReviewsBadge(data ? data.unreadCount : 0);
    renderReviewsList(data ? data.reviews : []);
}

async function markReviewsRead(payload) {
    if (!state.currentUser) return;
    try {
        await fetch('/api/ml-reviews', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('Erro ao marcar avaliações como lidas:', err);
    }
    await loadReviews();
}

function initReviewsModule() {
    const btnMarkAll = document.getElementById('btn-mark-all-reviews-read');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', () => markReviewsRead({ all: true }));
    }
}

// ==========================================
// STATUS DE CATÁLOGO (ganhando/perdendo a competição por anúncio)
// ==========================================

const CATALOG_STATUS_LABELS = {
    winning: { label: 'Ganhando', color: 'var(--success)' },
    sharing_first_place: { label: 'Empatado em 1º', color: 'var(--primary)' },
    competing: { label: 'Perdendo', color: 'var(--danger, #ef4444)' },
    listed: { label: 'Fora da disputa', color: 'var(--text-muted)' },
    not_listed: { label: 'Fora do catálogo', color: 'var(--text-muted)' },
};

const CATALOG_REASON_LABELS = {
    non_trusted_seller: 'Vendedor marcado como não confiável',
    reputation_below_threshold: 'Reputação abaixo do mínimo exigido',
    winner_has_better_reputation: 'O ganhador tem reputação melhor',
    manufacturing_time: 'Anúncio com prazo de fabricação (ganhador tem estoque imediato)',
    temporarily_winning_manufacturing_time: 'Ganhando temporariamente (prazo de fabricação, sem concorrente melhor no momento)',
    temporarily_competing_manufacturing_time: 'Competindo (prazo de fabricação, o ganhador também tem prazo)',
    temporarily_winning_best_reputation_available: 'Ganhando temporariamente (melhor oferta disponível no momento)',
    temporarily_competing_best_reputation_available: 'Competindo (mesma reputação do ganhador, sem estar à frente)',
    item_paused: 'Anúncio pausado',
    item_not_opted_in: 'Anúncio não participa do catálogo',
    shipping_mode: 'Modalidade de envio inferior à do ganhador',
    newbie_program_seller: 'Limite do programa para vendedores novos atingido',
};

function updateCatalogBadge(count) {
    const badge = document.getElementById('nav-badge-catalog');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function buildCatalogCard(item) {
    const card = document.createElement('section');
    card.className = 'card';
    card.style.marginBottom = '0.75rem';
    card.style.opacity = item.is_read ? '0.7' : '1';

    const header = document.createElement('div');
    header.className = 'item-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'item-card-title-group';

    titleGroup.appendChild(buildThumbnailImg(item.item_thumbnail));

    const title = document.createElement('strong');
    title.textContent = item.item_title || item.ml_item_id;
    titleGroup.appendChild(title);

    const statusInfo = CATALOG_STATUS_LABELS[item.status] || { label: item.status, color: 'var(--text-muted)' };
    const statusSpan = document.createElement('span');
    statusSpan.className = 'item-card-status';
    statusSpan.style.color = statusInfo.color;
    statusSpan.textContent = statusInfo.label;

    header.appendChild(titleGroup);
    header.appendChild(statusSpan);

    const detailP = document.createElement('p');
    detailP.className = 'small';
    detailP.style.color = 'var(--text-muted)';
    detailP.style.marginBottom = '0.35rem';
    const priceParts = [];
    if (item.current_price != null) priceParts.push(`Seu preço: R$ ${Number(item.current_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    if (item.status !== 'winning' && item.price_to_win != null) priceParts.push(`Preço pra ganhar: R$ ${Number(item.price_to_win).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    detailP.textContent = priceParts.join(' · ');

    card.appendChild(header);
    card.appendChild(detailP);

    if (item.reason) {
        const reasonP = document.createElement('p');
        reasonP.className = 'small';
        reasonP.style.color = 'var(--text-muted)';
        reasonP.style.marginBottom = '0.35rem';
        reasonP.textContent = item.reason.split(', ').map(r => CATALOG_REASON_LABELS[r] || r).join(' · ');
        card.appendChild(reasonP);
    }

    const dateP = document.createElement('p');
    dateP.className = 'small';
    dateP.style.color = 'var(--text-muted)';
    dateP.textContent = item.updated_at ? `Verificado em ${new Date(item.updated_at).toLocaleString('pt-BR')}` : '';
    card.appendChild(dateP);

    // Link direto pra tela de edição só faz sentido pra quem não está ganhando —
    // precisa do user_product_id (padrão de URL confirmado com o usuário).
    if (item.status !== 'winning' && item.user_product_id) {
        const editLink = document.createElement('a');
        editLink.className = 'btn btn-secondary btn-sm';
        editLink.style.marginTop = '0.5rem';
        editLink.style.display = 'inline-block';
        editLink.href = `https://www.mercadolivre.com.br/anuncios/${encodeURIComponent(item.user_product_id)}/modificar/bomni/variation?item_id=${encodeURIComponent(item.ml_item_id)}`;
        editLink.target = '_blank';
        editLink.rel = 'noopener';
        editLink.textContent = 'Editar anúncio no Mercado Livre';
        card.appendChild(editLink);
    }

    return card;
}

function renderCatalogList(items) {
    const all = items || [];
    const winning = all.filter(i => i.status === 'winning');
    const losing = all.filter(i => i.status !== 'winning');

    renderIntoList('catalog-list-winning', 'catalog-empty-winning', winning, buildCatalogCard);
    renderIntoList('catalog-list-losing', 'catalog-empty-losing', losing, buildCatalogCard);
}

async function loadCatalogStatus() {
    if (!state.currentUser) {
        updateCatalogBadge(0);
        return;
    }
    const data = await mlApiFetch('/api/ml-reviews?resource=catalog');
    updateCatalogBadge(data ? data.unreadCount : 0);
    renderCatalogList(data ? data.items : []);
}

async function markCatalogRead(payload) {
    if (!state.currentUser) return;
    try {
        await fetch('/api/ml-reviews?resource=catalog', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('Erro ao marcar status de catálogo como lido:', err);
    }
    await loadCatalogStatus();
}

function initCatalogStatusModule() {
    const btnMarkAll = document.getElementById('btn-mark-all-catalog-read');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', () => markCatalogRead({ all: true }));
    }

    const tabButtons = {
        winning: document.getElementById('catalog-tab-btn-winning'),
        losing: document.getElementById('catalog-tab-btn-losing'),
    };
    const tabPanels = {
        winning: document.getElementById('catalog-tab-winning'),
        losing: document.getElementById('catalog-tab-losing'),
    };
    Object.keys(tabButtons).forEach(key => {
        const btn = tabButtons[key];
        if (!btn) return;
        btn.addEventListener('click', () => {
            Object.keys(tabButtons).forEach(k => {
                if (!tabButtons[k] || !tabPanels[k]) return;
                const isActive = k === key;
                tabButtons[k].classList.toggle('active', isActive);
                tabPanels[k].classList.toggle('hidden', !isActive);
            });
        });
    });
}

// Mantém os badges de avaliações e catálogo atualizados enquanto a página fica
// aberta, sem precisar recarregar — o checker no backend roda a cada 15 min,
// aqui só confere a cada 5 min pra refletir rápido assim que houver mudança.
function startNotificationPolling() {
    setInterval(() => {
        if (!state.currentUser) return;
        loadReviews();
        loadCatalogStatus();
        loadPromotionsStatus();
        loadCheckStatus();
    }, 5 * 60 * 1000);
}

// "Última verificação" — sem isso não tem como saber, olhando o site, se o
// cron (GitHub Actions) parou de rodar. Mesma chamada alimenta as 3 abas.
async function loadCheckStatus() {
    const elIds = ['reviews-check-status', 'catalog-check-status', 'promotions-check-status'];
    if (!state.currentUser) {
        elIds.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
        return;
    }

    const data = await mlApiFetch('/api/ml-reviews?resource=status');
    let text = '';
    if (data && data.last_checked_at) {
        text = `Última verificação: ${timeAgo(data.last_checked_at)}`;
        if (data.total_active_items && data.total_active_items > 100) {
            text += ` · você tem ${data.total_active_items} anúncios ativos, mas só os 100 primeiros são verificados por rodada`;
        }
        if (data.last_error) {
            text += ' · a última rodada teve um erro (tentando de novo na próxima checagem)';
        }
    } else {
        text = 'Ainda sem checagem registrada — aguarde a próxima rodada (a cada 15 min).';
    }
    elIds.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = text; });
}

// ==========================================
// PROMOÇÕES COM PRAZO (alerta 3 dias antes de terminar, ou quando termina)
// ==========================================

const PROMOTION_TYPE_LABELS = {
    DEAL: 'Campanha Tradicional',
    MARKETPLACE_CAMPAIGN: 'Campanha Cofinanciada',
    VOLUME: 'Desconto por Quantidade',
    PRE_NEGOTIATED: 'Desconto Pré-Acordado',
    SELLER_CAMPAIGN: 'Campanha do Vendedor',
    UNHEALTHY_STOCK: 'Liquidação de Estoque Full',
    PRICE_DISCOUNT: 'Desconto Individual',
};

function updatePromotionsBadge(count) {
    const badge = document.getElementById('nav-badge-promotions');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderIntoList(containerId, emptyId, items, buildCardFn) {
    const container = document.getElementById(containerId);
    const emptyMsg = document.getElementById(emptyId);
    if (!container) return;
    container.innerHTML = '';

    if (!items || items.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }
    if (emptyMsg) emptyMsg.classList.add('hidden');
    items.forEach(item => container.appendChild(buildCardFn(item)));
}

function buildPromotionCard(item) {
    const card = document.createElement('section');
    card.className = 'card';
    card.style.marginBottom = '0.75rem';
    card.style.opacity = item.is_read ? '0.7' : '1';

    const header = document.createElement('div');
    header.className = 'item-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'item-card-title-group';

    titleGroup.appendChild(buildThumbnailImg(item.item_thumbnail));

    const title = document.createElement('strong');
    title.textContent = item.item_title || item.ml_item_id;
    titleGroup.appendChild(title);

    const daysLeft = item.finish_date ? Math.ceil((new Date(item.finish_date).getTime() - Date.now()) / 86400000) : null;
    const statusSpan = document.createElement('span');
    statusSpan.className = 'item-card-status';
    if (item.status === 'ended') {
        statusSpan.style.color = 'var(--text-muted)';
        statusSpan.textContent = 'Terminou';
    } else if (daysLeft != null && daysLeft <= 3) {
        statusSpan.style.color = 'var(--danger, #ef4444)';
        statusSpan.textContent = daysLeft <= 0 ? 'Termina hoje' : `Termina em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`;
    } else {
        statusSpan.style.color = 'var(--success)';
        statusSpan.textContent = 'Ativa';
    }

    header.appendChild(titleGroup);
    header.appendChild(statusSpan);
    card.appendChild(header);

    const detailP = document.createElement('p');
    detailP.className = 'small';
    detailP.style.color = 'var(--text-muted)';
    detailP.style.marginBottom = '0.35rem';
    const typeLabel = PROMOTION_TYPE_LABELS[item.promotion_type] || item.promotion_type || 'Promoção';
    detailP.textContent = item.promotion_name ? `${typeLabel} — ${item.promotion_name}` : typeLabel;
    card.appendChild(detailP);

    if (item.finish_date) {
        const dateP = document.createElement('p');
        dateP.className = 'small';
        dateP.style.color = 'var(--text-muted)';
        dateP.textContent = `${item.status === 'ended' ? 'Terminou em' : 'Termina em'} ${new Date(item.finish_date).toLocaleString('pt-BR')}`;
        card.appendChild(dateP);
    }

    card.appendChild(buildPromotionPageLink(item.ml_item_id));

    return card;
}

// A Central de Promoções do Mercado Livre busca por anúncio usando só a parte
// numérica do item_id (sem o prefixo "MLB"), ex.: /anuncios/lista/promos?search=4966146745
function mlItemNumericId(itemId) {
    return (itemId || '').replace(/^[A-Za-z]+/, '');
}

function buildPromotionPageLink(itemId) {
    const link = document.createElement('a');
    link.className = 'btn btn-secondary btn-sm';
    link.style.marginTop = '0.5rem';
    link.style.display = 'inline-block';
    link.href = `https://www.mercadolivre.com.br/anuncios/lista/promos?search=${encodeURIComponent(mlItemNumericId(itemId))}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Ver anúncio nas promoções';
    return link;
}

function buildLightningCandidateCard(item) {
    const card = document.createElement('section');
    card.className = 'card';
    card.style.marginBottom = '0.75rem';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'item-card-title-group';

    titleGroup.appendChild(buildThumbnailImg(item.item_thumbnail));

    const title = document.createElement('strong');
    title.textContent = item.item_title || item.ml_item_id;
    titleGroup.appendChild(title);

    card.appendChild(titleGroup);

    const detailP = document.createElement('p');
    detailP.className = 'small';
    detailP.style.color = 'var(--text-muted)';
    detailP.style.marginTop = '0.35rem';
    detailP.textContent = 'Elegível para participar de uma Oferta Relâmpago agora';
    card.appendChild(detailP);

    card.appendChild(buildPromotionPageLink(item.ml_item_id));

    return card;
}

const TEN_DAYS_MS = 10 * 86400000;

// As 4 abas são mutuamente exclusivas: "Vencem em 10 dias" é tirada de dentro de
// "Ativas" (não aparece nas duas), e "Podem ter Relâmpago" vem de uma lista à parte
// (ml_lightning_candidates, marcada com kind: 'lightning_candidate'), não misturada
// com promoções reais.
function renderPromotionsTabs(items) {
    const all = items || [];
    const promotions = all.filter(i => i.kind === 'promotion');
    const lightning = all.filter(i => i.kind === 'lightning_candidate');

    const soon = promotions.filter(i => i.status === 'active' && i.finish_date && (new Date(i.finish_date).getTime() - Date.now()) <= TEN_DAYS_MS);
    const soonIds = new Set(soon.map(i => i.id));
    const active = promotions.filter(i => i.status === 'active' && !soonIds.has(i.id));
    const ended = promotions.filter(i => i.status === 'ended');

    // Ativas/Vencem em 10 dias: mais urgente (menos dias restantes) primeiro.
    // Inativas: a que terminou por último primeiro (mais relevante que uma de meses atrás).
    const byFinishDateAsc = (a, b) => new Date(a.finish_date || 0) - new Date(b.finish_date || 0);
    const byUpdatedAtDesc = (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    active.sort(byFinishDateAsc);
    soon.sort(byFinishDateAsc);
    ended.sort(byUpdatedAtDesc);

    renderIntoList('promo-list-active', 'promo-empty-active', active, buildPromotionCard);
    renderIntoList('promo-list-soon', 'promo-empty-soon', soon, buildPromotionCard);
    renderIntoList('promo-list-ended', 'promo-empty-ended', ended, buildPromotionCard);
    renderIntoList('promo-list-lightning', 'promo-empty-lightning', lightning, buildLightningCandidateCard);
}

async function loadPromotionsStatus() {
    if (!state.currentUser) {
        updatePromotionsBadge(0);
        return;
    }
    const data = await mlApiFetch('/api/ml-reviews?resource=promotions');
    updatePromotionsBadge(data ? data.unreadCount : 0);
    renderPromotionsTabs(data ? data.items : []);
}

async function markPromotionsRead(payload) {
    if (!state.currentUser) return;
    try {
        await fetch('/api/ml-reviews?resource=promotions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('Erro ao marcar promoções como lidas:', err);
    }
    await loadPromotionsStatus();
}

function initPromotionsModule() {
    const btnMarkAll = document.getElementById('btn-mark-all-promotions-read');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', () => markPromotionsRead({ all: true }));
    }

    const tabButtons = {
        active: document.getElementById('promo-tab-btn-active'),
        soon: document.getElementById('promo-tab-btn-soon'),
        ended: document.getElementById('promo-tab-btn-ended'),
        lightning: document.getElementById('promo-tab-btn-lightning'),
    };
    const tabPanels = {
        active: document.getElementById('promo-tab-active'),
        soon: document.getElementById('promo-tab-soon'),
        ended: document.getElementById('promo-tab-ended'),
        lightning: document.getElementById('promo-tab-lightning'),
    };
    Object.keys(tabButtons).forEach(key => {
        const btn = tabButtons[key];
        if (!btn) return;
        btn.addEventListener('click', () => {
            Object.keys(tabButtons).forEach(k => {
                if (!tabButtons[k] || !tabPanels[k]) return;
                const isActive = k === key;
                tabButtons[k].classList.toggle('active', isActive);
                tabPanels[k].classList.toggle('hidden', !isActive);
            });
        });
    });
}

// Cabecalho passa a mostrar a view atual (icone + titulo + subtitulo) em vez
// de repetir sempre "Impoclick" (que ja aparece fixo na barra lateral).
const VIEW_HEADER_META = {
    'view-home': {
        title: 'Painel Inicial',
        subtitle: 'Visão geral e atalhos rápidos',
        icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
    },
    'view-calculator': {
        title: 'Calculadora de Rateio',
        subtitle: 'Simule custos, impostos e rateio da importação',
        icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'
    },
    'view-imports': {
        title: 'Histórico de Importação',
        subtitle: 'Reabra lotes salvos anteriormente',
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
    },
    'view-feasibility': {
        title: 'Viabilidade de Importação',
        subtitle: 'Compare regimes e simule o preço ideal de revenda',
        icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'
    },
    'view-doc-proforma': {
        title: 'Proforma Invoice',
        subtitle: 'Documento de cotação para o importador',
        icon: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>'
    },
    'view-doc-commercial': {
        title: 'Commercial Invoice',
        subtitle: 'Fatura comercial para o desembaraço aduaneiro',
        icon: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>'
    },
    'view-doc-packing': {
        title: 'Packing List',
        subtitle: 'Detalhamento de volumes e pesos da carga',
        icon: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>'
    },
    'view-cad-empresa': {
        title: 'Cadastro de Empresa',
        subtitle: 'Dados da sua empresa usados nos documentos',
        icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    },
    'view-cad-produtos': {
        title: 'Catálogo de Produtos',
        subtitle: 'Produtos cadastrados para reutilizar na calculadora',
        icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    },
    'view-settings': {
        title: 'Configurações',
        subtitle: 'Conecte o Mercado Livre e ajuste preferências',
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    },
    'view-help': {
        title: 'Central de Ajuda',
        subtitle: 'Perguntas frequentes sobre o Impoclick',
        icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
    },
    'view-reviews': {
        title: 'Avaliações',
        subtitle: 'Últimos comentários dos seus anúncios no Mercado Livre',
        icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
    },
    'view-catalog': {
        title: 'Catálogos',
        subtitle: 'Ganhando ou perdendo a disputa por catálogo',
        icon: '<path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/><circle cx="12" cy="8" r="7"/>'
    },
    'view-promotions': {
        title: 'Promoções',
        subtitle: 'Prazo de término e oportunidades de Oferta Relâmpago',
        icon: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
    }
};

function updateHeaderForView(viewId) {
    const meta = VIEW_HEADER_META[viewId];
    if (!meta) return;
    const badge = document.getElementById('header-view-badge');
    const titleEl = document.getElementById('header-view-title');
    const subtitleEl = document.getElementById('header-view-subtitle');
    if (badge) badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg>`;
    if (titleEl) titleEl.textContent = meta.title;
    if (subtitleEl) subtitleEl.textContent = meta.subtitle;
}

// Delegated click handler for "Conectar Conta ML" in Viabilidade. Registered
// once here (not inside syncSettingsUI, which only ever runs after the user
// visits Configurações) so the button works the first time, from any page.
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-viab-connect-ml') {
        e.preventDefault();
        const url = (state.currentUser && state.currentUser.id)
            ? `/api/ml-auth?userId=${state.currentUser.id}`
            : '/api/ml-auth';
        window.location.href = url;
    }
});

// 1. MENU ROUTING & DROPDOWN ACCORDION
function initDashboardNavigation() {
    // Mobile nav drawer (hamburger toggle) — collapsed by default on narrow
    // screens so the user doesn't have to scroll past the whole menu to
    // reach the page content.
    const navMenu = document.getElementById('nav-menu');
    const navToggleBtn = document.getElementById('btn-mobile-nav-toggle');
    if (navToggleBtn && navMenu) {
        navToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navMenu.classList.toggle('nav-menu-open');
            navToggleBtn.setAttribute('aria-expanded', String(isOpen));
            navToggleBtn.classList.toggle('active', isOpen);
        });
    }
    function closeMobileNavDrawer() {
        if (navMenu) navMenu.classList.remove('nav-menu-open');
        if (navToggleBtn) {
            navToggleBtn.setAttribute('aria-expanded', 'false');
            navToggleBtn.classList.remove('active');
        }
    }

    // Dropdown toggles
    document.querySelectorAll('.nav-dropdown-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = btn.closest('.nav-dropdown-group');
            const items = group.querySelector('.nav-dropdown-items');
            
            // Toggle active group
            const isOpen = group.classList.toggle('open');
            if (isOpen) {
                items.classList.remove('hidden');
            } else {
                items.classList.add('hidden');
            }
        });
    });

    // View switching click handler
    const switchView = (targetViewId) => {
        // Hide all views
        document.querySelectorAll('.view-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        
        // Show selected view
        const targetPanel = document.getElementById(targetViewId);
        if (targetPanel) {
            targetPanel.classList.remove('hidden');
        }

        updateHeaderForView(targetViewId);

        // Update active class on nav links
        document.querySelectorAll('.nav-item, .nav-subitem').forEach(item => {
            item.classList.remove('active');
        });

        // Find and highlight active button
        const activeBtn = document.querySelector(`[data-view="${targetViewId}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            
            // If it is a subitem, ensure the parent dropdown is open
            if (activeBtn.classList.contains('nav-subitem')) {
                const group = activeBtn.closest('.nav-dropdown-group');
                if (group) {
                    group.classList.add('open');
                    const groupToggle = group.querySelector('.nav-dropdown-toggle');
                    if (groupToggle) groupToggle.classList.add('active');
                }
            } else {
                document.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
                    toggle.classList.remove('active');
                });
            }
        }
    };

    // Bind click to nav items
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const viewId = btn.getAttribute('data-view');
            switchView(viewId);
            closeMobileNavDrawer();

            if (viewId === 'view-settings') {
                syncSettingsUI();
            }
            if (viewId === 'view-home') {
                renderHomeDashboard();
            }
            if (viewId === 'view-reviews') {
                loadReviews();
                loadCheckStatus();
            }
            if (viewId === 'view-catalog') {
                loadCatalogStatus();
                loadCheckStatus();
            }
            if (viewId === 'view-promotions') {
                loadPromotionsStatus();
                loadCheckStatus();
            }
        });
    });
}

// 2. PRODUCT CATALOG MODULE
function initCatalogModule() {
    const formProduct = document.getElementById('form-cad-product');
    const catalogSelect = document.getElementById('select-prod-catalog');
    
    // Bind file upload listeners to read base64 strings
    const catImageInput = document.getElementById('cat-prod-image');
    if (catImageInput) {
        catImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('cat-prod-image-base64').value = event.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                document.getElementById('cat-prod-image-base64').value = '';
            }
        });
    }

    const calcImageInput = document.getElementById('input-prod-image');
    if (calcImageInput) {
        calcImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('input-prod-image-base64').value = event.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                document.getElementById('input-prod-image-base64').value = '';
            }
        });
    }
    
    renderCatalogTable();
    updateCatalogDropdown();

    if (formProduct) {
        formProduct.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('cat-prod-name').value;
            const ncm = document.getElementById('cat-prod-ncm').value;
            const price = parseFloat(document.getElementById('cat-prod-price').value) || 0;
            const weight = parseFloat(document.getElementById('cat-prod-weight').value) || 0;
            const currency = document.getElementById('cat-prod-currency').value;
            const taxation = document.getElementById('cat-prod-taxation').value;
            const description = document.getElementById('cat-prod-description').value;
            const image = document.getElementById('cat-prod-image-base64').value;

            // Generate an id without '-' to avoid conflict with supabase uuid, or use UUIDs.
            const newItem = { sku: String(Date.now()), name, ncm, price, weight, currency, taxation, description, image };
            
            await window.db.saveCatalogItem(newItem);
            state.catalog = await window.db.getCatalog();

            // Reset form
            formProduct.reset();
            const base64input = document.getElementById('cat-prod-image-base64');
            if (base64input) base64input.value = '';
            
            renderCatalogTable();
            updateCatalogDropdown();
        });
    }

    if (catalogSelect) {
        catalogSelect.addEventListener('change', (e) => {
            const prodId = e.target.value;
            if (!prodId) return;
            
            const prod = state.catalog.find(p => p.id == prodId);
            if (prod) {
                document.getElementById('input-prod-name').value = prod.name;
                document.getElementById('input-prod-price').value = prod.price;
                document.getElementById('input-prod-weight').value = prod.weight;
                document.getElementById('select-prod-weight-unit').value = 'kg';
                document.getElementById('select-prod-taxation').value = prod.taxation;
                
                // Detailed custom fields
                const descField = document.getElementById('input-prod-description');
                const ncmField = document.getElementById('input-prod-ncm');
                const imgBase64Field = document.getElementById('input-prod-image-base64');
                const fileField = document.getElementById('input-prod-image');
                
                if (descField) descField.value = prod.description || '';
                if (ncmField) ncmField.value = prod.ncm || '';
                if (imgBase64Field) imgBase64Field.value = prod.image || '';
                if (fileField) fileField.value = ''; // Reset file input selector
                
                const currencySelect = document.getElementById('select-currency');
                if (currencySelect.value !== prod.currency) {
                    currencySelect.value = prod.currency;
                    state.currency = prod.currency;
                    updateCurrencyPrefixes();
                    saveState();
                    updateUI();
                }
            }
        });
    }
}

function renderCatalogTable() {
    const tbody = document.getElementById('tbody-catalog-products');
    if (!tbody) return;
    
    if (state.catalog.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">
                    Nenhum produto cadastrado no catálogo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    state.catalog.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(p.name)}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">NCM: ${escapeHtml(p.ncm) || 'N/A'}</span></td>
            <td>${p.ncm || '-'}</td>
            <td>${p.weight.toFixed(3)} kg</td>
            <td>${p.currency === 'USD' ? '$' : p.currency === 'EUR' ? '€' : 'R$'} ${p.price.toFixed(2)}</td>
            <td style="text-align: center;">
                <button class="btn btn-danger btn-sm" onclick="deleteCatalogItem(${p.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteCatalogItem(id) {
    if (await showConfirm('Deseja realmente excluir este produto do catálogo?', { title: 'Excluir produto', confirmText: 'Excluir', danger: true })) {
        await window.db.deleteCatalogItem(id);
        state.catalog = await window.db.getCatalog();
        renderCatalogTable();
        updateCatalogDropdown();
    }
}

function updateCatalogDropdown() {
    const dropdown = document.getElementById('select-prod-catalog');
    if (!dropdown) return;
    
    dropdown.innerHTML = '<option value="">-- Escolha um produto cadastrado no catálogo --</option>';
    state.catalog.forEach(p => {
        const symbol = p.currency === 'USD' ? '$' : p.currency === 'EUR' ? '€' : 'R$';
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${symbol} ${p.price.toFixed(2)})`;
        dropdown.appendChild(opt);
    });
}

// 3. COMPANY REGISTRATION MODULE
function initCompanyModule() {
    const formCompany = document.getElementById('form-cad-company');
    
    // company load is now handled in loadState()
    
    if (state.company) {
        document.getElementById('comp-name').value = state.company.name || '';
        document.getElementById('comp-cnpj').value = state.company.cnpj || '';
        document.getElementById('comp-email').value = state.company.email || '';
        document.getElementById('comp-address').value = state.company.address || '';
        document.getElementById('comp-phone').value = state.company.phone || '';
        document.getElementById('comp-zip').value = state.company.zip || '';
        const attnField = document.getElementById('comp-attn');
        if (attnField) attnField.value = state.company.attn || '';
    }

    if (formCompany) {
        formCompany.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('comp-name').value;
            const cnpj = document.getElementById('comp-cnpj').value;
            const email = document.getElementById('comp-email').value;
            const address = document.getElementById('comp-address').value;
            const phone = document.getElementById('comp-phone').value;
            const zip = document.getElementById('comp-zip').value;
            const attn = document.getElementById('comp-attn').value;
            const tradingName = ""; 
            const ie = "";

            state.company = { name, tradingName, cnpj, ie, email, address, phone, zip, attn };
            await window.db.saveCompany(state.company);
            
            showToast('Dados da empresa salvos com sucesso!', 'success');
            populateImporterSelectors();
        });
    }
    
    populateImporterSelectors();
}

function populateImporterSelectors() {
    const selectors = ['prof-importer-select', 'comm-importer-select', 'pack-importer-select'];
    selectors.forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        
        sel.innerHTML = '<option value="">-- Selecione uma Empresa --</option>';
        if (state.company) {
            const opt = document.createElement('option');
            opt.value = 'default';
            opt.textContent = state.company.name;
            sel.appendChild(opt);
        }
    });
}

// 4. DOCUMENTATION TEMPLATE GENERATOR
function initDocumentsModule() {
    const today = new Date().toISOString().split('T')[0];
    ['prof-date', 'comm-date', 'pack-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });

    // Proforma Invoice Generator
    // Proforma Invoice Generator
    const btnGenProf = document.getElementById('btn-generate-proforma');
    if (btnGenProf) {
        btnGenProf.addEventListener('click', () => {
            const supplier = document.getElementById('prof-supplier').value || '';
            const piNumber = document.getElementById('prof-number').value || '-';
            const piDate = document.getElementById('prof-date').value || '';
            const piPayment = document.getElementById('prof-payment').value || '-';
            const piIncoterm = document.getElementById('prof-incoterm').value || '-';
            
            // Exporter splitting
            const lines = supplier.split('\n');
            document.getElementById('preview-prof-exporter-name').textContent = lines[0] || '[Nome do Fornecedor / Exportador]';
            document.getElementById('preview-prof-exporter-details').textContent = lines.slice(1).join('\n') || '[Endereço e Contatos]';
            
            document.getElementById('preview-prof-invoice-no').textContent = piNumber;
            document.getElementById('preview-prof-invoice-date').textContent = piDate ? piDate.split('-').reverse().join('/') : '-';
            document.getElementById('preview-prof-payment-terms').textContent = piPayment;
            document.getElementById('preview-prof-incoterms-val').textContent = piIncoterm;

            // Origin, Currency, Mode
            document.getElementById('preview-prof-origin-val').textContent = document.getElementById('prof-origin').value || '-';
            document.getElementById('preview-prof-currency-val').textContent = state.currency;
            document.getElementById('preview-prof-mode-val').textContent = document.getElementById('prof-mode').value || '-';

            const impSelect = document.getElementById('prof-importer-select').value;
            if (impSelect === 'default' && state.company) {
                document.getElementById('preview-prof-importer-name').textContent = state.company.name;
                document.getElementById('preview-prof-importer-address').textContent = state.company.address;
                document.getElementById('preview-prof-importer-tax').textContent = state.company.cnpj;
                document.getElementById('preview-prof-importer-attn').textContent = state.company.attn || '-';
                document.getElementById('preview-prof-importer-phone').textContent = state.company.phone;
                document.getElementById('preview-prof-importer-email').textContent = state.company.email;
            } else {
                document.getElementById('preview-prof-importer-name').textContent = '[Selecione o Importador nos Cadastros]';
                document.getElementById('preview-prof-importer-address').textContent = '-';
                document.getElementById('preview-prof-importer-tax').textContent = '-';
                document.getElementById('preview-prof-importer-attn').textContent = '-';
                document.getElementById('preview-prof-importer-phone').textContent = '-';
                document.getElementById('preview-prof-importer-email').textContent = '-';
            }

            const tbodyItems = document.getElementById('preview-prof-items');
            tbodyItems.innerHTML = '';
            
            if (state.products.length === 0) {
                tbodyItems.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:#64748b;">Nenhum produto adicionado na calculadora.</td></tr>';
                document.getElementById('preview-prof-total-val').textContent = 'US$ 0,00';
                return;
            }

            let sumTotal = 0;
            state.products.forEach((p, index) => {
                const totalItemPrice = p.unitPrice * p.qty;
                sumTotal += totalItemPrice;
                const tr = document.createElement('tr');
                
                // Interactive Photo cell uploader
                const photoHTML = `
                    <div class="photo-cell-uploader" style="position: relative; width: 42px; height: 42px; margin: 0 auto; border: 1px dashed #94a3b8; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #f8fafc; cursor: pointer;">
                        ${p.image 
                            ? `<img src="${p.image}" style="width: 100%; height: 100%; object-fit: cover; display: block;">` 
                            : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #94a3b8;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`}
                        <input type="file" class="prof-upload-item-img" data-prod-id="${p.id}" accept="image/*" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                    </div>
                `;
                
                tr.innerHTML = `
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a;">${index + 1}</td>
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a;">${photoHTML}</td>
                    <td style="padding: 0.4rem; border: 1px solid #0f172a;"><strong>${escapeHtml(p.name)}</strong></td>
                    <td style="padding: 0.4rem; border: 1px solid #0f172a; color: #475569; font-size: 0.65rem;">${escapeHtml(p.description) || '-'}</td>
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a;">${p.ncm || '-'}</td>
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a; font-weight: 600;">${p.qty}</td>
                    <td style="padding: 0.4rem; text-align: right; border: 1px solid #0f172a;">${p.unitPrice.toLocaleString('en-US', {style:'currency', currency: state.currency})}</td>
                    <td style="padding: 0.4rem; text-align: right; border: 1px solid #0f172a; font-weight: 600;">${totalItemPrice.toLocaleString('en-US', {style:'currency', currency: state.currency})}</td>
                `;
                tbodyItems.appendChild(tr);
            });

            // Bind image upload handlers for Proforma
            tbodyItems.querySelectorAll('.prof-upload-item-img').forEach(input => {
                input.addEventListener('change', (e) => {
                    const prodId = parseFloat(e.target.getAttribute('data-prod-id'));
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const product = state.products.find(p => p.id === prodId);
                            if (product) {
                                product.image = event.target.result;
                                saveState();
                                updateUI();
                                btnGenProf.click(); // Re-render document preview
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            });

            // Bind Drag & Drop handlers for Proforma
            tbodyItems.querySelectorAll('.photo-cell-uploader').forEach(uploader => {
                const prodId = parseFloat(uploader.querySelector('input').getAttribute('data-prod-id'));

                uploader.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = 'var(--primary)';
                    uploader.style.backgroundColor = 'rgba(79, 70, 229, 0.08)';
                });

                uploader.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = 'var(--primary)';
                    uploader.style.backgroundColor = 'rgba(79, 70, 229, 0.08)';
                });

                uploader.addEventListener('dragleave', () => {
                    uploader.style.borderColor = '#94a3b8';
                    uploader.style.backgroundColor = '#f8fafc';
                });

                uploader.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = '#94a3b8';
                    uploader.style.backgroundColor = '#f8fafc';
                    
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const product = state.products.find(p => p.id === prodId);
                            if (product) {
                                product.image = event.target.result;
                                saveState();
                                updateUI();
                                btnGenProf.click(); // Refresh preview
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            });

            // Auto calculations from state.products
            const totalNetWeight = state.products.reduce((acc, p) => acc + (p.unitWeight * p.qty), 0);
            const totalVolumes = state.products.reduce((acc, p) => acc + p.qty, 0);

            // Totals block rendering
            const freightVal = parseFloat(document.getElementById('prof-freight').value) || 0;
            const insuranceVal = parseFloat(document.getElementById('prof-insurance').value) || 0;
            
            const netWeightValRaw = parseFloat(document.getElementById('prof-net-weight').value);
            const netWeightVal = netWeightValRaw > 0 ? netWeightValRaw : totalNetWeight.toFixed(2);
            
            const grossWeightValRaw = parseFloat(document.getElementById('prof-gross-weight').value);
            const grossWeightVal = grossWeightValRaw > 0 ? grossWeightValRaw : (totalNetWeight * 1.1).toFixed(2);

            const volumesValRaw = parseInt(document.getElementById('prof-volumes').value);
            const volumesVal = volumesValRaw > 0 ? volumesValRaw : totalVolumes;
            
            const signatureVal = document.getElementById('prof-signature').value || '-';

            document.getElementById('preview-prof-net-weight-val').textContent = netWeightVal;
            document.getElementById('preview-prof-gross-weight-val').textContent = grossWeightVal;
            document.getElementById('preview-prof-volumes-val').textContent = volumesVal;
            document.getElementById('preview-prof-freight-val').textContent = freightVal.toLocaleString('en-US', {style:'currency', currency: state.currency});
            document.getElementById('preview-prof-insurance-val').textContent = insuranceVal.toLocaleString('en-US', {style:'currency', currency: state.currency});
            
            const grandTotal = sumTotal + freightVal + insuranceVal;
            document.getElementById('preview-prof-total-val').textContent = grandTotal.toLocaleString('en-US', {style:'currency', currency: state.currency});
            document.getElementById('preview-prof-signature-val').textContent = signatureVal;
        });
    }

    // Commercial Invoice Generator
    const btnGenComm = document.getElementById('btn-generate-commercial');
    if (btnGenComm) {
        btnGenComm.addEventListener('click', () => {
            const supplier = document.getElementById('comm-supplier').value || '';
            const ciNumber = document.getElementById('comm-number').value || '-';
            const ciDate = document.getElementById('comm-date').value || '';
            const ciPayment = document.getElementById('comm-payment').value || '-';
            const ciIncoterm = document.getElementById('comm-incoterm').value || '-';
            
            // Exporter splitting
            const lines = supplier.split('\n');
            document.getElementById('preview-comm-exporter-name').textContent = lines[0] || '[Nome do Fornecedor / Exportador]';
            document.getElementById('preview-comm-exporter-details').textContent = lines.slice(1).join('\n') || '[Endereço e Contatos]';
            
            document.getElementById('preview-comm-invoice-no').textContent = ciNumber;
            document.getElementById('preview-comm-invoice-date').textContent = ciDate ? ciDate.split('-').reverse().join('/') : '-';
            document.getElementById('preview-comm-payment-terms').textContent = ciPayment;
            document.getElementById('preview-comm-incoterms-val').textContent = ciIncoterm;

            // Origin, Currency, Mode
            document.getElementById('preview-comm-origin-val').textContent = document.getElementById('comm-origin').value || '-';
            document.getElementById('preview-comm-currency-val').textContent = state.currency;
            document.getElementById('preview-comm-mode-val').textContent = document.getElementById('comm-mode').value || '-';

            const impSelect = document.getElementById('comm-importer-select').value;
            if (impSelect === 'default' && state.company) {
                document.getElementById('preview-comm-importer-name').textContent = state.company.name;
                document.getElementById('preview-comm-importer-address').textContent = state.company.address;
                document.getElementById('preview-comm-importer-tax').textContent = state.company.cnpj;
                document.getElementById('preview-comm-importer-attn').textContent = state.company.attn || '-';
                document.getElementById('preview-comm-importer-phone').textContent = state.company.phone;
                document.getElementById('preview-comm-importer-email').textContent = state.company.email;
            } else {
                document.getElementById('preview-comm-importer-name').textContent = '[Selecione o Importador nos Cadastros]';
                document.getElementById('preview-comm-importer-address').textContent = '-';
                document.getElementById('preview-comm-importer-tax').textContent = '-';
                document.getElementById('preview-comm-importer-attn').textContent = '-';
                document.getElementById('preview-comm-importer-phone').textContent = '-';
                document.getElementById('preview-comm-importer-email').textContent = '-';
            }

            const tbodyItems = document.getElementById('preview-comm-items');
            tbodyItems.innerHTML = '';
            
            if (state.products.length === 0) {
                tbodyItems.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:#64748b;">Nenhum produto adicionado na calculadora.</td></tr>';
                document.getElementById('preview-comm-total-val').textContent = 'US$ 0,00';
                return;
            }

            let sumTotal = 0;
            state.products.forEach((p, index) => {
                const totalItemPrice = p.unitPrice * p.qty;
                sumTotal += totalItemPrice;
                const tr = document.createElement('tr');
                
                // Interactive Photo cell uploader
                const photoHTML = `
                    <div class="photo-cell-uploader" style="position: relative; width: 42px; height: 42px; margin: 0 auto; border: 1px dashed #94a3b8; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #f8fafc; cursor: pointer;">
                        ${p.image 
                            ? `<img src="${p.image}" style="width: 100%; height: 100%; object-fit: cover; display: block;">` 
                            : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #94a3b8;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`}
                        <input type="file" class="comm-upload-item-img" data-prod-id="${p.id}" accept="image/*" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                    </div>
                `;
                
                tr.innerHTML = `
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a;">${index + 1}</td>
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a;">${photoHTML}</td>
                    <td style="padding: 0.4rem; border: 1px solid #0f172a;"><strong>${escapeHtml(p.name)}</strong></td>
                    <td style="padding: 0.4rem; border: 1px solid #0f172a; color: #475569; font-size: 0.65rem;">${escapeHtml(p.description) || '-'}</td>
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a;">${p.ncm || '-'}</td>
                    <td style="padding: 0.4rem; text-align: center; border: 1px solid #0f172a; font-weight: 600;">${p.qty}</td>
                    <td style="padding: 0.4rem; text-align: right; border: 1px solid #0f172a;">${p.unitPrice.toLocaleString('en-US', {style:'currency', currency: state.currency})}</td>
                    <td style="padding: 0.4rem; text-align: right; border: 1px solid #0f172a; font-weight: 600;">${totalItemPrice.toLocaleString('en-US', {style:'currency', currency: state.currency})}</td>
                `;
                tbodyItems.appendChild(tr);
            });

            // Bind image upload handlers for Commercial
            tbodyItems.querySelectorAll('.comm-upload-item-img').forEach(input => {
                input.addEventListener('change', (e) => {
                    const prodId = parseFloat(e.target.getAttribute('data-prod-id'));
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const product = state.products.find(p => p.id === prodId);
                            if (product) {
                                product.image = event.target.result;
                                saveState();
                                updateUI();
                                btnGenComm.click(); // Re-render document preview
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            });

            // Bind Drag & Drop handlers for Commercial
            tbodyItems.querySelectorAll('.photo-cell-uploader').forEach(uploader => {
                const prodId = parseFloat(uploader.querySelector('input').getAttribute('data-prod-id'));

                uploader.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = 'var(--primary)';
                    uploader.style.backgroundColor = 'rgba(79, 70, 229, 0.08)';
                });

                uploader.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = 'var(--primary)';
                    uploader.style.backgroundColor = 'rgba(79, 70, 229, 0.08)';
                });

                uploader.addEventListener('dragleave', () => {
                    uploader.style.borderColor = '#94a3b8';
                    uploader.style.backgroundColor = '#f8fafc';
                });

                uploader.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = '#94a3b8';
                    uploader.style.backgroundColor = '#f8fafc';
                    
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const product = state.products.find(p => p.id === prodId);
                            if (product) {
                                product.image = event.target.result;
                                saveState();
                                updateUI();
                                btnGenComm.click(); // Refresh preview
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            });

            // Auto calculations from state.products
            const totalNetWeight = state.products.reduce((acc, p) => acc + (p.unitWeight * p.qty), 0);
            const totalVolumes = state.products.reduce((acc, p) => acc + p.qty, 0);

            // Totals block rendering
            const freightVal = parseFloat(document.getElementById('comm-freight').value) || 0;
            const insuranceVal = parseFloat(document.getElementById('comm-insurance').value) || 0;
            
            const netWeightValRaw = parseFloat(document.getElementById('comm-net-weight').value);
            const netWeightVal = netWeightValRaw > 0 ? netWeightValRaw : totalNetWeight.toFixed(2);
            
            const grossWeightValRaw = parseFloat(document.getElementById('comm-gross-weight').value);
            const grossWeightVal = grossWeightValRaw > 0 ? grossWeightValRaw : (totalNetWeight * 1.1).toFixed(2);

            const volumesValRaw = parseInt(document.getElementById('comm-volumes').value);
            const volumesVal = volumesValRaw > 0 ? volumesValRaw : totalVolumes;
            
            const signatureVal = document.getElementById('comm-signature').value || '-';

            document.getElementById('preview-comm-net-weight-val').textContent = netWeightVal;
            document.getElementById('preview-comm-gross-weight-val').textContent = grossWeightVal;
            document.getElementById('preview-comm-volumes-val').textContent = volumesVal;
            document.getElementById('preview-comm-freight-val').textContent = freightVal.toLocaleString('en-US', {style:'currency', currency: state.currency});
            document.getElementById('preview-comm-insurance-val').textContent = insuranceVal.toLocaleString('en-US', {style:'currency', currency: state.currency});
            
            const grandTotal = sumTotal + freightVal + insuranceVal;
            document.getElementById('preview-comm-total-val').textContent = grandTotal.toLocaleString('en-US', {style:'currency', currency: state.currency});
            document.getElementById('preview-comm-signature-val').textContent = signatureVal;
        });
    }

    const btnGenPack = document.getElementById('btn-generate-packing');
    if (btnGenPack) {
        btnGenPack.addEventListener('click', () => {
            const fmt3 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

            const plNumber  = document.getElementById('pack-number').value || 'PL-2026-001';
            const plDate    = document.getElementById('pack-date').value || today;
            const invRef    = document.getElementById('pack-invoice-ref').value.trim() || '—';
            const origin    = document.getElementById('pack-origin').value.trim() || 'China';
            const portLoad  = document.getElementById('pack-port-load').value.trim() || '—';
            const portDest  = document.getElementById('pack-port-dest').value.trim() || '—';
            const transport = document.getElementById('pack-transport').value;
            const incoterms = document.getElementById('pack-incoterms').value;
            const pkgType   = document.getElementById('pack-pkg-type').value;
            const gwFactor  = (parseFloat(document.getElementById('pack-gw-factor').value) || 10) / 100;
            const marks     = document.getElementById('pack-marks').value.trim();
            const place     = document.getElementById('pack-place').value.trim();
            const signedBy  = document.getElementById('pack-signedby').value.trim();
            const notify    = document.getElementById('pack-notify').value.trim();
            const supplier  = document.getElementById('pack-supplier').value.trim() || '[Supplier Name / Address / Country]';

            document.getElementById('preview-pack-no').textContent        = plNumber;
            document.getElementById('preview-pack-date').textContent      = plDate.split('-').reverse().join('/');
            document.getElementById('preview-pack-inv-ref').textContent   = invRef;
            document.getElementById('preview-pack-origin').textContent    = origin;
            document.getElementById('preview-pack-transport').textContent = transport;
            document.getElementById('preview-pack-port-load').textContent = portLoad;
            document.getElementById('preview-pack-port-dest').textContent = portDest;
            document.getElementById('preview-pack-incoterms').textContent = incoterms;
            document.getElementById('preview-pack-exporter-text').textContent = supplier;
            document.getElementById('preview-pack-signed').textContent     = signedBy || '—';
            document.getElementById('preview-pack-place-date').textContent = place ? (place + ', ' + plDate.split('-').reverse().join('/')) : '—';

            const notifyBlock = document.getElementById('preview-pack-notify-block');
            if (notify) { document.getElementById('preview-pack-notify-text').textContent = notify; notifyBlock.style.display = 'block'; }
            else { notifyBlock.style.display = 'none'; }

            const marksBlock = document.getElementById('preview-pack-marks-block');
            if (marks) { document.getElementById('preview-pack-marks-text').textContent = marks; marksBlock.style.display = 'block'; }
            else { marksBlock.style.display = 'none'; }

            const impSelect = document.getElementById('pack-importer-select').value;
            const impEl = document.getElementById('preview-pack-importer-text');
            if (impSelect === 'default' && state.company) {
                impEl.innerHTML = '<strong>' + escapeHtml(state.company.name) + '</strong><br>CNPJ: ' + escapeHtml(state.company.cnpj) + '<br>' + escapeHtml(state.company.address) + '<br>CEP: ' + escapeHtml(state.company.zip) + '<br>Contato: ' + escapeHtml(state.company.email);
            } else {
                impEl.textContent = '[Selecione o Importador nos Cadastros]';
            }

            const tbodyItems = document.getElementById('preview-pack-items');
            const tfoot = document.getElementById('preview-pack-tfoot');
            tbodyItems.innerHTML = '';

            if (state.products.length === 0) {
                tbodyItems.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:#64748b;">Nenhum produto adicionado na calculadora.</td></tr>';
                tfoot.style.display = 'none';
                return;
            }

            let sumQty = 0, sumNW = 0, sumGW = 0, itemNum = 0;
            state.products.forEach(function(p) {
                itemNum++;
                const unitNW  = p.unitWeight;
                const unitGW  = unitNW * (1 + gwFactor);
                const totalNW = unitNW * p.qty;
                const totalGW = unitGW * p.qty;
                sumQty += p.qty; sumNW += totalNW; sumGW += totalGW;
                const hsCode = p.ncm ? ' <span style="color:#64748b;font-size:0.62rem;">HS: ' + escapeHtml(p.ncm) + '</span>' : '';
                const desc   = p.description ? '<div style="color:#64748b;font-size:0.62rem;">' + escapeHtml(p.description) + '</div>' : '';
                const rowBg  = itemNum % 2 === 0 ? 'background:#f8fafc;' : '';
                tbodyItems.innerHTML += '<tr style="' + rowBg + 'border-bottom:1px solid #e2e8f0;">'
                    + '<td style="padding:0.4rem 0.45rem;color:#64748b;">' + itemNum + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;"><strong>' + escapeHtml(p.name) + '</strong>' + hsCode + desc
                    + '<div style="font-size:0.62rem;color:#94a3b8;margin-top:1px;">Pkg: ' + pkgType + '</div></td>'
                    + '<td style="padding:0.4rem 0.45rem;text-align:center;">' + p.qty + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;text-align:center;">' + p.qty + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;text-align:right;">' + unitNW.toFixed(3) + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;text-align:right;">' + unitGW.toFixed(3) + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;text-align:right;">' + totalNW.toFixed(3) + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;text-align:right;">' + totalGW.toFixed(3) + '</td>'
                    + '</tr>';
            });

            document.getElementById('preview-pack-sum-pkgs').textContent   = sumQty;
            document.getElementById('preview-pack-sum-qty').textContent    = sumQty;
            document.getElementById('preview-pack-sum-nw').textContent     = fmt3(sumNW);
            document.getElementById('preview-pack-sum-weight').textContent = fmt3(sumGW);
            tfoot.style.display = '';
        });
    }

    const bindPrintBtn = (btnId) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                window.print();
            });
        }
    };
    bindPrintBtn('btn-print-proforma');
    bindPrintBtn('btn-print-commercial');
    bindPrintBtn('btn-print-packing');
}

// 5. IMPORT VIABILITY CALCULATOR MODULE (Previsibilidade de Custo)
// Regras fiscais alinhadas às usadas na Calculadora de Rateio (ver getProductTaxRates / calculateItemTaxes acima).

// Backend online (Vercel) que gerencia os tokens OAuth do Mercado Livre
// para o usuário atualmente logado.
async function mlApiFetch(path) {
    if (!state.currentUser) return null;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000); // Mercado Livre pode demorar
        const resp = await fetch(path, {
            headers: {
                'user-token': state.currentUser.id,
                'Authorization': `Bearer ${state.currentUser.access_token}`,
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!resp.ok) return null;
        return await resp.json();
    } catch (err) {
        return null; // backend indisponível ou erro de rede — quem chamou decide o fallback
    }
}

// Referência de tarifas de venda por categoria no Mercado Livre (Brasil) — usada apenas
// como fallback quando o servidor local (acima) não está disponível.
const ML_CATEGORY_FEES = [
    { name: 'Eletrônicos, Áudio e Vídeo', fee: 12 },
    { name: 'Celulares e Telefones', fee: 13 },
    { name: 'Informática', fee: 13 },
    { name: 'Eletrodomésticos', fee: 13 },
    { name: 'Casa, Móveis e Decoração', fee: 13 },
    { name: 'Ferramentas e Construção', fee: 13 },
    { name: 'Esportes e Fitness', fee: 13 },
    { name: 'Beleza e Cuidado Pessoal', fee: 14 },
    { name: 'Brinquedos e Hobbies', fee: 13 },
    { name: 'Relógios', fee: 13 },
    { name: 'Óculos', fee: 13 },
    { name: 'Moda (Roupas, Calçados e Bolsas)', fee: 14 },
    { name: 'Acessórios para Veículos', fee: 13 },
    { name: 'Bebês', fee: 13 },
    { name: 'Livros, Revistas e Comics', fee: 0 },
    { name: 'Outra categoria (definir % manualmente)', fee: 13 },
];

// Referência de custo de frete (Mercado Envios) por faixa de peso faturável — usada apenas
// como fallback quando o servidor local (ML_SERVER_URL) não está disponível; com o servidor
// rodando, o custo real vem de /users/{id}/shipping_options (mesmo endpoint que o ML usa).
// Usamos peso cubado (padrão do setor: C×L×A(cm) / 6000) comparado
// ao peso real para achar o peso faturável, e uma tabela local de referência por faixa — ajustável,
// igual à base de NCMs e à tabela de tarifas por categoria.
const ML_FREIGHT_BRACKETS = [
    { maxGrams: 300, cost: 14.90 },
    { maxGrams: 500, cost: 16.90 },
    { maxGrams: 1000, cost: 19.90 },
    { maxGrams: 2000, cost: 23.90 },
    { maxGrams: 3000, cost: 27.90 },
    { maxGrams: 4000, cost: 31.90 },
    { maxGrams: 5000, cost: 35.90 },
    { maxGrams: 9000, cost: 45.90 },
    { maxGrams: 13000, cost: 55.90 },
    { maxGrams: 17000, cost: 65.90 },
    { maxGrams: 23000, cost: 75.90 },
    { maxGrams: 30000, cost: 89.90 },
];

function calcVolumetricWeightG(lengthCm, widthCm, heightCm) {
    const volumetricKg = (lengthCm * widthCm * heightCm) / 6000;
    return volumetricKg * 1000;
}

function estimatePlatformFreight(weightG, lengthCm, widthCm, heightCm) {
    const volumetricWeightG = calcVolumetricWeightG(lengthCm, widthCm, heightCm);
    const billableWeightG = Math.max(weightG, volumetricWeightG);

    if (billableWeightG <= 0) {
        return { volumetricWeightG, billableWeightG, cost: 0, overMax: false };
    }

    const bracket = ML_FREIGHT_BRACKETS.find(b => billableWeightG <= b.maxGrams);
    if (bracket) {
        return { volumetricWeightG, billableWeightG, cost: bracket.cost, overMax: false };
    }
    // Acima da maior faixa de referência — não estimamos, usuário deve informar manualmente
    return { volumetricWeightG, billableWeightG, cost: 0, overMax: true };
}

function calcSimplifiedImport({ valueUSD, freightUSD, qty, exchangeRate, icmsPct }) {
    const valueBRL = valueUSD * qty * exchangeRate;
    const freightBRL = freightUSD * exchangeRate;
    const totalUSD = valueUSD * qty + freightUSD;
    const vaBRL = valueBRL + freightBRL;
    const icmsRate = icmsPct / 100;

    let iiBRL;
    const isUnderThreshold = totalUSD <= 50;
    if (isUnderThreshold) {
        iiBRL = vaBRL * 0.20;
    } else {
        const rawII = vaBRL * 0.60;
        const deductionBRL = 20 * exchangeRate;
        iiBRL = Math.max(0, rawII - deductionBRL);
    }

    const baseICMS = icmsRate < 1 ? (vaBRL + iiBRL) / (1 - icmsRate) : (vaBRL + iiBRL);
    const icmsBRL = baseICMS * icmsRate;
    const totalCost = vaBRL + iiBRL + icmsBRL;
    const unitCost = qty > 0 ? totalCost / qty : 0;

    return { valueBRL, freightBRL, vaBRL, iiBRL, icmsBRL, totalCost, unitCost, isUnderThreshold };
}

function calcFormalImport({ valueUSD, freightUSD, qty, exchangeRate, icmsPct, otherFeesBRL, ncm }) {
    const vaBRL = (valueUSD * qty + freightUSD) * exchangeRate;
    const rates = getProductTaxRates(ncm);
    const icmsRate = icmsPct / 100;

    const iiBRL = vaBRL * (rates.ii / 100);
    const ipiBRL = (vaBRL + iiBRL) * (rates.ipi / 100);
    const pisBRL = vaBRL * (rates.pis / 100);
    const cofinsBRL = vaBRL * (rates.cofins / 100);
    const baseICMS = icmsRate < 1
        ? (vaBRL + iiBRL + ipiBRL + pisBRL + cofinsBRL + otherFeesBRL) / (1 - icmsRate)
        : (vaBRL + iiBRL + ipiBRL + pisBRL + cofinsBRL + otherFeesBRL);
    const icmsBRL = baseICMS * icmsRate;

    const totalTaxes = iiBRL + ipiBRL + pisBRL + cofinsBRL + icmsBRL;
    const totalCost = vaBRL + totalTaxes + otherFeesBRL;
    const unitCost = qty > 0 ? totalCost / qty : 0;

    return { vaBRL, iiBRL, ipiBRL, pisBRL, cofinsBRL, icmsBRL, totalTaxes, totalCost, unitCost, rates };
}

function initFeasibilityModule() {
    const panelSimples = document.getElementById('viab-tab-simples');
    if (!panelSimples) return;

    function brl(v) {
        return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    function num(id, def = 0) {
        const el = document.getElementById(id);
        const v = parseFloat(el ? el.value : NaN);
        return isNaN(v) ? def : v;
    }
    function int(id, def = 1) {
        const el = document.getElementById(id);
        const v = parseInt(el ? el.value : NaN, 10);
        return isNaN(v) ? def : v;
    }

    // --- SUB-TAB SWITCHING (3 abas) ---
    const tabButtons = {
        simples: document.getElementById('viab-tab-btn-simples'),
        formal: document.getElementById('viab-tab-btn-formal'),
        mercado: document.getElementById('viab-tab-btn-mercado'),
    };
    const tabPanels = {
        simples: panelSimples,
        formal: document.getElementById('viab-tab-formal'),
        mercado: document.getElementById('viab-tab-mercado'),
    };
    Object.keys(tabButtons).forEach(key => {
        const btn = tabButtons[key];
        if (!btn) return;
        btn.addEventListener('click', () => {
            Object.keys(tabButtons).forEach(k => {
                if (!tabButtons[k] || !tabPanels[k]) return;
                const isActive = k === key;
                tabButtons[k].classList.toggle('active', isActive);
                tabPanels[k].classList.toggle('hidden', !isActive);
            });
            if (key === 'mercado') renderMercado();
        });
    });

    // Custo final de cada regime, mantido atualizado para a aba de Comparação de Mercado
    let lastSimpUnitCost = 0;
    let lastFormalUnitCost = 0;
    // Se o usuário editar manualmente o campo de custo final na Comparação de
    // Mercado, paramos de sobrescrevê-lo com o valor automático das outras abas.
    let simplesRefTouched = false;
    let formalRefTouched = false;

    // --- IMPORTAÇÃO SIMPLIFICADA ---
    function renderSimples() {
        const valueUSD = num('simp-f-value');
        const freightUSD = num('simp-f-freight');
        const qty = int('simp-f-qty', 1);
        const exchangeRate = num('simp-f-exchange', 5.50);
        const icmsPct = num('simp-f-icms', 17);

        const r = calcSimplifiedImport({ valueUSD, freightUSD, qty, exchangeRate, icmsPct });
        lastSimpUnitCost = r.unitCost;

        document.getElementById('simp-r-va').textContent = brl(r.vaBRL);
        document.getElementById('simp-r-ii').textContent = brl(r.iiBRL);
        document.getElementById('simp-r-icms').textContent = brl(r.icmsBRL);
        document.getElementById('simp-r-total').textContent = brl(r.totalCost);
        document.getElementById('simp-r-unit').textContent = brl(r.unitCost);

        const ruleEl = document.getElementById('simp-r-rule-note');
        if (ruleEl) {
            ruleEl.innerHTML = r.isUnderThreshold
                ? '💡 Regra aplicada: valor total até US$ 50 → <strong>II de 20%</strong> sobre o valor aduaneiro.'
                : '💡 Regra aplicada: valor total acima de US$ 50 → <strong>II de 60%</strong> sobre o valor aduaneiro, com dedução de US$ 20.';
        }

        const memTbody = document.getElementById('simp-r-memory-tbody');
        const memTfoot = document.getElementById('simp-r-memory-tfoot');
        if (memTbody) {
            memTbody.innerHTML = `
                <tr><td>Valor do Produto</td><td class="text-right">—</td><td class="text-right">${brl(r.valueBRL)}</td></tr>
                <tr><td>Frete Internacional</td><td class="text-right">—</td><td class="text-right">${brl(r.freightBRL)}</td></tr>
                <tr><td style="font-weight:600;">= Valor Aduaneiro</td><td class="text-right">—</td><td class="text-right" style="font-weight:600;">${brl(r.vaBRL)}</td></tr>
                <tr><td>Imposto de Importação (II)</td><td class="text-right">${r.isUnderThreshold ? '20%' : '60% (- US$20)'}</td><td class="text-right">${brl(r.iiBRL)}</td></tr>
                <tr><td>ICMS</td><td class="text-right">${icmsPct}%</td><td class="text-right">${brl(r.icmsBRL)}</td></tr>
            `;
        }
        if (memTfoot) {
            memTfoot.innerHTML = `<tr style="font-weight:700;"><td colspan="2">Custo Total do Lote</td><td class="text-right">${brl(r.totalCost)}</td></tr>`;
        }
        renderMercado();
    }
    ['simp-f-value', 'simp-f-freight', 'simp-f-qty', 'simp-f-exchange', 'simp-f-icms'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderSimples);
    });
    renderSimples();

    // --- IMPORTAÇÃO FORMAL ---
    const ncmInput = document.getElementById('formal-f-ncm');
    const ncmPreviewEl = document.getElementById('formal-ncm-preview');

    function renderFormal() {
        const valueUSD = num('formal-f-value');
        const freightUSD = num('formal-f-freight');
        const qty = int('formal-f-qty', 1);
        const exchangeRate = num('formal-f-exchange', 5.50);
        const icmsPct = num('formal-f-icms', 17);
        const otherFeesBRL = num('formal-f-other');
        const ncm = ncmInput ? ncmInput.value : '';

        const r = calcFormalImport({ valueUSD, freightUSD, qty, exchangeRate, icmsPct, otherFeesBRL, ncm });
        lastFormalUnitCost = r.unitCost;

        document.getElementById('formal-r-va').textContent = brl(r.vaBRL);
        document.getElementById('formal-r-taxes').textContent = brl(r.totalTaxes);
        document.getElementById('formal-r-total').textContent = brl(r.totalCost);
        document.getElementById('formal-r-unit').textContent = brl(r.unitCost);

        const tbody = document.getElementById('formal-r-memory-tbody');
        const tfoot = document.getElementById('formal-r-memory-tfoot');
        if (tbody) {
            tbody.innerHTML = `
                <tr><td>Valor Aduaneiro (Produto + Frete)</td><td class="text-right">—</td><td class="text-right">${brl(r.vaBRL)}</td></tr>
                <tr><td>Imposto de Importação (II)</td><td class="text-right">${r.rates.ii}%</td><td class="text-right">${brl(r.iiBRL)}</td></tr>
                <tr><td>IPI</td><td class="text-right">${r.rates.ipi}%</td><td class="text-right">${brl(r.ipiBRL)}</td></tr>
                <tr><td>PIS</td><td class="text-right">${r.rates.pis}%</td><td class="text-right">${brl(r.pisBRL)}</td></tr>
                <tr><td>COFINS</td><td class="text-right">${r.rates.cofins}%</td><td class="text-right">${brl(r.cofinsBRL)}</td></tr>
                <tr><td>ICMS</td><td class="text-right">${icmsPct}%</td><td class="text-right">${brl(r.icmsBRL)}</td></tr>
                ${otherFeesBRL > 0 ? `<tr><td>Outras Despesas Aduaneiras</td><td class="text-right">—</td><td class="text-right">${brl(otherFeesBRL)}</td></tr>` : ''}
            `;
        }
        if (tfoot) {
            tfoot.innerHTML = `<tr style="font-weight:700;"><td colspan="2">Custo Total do Lote</td><td class="text-right">${brl(r.totalCost)}</td></tr>`;
        }
        renderMercado();
    }

    async function updateNcmPreview() {
        if (!ncmPreviewEl) return;
        const raw = ncmInput ? ncmInput.value : '';
        const clean = raw.replace(/[^0-9]/g, '');
        if (!clean) {
            ncmPreviewEl.classList.add('hidden');
            renderFormal();
            return;
        }
        ncmPreviewEl.classList.remove('hidden');
        const match = typeof lookupLocalNcm === 'function' ? lookupLocalNcm(clean) : null;
        if (match) {
            ncmPreviewEl.className = 'ncm-preview success';
            ncmPreviewEl.innerHTML = `
                <div><strong>NCM Encontrado:</strong> <span class="ncm-badge">${clean}</span> - ${match.name}</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                    Alíquotas: II ${match.ii}% | IPI ${match.ipi}% | PIS ${match.pis}% | COFINS ${match.cofins}%
                </div>`;
            renderFormal();
            return;
        }

        if (clean.length !== 8) {
            ncmPreviewEl.className = 'ncm-preview warning';
            ncmPreviewEl.innerHTML = `
                <div>NCM <span class="ncm-badge">${clean}</span> incompleto — o código precisa ter 8 dígitos para consultar a estimativa.</div>`;
            renderFormal();
            return;
        }

        // Já tem estimativa em cache (consulta anterior)?
        const cached = state.ncmRateEstimateCache && state.ncmRateEstimateCache[clean];
        if (cached != null) {
            ncmPreviewEl.className = 'ncm-preview warning';
            ncmPreviewEl.innerHTML = `
                <div><strong>NCM fora da base curada:</strong> <span class="ncm-badge">${clean}</span> — usando estimativa do IBPT.</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                    Carga tributária federal aproximada para produtos importados: <strong>${cached.toFixed(2)}%</strong> (aplicada como Imposto de Importação — o IBPT não discrimina II/IPI/PIS/COFINS separadamente). Fonte: IBPT, não substitui a alíquota exata da TEC/TIPI.
                </div>`;
            renderFormal();
            return;
        }

        ncmPreviewEl.className = 'ncm-preview warning';
        ncmPreviewEl.innerHTML = `<div>NCM <span class="ncm-badge">${clean}</span> não está na base curada. Consultando estimativa (IBPT)...</div>`;
        renderFormal();

        const estimatedPct = await fetchIbptTaxEstimate(clean);
        // O usuário pode ter mudado o campo enquanto a consulta rodava
        const stillCurrent = ncmInput && ncmInput.value.replace(/[^0-9]/g, '') === clean;
        if (!stillCurrent) return;

        if (estimatedPct != null) {
            ncmPreviewEl.className = 'ncm-preview warning';
            ncmPreviewEl.innerHTML = `
                <div><strong>NCM fora da base curada:</strong> <span class="ncm-badge">${clean}</span> — usando estimativa do IBPT.</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                    Carga tributária federal aproximada para produtos importados: <strong>${estimatedPct.toFixed(2)}%</strong> (aplicada como Imposto de Importação — o IBPT não discrimina II/IPI/PIS/COFINS separadamente). Fonte: IBPT, não substitui a alíquota exata da TEC/TIPI.
                </div>`;
        } else {
            ncmPreviewEl.className = 'ncm-preview error';
            ncmPreviewEl.innerHTML = `
                <div>NCM <span class="ncm-badge">${clean}</span> não encontrado na base local nem na estimativa do IBPT.</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                    Alíquotas aplicadas: II 0% | IPI 0% | PIS 0% | COFINS 0% (informe um NCM cadastrado para tributação real).
                </div>`;
        }
        renderFormal();
    }

    ['formal-f-value', 'formal-f-freight', 'formal-f-qty', 'formal-f-exchange', 'formal-f-icms', 'formal-f-other'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderFormal);
    });
    if (ncmInput) {
        ncmInput.addEventListener('input', updateNcmPreview);
        ncmInput.addEventListener('blur', updateNcmPreview);
    }
    renderFormal();

    // --- COMPARAÇÃO DE MERCADO (dados reais via servidor local ML_SERVER_URL, com fallback) ---
    let resolvedCategoryId = null;
    let resolvedCategoryName = null;

    function fmtGrams(g) {
        return g >= 1000 ? `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`;
    }

    // --- Status de conexão com a conta Mercado Livre (via servidor local) ---
    // (Removido, status agora é gerenciado pelo syncSettingsUI no topo da aba)

    // --- Detecção de categoria real pelo nome do produto ---
    const mktQueryInput = document.getElementById('mkt-f-query');
    const mktCategoryInfoEl = document.getElementById('mkt-category-info');

    async function detectCategory() {
        const query = (mktQueryInput ? mktQueryInput.value : '').trim();
        if (!mktCategoryInfoEl) return;
        if (!query) {
            mktCategoryInfoEl.classList.add('hidden');
            resolvedCategoryId = null;
            resolvedCategoryName = null;
            return;
        }

        const data = await mlApiFetch(`/api/ml-market?action=category&q=${encodeURIComponent(query)}`);
        mktCategoryInfoEl.classList.remove('hidden');
        if (data && data.categoryId) {
            resolvedCategoryId = data.categoryId;
            resolvedCategoryName = data.categoryName;
            mktCategoryInfoEl.className = 'ncm-preview success';
            mktCategoryInfoEl.innerHTML = `<div><strong>Categoria detectada:</strong> <span class="ncm-badge">${data.categoryId}</span> ${data.categoryName}</div>`;
            await updateFeeFromApi();
        } else {
            resolvedCategoryId = null;
            resolvedCategoryName = null;
            mktCategoryInfoEl.className = 'ncm-preview warning';
            mktCategoryInfoEl.innerHTML = `<div>Não foi possível detectar a categoria automaticamente (servidor local indisponível ou termo não reconhecido) — ajuste a Taxa de Venda ML manualmente.</div>`;
        }
    }
    if (mktQueryInput) mktQueryInput.addEventListener('blur', detectCategory);

    // --- Taxa de venda real (categoria + preço) ---
    async function updateFeeFromApi() {
        const feeInput = document.getElementById('mkt-f-fee');
        const feeNote = document.getElementById('mkt-f-fee-note');
        if (!resolvedCategoryId) return;
        // O preço só serve pra API achar a faixa/tipo de anúncio certo; enquanto o
        // usuário não preenche o preço do mais vendido, usa um valor de referência
        // para já trazer a taxa assim que a categoria for detectada.
        const price = num('mkt-f-price') || 100;

        const data = await mlApiFetch(`/api/ml-market?action=fee&price=${encodeURIComponent(price)}&category=${encodeURIComponent(resolvedCategoryId)}`);
        if (data && feeInput) {
            feeInput.value = data.percentageFee;
            if (feeNote) feeNote.textContent = `Taxa real da API para "${resolvedCategoryName}", anúncio ${data.listingTypeName}: ${data.percentageFee}%.`;
            renderMercado();
        }
    }
    const mktPriceInput = document.getElementById('mkt-f-price');
    if (mktPriceInput) mktPriceInput.addEventListener('blur', updateFeeFromApi);

    // --- Buscar mais vendidos: abre o site real + mostra o produto #1 do ranking via API ---
    const mktSearchBtn = document.getElementById('mkt-btn-search');
    const mktBestSellerInfoEl = document.getElementById('mkt-bestseller-info');
    if (mktSearchBtn) {
        mktSearchBtn.addEventListener('click', async () => {
            const query = (mktQueryInput ? mktQueryInput.value : '').trim();
            if (!query) {
                showToast('Informe o nome/tipo do produto para pesquisar.', 'error');
                return;
            }
            const url = 'https://lista.mercadolivre.com.br/' + encodeURIComponent(query);
            window.open(url, '_blank', 'noopener');

            if (!mktBestSellerInfoEl) return;
            if (!resolvedCategoryId) {
                mktBestSellerInfoEl.classList.remove('hidden');
                mktBestSellerInfoEl.className = 'ncm-preview warning';
                mktBestSellerInfoEl.innerHTML = '<div>Saia do campo "Nome / Tipo do Produto" para detectar a categoria antes de buscar o ranking real.</div>';
                return;
            }
            mktBestSellerInfoEl.classList.remove('hidden');
            mktBestSellerInfoEl.className = 'ncm-preview warning';
            mktBestSellerInfoEl.innerHTML = '<div>Consultando o ranking de mais vendidos...</div>';

            const data = await mlApiFetch(`/api/ml-market?action=bestseller&category=${encodeURIComponent(resolvedCategoryId)}`);
            if (data && data.id) {
                mktBestSellerInfoEl.className = 'ncm-preview success';
                mktBestSellerInfoEl.innerHTML = `
                    <div><strong>#1 mais vendido em ${resolvedCategoryName}:</strong> ${data.name || data.id}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                        <a href="${data.permalink}" target="_blank" rel="noopener" style="color:var(--primary);">Abrir página do produto ↗</a> — confira o preço atual e cole no campo abaixo (a API não libera preço de outros vendedores para este app).
                    </div>`;
            } else {
                mktBestSellerInfoEl.className = 'ncm-preview warning';
                mktBestSellerInfoEl.innerHTML = '<div>Não foi possível consultar o ranking real agora (servidor local indisponível). Use a busca aberta ao lado para conferir manualmente.</div>';
            }
        });
    }

    // --- Frete real por peso/dimensão (com fallback para a tabela de referência local) ---
    async function updateWeightEstimate() {
        const weightG = num('mkt-f-weight');
        const lengthCm = num('mkt-f-length');
        const widthCm = num('mkt-f-width');
        const heightCm = num('mkt-f-height');
        const price = num('mkt-f-price');

        const noteEl = document.getElementById('mkt-r-weight-note');
        const freightInput = document.getElementById('mkt-f-platform-freight');

        if (weightG <= 0 && (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0)) {
            if (noteEl) noteEl.innerHTML = '';
            return;
        }

        // Tenta o valor real via API (precisa de um preço de venda para simular a cobrança)
        if (price > 0) {
            const data = await mlApiFetch(
                `/api/ml-freight?weight=${weightG}&length=${lengthCm}&width=${widthCm}&height=${heightCm}&price=${price}`
            );
            if (data && typeof data.cost === 'number') {
                if (noteEl) {
                    const discountInfo = data.discount && data.discount.rate > 0
                        ? ` Já inclui um desconto de <strong>${(data.discount.rate * 100).toFixed(0)}%</strong> pela reputação/nível da sua conta (sem desconto seria ${brl(data.discount.promoted_amount)}).`
                        : '';
                    noteEl.innerHTML = `🟢 Peso faturável (API): <strong>${fmtGrams(data.billableWeightG)}</strong> → frete real cobrado pelo Mercado Livre: <strong>${brl(data.cost)}</strong>.${discountInfo}`;
                }
                if (freightInput) freightInput.value = data.cost.toFixed(2);
                renderMercado();
                return;
            }
        }

        // Fallback: estimativa local por peso cubado + tabela de referência
        const est = estimatePlatformFreight(weightG, lengthCm, widthCm, heightCm);
        if (noteEl) {
            if (est.billableWeightG <= 0) {
                noteEl.innerHTML = '';
            } else if (est.overMax) {
                noteEl.innerHTML = `Peso cubado: <strong>${fmtGrams(est.volumetricWeightG)}</strong> | Peso faturável: <strong>${fmtGrams(est.billableWeightG)}</strong> — acima da nossa tabela de referência (30kg). Informe o frete manualmente abaixo.`;
            } else {
                noteEl.innerHTML = `💡 Estimativa local (servidor indisponível ou sem preço informado) — Peso faturável: <strong>${fmtGrams(est.billableWeightG)}</strong> → frete de referência: <strong>${brl(est.cost)}</strong>.`;
            }
        }
        if (freightInput && est.billableWeightG > 0 && !est.overMax) {
            freightInput.value = est.cost.toFixed(2);
        }
        renderMercado();
    }
    ['mkt-f-weight', 'mkt-f-length', 'mkt-f-width', 'mkt-f-height'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateWeightEstimate);
    });
    if (mktPriceInput) mktPriceInput.addEventListener('blur', updateWeightEstimate);

    function renderMercado() {
        const sourceRadio = document.querySelector('input[name="mkt-cost-source"]:checked');
        const source = sourceRadio ? sourceRadio.value : 'simples';

        const refSimplesEl = document.getElementById('mkt-ref-simples');
        const refFormalEl = document.getElementById('mkt-ref-formal');
        if (refSimplesEl && !simplesRefTouched) refSimplesEl.value = lastSimpUnitCost.toFixed(2);
        if (refFormalEl && !formalRefTouched) refFormalEl.value = lastFormalUnitCost.toFixed(2);

        const refCost = source === 'formal' ? num('mkt-ref-formal') : num('mkt-ref-simples');

        const price = num('mkt-f-price');
        const feePct = num('mkt-f-fee', 13);
        const platformFreight = num('mkt-f-platform-freight');
        const feeAmount = price * (feePct / 100);
        const netRevenue = price - feeAmount - platformFreight;
        const diff = netRevenue - refCost;
        const marginPct = price > 0 ? (diff / price) * 100 : 0;

        const memTbody = document.getElementById('mkt-r-memory-tbody');
        const memTfoot = document.getElementById('mkt-r-memory-tfoot');
        if (memTbody) {
            memTbody.innerHTML = `
                <tr><td>Preço de Venda (Concorrente)</td><td class="text-right">${brl(price)}</td></tr>
                <tr><td>(-) Taxa de Venda Mercado Livre (${feePct}%)</td><td class="text-right">${brl(feeAmount)}</td></tr>
                <tr><td>(-) Frete da Plataforma</td><td class="text-right">${brl(platformFreight)}</td></tr>
                <tr><td style="font-weight:600;">(=) Receita Líquida</td><td class="text-right" style="font-weight:600;">${brl(netRevenue)}</td></tr>
                <tr><td>(-) Seu Custo Final de Importação</td><td class="text-right">${brl(refCost)}</td></tr>
            `;
        }
        if (memTfoot) {
            memTfoot.innerHTML = `<tr style="font-weight:700;"><td>(=) Resultado Líquido por Unidade</td><td class="text-right" style="color:${diff >= 0 ? 'var(--success)' : 'var(--danger)'};">${brl(diff)}</td></tr>`;
        }

        const verdictEl = document.getElementById('mkt-r-verdict');
        const detailEl = document.getElementById('mkt-r-detail');
        if (!verdictEl || !detailEl) return;

        if (price <= 0 || refCost <= 0) {
            verdictEl.textContent = '—';
            verdictEl.style.color = 'var(--text-muted)';
            detailEl.textContent = 'Preencha o custo final (nas abas Simplificada/Formal) e o preço do concorrente para ver o resultado.';
            return;
        }

        if (diff <= 0) {
            verdictEl.textContent = 'NÃO COMPENSA';
            verdictEl.style.color = 'var(--danger)';
            detailEl.textContent = `Vendendo a ${brl(price)}, descontando a taxa do Mercado Livre e o frete da plataforma, faltariam ${brl(Math.abs(diff))} para cobrir seu custo final — prejuízo estimado.`;
        } else if (marginPct < 15) {
            verdictEl.textContent = 'MARGEM APERTADA — ANALISAR';
            verdictEl.style.color = 'var(--warning)';
            detailEl.textContent = `Sobraria ${brl(diff)} líquidos por unidade (${marginPct.toFixed(1)}% do preço de venda) após taxa ML, frete da plataforma e seu custo final — margem baixa, avalie outros custos antes de importar.`;
        } else {
            verdictEl.textContent = 'COMPENSA';
            verdictEl.style.color = 'var(--success)';
            detailEl.textContent = `Sobraria ${brl(diff)} líquidos por unidade (${marginPct.toFixed(1)}% do preço de venda) após taxa ML, frete da plataforma e seu custo final.`;
        }
    }

    document.querySelectorAll('input[name="mkt-cost-source"]').forEach(el => {
        el.addEventListener('change', renderMercado);
    });
    ['mkt-f-price', 'mkt-f-fee', 'mkt-f-platform-freight'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderMercado);
    });

    const refSimplesInput = document.getElementById('mkt-ref-simples');
    const refFormalInput = document.getElementById('mkt-ref-formal');
    if (refSimplesInput) {
        refSimplesInput.addEventListener('input', () => {
            simplesRefTouched = true;
            renderMercado();
        });
    }
    if (refFormalInput) {
        refFormalInput.addEventListener('input', () => {
            formalRefTouched = true;
            renderMercado();
        });
    }

    renderMercado();
}

// 6. IMPORTS HISTORY (SAVE & LOAD) MODULE
function initHistoryModule() {
    const btnSave = document.getElementById('btn-save-import');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            if (state.products.length === 0) {
                showToast('Adicione pelo menos um produto na calculadora antes de salvar a importação.', 'error');
                return;
            }
            
            const defName = `Lote #${Date.now().toString().slice(-4)}`;
            const name = prompt('Digite um nome ou identificador para este lote de importação:', defName);
            if (name === null) return;
            
            const finalName = name.trim() || defName;
            
            if (state.currentUser) {
                try {
                    const result = await window.db.saveHistory(finalName, state);
                    if (result && result.error) {
                        showToast('Erro técnico do Banco de Dados: ' + result.error.message + '\n\nCertifique-se de que rodou o script SQL no painel do Supabase corretamente.', 'error', 8000);
                        return;
                    }
                } catch(e) {
                    console.error('Erro ao salvar no Supabase:', e);
                }
            } else {
                const totalQty = state.products.reduce((acc, p) => acc + p.qty, 0);
                
                const spread = state.exchangeMode === 'complete' ? (state.spread || 0) : 0;
                const iof = state.exchangeMode === 'complete' ? (state.iof || 0) : 0;
                const effectiveRate = state.currency === 'BRL' ? 1 : state.exchangeRate * (1 + spread / 100) * (1 + iof / 100);
                const totalFobBRL = state.products.reduce((acc, p) => acc + (p.unitPrice * p.qty), 0) * effectiveRate;
                
                const freightBRL = state.freightInBRL ? state.freight : state.freight * effectiveRate;
                const insuranceBRL = state.insuranceInBRL ? state.insurance : state.insurance * effectiveRate;
                const feesBRL = state.feesInBRL ? state.fees : state.fees * effectiveRate;
                const totalFreightInsuranceFees = freightBRL + insuranceBRL + feesBRL;
                const totalImportBRL = totalFobBRL + totalFreightInsuranceFees;

                const newImport = {
                    id: Date.now(),
                    name: finalName,
                    date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
                    itemsCount: totalQty,
                    currency: state.currency,
                    fobBRL: totalFobBRL,
                    totalBRL: totalImportBRL,
                    stateData: JSON.parse(JSON.stringify(state))
                };
                
                let historyList = [];
                try {
                    historyList = JSON.parse(localStorage.getItem('import_rateio_history')) || [];
                } catch(e) {}
                historyList.unshift(newImport);
                localStorage.setItem('import_rateio_history', JSON.stringify(historyList));
            }
            
            showToast(`Lote "${finalName}" salvo no histórico com sucesso!`, 'success');
            renderHistoryTable();
            renderHomeDashboard();
        });
    }

    renderHistoryTable();
}

// ONBOARDING — tour de boas-vindas mostrado uma única vez no primeiro acesso
// (guardado por localStorage, não depende de coluna nova no Supabase).
function initOnboardingTour() {
    if (!state.currentUser) return;
    if (localStorage.getItem('impoclick_onboarding_seen_v1')) return;

    const modal = document.getElementById('onboarding-modal');
    const titleEl = document.getElementById('onboarding-title');
    const textEl = document.getElementById('onboarding-text');
    const iconEl = document.getElementById('onboarding-icon');
    const dotsEl = document.getElementById('onboarding-dots');
    const nextBtn = document.getElementById('btn-onboarding-next');
    const skipBtn = document.getElementById('btn-onboarding-skip');
    const closeBtn = document.getElementById('btn-onboarding-close');
    if (!modal || !nextBtn) return;

    const steps = [
        {
            title: 'Bem-vindo ao Impoclick!',
            text: 'Simule custos e impostos de importação em segundos, com câmbio em tempo real e integração com o Mercado Livre.',
            icon: VIEW_HEADER_META['view-home'].icon
        },
        {
            title: 'Painel Inicial',
            text: 'Acompanhe o dólar em tempo real, quantos lotes você já simulou e retome o último de onde parou.',
            icon: VIEW_HEADER_META['view-home'].icon
        },
        {
            title: 'Calculadora de Rateio',
            text: 'Cadastre os produtos do lote e veja o custo final rateado entre eles — por peso, valor ou quantidade.',
            icon: VIEW_HEADER_META['view-calculator'].icon
        },
        {
            title: 'Viabilidade de Importação',
            text: 'Compare Simplificada x Formal e descubra se vale a pena vender aquele produto, comparando com o Mercado Livre.',
            icon: VIEW_HEADER_META['view-feasibility'].icon
        },
        {
            title: 'Documentos e Central de Ajuda',
            text: 'Gere Proforma, Commercial Invoice e Packing List prontos para o despachante. Com dúvidas, a Central de Ajuda está sempre no menu.',
            icon: VIEW_HEADER_META['view-doc-proforma'].icon
        }
    ];
    let step = 0;

    function render() {
        const s = steps[step];
        titleEl.textContent = s.title;
        textEl.textContent = s.text;
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>`;
        dotsEl.innerHTML = steps.map((_, i) => `<span class="onboarding-dot${i === step ? ' active' : ''}"></span>`).join('');
        nextBtn.textContent = step === steps.length - 1 ? 'Concluir' : 'Próximo';
    }

    function finish() {
        localStorage.setItem('impoclick_onboarding_seen_v1', '1');
        modal.classList.add('hidden');
    }

    nextBtn.addEventListener('click', () => {
        if (step === steps.length - 1) { finish(); return; }
        step++;
        render();
    });
    if (skipBtn) skipBtn.addEventListener('click', finish);
    if (closeBtn) closeBtn.addEventListener('click', finish);

    render();
    modal.classList.remove('hidden');
}

// PAINEL INICIAL — KPIs reais (histórico, câmbio, NCM mais usado) em vez de
// só uma grade estática de atalhos.
function formatBRL(v) {
    return `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function renderHomeDashboard() {
    const view = document.getElementById('view-home');
    if (!view) return;

    const historyList = await getHistorySummaryList();

    const continueCard = document.getElementById('home-continue-card');
    if (continueCard) {
        if (historyList.length > 0) {
            const latest = historyList[0];
            continueCard.classList.remove('hidden');
            const nameEl = document.getElementById('home-continue-name');
            const metaEl = document.getElementById('home-continue-meta');
            const btn = document.getElementById('home-continue-btn');
            if (nameEl) nameEl.textContent = latest.name;
            if (metaEl) metaEl.textContent = `${latest.date} • ${latest.itemsCount} item(ns) • ${formatBRL(latest.totalBRL)}`;
            if (btn) btn.onclick = () => loadSavedImport(latest.rawId);
        } else {
            continueCard.classList.add('hidden');
        }
    }
}

// Busca e computa a lista de lotes salvos (Supabase ou localStorage), com os
// totais já calculados. Compartilhada pela tabela de Histórico e pelos KPIs
// do Painel Inicial para não duplicar a lógica de cálculo em dois lugares.
async function getHistorySummaryList() {
    let historyList = [];
    if (state.currentUser) {
        try {
            const spData = await window.db.getHistory();
            historyList = spData.map(row => {
                const s = row.state_data || {};
                const totalQty = s.products ? s.products.reduce((acc, p) => acc + p.qty, 0) : 0;

                const spread = s.exchangeMode === 'complete' ? (s.spread || 0) : 0;
                const iof = s.exchangeMode === 'complete' ? (s.iof || 0) : 0;
                const effectiveRate = s.currency === 'BRL' ? 1 : (s.exchangeRate || 5) * (1 + spread / 100) * (1 + iof / 100);
                const totalFobBRL = s.products ? s.products.reduce((acc, p) => acc + (p.unitPrice * p.qty), 0) * effectiveRate : 0;

                const freightBRL = s.freightInBRL ? (s.freight || 0) : (s.freight || 0) * effectiveRate;
                const insuranceBRL = s.insuranceInBRL ? (s.insurance || 0) : (s.insurance || 0) * effectiveRate;
                const feesBRL = s.feesInBRL ? (s.fees || 0) : (s.fees || 0) * effectiveRate;
                const totalFreightInsuranceFees = freightBRL + insuranceBRL + feesBRL;
                const totalImportBRL = totalFobBRL + totalFreightInsuranceFees;

                return {
                    id: `'${row.id}'`, // String pré-formatada para uso em atributos onclick="..." (ver renderHistoryTable)
                    rawId: row.id, // valor real, use este para chamar loadSavedImport/deleteSavedImport programaticamente
                    name: row.name,
                    date: new Date(row.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(row.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
                    rawDate: row.created_at,
                    itemsCount: totalQty,
                    currency: s.currency || 'USD',
                    fobBRL: totalFobBRL,
                    totalBRL: totalImportBRL,
                    stateData: s
                };
            });
        } catch(e) {
            console.error('Erro ao buscar histórico do Supabase', e);
        }
    } else {
        try {
            const raw = JSON.parse(localStorage.getItem('import_rateio_history')) || [];
            historyList = raw.map(item => ({ ...item, rawId: item.id, rawDate: item.id }));
        } catch(e) {
            historyList = [];
        }
    }
    return historyList;
}

async function renderHistoryTable() {
    const tbody = document.getElementById('tbody-saved-imports');
    if (!tbody) return;

    const historyList = await getHistorySummaryList();

    if (historyList.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state-row">
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
                    Nenhum lote salvo ainda. Salve seu lote atual a partir do botão "Salvar Lote" na calculadora.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    historyList.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td>${item.date}</td>
            <td>${item.itemsCount}</td>
            <td>${item.currency}</td>
            <td>R$ ${(item.fobBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>R$ ${(item.totalBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="text-align: center; display: flex; gap: 0.5rem; justify-content: center;">
                <button class="btn btn-primary btn-sm" onclick="loadSavedImport(${item.id})">Carregar</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSavedImport(${item.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteSavedImport(id) {
    if (await showConfirm('Deseja realmente excluir este lote do histórico?', { title: 'Excluir lote', confirmText: 'Excluir', danger: true })) {
        if (state.currentUser) {
            try { await window.db.deleteHistory(id); } catch(e) {}
        } else {
            let historyList = [];
            try {
                historyList = JSON.parse(localStorage.getItem('import_rateio_history')) || [];
            } catch(e) {
                historyList = [];
            }
            
            historyList = historyList.filter(item => item.id !== id);
            localStorage.setItem('import_rateio_history', JSON.stringify(historyList));
        }
        renderHistoryTable();
        renderHomeDashboard();
    }
}

async function loadSavedImport(id) {
    let item = null;
    
    if (state.currentUser) {
        try {
            const spData = await window.db.getHistory();
            const row = spData.find(i => i.id === id);
            if (row) {
                item = { name: row.name, stateData: row.state_data };
            }
        } catch(e) {}
    } else {
        let historyList = [];
        try {
            historyList = JSON.parse(localStorage.getItem('import_rateio_history')) || [];
        } catch(e) {}
        item = historyList.find(i => i.id === id);
    }
    
    if (item && item.stateData) {
        if (await showConfirm(`Deseja carregar a importação "${item.name}" na calculadora? Isso substituirá seus dados atuais.`, { title: 'Carregar lote' })) {
            const savedUser = state.currentUser;
            state = { ...state, ...item.stateData };
            state.currentUser = savedUser;
            
            document.getElementById('select-currency').value = state.currency;
            document.getElementById('input-exchange-rate').value = state.exchangeRate;
            document.getElementById('input-spread').value = state.spread || 4.0;
            document.getElementById('input-iof').value = state.iof || 2.38;
            document.getElementById('input-freight').value = state.freight || 0;
            document.getElementById('freight-in-brl').checked = state.freightInBRL || false;
            document.getElementById('input-insurance').value = state.insurance || 0;
            document.getElementById('insurance-in-brl').checked = state.insuranceInBRL || false;
            document.getElementById('input-other-fees').value = state.fees || 0;
            document.getElementById('fees-in-brl').checked = state.feesInBRL || false;
            
            const exModeRadio = document.querySelector(`input[name="exchange-mode"][value="${state.exchangeMode || 'simple'}"]`);
            if (exModeRadio) exModeRadio.checked = true;
            
            saveState();
            
            updateCurrencyPrefixes();
            updateUI();
            
            document.querySelectorAll('.view-panel').forEach(panel => panel.classList.add('hidden'));
            document.getElementById('view-calculator').classList.remove('hidden');
            document.querySelectorAll('.nav-item, .nav-subitem').forEach(btn => btn.classList.remove('active'));
            document.querySelector('[data-view="view-calculator"]').classList.add('active');
            updateHeaderForView('view-calculator');

            showToast(`Lote "${item.name}" carregado com sucesso na calculadora!`, 'success');
        }
    }
}

// 7. SETTINGS AND THEME SELECTION UTILITIES
// Sincroniza o status do Mercado Livre mostrado na aba Viabilidade. Roda uma
// vez no carregamento (nao apenas quando o usuario visita Configuracoes),
// senao o status/botao ficam presos no estado padrao ate a primeira visita.
function syncViabMlStatus() {
    const btnViabConnectMl = document.getElementById('btn-viab-connect-ml');
    const btnViabDisconnectMl = document.getElementById('btn-viab-disconnect-ml');
    const statusTextViabMl = document.getElementById('viab-ml-status-text');
    if (!btnViabConnectMl || !statusTextViabMl) return;

    if (btnViabDisconnectMl && !btnViabDisconnectMl.dataset.bound) {
        btnViabDisconnectMl.dataset.bound = 'true';
        btnViabDisconnectMl.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!state.currentUser) return;
            if (!await showConfirm('Desconectar sua conta do Mercado Livre? As simulações voltarão a usar estimativas padrão até você reconectar.', { title: 'Desconectar Mercado Livre', confirmText: 'Desconectar', danger: true })) return;

            btnViabDisconnectMl.disabled = true;
            try {
                await fetch('/api/ml-status', {
                    method: 'POST',
                    headers: { 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` }
                });
            } catch (err) {
                console.error('Erro ao desconectar ML:', err);
            }
            btnViabDisconnectMl.disabled = false;
            syncViabMlStatus();
        });
    }

    mlApiFetch('/api/ml-status').then(res => {
        if (res && res.connected) {
            statusTextViabMl.textContent = `Conectado como: ${res.nickname}`;
            statusTextViabMl.style.color = 'var(--success)';
            btnViabConnectMl.textContent = 'Reconectar';
            btnViabConnectMl.className = 'btn btn-secondary btn-sm';
            if (btnViabDisconnectMl) btnViabDisconnectMl.classList.remove('hidden');
        } else {
            statusTextViabMl.textContent = 'Não conectado. Algumas simulações automáticas usarão estimativas padrão.';
            statusTextViabMl.style.color = 'var(--danger)';
            btnViabConnectMl.textContent = 'Conectar Conta ML';
            btnViabConnectMl.className = 'btn btn-primary btn-sm';
            btnViabConnectMl.style.backgroundColor = '#FFE600';
            btnViabConnectMl.style.color = '#2D3277';
            if (btnViabDisconnectMl) btnViabDisconnectMl.classList.add('hidden');
        }
    });
}

function syncSettingsUI() {
    if (state.currentUser) {
        document.getElementById('settings-user-email').textContent = state.currentUser.email;
        document.getElementById('settings-user-license-type').textContent = state.currentUser.isSubscribed ? "Assinatura Pro (Mensal)" : "Período de Testes";
        
        const expWrapper = document.getElementById('settings-license-expiration-wrapper');
        const expText = document.getElementById('settings-user-expiration');
        if (state.currentUser.subscriptionExpiresAt) {
            expWrapper.style.display = 'block';
            expText.textContent = new Date(state.currentUser.subscriptionExpiresAt).toLocaleDateString('pt-BR');
        } else {
            expWrapper.style.display = 'none';
        }
    }

    const btnLight = document.getElementById('btn-theme-light-choice');
    const btnDark = document.getElementById('btn-theme-dark-choice');
    
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    if (theme === 'light') {
        btnLight.className = 'btn btn-primary btn-sm';
        btnDark.className = 'btn btn-secondary btn-sm';
    } else {
        btnLight.className = 'btn btn-secondary btn-sm';
        btnDark.className = 'btn btn-primary btn-sm';
    }

    // Sincronizar status do Mercado Livre
    const btnConnectMl = document.getElementById('btn-connect-ml');
    const btnDisconnectMl = document.getElementById('btn-disconnect-ml');
    const statusTextMl = document.getElementById('ml-connection-status');
    if (btnConnectMl && statusTextMl) {
        btnConnectMl.addEventListener('click', (e) => {
            e.preventDefault();
            const url = (state.currentUser && state.currentUser.id)
                ? `/api/ml-auth?userId=${state.currentUser.id}`
                : '/api/ml-auth';
            window.location.href = url;
        });

        if (btnDisconnectMl) {
            btnDisconnectMl.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!state.currentUser) return;
                if (!await showConfirm('Desconectar sua conta do Mercado Livre? As simulações voltarão a usar estimativas padrão até você reconectar.', { title: 'Desconectar Mercado Livre', confirmText: 'Desconectar', danger: true })) return;

                btnDisconnectMl.disabled = true;
                try {
                    await fetch('/api/ml-status', {
                        method: 'POST',
                        headers: { 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` }
                    });
                } catch (err) {
                    console.error('Erro ao desconectar ML:', err);
                }
                btnDisconnectMl.disabled = false;
                syncSettingsUI();
            });
        }

        statusTextMl.textContent = 'Verificando conexão...';
        statusTextMl.style.color = 'var(--text-muted)';

        mlApiFetch('/api/ml-status').then(res => {
            if (res && res.connected) {
                statusTextMl.textContent = `Conectado como: ${res.nickname}`;
                statusTextMl.style.color = 'var(--success)';
                btnConnectMl.textContent = 'Reconectar';
                btnConnectMl.className = 'btn btn-secondary btn-sm';
                if (btnDisconnectMl) btnDisconnectMl.classList.remove('hidden');
            } else {
                statusTextMl.textContent = 'Não conectado';
                statusTextMl.style.color = 'var(--text-muted)';
                btnConnectMl.textContent = 'Conectar Conta';
                btnConnectMl.className = 'btn btn-primary btn-sm';
                btnConnectMl.style.backgroundColor = '#FFE600';
                btnConnectMl.style.color = '#2D3277';
                if (btnDisconnectMl) btnDisconnectMl.classList.add('hidden');
            }
        });
    }

    syncViabMlStatus();

    btnLight.onclick = () => {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        updateThemeIcon('light');
        syncSettingsUI();
    };

    btnDark.onclick = () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        updateThemeIcon('dark');
        syncSettingsUI();
    };
    
    document.getElementById('btn-reset-database').onclick = async () => {
        const ok = await showConfirm(
            'Isso apagará TODOS os dados salvos localmente no navegador, incluindo histórico de lotes, produtos catalogados e empresa importadora.',
            { title: 'Resetar base de dados', confirmText: 'Resetar', danger: true }
        );
        if (ok) {
            localStorage.clear();
            showToast('Toda a base de dados foi apagada. A página será reiniciada.', 'success');
            setTimeout(() => location.reload(), 900);
        }
    };
    
    document.getElementById('btn-open-payment-settings').onclick = () => {
        const paymentModal = document.getElementById('payment-modal');
        if (paymentModal) paymentModal.classList.remove('hidden');
    };
}


