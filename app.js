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
            state = { ...state, ...parsed };
            
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
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

// SAVE STATE
async function saveState() {
    localStorage.setItem('import_rateio_state', JSON.stringify(state));
    if (state.currentUser) {
        try { await window.db.saveActiveSimulation(state); } catch(e){}
    }
}

// ==========================================
// AWESOMEAPI - REALTIME DOLLAR EXCHANGERATE
// ==========================================

async function fetchDollarRate() {
    const usdValEl = document.getElementById('ticker-usd-value');
    const usdChangeEl = document.getElementById('ticker-usd-change');
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
        
        // Update current price UI
        if (usdValEl) {
            usdValEl.textContent = `R$ ${bid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
        }
        
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
        alert('Conta do Mercado Livre conectada com sucesso!');
        window.history.replaceState({}, document.title, window.location.pathname);
        // Switch to settings view
        setTimeout(() => {
            const btnSettings = document.querySelector('[data-view="view-settings"]');
            if (btnSettings) btnSettings.click();
        }, 500);
    }
    await checkAuthSession();
    await loadState();
    registerEventListeners();
    registerAuthEventListeners();
    registerSubscriptionEventListeners();
    fetchDollarRate();
    preloadOfficialNcmDatabase();
    updateUI();
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

    // Clean all button
    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if (confirm('Tem certeza de que deseja apagar todos os produtos e zerar as configurações?')) {
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

async function preloadOfficialNcmDatabase() {
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
    
    // 1.5. Busca na base cacheada/pré-carregada
    if (state.ncmCache && state.ncmCache[cleanNcm]) {
        const desc = state.ncmCache[cleanNcm];
        previewEl.className = "ncm-preview success";
        previewEl.innerHTML = `
            <div><strong>NCM Detectado (Cache/Oficial):</strong> <span class="ncm-badge">${cleanNcm}</span> - ${desc}</div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                NCM sem alíquotas locais cadastradas. Alíquotas aplicadas: II = 0% | IPI = 0% | PIS = 0% | COFINS = 0%
            </div>
            <div style="font-size:0.68rem; color:var(--success); margin-top:0.35rem; font-weight: 500; display: flex; align-items: center; gap: 0.25rem;">
                <span>ℹ️</span> <span><strong>Fonte do Dado:</strong> Base oficial pré-carregada do Portal Único Siscomex / GitHub.</span>
            </div>
        `;
        return;
    }

    // 2. Consulta API Siscomex se tiver 8 dígitos
    if (cleanNcm.length === 8) {
        previewEl.className = "ncm-preview warning";
        previewEl.innerHTML = `
            <div>Consultando NCM <span class="ncm-badge">${cleanNcm}</span> na base da Receita Federal (BrasilAPI)...</div>
        `;
        
        try {
            const response = await fetch(`https://brasilapi.com.br/api/ncm/v1/${cleanNcm}`);
            if (response.status === 200) {
                const data = await response.json();
                
                // Salva no cache do estado para uso nos cálculos síncronos
                state.ncmCache = state.ncmCache || {};
                state.ncmCache[cleanNcm] = data.descricao;
                saveState();
                
                previewEl.className = "ncm-preview success";
                previewEl.innerHTML = `
                    <div><strong>NCM Encontrado (Siscomex):</strong> <span class="ncm-badge">${cleanNcm}</span> - ${data.descricao}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                        NCM sem alíquotas locais cadastradas. Alíquotas aplicadas: II = 0% | IPI = 0% | PIS = 0% | COFINS = 0%
                    </div>
                    <div style="font-size:0.68rem; color:var(--warning); margin-top:0.35rem; font-weight: 500; display: flex; align-items: center; gap: 0.25rem;">
                        <span>ℹ️</span> <span><strong>Fonte do Dado:</strong> Base descritiva oficial da Receita Federal do Brasil (consulta via API Siscomex / BrasilAPI).</span>
                    </div>
                `;
            } else {
                throw new Error('NCM não encontrado na BrasilAPI');
            }
        } catch (err) {
            // Tenta consultar a segunda base (API IBPT - Seu Negócio na Nuvem)
            previewEl.className = "ncm-preview warning";
            previewEl.innerHTML = `
                <div>Consultando NCM <span class="ncm-badge">${cleanNcm}</span> na base de dados secundária (IBPT)...</div>
            `;
            
            try {
                const responseSec = await fetch(`https://api-ibpt.seunegocionanuvem.com.br/api_ibpt.php?codigo=${cleanNcm}&uf=SP`);
                if (responseSec.status === 200) {
                    const dataSec = await responseSec.json();
                    if (dataSec && dataSec.descricao) {
                        // Salva no cache do estado para uso nos cálculos síncronos
                        state.ncmCache = state.ncmCache || {};
                        state.ncmCache[cleanNcm] = dataSec.descricao;
                        saveState();

                        previewEl.className = "ncm-preview success";
                        previewEl.innerHTML = `
                            <div><strong>NCM Encontrado (IBPT):</strong> <span class="ncm-badge">${cleanNcm}</span> - ${dataSec.descricao}</div>
                            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                                NCM sem alíquotas locais cadastradas. Alíquotas aplicadas: II = 0% | IPI = 0% | PIS = 0% | COFINS = 0%
                            </div>
                            <div style="font-size:0.68rem; color:var(--warning); margin-top:0.35rem; font-weight: 500; display: flex; align-items: center; gap: 0.25rem;">
                                <span>ℹ️</span> <span><strong>Fonte do Dado:</strong> Base descritiva do IBPT (consulta em tempo real via API Seu Negócio na Nuvem).</span>
                            </div>
                        `;
                        return;
                    }
                }
                throw new Error('NCM não encontrado na API IBPT');
            } catch (errSec) {
                previewEl.className = "ncm-preview error";
                previewEl.innerHTML = `
                    <div><strong>NCM Não Encontrado:</strong> <span class="ncm-badge">${cleanNcm}</span> não localizado em nenhuma das bases (BrasilAPI / IBPT).</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">
                        Nenhum imposto de importação formal será aplicado para este item (alíquotas zeradas).
                    </div>
                `;
            }
        }
    } else {
        previewEl.className = "ncm-preview error";
        previewEl.innerHTML = `
            <div><strong>NCM Incompleto:</strong> O NCM deve possuir 8 dígitos para consulta (ex: 85235190).</div>
        `;
    }
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
                        <div style="font-weight: 600; color: var(--text-color);">${p.name}</div>
                        ${p.description ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.description}</div>` : ''}
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
                <button class="btn-icon-edit btn-edit-item" data-id="${p.id}" title="Editar produto">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon-danger btn-delete-item" data-id="${p.id}" title="Excluir produto">
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
            <td style="font-weight:600;">${item.product.name}</td>
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
                <td style="font-weight:600;">${item.product.name}</td>
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
                <span class="bar-name">${item.product.name} (x${item.product.qty})</span>
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
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim().toLowerCase();
            const password = document.getElementById('login-password').value;
            const alertEl = document.getElementById('login-alert');

            try {
                showAuthAlert(alertEl, 'success', 'Conectando ao servidor...');
                
                const { data, error } = await window.db.signIn(email, password);
                
                if (error) {
                    let msg = 'E-mail ou senha incorretos.';
                    if (error.message && error.message.includes('Email not confirmed')) {
                        msg = 'Por favor, confirme seu e-mail (verifique a caixa de entrada).';
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

                // Log in automatically
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
            if (confirm('Tem certeza de que deseja sair?')) {
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
    if (loginAlert) {
        loginAlert.className = 'auth-alert hidden';
        loginAlert.textContent = '';
    }
    if (registerAlert) {
        registerAlert.className = 'auth-alert hidden';
        registerAlert.textContent = '';
    }
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
            alert("Você precisa estar logado para assinar o plano.");
            return;
        }
        
        // UI Feedback
        if(btnMpCheckout) btnMpCheckout.disabled = true;
        if(btnMpSubscription) btnMpSubscription.disabled = true;
        if(mpLoading) mpLoading.style.display = 'block';
        
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: session.id })
            });
            
            const data = await response.json();
            
            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                alert('Erro ao gerar link de pagamento: ' + (data.error || 'Erro desconhecido'));
                if(btnMpCheckout) btnMpCheckout.disabled = false;
                if(btnMpSubscription) btnMpSubscription.disabled = false;
                if(mpLoading) mpLoading.style.display = 'none';
            }
        } catch (error) {
            console.error('Erro na chamada MP:', error);
            alert('Erro de conexão ao gerar pagamento.');
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
});

// 1. MENU ROUTING & DROPDOWN ACCORDION
function initDashboardNavigation() {
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
            
            if (viewId === 'view-settings') {
                syncSettingsUI();
            }
        });
    });
}

// 2. PRODUCT CATALOG MODULE
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
            <td><strong>${p.name}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">NCM: ${p.ncm || 'N/A'}</span></td>
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
    if (confirm('Deseja realmente excluir este produto do catálogo?')) {
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
            
            alert('Dados da empresa salvos com sucesso!');
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
                    <td style="padding: 0.4rem; border: 1px solid #0f172a;"><strong>${p.name}</strong></td>
                    <td style="padding: 0.4rem; border: 1px solid #0f172a; color: #475569; font-size: 0.65rem;">${p.description || '-'}</td>
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
                    <td style="padding: 0.4rem; border: 1px solid #0f172a;"><strong>${p.name}</strong></td>
                    <td style="padding: 0.4rem; border: 1px solid #0f172a; color: #475569; font-size: 0.65rem;">${p.description || '-'}</td>
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
                impEl.innerHTML = '<strong>' + state.company.name + '</strong><br>CNPJ: ' + state.company.cnpj + '<br>' + state.company.address + '<br>CEP: ' + state.company.zip + '<br>Contato: ' + state.company.email;
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
                const hsCode = p.ncm ? ' <span style="color:#64748b;font-size:0.62rem;">HS: ' + p.ncm + '</span>' : '';
                const desc   = p.description ? '<div style="color:#64748b;font-size:0.62rem;">' + p.description + '</div>' : '';
                const rowBg  = itemNum % 2 === 0 ? 'background:#f8fafc;' : '';
                tbodyItems.innerHTML += '<tr style="' + rowBg + 'border-bottom:1px solid #e2e8f0;">'
                    + '<td style="padding:0.4rem 0.45rem;color:#64748b;">' + itemNum + '</td>'
                    + '<td style="padding:0.4rem 0.45rem;"><strong>' + p.name + '</strong>' + hsCode + desc
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
                'user-token': state.currentUser.id
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

    function updateNcmPreview() {
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
        } else {
            ncmPreviewEl.className = 'ncm-preview warning';
            ncmPreviewEl.innerHTML = `
                <div>NCM <span class="ncm-badge">${clean}</span> não encontrado na base local.</div>
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

        const data = await mlApiFetch(`/api/ml-category?q=${encodeURIComponent(query)}`);
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
        const price = num('mkt-f-price');
        if (!resolvedCategoryId || price <= 0) return;

        const data = await mlApiFetch(`/api/ml-fee?price=${encodeURIComponent(price)}&category=${encodeURIComponent(resolvedCategoryId)}`);
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
                alert('Informe o nome/tipo do produto para pesquisar.');
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

            const data = await mlApiFetch(`/api/ml-best-seller?category=${encodeURIComponent(resolvedCategoryId)}`);
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
        const refCost = source === 'formal' ? lastFormalUnitCost : lastSimpUnitCost;

        const refSimplesEl = document.getElementById('mkt-ref-simples');
        const refFormalEl = document.getElementById('mkt-ref-formal');
        if (refSimplesEl) refSimplesEl.value = brl(lastSimpUnitCost);
        if (refFormalEl) refFormalEl.value = brl(lastFormalUnitCost);

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
    renderMercado();
}

// 6. IMPORTS HISTORY (SAVE & LOAD) MODULE
function initHistoryModule() {
    const btnSave = document.getElementById('btn-save-import');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            if (state.products.length === 0) {
                alert('Adicione pelo menos um produto na calculadora antes de salvar a importação.');
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
                        alert('Erro técnico do Banco de Dados: ' + result.error.message + '\n\nCertifique-se de que rodou o script SQL no painel do Supabase corretamente.');
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
            
            alert(`Lote "${finalName}" salvo no histórico com sucesso!`);
            renderHistoryTable();
        });
    }

    renderHistoryTable();
}

async function renderHistoryTable() {
    const tbody = document.getElementById('tbody-saved-imports');
    if (!tbody) return;

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
                    id: `'${row.id}'`, // String format for Supabase UUID
                    name: row.name,
                    date: new Date(row.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(row.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
                    itemsCount: totalQty,
                    currency: s.currency || 'USD',
                    fobBRL: totalFobBRL,
                    totalBRL: totalImportBRL
                };
            });
        } catch(e) {
            console.error('Erro ao buscar histórico do Supabase', e);
        }
    } else {
        try {
            historyList = JSON.parse(localStorage.getItem('import_rateio_history')) || [];
        } catch(e) {
            historyList = [];
        }
    }

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
            <td><strong>${item.name}</strong></td>
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
    if (confirm('Deseja realmente excluir este lote do histórico?')) {
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
        if (confirm(`Deseja carregar a importação "${item.name}" na calculadora? Isso substituirá seus dados atuais.`)) {
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
            
            document.getElementById('view-calculator').classList.remove('hidden');
            document.getElementById('view-imports').classList.add('hidden');
            document.querySelectorAll('.nav-item, .nav-subitem').forEach(btn => btn.classList.remove('active'));
            document.querySelector('[data-view="view-calculator"]').classList.add('active');
            
            alert(`Lote "${item.name}" carregado com sucesso na calculadora!`);
        }
    }
}

// 7. SETTINGS AND THEME SELECTION UTILITIES
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

    // Delegated click handler for "Conectar Conta ML" in Viabilidade
    // This works even if the button is re‑created by any UI update.
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'btn-viab-connect-ml') {
        e.preventDefault();
        const url = (state.currentUser && state.currentUser.id)
          ? `/api/ml-auth?userId=${state.currentUser.id}`
          : '/api/ml-auth';
        window.location.href = url;
      }
    });

    const btnLight = document.getElementById('btn-theme-light-choice');
    const btnDark = document.getElementById('btn-theme-dark-choice');
    
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
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
                if (!confirm('Desconectar sua conta do Mercado Livre? As simulações voltarão a usar estimativas padrão até você reconectar.')) return;

                btnDisconnectMl.disabled = true;
                try {
                    await fetch('/api/ml-disconnect', {
                        method: 'POST',
                        headers: { 'user-token': state.currentUser.id }
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

    // Sincronizar status do Mercado Livre (Aba Viabilidade)
    const btnViabConnectMl = document.getElementById('btn-viab-connect-ml');
    const statusTextViabMl = document.getElementById('viab-ml-status-text');
    if (btnViabConnectMl && statusTextViabMl) {
        mlApiFetch('/api/ml-status').then(res => {
            if (res && res.connected) {
                statusTextViabMl.textContent = `Conectado como: ${res.nickname}`;
                statusTextViabMl.style.color = 'var(--success)';
                btnViabConnectMl.textContent = 'Reconectar';
                btnViabConnectMl.className = 'btn btn-secondary btn-sm';
            } else {
                statusTextViabMl.textContent = 'Não conectado. Algumas simulações automáticas usarão estimativas padrão.';
                statusTextViabMl.style.color = 'var(--danger)';
                btnViabConnectMl.textContent = 'Conectar Conta ML';
                btnViabConnectMl.className = 'btn btn-primary btn-sm';
                btnViabConnectMl.style.backgroundColor = '#FFE600';
                btnViabConnectMl.style.color = '#2D3277';
            }
        });
    }

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
    
    document.getElementById('btn-reset-database').onclick = () => {
        if (confirm('ATENÇÃO: Isso apagará TODOS os dados salvos locais no navegador, incluindo histórico de lotes, produtos catalogados e empresa importadora. Deseja realmente resetar a base de dados?')) {
            localStorage.clear();
            alert('Toda a base de dados foi apagada. A página será reiniciada.');
            location.reload();
        }
    };
    
    document.getElementById('btn-open-payment-settings').onclick = () => {
        const paymentModal = document.getElementById('payment-modal');
        if (paymentModal) paymentModal.classList.remove('hidden');
    };
}


