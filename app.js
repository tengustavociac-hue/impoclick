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

// O estado inicial, guardado antes de qualquer mudança. Lote salvo por uma
// versão antiga pode não ter algum campo; o relatório "Ver" completa com
// estes valores, e não com o que estiver aberto na calculadora.
const ESTADO_PADRAO = JSON.parse(JSON.stringify(state));

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

// Preenchem um campo do formulário só se ele existir de fato.
//
// O bloco de restauração em loadState() tinha ~20 `getElementById(...).value =`
// seguidos, sem nenhuma guarda. Como tudo roda dentro de um try, bastava UM id
// renomeado no index.html pra primeira linha a falhar abortar todo o resto: a
// simulação do usuário voltava pela metade, alguns campos preenchidos e outros
// no padrão, e o único sinal era uma linha no console. Agora um id faltando
// custa só aquele campo, e diz qual é.
function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Campo #${id} não existe no HTML — restauração do estado ignorou este valor.`);
        return;
    }
    el.value = value;
}

function setFieldChecked(id, checked) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Campo #${id} não existe no HTML — restauração do estado ignorou este valor.`);
        return;
    }
    el.checked = !!checked;
}

// Subgrupos recolhíveis da barra lateral.
//
// O estado fica em localStorage e não no banco: é preferência de janela, não
// dado da conta — e guardar no servidor faria a barra "piscar" no carregamento,
// enquanto a sessão não voltasse.
const CHAVE_SUBGRUPOS = 'impoclick_subgrupos_abertos';

function lerSubgruposAbertos() {
    try {
        return new Set(JSON.parse(localStorage.getItem(CHAVE_SUBGRUPOS) || '[]'));
    } catch (e) {
        return new Set();
    }
}

function abrirSubgrupo(grupo, abrir) {
    if (!grupo) return;
    grupo.classList.toggle('open', abrir);

    const itens = grupo.querySelector('.nav-dropdown-items');
    if (itens) itens.classList.toggle('hidden', !abrir);

    const botao = grupo.querySelector('.nav-subgroup-toggle');
    if (botao) botao.setAttribute('aria-expanded', String(abrir));

    const chave = grupo.getAttribute('data-subgroup');
    if (!chave) return;
    const abertos = lerSubgruposAbertos();
    if (abrir) abertos.add(chave); else abertos.delete(chave);
    try {
        localStorage.setItem(CHAVE_SUBGRUPOS, JSON.stringify([...abertos]));
    } catch (e) { /* localStorage bloqueado: a barra segue funcionando, só não lembra */ }
}

function restaurarSubgrupos() {
    const abertos = lerSubgruposAbertos();
    document.querySelectorAll('.nav-dropdown-group[data-subgroup]').forEach(g => {
        abrirSubgrupo(g, abertos.has(g.getAttribute('data-subgroup')));
    });
}

// LOAD PERSISTED STATE
async function loadState() {
    let savedState = null;
    if (state.currentUser) {
        try {
            savedState = await window.db.getActiveSimulation();
            state.catalog = await window.db.getCatalog();
            state.company = await window.db.getCompany();
        } catch(e){
            // Este catch era vazio: se a leitura do Supabase falhasse, o app
            // seguia com catálogo e empresa vazios como se o usuário não
            // tivesse nada salvo — indistinguível de conta nova. Agora pelo
            // menos aparece no console.
            console.error('Falha ao carregar dados salvos do Supabase (catálogo/empresa/simulação):', e);
        }
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
            setFieldValue('select-currency', state.currency);
            setFieldValue('input-exchange-rate', state.exchangeRate);
            setFieldValue('input-freight', state.freight);
            setFieldChecked('freight-in-brl', state.freightInBRL);
            setFieldValue('input-insurance', state.insurance);
            setFieldChecked('insurance-in-brl', state.insuranceInBRL);
            setFieldValue('input-other-fees', state.fees);
            setFieldChecked('fees-in-brl', state.feesInBRL);

            // Tax radio
            const taxModeRadio = document.querySelector(`input[name="tax-mode"][value="${state.taxMode}"]`);
            if (taxModeRadio) taxModeRadio.checked = true;
            setFieldValue('select-tax-regime', state.taxRegime);
            setFieldValue('input-custom-ii', state.customII);
            setFieldValue('input-custom-icms', state.customICMS);
            setFieldValue('input-icms-rate', state.icmsRate);
            setFieldValue('input-manual-ii', state.manualII);
            setFieldValue('input-manual-icms', state.manualICMS);

            // Splits
            setFieldValue('select-freight-split', state.freightSplit);
            setFieldValue('select-insurance-split', state.insuranceSplit);
            setFieldValue('select-fees-split', state.feesSplit);
            setFieldValue('select-tax-split', state.taxSplit);

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
            setFieldValue('input-spread', state.spread !== undefined ? state.spread : 4.0);
            setFieldValue('input-iof', state.iof !== undefined ? state.iof : 2.38);
            setFieldChecked('toggle-resale-mode', state.resaleMode || false);
            setFieldValue('input-global-margin', state.globalMargin !== undefined ? state.globalMargin : 40);
 
            // Load exchange mode selection
            state.exchangeMode = parsed.exchangeMode || 'simple';
            const exModeRadio = document.querySelector(`input[name="exchange-mode"][value="${state.exchangeMode}"]`);
            if (exModeRadio) {
                exModeRadio.checked = true;
            }
 
            const configFields = document.getElementById('resale-config-fields');
            if (configFields) {
                configFields.classList.toggle('hidden', !state.resaleMode);
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
    const gradStart = `color-mix(in oklab, ${color} 25%, transparent)`;
    const gradEnd = 'transparent';
    
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
    if (urlParams.has('shopee_connected')) {
        const ok = urlParams.get('shopee_connected') === 'true';
        showToast(ok ? 'Conta da Shopee conectada com sucesso!' : 'Não foi possível conectar a conta da Shopee.', ok ? 'success' : 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => {
            const btnSettings = document.querySelector('[data-view="view-settings"]');
            if (btnSettings) btnSettings.click();
        }, 500);
    }
    if (urlParams.has('amazon_ads_connected')) {
        const ok = urlParams.get('amazon_ads_connected') === 'true';
        showToast(ok ? 'Anúncios da Amazon conectados com sucesso!' : 'Não foi possível conectar os anúncios da Amazon.', ok ? 'success' : 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
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
    // Link do popup da extensão para a aba de Patrocinados.
    if (window.location.hash === '#view-ads') {
        setTimeout(() => {
            const btnAds = document.querySelector('[data-view="view-ads"]');
            if (btnAds) btnAds.click();
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
    // Aceita link direto pra uma sub-aba específica: #view-promotions/ended ou
    // #view-promotions/lightning (senão abre em "active").
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

    // Link de "esqueci minha senha": o Supabase já abriu a sessão pelo token
    // do link, então sem isto a pessoa cairia direto no app sem nunca
    // escolher a senha nova — e continuaria sem saber qual é.
    const veioDeRecuperacao = /type=recovery/.test(window.__authRedirectHash || '');
    if (state.currentUser && veioDeRecuperacao) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Link de e-mail vencido ou já usado: o Supabase devolve error_code no
    // endereço e a pessoa caía no login sem saber o que houve.
    const linkVencido = /error_code=otp_expired|error=access_denied/.test(window.__authRedirectHash || '');

    // Quem chega por link de confirmação/recuperação (ou com #login) espera
    // a tela de login, não a página de apresentação. Se a confirmação deu
    // certo o app abre direto; isso cobre o caso em que ela falhou.
    if (/access_token|type=|error/.test(window.__authRedirectHash || '') || window.location.hash === '#login') {
        showAuthScreen = true;
    }

    syncViabMlStatus();
    await loadState();
    registerEventListeners();
    registerAuthEventListeners();
    registerSubscriptionEventListeners();
    if (state.currentUser && veioDeRecuperacao) openRecoveryModal();
    if (linkVencido) {
        showAuthAlert(document.getElementById('login-alert'), 'error',
            'Esse link de e-mail venceu ou já foi usado. Para trocar a senha, peça um novo em "Esqueci minha senha".');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
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

    // ==========================================================
    // IMPORTAÇÃO POR NF-e (XML)
    //
    // A NF-e traz cada item em <det><prod>, com nome, NCM, quantidade e preço
    // unitário em campos próprios — extração exata, sem heurística e sem IA.
    // Preço vem em REAIS; o simulador trabalha em dólar, então a conversão usa
    // a cotação que o usuário informa (a taxa da operação real quase nunca é a
    // do dia). Peso não existe por item na NF-e, então fica em branco.
    // ==========================================================
    const inputNfeXml = document.getElementById('input-nfe-xml');
    const nfeCambioBox = document.getElementById('nfe-cambio-box');
    const inputNfeCambio = document.getElementById('input-nfe-cambio');
    const nfeAchadosEl = document.getElementById('nfe-achados');
    const btnNfeUsarCotacao = document.getElementById('btn-nfe-usar-cotacao');
    const btnNfeConfirmar = document.getElementById('btn-nfe-confirmar');
    const btnNfeCancelar = document.getElementById('btn-nfe-cancelar');

    // Itens lidos das notas, aguardando a cotação para virarem produtos.
    let itensDaNfe = [];

    // getElementsByTagNameNS('*', ...) em vez de getElementsByTagName: a NF-e
    // usa o namespace http://www.portalfiscal.inf.br/nfe e alguns emissores
    // ainda mandam o XML com prefixo. Buscar ignorando o namespace pega os dois.
    const tagTexto = (el, nome) => {
        if (!el) return '';
        const achado = el.getElementsByTagNameNS('*', nome)[0];
        return achado ? String(achado.textContent || '').trim() : '';
    };

    // O NCM já define as alíquotas de II/IPI no regime "Importação Formal", via
    // getProductTaxRates(). O que ele NÃO fazia era acionar as isenções: a
    // importação marcava tudo como 'taxable', então livro e medicamento vindos
    // da nota perdiam a imunidade e eram tributados como qualquer produto.
    //
    // Livros, jornais e periódicos: imunidade do art. 150, VI, "d" da
    // Constituição — capítulo 49, posições 4901 a 4904.
    // Medicamentos: posições 3003 e 3004, isentos de II (o ICMS continua).
    // Código usado quando o NCM da origem não serve. Precisa existir na tabela,
    // senão o cálculo do regime formal não teria de onde tirar alíquota.
    const NCM_PADRAO = '65050099';

    // Diagnóstico do NCM: diz QUAL código falhou e POR QUÊ, em vez de só contar
    // quantos. NCM errado não quebra a importação — o produto entra com alíquota
    // genérica e o custo sai errado sem nenhum aviso, que é o pior dos casos.
    function diagnosticarNcm(bruto) {
        const digitos = String(bruto == null ? '' : bruto).replace(/\D/g, '');

        if (!digitos) {
            return { ncm: NCM_PADRAO, problema: 'ausente', bruto: '',
                explicacao: 'A linha não trouxe nenhum código.' };
        }
        if (digitos.length < 8) {
            return { ncm: NCM_PADRAO, problema: 'incompleto', bruto: digitos,
                explicacao: `Tem ${digitos.length} dígito(s). O HS Code internacional usa 6 e o NCM brasileiro usa 8 — os dois últimos são classificação nacional, que o fornecedor estrangeiro não tem como preencher.` };
        }
        if (digitos.length > 8) {
            return { ncm: NCM_PADRAO, problema: 'longo', bruto: digitos,
                explicacao: `Tem ${digitos.length} dígitos, mais que os 8 do NCM. Costuma ser código interno do fornecedor na mesma coluna.` };
        }

        const achado = (typeof lookupLocalNcm === 'function') ? lookupLocalNcm(digitos) : null;
        if (!achado) {
            // Mantém o código do arquivo: ele pode estar certo e só faltar na
            // nossa tabela. Trocar pelo padrão esconderia o dado de origem.
            return { ncm: digitos, problema: 'desconhecido', bruto: digitos,
                explicacao: 'Tem 8 dígitos, mas não consta na tabela oficial TEC/TIPI. Confira a digitação — o cálculo vai usar alíquota genérica.' };
        }
        return { ncm: digitos, problema: null, bruto: digitos, aliquotas: achado };
    }

    const ROTULO_PROBLEMA_NCM = {
        ausente: 'sem NCM',
        incompleto: 'NCM incompleto',
        longo: 'NCM longo demais',
        desconhecido: 'NCM fora da tabela oficial',
    };

    // Agrupa por tipo de problema para a lista não virar uma parede de linhas
    // repetindo a mesma explicação em invoice de 58 itens.
    function relatorioNcm(itens) {
        const grupos = new Map();
        itens.forEach((item) => {
            if (!item.ncmProblema) return;
            if (!grupos.has(item.ncmProblema)) {
                grupos.set(item.ncmProblema, { explicacao: item.ncmExplicacao, produtos: [] });
            }
            grupos.get(item.ncmProblema).produtos.push({ nome: item.nome, bruto: item.ncmBruto });
        });
        if (!grupos.size) return '';

        const total = itens.filter((i) => i.ncmProblema).length;
        const blocos = [...grupos.entries()].map(([tipo, dados]) => {
            const lista = dados.produtos.slice(0, 6).map((p) =>
                `<li><code>${escapeHtml(p.bruto || '—')}</code> ${escapeHtml(p.nome.slice(0, 40))}</li>`
            ).join('');
            const resto = dados.produtos.length > 6 ? `<li>… e mais ${dados.produtos.length - 6}</li>` : '';
            return `<div class="ncm-problema">
                        <strong>${ROTULO_PROBLEMA_NCM[tipo] || tipo} — ${dados.produtos.length} item(ns)</strong>
                        <p>${escapeHtml(dados.explicacao)}</p>
                        <ul>${lista}${resto}</ul>
                    </div>`;
        }).join('');

        return `<div class="ncm-problemas-box">
                    <strong class="ncm-problemas-titulo">⚠ ${total} item(ns) com problema no NCM</strong>
                    ${blocos}
                    <p class="ncm-problemas-rodape">Eles serão importados assim mesmo, com alíquota genérica. Corrija o NCM de cada um na lista de produtos para o cálculo ficar correto.</p>
                </div>`;
    }

    function tributacaoPorNcm(ncm) {
        if (/^490[1234]/.test(ncm)) return 'exempt-books';
        if (/^300[34]/.test(ncm)) return 'exempt-meds';
        return 'taxable';
    }

    function lerItensDaNfe(xmlTexto, nomeArquivo) {
        const doc = new DOMParser().parseFromString(xmlTexto, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) {
            throw new Error(`${nomeArquivo}: arquivo não é um XML válido.`);
        }

        const dets = doc.getElementsByTagNameNS('*', 'det');
        if (!dets.length) {
            throw new Error(`${nomeArquivo}: nenhum item encontrado — confira se é o XML da NF-e, e não o DANFE em PDF.`);
        }

        const itens = [];
        for (const det of dets) {
            const prod = det.getElementsByTagNameNS('*', 'prod')[0];
            if (!prod) continue;

            const nome = tagTexto(prod, 'xProd');
            const quantidade = parseFloat(tagTexto(prod, 'qCom'));
            const precoBRL = parseFloat(tagTexto(prod, 'vUnCom'));
            // Só os dígitos: alguns emissores mandam o NCM formatado.
            const ncm = tagTexto(prod, 'NCM').replace(/\D/g, '');
            // infAdProd é irmão de prod e costuma trazer a descrição longa,
            // que serve melhor para a invoice do que o nome curto.
            const descricao = tagTexto(det, 'infAdProd') || nome;

            if (!nome || !Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(precoBRL) || precoBRL <= 0) {
                continue;
            }

            const diag = diagnosticarNcm(ncm);
            itens.push({
                nome,
                // A NF-e permite quantidade fracionada; o simulador trabalha com
                // unidades inteiras, então arredonda para cima para não sumir
                // com item de 0,5 caixa.
                quantidade: Math.max(1, Math.ceil(quantidade)),
                precoBRL,
                ncm: diag.ncm,
                descricao,
                tributacao: tributacaoPorNcm(diag.ncm),
                ncmProblema: diag.problema,
                ncmExplicacao: diag.explicacao || '',
                ncmBruto: diag.bruto,
                aliquotas: diag.aliquotas || null,
            });
        }

        if (!itens.length) {
            throw new Error(`${nomeArquivo}: os itens da nota estão sem nome, quantidade ou preço válidos.`);
        }
        return itens;
    }

    const mostrarStatusImportacao = (classe, html) => {
        if (!bulkStatusEl) return;
        bulkStatusEl.classList.remove('hidden');
        bulkStatusEl.className = `ncm-preview ${classe}`;
        bulkStatusEl.innerHTML = `<div>${html}</div>`;
    };

    const fecharCaixaNfe = () => {
        itensDaNfe = [];
        if (nfeCambioBox) nfeCambioBox.classList.add('hidden');
        if (inputNfeXml) inputNfeXml.value = '';
    };

    if (inputNfeXml) {
        inputNfeXml.addEventListener('change', async () => {
            const arquivos = Array.from(inputNfeXml.files || []);
            if (!arquivos.length) return;

            const lidos = [];
            const falhas = [];

            for (const arquivo of arquivos) {
                try {
                    const texto = await arquivo.text();
                    lidos.push(...lerItensDaNfe(texto, arquivo.name));
                } catch (erro) {
                    falhas.push(erro.message);
                }
            }

            if (!lidos.length) {
                mostrarStatusImportacao('warning', falhas.join('<br>') || 'Nenhum item encontrado nas notas enviadas.');
                fecharCaixaNfe();
                return;
            }

            itensDaNfe = lidos;

            const totalBRL = lidos.reduce((soma, i) => soma + i.precoBRL * i.quantidade, 0);
            const comAliquota = lidos.filter((i) => i.aliquotas).length;
            const livros = lidos.filter((i) => i.tributacao === 'exempt-books').length;
            const remedios = lidos.filter((i) => i.tributacao === 'exempt-meds').length;

            if (nfeAchadosEl) {
                const isentos = [
                    livros ? `${livros} livro(s)` : '',
                    remedios ? `${remedios} medicamento(s)` : '',
                ].filter(Boolean).join(' e ');

                nfeAchadosEl.innerHTML =
                    `<strong>${lidos.length} produto(s)</strong> encontrado(s) em ${arquivos.length} nota(s), `
                    + `somando <strong>${formatCurrency(totalBRL, 'BRL')}</strong>.`
                    // Torna visível que o NCM da nota foi reconhecido na tabela
                    // oficial — é dele que saem as alíquotas do regime formal.
                    + `<br>NCM reconhecido na tabela TEC/TIPI em <strong>${comAliquota} de ${lidos.length}</strong> item(ns).`
                    + relatorioNcm(lidos)
                    // Mudança de tributação mexe no imposto, então nunca acontece
                    // em silêncio: se algum item virou isento, o usuário lê aqui
                    // antes de confirmar.
                    + (isentos ? `<br>${isentos} identificado(s) pelo NCM e marcado(s) como <strong>isento(s)</strong>.` : '')
                    + (falhas.length ? `<br><span class="nfe-falha">${falhas.length} arquivo(s) ignorado(s).</span>` : '');
            }

            // Pré-preenche com a cotação que o app já busca, mas deixa editável:
            // é ela que o usuário mais provavelmente quer ajustar.
            if (inputNfeCambio && !inputNfeCambio.value) {
                inputNfeCambio.value = Number(state.exchangeRate || 0).toFixed(4);
            }
            if (nfeCambioBox) nfeCambioBox.classList.remove('hidden');
            if (bulkStatusEl) bulkStatusEl.classList.add('hidden');
            if (inputNfeCambio) inputNfeCambio.focus();
        });
    }

    if (btnNfeUsarCotacao) {
        btnNfeUsarCotacao.addEventListener('click', () => {
            if (inputNfeCambio) inputNfeCambio.value = Number(state.exchangeRate || 0).toFixed(4);
        });
    }

    if (btnNfeCancelar) {
        btnNfeCancelar.addEventListener('click', fecharCaixaNfe);
    }

    if (btnNfeConfirmar) {
        btnNfeConfirmar.addEventListener('click', () => {
            const cambio = parseFloat(String(inputNfeCambio && inputNfeCambio.value).replace(',', '.'));
            if (!Number.isFinite(cambio) || cambio <= 0) {
                showToast('Informe a cotação usada para converter a nota.', 'error');
                if (inputNfeCambio) inputNfeCambio.focus();
                return;
            }
            if (!itensDaNfe.length) {
                fecharCaixaNfe();
                return;
            }

            itensDaNfe.forEach((item, indice) => {
                // Duas casas é o que o formulário mostra e como se pensa preço em
                // dólar. Mas item barato dividido por ~5 pode zerar no
                // arredondamento, e produto de graça quebraria o rateio — nesse
                // caso guarda quatro casas.
                const bruto = item.precoBRL / cambio;
                const precoUSD = bruto >= 0.005 ? Math.round(bruto * 100) / 100 : Math.round(bruto * 10000) / 10000;

                state.products.push({
                    id: Date.now() + indice,
                    name: item.nome,
                    qty: item.quantidade,
                    unitPrice: precoUSD,
                    unitWeight: 0,
                    taxation: item.tributacao,
                    description: item.descricao,
                    ncm: item.ncm,
                    image: '',
                });
            });

            const total = itensDaNfe.length;
            mostrarStatusImportacao(
                'success',
                `${total} produto(s) importado(s) da NF-e, convertidos a R$ ${cambio.toFixed(4)} por dólar. `
                + 'Confira o peso de cada item — a nota fiscal não informa peso unitário.'
            );
            showToast(`${total} produto(s) importado(s) da nota fiscal!`, 'success');

            fecharCaixaNfe();
            saveState();
            updateUI();
        });
    }

    // ==========================================================
    // IMPORTAÇÃO POR COMMERCIAL INVOICE (Excel / CSV)
    //
    // Diferente da NF-e, a Commercial Invoice não tem formato padrão: cada
    // fornecedor nomeia as colunas do seu jeito e põe título, endereço e dados
    // de embarque acima da tabela. Por isso o cabeçalho é procurado, as colunas
    // são adivinhadas por sinônimos, e o resultado é SEMPRE mostrado para
    // conferência antes de virar produto — importar com a coluna errada
    // envenenaria o custo de toda a simulação sem dar nenhum sinal.
    //
    // O preço já vem em dólar, então não há conversão. O peso fica em branco.
    // ==========================================================
    const inputInvoice = document.getElementById('input-invoice');
    const invoiceBox = document.getElementById('invoice-box');
    const invoiceAchadosEl = document.getElementById('invoice-achados');
    const invoicePreviaEl = document.getElementById('invoice-previa');
    const btnInvoiceConfirmar = document.getElementById('btn-invoice-confirmar');
    const btnInvoiceCancelar = document.getElementById('btn-invoice-cancelar');
    const seletoresInvoice = {
        nome: document.getElementById('ci-col-nome'),
        descricao: document.getElementById('ci-col-desc'),
        qtd: document.getElementById('ci-col-qtd'),
        preco: document.getElementById('ci-col-preco'),
        ncm: document.getElementById('ci-col-ncm'),
    };

    // Linhas da planilha aguardando o mapeamento ser confirmado.
    let linhasInvoice = [];
    let cabecalhoInvoiceIdx = -1;

    // Cada lista vai do termo MAIS específico para o mais genérico: a busca por
    // trecho usa a primeira que casar, então "product name" precisa ser testada
    // antes de "name", e "unit price" antes de "price".
    const SINONIMOS_INVOICE = {
        nome: ['product name', 'productname', 'product', 'commodity', 'goods name', 'goods',
               'model no', 'model', 'style no', 'style', 'article', 'name',
               'nome do produto', 'nome', 'produto', 'mercadoria'],
        descricao: ['product description', 'description of goods', 'item description', 'descriptions',
                    'description', 'specification', 'specifications', 'specs',
                    'descricao do produto', 'descricao', 'especificacao'],
        qtd: ['total qty', "q'ty", 'qty.', 'qty', 'quantity', 'quantities', 'pcs', 'pieces', 'piece',
              'qtde', 'qtd', 'quantidade', 'unidades'],
        preco: ['fob unit price', 'unit price usd', 'unit price', 'unitprice', 'u/price', 'u price',
                'uprice', 'unit cost', 'fob price', 'price usd', 'preco unitario', 'valor unitario',
                'fob', 'price', 'preco'],
        ncm: ['h.s. code', 'hs code', 'hscode', 'hs-code', 'hs no', 'customs code', 'tariff code',
              'tariff', 'codigo ncm', 'ncm', 'hs'],
    };

    // Duas famílias que jamais podem ser aproveitadas:
    //
    // Numeração da linha ("ITEM", "NO."): "item" estava na lista de nome e o
    // resultado foi produto chamado "1", "2", "3" — a coluna de contagem vencia
    // a de nome por vir antes na planilha.
    //
    // Total da linha ("AMOUNT", "TOTAL"): confundido com preço unitário,
    // multiplicaria o custo pela quantidade sem nada parecer errado na tela.
    const NUNCA_APROVEITAR = [
        'no', 'no.', 'n', 'nr', 'num', 'number', 'item', 'item no', 'item no.', 'items',
        's/n', 'sn', 'sr no', 'seq', 'sequencia', 'linha', 'line', '#', 'ordem',
        'amount', 'amount usd', 'total', 'total amount', 'total price', 'total fob',
        'valor total', 'subtotal', 'sum',
    ];

    const normalizarCabecalho = (texto) => String(texto == null ? '' : texto)
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s\/'.#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    function classificarCabecalho(texto) {
        const t = normalizarCabecalho(texto);
        if (!t || NUNCA_APROVEITAR.includes(t)) return null;
        for (const [campo, termos] of Object.entries(SINONIMOS_INVOICE)) {
            if (termos.includes(t)) return campo;
        }
        // Só depois da correspondência exata: "unit price (usd)" contém
        // "unit price", mas "amount" jamais pode virar preço. O mínimo de 4
        // caracteres evita que "hs" case dentro de qualquer palavra.
        for (const [campo, termos] of Object.entries(SINONIMOS_INVOICE)) {
            if (termos.some((termo) => termo.length >= 4 && t.includes(termo))) return campo;
        }
        return null;
    }

    function acharLinhaCabecalho(linhas) {
        let melhor = { indice: -1, pontos: 0 };
        for (let i = 0; i < Math.min(linhas.length, 25); i++) {
            const campos = new Set();
            for (const celula of linhas[i] || []) {
                const campo = classificarCabecalho(celula);
                if (campo) campos.add(campo);
            }
            // Exige quantidade ou preço: uma linha só com "description" pode ser
            // texto solto do cabeçalho da carta, não a tabela de itens.
            if ((campos.has('qtd') || campos.has('preco')) && campos.size > melhor.pontos) {
                melhor = { indice: i, pontos: campos.size };
            }
        }
        return melhor.indice;
    }

    // Número em planilha vem de tudo quanto é jeito: "1,234.56", "1.234,56",
    // "US$ 12.50", "12,50", ou já como number quando o Excel tipou a célula.
    function lerNumeroInvoice(valor) {
        if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
        if (valor == null) return NaN;

        let t = String(valor).trim().replace(/[^\d.,\-]/g, '').replace(/(?!^)-/g, '');
        if (!t || t === '-') return NaN;

        const temPonto = t.includes('.');
        const temVirgula = t.includes(',');

        if (temPonto && temVirgula) {
            // O separador decimal é o que aparece por último.
            const decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
            const milhar = decimal === '.' ? ',' : '.';
            t = t.split(milhar).join('').replace(decimal, '.');
        } else if (temVirgula) {
            // Vírgula sozinha: decimal ("12,50") ou milhar ("1,234")? Três
            // dígitos depois e nenhum outro separador indica milhar.
            const partes = t.split(',');
            t = (partes.length > 2 || partes[partes.length - 1].length === 3) ? partes.join('') : t.replace(',', '.');
        } else if (temPonto) {
            const partes = t.split('.');
            // Em invoice de fornecedor o ponto é decimal, então só trata como
            // milhar quando há mais de um.
            if (partes.length > 2) t = partes.join('');
        }

        const n = parseFloat(t);
        return Number.isFinite(n) ? n : NaN;
    }

    function extrairItensInvoice(linhas, cabecalhoIdx, mapa) {
        const itens = [];
        for (let i = cabecalhoIdx + 1; i < linhas.length; i++) {
            const linha = linhas[i] || [];
            const bruto = linha.map((c) => String(c == null ? '' : c).trim());
            if (!bruto.some(Boolean)) continue;

            // Linha de fechamento encerra a tabela: seguir adiante importaria o
            // somatório como se fosse mais um produto.
            const primeira = normalizarCabecalho(bruto.find(Boolean) || '');
            if (/^(total|grand total|subtotal|sum|amount in words|say total)/.test(primeira)) break;

            const celula = (indice) => (indice >= 0 ? String(linha[indice] == null ? '' : linha[indice]).trim() : '');

            // Muitas invoices têm só "DESCRIPTION" e nenhuma coluna de nome. Uma
            // cobre a outra, nos dois sentidos, para nunca importar produto sem
            // nome — foi assim que a lista veio cheia de "1", "2", "3".
            const nome = celula(mapa.nome) || celula(mapa.descricao);
            const descricao = celula(mapa.descricao) || nome;
            const qtd = mapa.qtd >= 0 ? lerNumeroInvoice(linha[mapa.qtd]) : NaN;
            const preco = mapa.preco >= 0 ? lerNumeroInvoice(linha[mapa.preco]) : NaN;
            if (!nome || !Number.isFinite(qtd) || qtd <= 0 || !Number.isFinite(preco) || preco <= 0) continue;

            const diag = diagnosticarNcm(mapa.ncm >= 0 ? linha[mapa.ncm] : '');

            itens.push({
                nome,
                descricao,
                quantidade: Math.max(1, Math.ceil(qtd)),
                precoUSD: preco,
                ncm: diag.ncm,
                ncmProblema: diag.problema,
                ncmExplicacao: diag.explicacao || '',
                ncmBruto: diag.bruto,
            });
        }
        return itens;
    }

    const fecharCaixaInvoice = () => {
        linhasInvoice = [];
        cabecalhoInvoiceIdx = -1;
        if (invoiceBox) invoiceBox.classList.add('hidden');
        if (inputInvoice) inputInvoice.value = '';
    };

    const mapaAtualInvoice = () => ({
        nome: parseInt(seletoresInvoice.nome.value, 10),
        descricao: parseInt(seletoresInvoice.descricao.value, 10),
        qtd: parseInt(seletoresInvoice.qtd.value, 10),
        preco: parseInt(seletoresInvoice.preco.value, 10),
        ncm: parseInt(seletoresInvoice.ncm.value, 10),
    });

    // Redesenha a prévia a cada troca de coluna: é ela que deixa o erro de
    // mapeamento visível antes de virar custo.
    function atualizarPreviaInvoice() {
        if (cabecalhoInvoiceIdx < 0 || !invoicePreviaEl) return;
        const itens = extrairItensInvoice(linhasInvoice, cabecalhoInvoiceIdx, mapaAtualInvoice());

        if (!itens.length) {
            invoicePreviaEl.innerHTML = '<span class="nfe-falha">Nenhuma linha válida com esse mapeamento. Confira as colunas.</span>';
            if (btnInvoiceConfirmar) btnInvoiceConfirmar.disabled = true;
            return;
        }
        if (btnInvoiceConfirmar) btnInvoiceConfirmar.disabled = false;

        const totalUSD = itens.reduce((s, i) => s + i.precoUSD * i.quantidade, 0);
        const amostra = itens.slice(0, 3).map((i) =>
            `<tr><td>${escapeHtml(i.nome.slice(0, 34))}</td><td class="text-right">${i.quantidade}</td>`
            + `<td class="text-right">${formatCurrency(i.precoUSD, 'USD')}</td>`
            + `<td class="text-right">${i.ncmProblema ? `<span class="nfe-falha">${escapeHtml(i.ncmBruto || '—')}</span>` : i.ncm}</td></tr>`
        ).join('');

        invoicePreviaEl.innerHTML =
            `<table class="ci-tabela"><thead><tr><th>Produto</th><th class="text-right">Qtd</th>`
            + `<th class="text-right">Unit.</th><th class="text-right">NCM</th></tr></thead><tbody>${amostra}</tbody></table>`
            + `<p class="ci-resumo"><strong>${itens.length} item(ns)</strong>, total ${formatCurrency(totalUSD, 'USD')}.`
            + (itens.length > 3 ? ` Mostrando os 3 primeiros.` : '')
            + `</p>`
            + relatorioNcm(itens);
    }

    if (inputInvoice) {
        inputInvoice.addEventListener('change', async () => {
            const arquivo = inputInvoice.files && inputInvoice.files[0];
            if (!arquivo) return;

            if (typeof XLSX === 'undefined') {
                mostrarStatusImportacao('warning', 'A biblioteca de planilhas não carregou. Recarregue a página e tente de novo.');
                fecharCaixaInvoice();
                return;
            }

            try {
                const buffer = await arquivo.arrayBuffer();
                const pasta = XLSX.read(buffer, { type: 'array' });
                const aba = pasta.Sheets[pasta.SheetNames[0]];
                // header:1 devolve matriz de linhas, que é o que permite procurar
                // o cabeçalho em vez de assumir que ele está na primeira linha.
                linhasInvoice = XLSX.utils.sheet_to_json(aba, { header: 1, raw: true, defval: '' });
            } catch (erro) {
                console.error('Erro ao ler a Commercial Invoice:', erro);
                mostrarStatusImportacao('warning', 'Não consegui ler este arquivo. Envie a invoice em .xlsx, .xls ou .csv.');
                fecharCaixaInvoice();
                return;
            }

            cabecalhoInvoiceIdx = acharLinhaCabecalho(linhasInvoice);
            if (cabecalhoInvoiceIdx < 0) {
                mostrarStatusImportacao('warning',
                    'Não encontrei a tabela de itens nesta planilha. Ela precisa ter uma linha de cabeçalho com colunas de quantidade e preço unitário.');
                fecharCaixaInvoice();
                return;
            }

            const cabecalho = linhasInvoice[cabecalhoInvoiceIdx] || [];
            const sugerido = { nome: -1, descricao: -1, qtd: -1, preco: -1, ncm: -1 };
            cabecalho.forEach((celula, indice) => {
                const campo = classificarCabecalho(celula);
                if (campo && sugerido[campo] === -1) sugerido[campo] = indice;
            });

            // Preenche os seletores com todas as colunas da planilha, para o
            // usuário corrigir o que a adivinhação errou.
            Object.entries(seletoresInvoice).forEach(([campo, seletor]) => {
                if (!seletor) return;
                const opcoes = ['<option value="-1">— não usar —</option>'];
                cabecalho.forEach((celula, indice) => {
                    const rotulo = String(celula || '').trim() || `Coluna ${indice + 1}`;
                    opcoes.push(`<option value="${indice}">${escapeHtml(rotulo)}</option>`);
                });
                seletor.innerHTML = opcoes.join('');
                seletor.value = String(sugerido[campo]);
                seletor.onchange = atualizarPreviaInvoice;
            });

            // Nome e descrição se cobrem: só avisa que falta quando as DUAS
            // ficaram sem coluna, que é o caso em que o produto entraria anônimo.
            const naoDetectadas = Object.entries(sugerido)
                .filter(([campo, v]) => {
                    if (v !== -1) return false;
                    if (campo === 'nome') return sugerido.descricao === -1;
                    if (campo === 'descricao') return sugerido.nome === -1;
                    return true;
                })
                .map(([k]) => k);
            const rotulos = {
                nome: 'nome do produto',
                descricao: 'descrição',
                qtd: 'quantidade',
                preco: 'preço unitário',
                ncm: 'NCM',
            };
            if (invoiceAchadosEl) {
                invoiceAchadosEl.innerHTML =
                    `Cabeçalho encontrado na <strong>linha ${cabecalhoInvoiceIdx + 1}</strong> de <em>${escapeHtml(arquivo.name)}</em>.`
                    + (naoDetectadas.length
                        ? `<br><span class="nfe-falha">Não identifiquei: ${naoDetectadas.map((c) => rotulos[c]).join(', ')}. Escolha a coluna abaixo.</span>`
                        : '<br>Todas as colunas foram identificadas — confira antes de importar.');
            }

            if (invoiceBox) invoiceBox.classList.remove('hidden');
            if (bulkStatusEl) bulkStatusEl.classList.add('hidden');
            atualizarPreviaInvoice();
        });
    }

    if (btnInvoiceCancelar) btnInvoiceCancelar.addEventListener('click', fecharCaixaInvoice);

    if (btnInvoiceConfirmar) {
        btnInvoiceConfirmar.addEventListener('click', () => {
            const itens = extrairItensInvoice(linhasInvoice, cabecalhoInvoiceIdx, mapaAtualInvoice());
            if (!itens.length) {
                showToast('Nenhum item válido com esse mapeamento de colunas.', 'error');
                return;
            }

            itens.forEach((item, indice) => {
                state.products.push({
                    id: Date.now() + indice,
                    name: item.nome,
                    qty: item.quantidade,
                    // Já em dólar: a Commercial Invoice é a fatura do fornecedor
                    // estrangeiro, então não há conversão a fazer.
                    unitPrice: item.precoUSD,
                    unitWeight: 0,
                    taxation: tributacaoPorNcm(item.ncm),
                    description: item.descricao,
                    ncm: item.ncm,
                    image: '',
                });
            });

            mostrarStatusImportacao('success',
                `${itens.length} produto(s) importado(s) da Commercial Invoice, com preço em dólar. `
                + 'Confira o peso de cada item — a invoice não traz peso unitário.');
            showToast(`${itens.length} produto(s) importado(s) da invoice!`, 'success');

            fecharCaixaInvoice();
            saveState();
            updateUI();
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

// `s` é o estado de onde vêm os caches de NCM. Sem ele, o da calculadora
// aberta; o relatório do histórico passa o do lote salvo.
function getProductTaxRates(ncmCode, s = state) {
    const cleanNcm = ncmCode ? ncmCode.toString().replace(/[^0-9]/g, '') : '';
    // Busca na base local de NCMs (de ncm_db.js)
    if (typeof lookupLocalNcm === 'function') {
        const localData = lookupLocalNcm(cleanNcm);
        if (localData) {
            return {
                // A tabela oficial (TEC/TIPI) não guarda descrição — são ~10.500
                // NCMs e isso quadruplicaria o arquivo. A descrição vem da
                // nomenclatura do Siscomex, que o app já baixa pro ncmCache.
                name: localData.name
                    || (s.ncmCache && s.ncmCache[cleanNcm])
                    || `NCM ${cleanNcm}`,
                ii: localData.ii,
                ipi: localData.ipi,
                pis: localData.pis,
                cofins: localData.cofins,
                // Ambos são alíquota real; 'tec-tipi' só registra que veio da
                // tabela oficial e não da curadoria manual.
                source: localData.origem === 'oficial' ? 'tec-tipi' : 'local'
            };
        }
    }

    // Estimativa do IBPT (populada de forma assíncrona por fetchIbptTaxEstimate,
    // disparada pelas telas de preview de NCM). Aplicada como II para refletir
    // o custo total aproximado, já que o IBPT não discrimina por tributo.
    if (s.ncmRateEstimateCache && s.ncmRateEstimateCache[cleanNcm] != null) {
        return {
            name: (s.ncmCache && s.ncmCache[cleanNcm]) || 'NCM fora da base curada (estimativa IBPT)',
            ii: s.ncmRateEstimateCache[cleanNcm],
            ipi: 0,
            pis: 0,
            cofins: 0,
            source: 'ibpt-estimate'
        };
    }

    // Busca na base cacheada online pesquisada anteriormente
    if (s.ncmCache && s.ncmCache[cleanNcm]) {
        return {
            name: s.ncmCache[cleanNcm],
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

// O campo `source` de getProductTaxRates distingue alíquota REAL de ausência de
// dado, e até aqui nada no app lia esse campo:
//
//   'local'         -> base curada do ncm_db.js, alíquotas de verdade
//   'ibpt-estimate' -> estimativa da API do IBPT
//   'online'        -> base do Siscomex: traz SÓ a descrição do NCM, sem alíquota
//   'fallback'      -> código não encontrado em lugar nenhum
//
// Nos dois últimos casos getProductTaxRates devolve II/IPI/PIS/COFINS = 0, e a
// tabela exibia "0.0%" — visualmente idêntico a um produto legitimamente
// isento. No caso 'online' era pior: a descrição do NCM aparecia correta (são
// ~9300 códigos oficiais), passando a impressão de que o código tinha sido
// reconhecido E as alíquotas conferidas. O usuário decidia importar vendo um
// custo sem II, IPI, PIS e COFINS.
function ratesAreUnknown(rates) {
    return !rates || rates.source === 'online' || rates.source === 'fallback';
}

// Devolve o percentual formatado, ou "n/d" quando não existe alíquota cadastrada.
function formatRatePercent(rates, value, digits) {
    if (ratesAreUnknown(rates)) return 'n/d';
    return `${Number(value || 0).toFixed(digits)}%`;
}

// `s` é o estado do lote: regime, alíquotas, câmbio. Sem ele, o da
// calculadora aberta. Antes a função só lia o global, e por isso só sabia
// calcular o lote que estivesse carregado na tela.
function calculateItemTaxes(itemVABRL, itemFeesBRL, ncm, taxation, totalVAUSD, totalTaxableOfficialVABRL, totalWeight, itemWeight, totalOfficialVABRL, qty, totalQty, s = state) {
    let iiBRL = 0;
    let ipiBRL = 0;
    let pisBRL = 0;
    let cofinsBRL = 0;
    let icmsBRL = 0;
    let ratesUsed = null;

    const icmsRatePercent = s.icmsRate / 100;

    if (s.taxMode === 'auto') {
        if (taxation === 'exempt-books') {
            return { iiBRL: 0, ipiBRL: 0, pisBRL: 0, cofinsBRL: 0, icmsBRL: 0, ratesUsed: null };
        } else if (taxation === 'exempt-meds') {
            const baseICMS = itemVABRL / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
            return { iiBRL: 0, ipiBRL: 0, pisBRL: 0, cofinsBRL: 0, icmsBRL: icmsBRL, ratesUsed: null };
        }

        if (s.taxRegime === 'remessa-conforme') {
            const exchangeFactor = (s.currency === 'BRL' ? 1 : s.exchangeRate);
            if (totalVAUSD <= 50) {
                iiBRL = itemVABRL * 0.20;
            } else {
                const rawII = itemVABRL * 0.60;
                const itemDeductionBRL = (20 * exchangeFactor) * (itemVABRL / totalTaxableOfficialVABRL);
                iiBRL = Math.max(0, rawII - itemDeductionBRL);
            }
            const baseICMS = (itemVABRL + iiBRL) / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        } else if (s.taxRegime === 'regra-geral') {
            iiBRL = itemVABRL * 0.60;
            const baseICMS = (itemVABRL + iiBRL) / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        } else if (s.taxRegime === 'apenas-icms') {
            iiBRL = 0;
            const baseICMS = itemVABRL / (1 - icmsRatePercent);
            icmsBRL = baseICMS * icmsRatePercent;
        } else if (s.taxRegime === 'personalizado') {
            const customIIRatePercent = s.customII / 100;
            const customICMSRatePercent = s.customICMS / 100;
            iiBRL = itemVABRL * customIIRatePercent;
            const baseICMS = (itemVABRL + iiBRL) / (1 - customICMSRatePercent);
            icmsBRL = baseICMS * customICMSRatePercent;
        } else if (s.taxRegime === 'importacao-formal') {
            const rates = getProductTaxRates(ncm, s);
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
        if (s.taxSplit === 'weight' && totalWeight > 0) {
            taxShare = itemWeight / totalWeight;
        } else if (totalOfficialVABRL > 0) {
            taxShare = itemVABRL / totalOfficialVABRL;
        } else {
            taxShare = qty / totalQty;
        }
        iiBRL = s.manualII * taxShare;
        icmsBRL = s.manualICMS * taxShare;
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

// Visitante deslogado vê a landing por padrão; a tela de login só aparece
// quando ele clica em "Entrar"/"Testar grátis" (ou quando chega por um link
// de confirmação de e-mail). Esse flag guarda essa escolha.
let showAuthScreen = false;

function goToAuthScreen(tab) {
    showAuthScreen = true;
    updateUI();
    // Abre já na aba certa (entrar x cadastrar)
    const tabBtn = document.getElementById(tab === 'register' ? 'tab-register' : 'tab-login');
    if (tabBtn) tabBtn.click();
    window.scrollTo({ top: 0 });
}

function goToLanding() {
    showAuthScreen = false;
    updateUI();
    window.scrollTo({ top: 0 });
}

// MAIN CALCULATION & UI RE-RENDER
// A conta da calculadora, sem tela nenhuma: câmbio, rateio de frete, seguro e
// despesas, impostos por item e custo final. O updateUI desenha a partir
// dela, e o relatório "Ver" do histórico de importação também — uma conta
// só, para as duas telas nunca discordarem de um imposto. Recebe o estado
// do lote em vez de ler o global, por isso calcula um lote salvo sem
// mexer no que está aberto na calculadora.
function calcularLote(s) {
    const produtos = s.products || [];

    // Câmbio efetivo
    const spread = s.exchangeMode === 'complete' ? (s.spread || 0) : 0;
    const iof = s.exchangeMode === 'complete' ? (s.iof || 0) : 0;
    const effectiveRate = s.exchangeRate * (1 + spread / 100) * (1 + iof / 100);

    // 1. Calculate Totals for package
    const totalQty = produtos.reduce((acc, p) => acc + p.qty, 0);
    const totalWeight = produtos.reduce((acc, p) => acc + (p.unitWeight * p.qty), 0);
    
    const factorEffectiveBRL = s.currency === 'BRL' ? 1 : effectiveRate;
    const factorOfficialBRL = s.currency === 'BRL' ? 1 : s.exchangeRate;
    
    const totalFobForeign = produtos.reduce((acc, p) => acc + (p.unitPrice * p.qty), 0);
    const totalFobBRL = totalFobForeign * factorEffectiveBRL; // Actual money spent
    const totalFobOfficialBRL = totalFobForeign * factorOfficialBRL; // Declared for taxes
    
    // 2. RUN DISTRIBUTION MATHEMATICS
    const freightBRL = s.freightInBRL ? s.freight : s.freight * factorEffectiveBRL;
    const insuranceBRL = s.insuranceInBRL ? s.insurance : s.insurance * factorEffectiveBRL;
    const feesBRL = s.feesInBRL ? s.fees : s.fees * factorEffectiveBRL;
    
    // For official tax calculation (PTAX without spread/iof)
    const freightOfficialBRL = s.freightInBRL ? s.freight : s.freight * factorOfficialBRL;
    const insuranceOfficialBRL = s.insuranceInBRL ? s.insurance : s.insurance * factorOfficialBRL;
    
    // Pre-calculate shares
    let itemsCalculation = produtos.map(p => {
        const itemFobForeign = p.unitPrice * p.qty;
        const itemFobBRL = itemFobForeign * factorEffectiveBRL;
        const itemFobOfficialBRL = itemFobForeign * factorOfficialBRL;
        const itemWeightTotal = p.unitWeight * p.qty;
        
        // Freight apportionment share
        let freightShare = 0;
        if (s.freightSplit === 'weight' && totalWeight > 0) {
            freightShare = itemWeightTotal / totalWeight;
        } else if (totalFobBRL > 0) {
            freightShare = itemFobBRL / totalFobBRL;
        } else {
            freightShare = p.qty / totalQty;
        }
        
        // Insurance apportionment share
        let insuranceShare = 0;
        if (s.insuranceSplit === 'weight' && totalWeight > 0) {
            insuranceShare = itemWeightTotal / totalWeight;
        } else if (totalFobBRL > 0) {
            insuranceShare = itemFobBRL / totalFobBRL;
        } else {
            insuranceShare = p.qty / totalQty;
        }
        
        // Fees apportionment share
        let feesShare = 0;
        if (s.feesSplit === 'quantity' && totalQty > 0) {
            feesShare = p.qty / totalQty;
        } else if (s.feesSplit === 'weight' && totalWeight > 0) {
            feesShare = itemWeightTotal / totalWeight;
        } else if (totalFobBRL > 0) {
            feesShare = itemFobBRL / totalFobBRL;
        } else {
            feesShare = 1 / produtos.length;
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
    
    const totalVAUSD = s.currency === 'USD' 
        ? totalOfficialVABRL / s.exchangeRate 
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
            totalQty,
            s
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

    // Custo final de cada item: o que sai do bolso, com câmbio efetivo, rateios
    // e impostos. Mesma soma que a tabela de resultados sempre fez.
    itemsCalculation.forEach(item => {
        item.custoTotalBRL = item.fobBRL + item.freightBRL + item.insuranceBRL + item.feesBRL + item.iiBRL + item.icmsBRL + (item.ipiBRL || 0) + (item.pisBRL || 0) + (item.cofinsBRL || 0);
        item.custoUnitBRL = item.custoTotalBRL / item.product.qty;
    });
    
    return {
        effectiveRate, totalQty, totalWeight, factorEffectiveBRL, factorOfficialBRL,
        totalFobForeign, totalFobBRL, totalFobOfficialBRL,
        freightBRL, insuranceBRL, feesBRL, freightOfficialBRL, insuranceOfficialBRL,
        itemsCalculation, totalOfficialVABRL, totalTaxableOfficialVABRL, totalVAUSD,
        totalIIBRL, totalICMSBRL,
    };
}

function updateUI() {
    const landingContainer = document.getElementById('landing-container');
    const authContainer = document.getElementById('auth-container');
    const paywallScreen = document.getElementById('paywall-screen');
    const appContainer = document.querySelector('.app-container');
    const userDisplayName = document.getElementById('user-display-name');
    const trialBanner = document.getElementById('trial-banner');
    const trialDaysText = document.getElementById('trial-days-text');

    // A partir daqui o JS assume o controle da landing, então a regra de CSS
    // que a escondia durante o carregamento (html.has-session) sai do caminho.
    document.documentElement.classList.remove('has-session');

    if (!state.currentUser) {
        if (paywallScreen) paywallScreen.classList.add('hidden');
        if (appContainer) appContainer.classList.add('hidden');
        if (landingContainer) landingContainer.classList.toggle('hidden', showAuthScreen);
        if (authContainer) authContainer.classList.toggle('hidden', !showAuthScreen);
        return;
    }

    if (landingContainer) landingContainer.classList.add('hidden');

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
        // A coluna vem do banco como subscription_expires_at, em string ISO. O
        // código lia subscriptionExpiresAt e comparava com um timestamp, então
        // a condição nunca era verdadeira e quem teve assinatura vencida via a
        // mensagem de teste grátis.
        const rawExpiry = state.currentUser && (state.currentUser.subscription_expires_at || state.currentUser.subscriptionExpiresAt);
        const expiryTime = rawExpiry ? new Date(rawExpiry).getTime() : NaN;
        if (!isNaN(expiryTime) && Date.now() >= expiryTime) {
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
    
    // Câmbio efetivo e o resto da conta saem de calcularLote(), a mesma que o
    // relatório do histórico usa.
    const lote = calcularLote(state);
    const { effectiveRate } = lote;
    
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
    
    // 1. Totais do lote, de calcularLote().
    const { totalQty, totalWeight, factorEffectiveBRL, totalFobForeign, totalFobBRL } = lote;
    
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
    
    // 2. A conta toda vem de calcularLote(), chamada no começo da função.
    const { freightBRL, insuranceBRL, feesBRL, itemsCalculation, totalIIBRL, totalICMSBRL } = lote;
    
    // 3. RENDER RESULTS TABLE
    const tbodyResults = document.getElementById('tbody-results');
    tbodyResults.innerHTML = '';
    
    let sumFinalCostTotalBRL = 0;
    let sumResaleRevenueBRL = 0;
    let sumResaleProfitBRL = 0;
    
    itemsCalculation.forEach(item => {
        const itemFinalCostTotalBRL = item.custoTotalBRL;
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
        // As alíquotas por NCM só entram no cálculo em modo automático (ver
        // calculateItemTaxes: o ramo do regime formal está dentro do
        // `if (state.taxMode === 'auto')`). Antes o quadro detalhado era
        // desenhado só pelo regime, então em modo manual ele mostrava II, IPI,
        // PIS, COFINS e ICMS zerados sem dizer por quê — parecia que a base de
        // NCM não estava funcionando.
        if (state.taxRegime === 'importacao-formal' && state.taxMode === 'auto') {
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
            // Regime formal escolhido, mas modo manual ligado: avisa em vez de
            // exibir zeros, que era o que fazia parecer defeito na base de NCM.
            const avisoNcmIgnorado = state.taxRegime === 'importacao-formal'
                ? `<span style="font-size:0.68rem; color:var(--warning); display:block; margin-top:0.25rem; line-height:1.3;">
                       Alíquotas por NCM não aplicadas: os impostos estão em <strong>modo manual</strong>.
                   </span>`
                : '';

            taxesCellHtml = `
                <span style="font-size:0.75rem; color:var(--text-muted); display:block;">
                    II: R$ ${item.iiBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
                ICMS: R$ ${item.icmsBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                ${avisoNcmIgnorado}
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
    trFoot.style.backgroundColor = 'var(--surface-raised)';
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
        let itensSemAliquota = 0;

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
            
            const semAliquota = ratesAreUnknown(rates);
            if (semAliquota) itensSemAliquota++;

            const avisoNcm = semAliquota
                ? ` <span title="Este NCM não tem alíquotas cadastradas. Os impostos federais NÃO foram calculados para este item." style="color:var(--danger); font-weight:700; cursor:help;">⚠</span>`
                : '';

            const tr = document.createElement('tr');
            if (semAliquota) tr.style.background = 'var(--danger-soft)';
            tr.innerHTML = `
                <td style="font-weight:600;">${escapeHtml(item.product.name)}</td>
                <td class="text-center"><span class="ncm-badge">${item.product.ncm || '-'}</span>${avisoNcm}</td>
                <td class="text-right">R$ ${item.vaBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${formatRatePercent(rates, rates.ii, 1)}</span>
                    R$ ${item.iiBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${formatRatePercent(rates, rates.ipi, 1)}</span>
                    R$ ${(item.ipiBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${formatRatePercent(rates, rates.pis, 2)}</span>
                    R$ ${(item.pisBRL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                <td class="text-right">
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${formatRatePercent(rates, rates.cofins, 2)}</span>
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
            <tr style="background-color: var(--surface-raised); font-weight:700; border-top: 2px solid var(--border-color);">
                <td colspan="2">Totais Consolidados</td>
                <td class="text-right">R$ ${sumVaBRL.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumII.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumIPI.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumPIS.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumCOFINS.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right">R$ ${sumICMS.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="text-right highlight-col">R$ ${sumTotalImpostos.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
            ${itensSemAliquota > 0 ? `
            <tr>
                <td colspan="9" style="background: var(--danger-soft); border-top: 2px solid var(--danger); padding: 0.85rem 1rem; font-weight:600; line-height:1.5; text-align:left; white-space:normal;">
                    ⚠ ${itensSemAliquota === 1
                        ? '1 item está sem alíquotas cadastradas'
                        : `${itensSemAliquota} itens estão sem alíquotas cadastradas`} (marcado${itensSemAliquota === 1 ? '' : 's'} com ⚠ na coluna NCM).
                    <span style="display:block; font-weight:400; margin-top:0.35rem;">
                        Para ${itensSemAliquota === 1 ? 'ele' : 'eles'}, <strong>II, IPI, PIS e COFINS não foram calculados</strong> —
                        entram como zero nos totais acima. O custo real de importação é maior que o exibido.
                        Informe as alíquotas manualmente (modo de tributação personalizado) antes de decidir pela compra.
                    </span>
                </td>
            </tr>` : ''}
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
        { name: 'Custo FOB', value: totalFobBRL, color: 'var(--chart-1)' },
        { name: 'Frete', value: freightBRL, color: 'var(--chart-2)' },
        { name: 'Seguro', value: insuranceBRL, color: 'var(--chart-3)' },
        { name: 'Outras Taxas', value: feesBRL, color: 'var(--chart-4)' },
        { name: 'Impostos', value: totalTaxesBRL, color: 'var(--chart-5)' }
    ];
    renderDonutChart(donutData);
    
    // Chart B: Horizonal stacked bar meters per item
    const barsContainer = document.getElementById('product-cost-bars');
    barsContainer.innerHTML = '';
    
    itemsCalculation.forEach(item => {
        // IPI, PIS e COFINS precisam entrar aqui. Somando só II e ICMS, este
        // gráfico mostrava um custo unitário MENOR que o da tabela ao lado, para
        // o mesmo produto. O erro ficou invisível por muito tempo porque esses
        // três impostos só existem no regime "Importação Formal" — nos regimes
        // simplificados eles são sempre zero e as duas contas batiam.
        const itemTaxes = item.iiBRL + (item.ipiBRL || 0) + (item.pisBRL || 0)
            + (item.cofinsBRL || 0) + item.icmsBRL;
        const itemTotal = item.fobBRL + item.freightBRL + item.insuranceBRL + item.feesBRL + itemTaxes;
        if (itemTotal === 0) return;

        const pctFOB = (item.fobBRL / itemTotal) * 100;
        const pctFreight = (item.freightBRL / itemTotal) * 100;
        const pctInsurance = (item.insuranceBRL / itemTotal) * 100;
        const pctFees = (item.feesBRL / itemTotal) * 100;
        const pctTaxes = (itemTaxes / itemTotal) * 100;
        
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
                ${pctTaxes > 0 ? `<div class="progress-segment color-taxes" style="width: ${pctTaxes}%" data-tooltip="Impostos: ${pctTaxes.toFixed(1)}% (R$ ${itemTaxes.toFixed(0)})"></div>` : ''}
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
        if (state.currentUser && typeof loadAdsOff === 'function') loadAdsOff();
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
    const formForgot = document.getElementById('form-forgot');
    const btnLogout = document.getElementById('btn-logout');

    // Botões da landing pública que levam pra tela de login/cadastro.
    document.querySelectorAll('[data-lp-action]').forEach((btn) => {
        btn.addEventListener('click', () => goToAuthScreen(btn.dataset.lpAction));
    });

    const btnBackToLanding = document.getElementById('btn-back-to-landing');
    if (btnBackToLanding) btnBackToLanding.addEventListener('click', goToLanding);

    // Tab Switching
    if (tabLogin && tabRegister && formLogin && formRegister) {
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            formLogin.classList.remove('hidden');
            formRegister.classList.add('hidden');
            if (formForgot) formForgot.classList.add('hidden');
            clearAuthAlerts();
        });

        tabRegister.addEventListener('click', () => {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            formRegister.classList.remove('hidden');
            formLogin.classList.add('hidden');
            if (formForgot) formForgot.classList.add('hidden');
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

    // Esqueci minha senha
    const btnForgot = document.getElementById('btn-forgot-password');
    const btnForgotBack = document.getElementById('btn-forgot-back');
    if (btnForgot && formForgot && formLogin) {
        btnForgot.addEventListener('click', () => {
            // Aproveita o e-mail que a pessoa já digitou no login.
            document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
            formLogin.classList.add('hidden');
            if (formRegister) formRegister.classList.add('hidden');
            formForgot.classList.remove('hidden');
            clearAuthAlerts();
            document.getElementById('forgot-email').focus();
        });
    }
    if (btnForgotBack && tabLogin) btnForgotBack.addEventListener('click', () => tabLogin.click());

    if (formForgot) {
        formForgot.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value.trim().toLowerCase();
            const alertEl = document.getElementById('forgot-alert');
            const botao = formForgot.querySelector('button[type="submit"]');
            botao.disabled = true;
            showAuthAlert(alertEl, 'success', 'Enviando...');
            try {
                const { error } = await window.db.resetPassword(email);
                if (error) {
                    const limite = error.status === 429 || /security purposes|rate limit/i.test(error.message || '');
                    showAuthAlert(alertEl, 'error', limite
                        ? 'Você acabou de pedir um link. Espere um minuto e tente de novo.'
                        : 'Não foi possível enviar agora: ' + error.message);
                    return;
                }
                // A mesma resposta exista a conta ou não: dizer "e-mail não
                // cadastrado" deixaria qualquer um descobrir quem é cliente.
                showAuthAlert(alertEl, 'success',
                    `Se existir uma conta com ${email}, o link chega em alguns minutos. Confira também o spam.`);
            } catch (err) {
                showAuthAlert(alertEl, 'error', 'Não foi possível enviar agora. Tente de novo em instantes.');
            } finally {
                botao.disabled = false;
            }
        });
    }

    const formNewPassword = document.getElementById('form-new-password');
    if (formNewPassword) {
        formNewPassword.addEventListener('submit', async (e) => {
            e.preventDefault();
            const senha = document.getElementById('new-password').value;
            const repetida = document.getElementById('new-password-2').value;
            const alertEl = document.getElementById('new-password-alert');
            if (senha.length < 6) {
                showAuthAlert(alertEl, 'error', 'A senha precisa ter pelo menos 6 caracteres.');
                return;
            }
            if (senha !== repetida) {
                showAuthAlert(alertEl, 'error', 'As duas senhas não são iguais.');
                return;
            }
            const botao = formNewPassword.querySelector('button[type="submit"]');
            botao.disabled = true;
            try {
                const { error } = await window.db.updatePassword(senha);
                if (error) {
                    showAuthAlert(alertEl, 'error', /different from the old/i.test(error.message || '')
                        ? 'A senha nova precisa ser diferente da antiga.'
                        : 'Não foi possível salvar: ' + error.message);
                    return;
                }
                formNewPassword.reset();
                alertEl.className = 'auth-alert hidden';
                document.getElementById('recovery-modal').classList.add('hidden');
                showToast('Senha alterada. Use a nova senha nos próximos acessos.', 'success', 6000);
            } catch (err) {
                showAuthAlert(alertEl, 'error', 'Não foi possível salvar agora. Tente de novo em instantes.');
            } finally {
                botao.disabled = false;
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
                goToLanding();
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
    const forgotAlert = document.getElementById('forgot-alert');
    if (forgotAlert) {
        forgotAlert.className = 'auth-alert hidden';
        forgotAlert.textContent = '';
    }
    if (resendBtn) resendBtn.classList.add('hidden');
}

// Janela "Crie sua nova senha", aberta quando a pessoa volta pelo link de
// recuperação. Não tem "fechar": ela veio justamente trocar a senha.
function openRecoveryModal() {
    const modal = document.getElementById('recovery-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const campo = document.getElementById('new-password');
    if (campo) campo.focus();
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

    // Cores da animação do logo, na paleta do design system (ver DESIGN.md):
    // o núcleo e o halo das fagulhas usam o laranja cargo — que é a cor da
    // própria seta da marca — e o acento é o aqua. Antes eram rosa neon e azul,
    // que não existem na paleta.
    const TEAL_DEEP = '#053A44';  // --aqua-900, o corpo do contêiner
    const NEON_A = '255,96,0';    // --orange-500, núcleo da fagulha
    const NEON_B = '255,146,71';  // --orange-300, halo quente
    const BLUE = '35,211,211';    // --aqua-400, acento nas fagulhas

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
        ctx.fillStyle = 'rgba(255,241,230,0.55)';  // --orange-50, brilho do núcleo
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

// Havia aqui um PAYMENT_LINK fixo (mpago.la/...) apontando para uma conta
// específica do Mercado Pago. Estava declarado e nunca usado — o fluxo real
// passa por /api/mp-checkout e /api/mp-subscription, que montam a cobrança com
// o MP_ACCESS_TOKEN da Vercel. Removido de propósito: link de conta cravado no
// código sobrevive a troca de conta e volta a ser usado por engano, mandando
// dinheiro para o lugar errado sem ninguém notar. Para trocar a conta que
// recebe, basta trocar MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET nas env vars.

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

    // Dono/admin do app (tabela app_admins) tem acesso infinito — não é
    // cliente pagante, então nunca cai em trial nem em "assinatura vencida".
    if (user.is_app_admin) return { hasAccess: true, isTrial: false, daysRemaining: Infinity, isSubscribed: false };

    // Novo padrão: o webhook do Stripe/Mercado Pago atualiza is_pro no banco.
    // A data em subscription_expires_at PRECISA ser conferida aqui: antes o
    // is_pro sozinho liberava acesso, e como nada volta ele pra false quando os
    // 30 dias vencem, um único PIX comprava acesso vitalício.
    //   - subscription_expires_at nulo  -> assinatura recorrente, vale até cancelar
    //   - subscription_expires_at com data -> pagamento avulso/PIX de 30 dias
    // O is_subscribed legado entra na mesma regra.
    const isPaid = user.is_pro || user.is_subscribed || user.isSubscribed;
    if (isPaid) {
        const rawExpiry = user.subscription_expires_at || user.subscriptionExpiresAt;
        const expiresAt = rawExpiry ? new Date(rawExpiry) : null;
        const hasValidExpiry = expiresAt && !isNaN(expiresAt.getTime());

        // Data ausente ou ilegível é tratada como "sem vencimento" — na dúvida
        // não derrubamos o acesso de quem pagou.
        if (!hasValidExpiry || expiresAt.getTime() > Date.now()) {
            const daysRemaining = hasValidExpiry
                ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                : 30;
            return { hasAccess: true, isTrial: false, daysRemaining, isSubscribed: true };
        }
        // Venceu: cai pro trial abaixo, que já estará expirado para uma conta
        // antiga, resultando em hasAccess: false.
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
        if (!paymentModal) return;
        paymentModal.classList.remove('hidden');
        // Reabrir tem que começar limpo: sem isso a mensagem de "cartão
        // recusado" da tentativa anterior fica na tela por cima do formulário
        // novo, e o painel de sucesso esconderia os planos pra sempre.
        limparStatusPagamento();
        selecionarPlano('mensal');
        montarCardForm();
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
            goToLanding();
        });
    }

    // ======================================================================
    // PAGAMENTO
    //
    // MENSAL: o cartão é tokenizado aqui mesmo pelo MercadoPago.js e o
    // /api/mp-subscription autoriza a assinatura direto na API do MP. A pessoa
    // não é redirecionada, não faz login no Mercado Pago e nem precisa ter
    // conta lá — foi assim que a tela "Seu e-mail não corresponde ao da
    // assinatura" deixou de ter como acontecer. Antes daqui passava um campo
    // pedindo o e-mail da conta do MP, que só transferia o erro pro cliente.
    //
    // AVULSO: segue redirecionando pro checkout do MP, que é onde o PIX existe.
    // Esse caminho nunca teve o problema do e-mail.
    // ======================================================================
    const btnMpCheckout = document.getElementById('btn-mp-checkout');
    const btnMpSubscription = document.getElementById('btn-mp-subscription');
    const btnMpContinuar = document.getElementById('btn-mp-continuar');
    const mpLoading = document.getElementById('mp-loading');
    const mpErro = document.getElementById('mp-erro');
    const formAssinatura = document.getElementById('form-assinatura');
    const painelAvulso = document.getElementById('painel-avulso');
    const painelSucesso = document.getElementById('mp-sucesso');
    const planoMensal = document.getElementById('plano-mensal');
    const planoAvulso = document.getElementById('plano-avulso');
    const mpPlanos = document.querySelector('.mp-planos');

    // Nomes que o MercadoPago.js usa nos erros de validação, traduzidos pro que
    // o cliente vê escrito na tela do modal.
    const CAMPOS_AMIGAVEIS = {
        cardNumber: 'número do cartão',
        expirationDate: 'validade',
        expirationMonth: 'validade',
        expirationYear: 'validade',
        securityCode: 'CVV',
        cardholderName: 'nome impresso no cartão',
        identificationNumber: 'CPF do titular',
    };

    let cardForm = null;
    let montandoCardForm = false;
    let errosDoCartao = [];

    const limparStatusPagamento = () => {
        if (mpErro) { mpErro.style.display = 'none'; mpErro.textContent = ''; }
        if (mpLoading) mpLoading.style.display = 'none';
        if (painelSucesso) painelSucesso.classList.add('hidden');
        if (mpPlanos) mpPlanos.classList.remove('hidden');
    };

    const mostrarErro = (mensagem) => {
        if (mpLoading) mpLoading.style.display = 'none';
        if (!mpErro) { showToast(mensagem, 'error'); return; }
        mpErro.textContent = mensagem;
        mpErro.style.display = 'block';
    };

    const mostrarCarregando = (mensagem) => {
        if (mpErro) mpErro.style.display = 'none';
        if (!mpLoading) return;
        mpLoading.textContent = mensagem;
        mpLoading.style.display = 'block';
    };

    const selecionarPlano = (plano) => {
        const mensal = plano !== 'avulso';
        if (planoMensal) {
            planoMensal.classList.toggle('ativo', mensal);
            planoMensal.setAttribute('aria-checked', String(mensal));
        }
        if (planoAvulso) {
            planoAvulso.classList.toggle('ativo', !mensal);
            planoAvulso.setAttribute('aria-checked', String(!mensal));
        }
        if (formAssinatura) formAssinatura.classList.toggle('hidden', !mensal);
        if (painelAvulso) painelAvulso.classList.toggle('hidden', mensal);
        if (mpErro) mpErro.style.display = 'none';
    };

    // Monta o formulário de cartão uma vez só: o SDK sobe iframes e busca tipos
    // de documento na API do MP, então remontar a cada abertura do modal
    // piscaria a tela à toa.
    const montarCardForm = async () => {
        if (cardForm || montandoCardForm || !formAssinatura) return;

        if (typeof MercadoPago === 'undefined') {
            mostrarErro('Não foi possível carregar o formulário de cartão. Recarregue a página e tente de novo.');
            return;
        }

        montandoCardForm = true;
        try {
            // A public key vem do GET do próprio endpoint de assinatura, e não
            // de uma constante no bundle: ela continua morando nas env vars da
            // Vercel, e trocar de conta do MP não exige mexer no app.js.
            const resposta = await fetch('/api/mp-subscription');
            const dados = await resposta.json().catch(() => ({}));
            if (!resposta.ok || !dados.publicKey) throw new Error(dados.error || 'public key indisponível');

            // Os MP Fields são iframes: não herdam nada do nosso CSS, então a
            // cor do texto tem que ser passada na mão — senão o tema escuro fica
            // com dígitos pretos em campo escuro.
            const estiloCampo = {
                color: getComputedStyle(document.body).color || '#ffffff',
                'font-size': '16px',
                placeholderColor: '#8d8d8d',
            };

            const mp = new MercadoPago(dados.publicKey, { locale: 'pt-BR' });

            cardForm = mp.cardForm({
                amount: '29.90',
                iframe: true,
                form: {
                    id: 'form-assinatura',
                    cardNumber: { id: 'form-checkout__cardNumber', placeholder: '0000 0000 0000 0000', style: estiloCampo },
                    expirationDate: { id: 'form-checkout__expirationDate', placeholder: 'MM/AA', style: estiloCampo },
                    securityCode: { id: 'form-checkout__securityCode', placeholder: '123', style: estiloCampo },
                    cardholderName: { id: 'form-checkout__cardholderName', placeholder: 'Como está no cartão' },
                    identificationType: { id: 'form-checkout__identificationType' },
                    identificationNumber: { id: 'form-checkout__identificationNumber', placeholder: '000.000.000-00' },
                    issuer: { id: 'form-checkout__issuer' },
                    installments: { id: 'form-checkout__installments' },
                },
                callbacks: {
                    onFormMounted: (erro) => {
                        if (erro) {
                            console.error('Erro ao montar o CardForm do Mercado Pago:', erro);
                            mostrarErro('Não foi possível carregar o formulário de cartão. Recarregue a página.');
                            return;
                        }
                        if (btnMpSubscription) {
                            btnMpSubscription.disabled = false;
                            btnMpSubscription.textContent = 'Assinar por R$ 29,90/mês';
                        }
                    },
                    onSubmit: (evento) => {
                        evento.preventDefault();
                        enviarAssinatura();
                    },
                    onValidityChange: (erro, campo) => {
                        const alvo = document.getElementById('form-checkout__' + campo);
                        if (alvo) alvo.classList.toggle('mp-field-invalido', Boolean(erro));
                    },
                    onError: (erros) => {
                        // Guarda em vez de exibir: o onError dispara a cada tecla
                        // enquanto o campo está incompleto, e avisar durante a
                        // digitação é ruído. Vira mensagem só no submit.
                        errosDoCartao = Array.isArray(erros) ? erros : [];
                        console.warn('CardForm do Mercado Pago:', erros);
                    },
                },
            });
        } catch (erro) {
            console.error('Falha ao preparar o formulário de cartão:', erro);
            mostrarErro('Não foi possível carregar o formulário de cartão. Tente de novo em instantes.');
        } finally {
            montandoCardForm = false;
        }
    };

    // O CardToken vale um único uso. Depois de qualquer recusa o formulário
    // precisa ser remontado, senão a segunda tentativa falha sozinha com token
    // inválido — mesmo que o cartão esteja certo.
    const remontarCardForm = async () => {
        if (cardForm && typeof cardForm.unmount === 'function') {
            try { cardForm.unmount(); } catch (erro) { /* já estava desmontado */ }
        }
        cardForm = null;
        errosDoCartao = [];
        if (btnMpSubscription) {
            btnMpSubscription.disabled = true;
            btnMpSubscription.textContent = 'Carregando formulário seguro...';
        }
        await montarCardForm();
    };

    // Transforma os erros de validação do SDK na lista de campos pra conferir.
    // A forma exata do objeto de erro varia entre versões do MercadoPago.js, daí
    // a busca ser feita no texto do erro inteiro em vez de num campo fixo.
    const descreverErrosDeCampo = () => {
        const texto = JSON.stringify(errosDoCartao || []);
        const campos = Object.keys(CAMPOS_AMIGAVEIS)
            .filter((chave) => texto.includes(chave))
            .map((chave) => CAMPOS_AMIGAVEIS[chave]);
        const unicos = [...new Set(campos)];
        return unicos.length
            ? `Confira ${unicos.join(', ')} e tente de novo.`
            : 'Confira os dados do cartão e tente de novo.';
    };

    const mostrarSucesso = async (jaAssinante) => {
        if (mpLoading) mpLoading.style.display = 'none';
        if (mpErro) mpErro.style.display = 'none';

        // Quem já tinha assinatura ativa não foi cobrado de novo — prometer
        // "próxima cobrança em 30 dias" pra essa pessoa seria mentira.
        if (jaAssinante && painelSucesso) {
            const texto = painelSucesso.querySelector('p');
            if (texto) {
                texto.textContent = 'Você já tinha uma assinatura ativa no Mercado Pago, '
                    + 'então não houve nova cobrança. Seu acesso PRO foi restaurado.';
            }
        }

        if (formAssinatura) formAssinatura.classList.add('hidden');
        if (painelAvulso) painelAvulso.classList.add('hidden');
        if (mpPlanos) mpPlanos.classList.add('hidden');
        if (painelSucesso) painelSucesso.classList.remove('hidden');

        // O endpoint já gravou is_pro, então recarregar o perfil e rerenderizar
        // tira o paywall da frente sem a pessoa precisar dar F5. O webhook segue
        // sendo a fonte da verdade para renovação e cancelamento.
        await checkAuthSession();
        updateUI();
    };

    // O cartão estar autorizado não significa que o dinheiro entrou: o Mercado
    // Pago processa a primeira fatura depois, de forma assíncrona, e ela pode ser
    // recusada. Comemorar na autorização foi o que deixou cliente com pagamento
    // recusado usando o sistema. Agora esperamos o webhook gravar o acesso e
    // conferimos no perfil — a fonte da verdade é o banco, não a tela.
    const TENTATIVAS_CONFIRMACAO = 20;
    const INTERVALO_CONFIRMACAO_MS = 4000;

    const aguardarConfirmacaoDoPagamento = async () => {
        if (btnMpSubscription) btnMpSubscription.disabled = true;
        mostrarCarregando('Cartão autorizado. Confirmando o pagamento com o banco — isso leva alguns instantes...');

        for (let tentativa = 0; tentativa < TENTATIVAS_CONFIRMACAO; tentativa++) {
            await new Promise((resolve) => setTimeout(resolve, INTERVALO_CONFIRMACAO_MS));
            await checkAuthSession();
            if (checkSubscriptionStatus(state.currentUser).hasAccess) {
                await mostrarSucesso(false);
                return;
            }
        }

        // Estourou o tempo sem confirmação. Não liberamos nada por conta própria:
        // o webhook libera sozinho assim que o MP aprovar, e afirmar que está
        // ativo sem estar seria repetir exatamente o bug que estamos corrigindo.
        // O botão segue desabilitado para não criar uma segunda assinatura.
        mostrarCarregando(
            'Sua assinatura foi criada e o cartão autorizado, mas o Mercado Pago ainda não confirmou a cobrança. '
            + 'Assim que confirmar, seu acesso é liberado automaticamente — pode fechar esta janela.'
        );
    };

    const enviarAssinatura = async () => {
        const session = await window.db.getSession();
        if (!session || !session.id) {
            mostrarErro('Sua sessão expirou. Faça login de novo para assinar.');
            return;
        }
        if (!cardForm) {
            mostrarErro('O formulário de cartão ainda não carregou. Aguarde um instante.');
            return;
        }

        const dadosCartao = cardForm.getCardFormData();
        if (!dadosCartao || !dadosCartao.token) {
            mostrarErro(descreverErrosDeCampo());
            return;
        }

        if (btnMpSubscription) btnMpSubscription.disabled = true;
        mostrarCarregando('Autorizando a assinatura com o banco emissor...');

        try {
            const resposta = await fetch('/api/mp-subscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                // O deviceId vem do security.js do Mercado Pago e entra no score
                // do antifraude deles. Sem ele, cobranças legítimas de R$ 29,90
                // foram recusadas com cc_rejected_high_risk.
                body: JSON.stringify({
                    cardToken: dadosCartao.token,
                    deviceId: window.MP_DEVICE_SESSION_ID || null,
                }),
            });
            const corpo = await resposta.json().catch(() => ({}));

            if (!resposta.ok || corpo.status !== 'authorized') {
                mostrarErro(corpo.error || 'Não foi possível autorizar o cartão. Tente outro cartão.');
                await remontarCardForm();
                return;
            }

            // Só mostra "Assinatura ativa" quando o acesso existe de verdade no
            // banco. Nos outros casos entra a espera pela confirmação do MP.
            if (corpo.acessoLiberado) {
                await mostrarSucesso(corpo.jaAssinante === true);
            } else {
                await aguardarConfirmacaoDoPagamento();
            }
        } catch (erro) {
            console.error('Erro ao criar a assinatura no Mercado Pago:', erro);
            mostrarErro('Erro de conexão. Confira sua internet e tente de novo.');
            await remontarCardForm();
        } finally {
            if (btnMpSubscription) btnMpSubscription.disabled = false;
        }
    };

    const irParaCheckoutAvulso = async () => {
        const session = await window.db.getSession();
        if (!session || !session.id) {
            mostrarErro('Você precisa estar logado para pagar.');
            return;
        }

        if (btnMpCheckout) btnMpCheckout.disabled = true;
        mostrarCarregando('Gerando link seguro do Mercado Pago...');

        try {
            const resposta = await fetch('/api/mp-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ userId: session.id }),
            });
            const corpo = await resposta.json().catch(() => ({}));

            if (corpo.init_point) {
                window.location.href = corpo.init_point;
                return;
            }
            mostrarErro(corpo.error || 'Não foi possível gerar o link de pagamento.');
        } catch (erro) {
            console.error('Erro na chamada do checkout avulso:', erro);
            mostrarErro('Erro de conexão ao gerar o pagamento.');
        } finally {
            if (btnMpCheckout) btnMpCheckout.disabled = false;
        }
    };

    // Além de trocar o painel, o clique no mensal tenta montar o formulário.
    // É a rede de segurança para qualquer caminho que abra o modal sem passar
    // pelo openModal: o CardForm monta no primeiro clique em vez de deixar o
    // botão preso em "Carregando formulário seguro...".
    if (planoMensal) {
        planoMensal.addEventListener('click', () => {
            selecionarPlano('mensal');
            montarCardForm();
        });
    }
    if (planoAvulso) planoAvulso.addEventListener('click', () => selecionarPlano('avulso'));

    // O botão de Configurações abre o modal de outro ponto do arquivo e precisa
    // do mesmo caminho de abertura, senão o formulário de cartão não monta.
    window.abrirModalPagamento = openModal;
    if (btnMpCheckout) btnMpCheckout.addEventListener('click', irParaCheckoutAvulso);
    if (btnMpContinuar) {
        btnMpContinuar.addEventListener('click', () => {
            if (paymentModal) paymentModal.classList.add('hidden');
        });
    }

    // Rede de segurança: quem envia o formulário é o onSubmit do cardForm, mas
    // se ele não tiver montado o navegador faria um submit de verdade e
    // recarregaria a página, perdendo a sessão da tela.
    if (formAssinatura) {
        formAssinatura.addEventListener('submit', (evento) => evento.preventDefault());
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
    initGtin();
    initReviewsModule();
    initCatalogStatusModule();
    initPromotionsModule();
    initPrecificacaoMarketplaces();
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

// timeAgo tem granularidade de dias e devolve "hoje" pra qualquer coisa nas
// últimas 24h — bom para avaliações e promoções, inútil para saber se uma
// checagem de 15 em 15 minutos parou de rodar. Esta versão desce a minutos.
function timeAgoPrecise(dateStr) {
    if (!dateStr) return '';
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin === 1) return 'há 1 minuto';
    if (diffMin < 60) return `há ${diffMin} minutos`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras === 1) return 'há 1 hora';
    if (diffHoras < 24) return `há ${diffHoras} horas`;
    return timeAgo(dateStr);
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
        placeholder.style.background = 'var(--surface-2)';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        return placeholder;
    }

    const img = document.createElement('img');
    // Normaliza para https. O backend passou a gravar já em https (secure_thumbnail),
    // mas as linhas gravadas antes disso continuam com http:// no banco — e a página
    // é servida em https, então elas viram mixed content e violação de CSP. Converter
    // aqui cobre o histórico sem precisar migrar dado.
    img.src = String(src).replace(/^http:\/\//i, 'https://');
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
    highlight.style.background = 'var(--surface-2)';
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
    competing: { label: 'Perdendo', color: 'var(--danger)' },
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

// Banner curto explicando exatamente qual mudança gerou o alerta daquele item
// (não só que ele está "não lido") — usado no topo do card, catálogo e
// promoções, só enquanto o alerta segue sem leitura.
function buildAlertBanner(text) {
    const banner = document.createElement('p');
    banner.className = 'small';
    banner.style.color = 'var(--danger)';
    banner.style.fontWeight = '600';
    banner.style.margin = '0 0 0.5rem 0';
    banner.textContent = `⚠ ${text}`;
    return banner;
}

// ==========================================
// MARGEM DOS ANÚNCIOS GANHANDO O CATÁLOGO
//
// Ganhar a disputa de catálogo trava o preço: ele é o que faz o anúncio
// aparecer, não uma escolha livre como num anúncio comum. Este bloco mostra,
// para cada anúncio na aba "Ganhando", se aquele preço ainda cobre comissão,
// frete, imposto, o custo do produto e o que se gasta com o anúncio
// patrocinado dele — antes do vendedor descobrir vendendo no prejuízo.
//
// Custo do produto e imposto são OS MESMOS do painel de Patrocinados
// (window.db.getAdsMargemDados/saveItemCost/saveAdsTax — tabelas ml_item_costs
// e ml_ads_settings): digitar o custo aqui já deixa ele pronto lá, e vice-versa.
// ==========================================

const CATALOG_MARGEM_CACHE_KEY = 'impoclick-catalog-margem';
const CATALOG_MARGEM_CACHE_HORAS = 6;

// Preenchido por carregarMargemCatalogo(): { [ml_item_id]: { preco, comissaoUn,
// freteUn, adsUn, temAds } }. null enquanto ainda não foi buscado.
let catalogMargemPorItem = null;
let catalogMargemCarregando = false;
// Custo do produto (por MLB) e imposto sobre a venda (%) — compartilhados
// com o Patrocinados (ml_item_costs / ml_ads_settings). Comissão e frete não
// entram aqui: vêm prontos do servidor, calculados a partir das vendas reais
// dos últimos 30 dias sempre que existem (ver resource=catalog-margem).
let catalogCustoPorItem = {};
let catalogImpostoPct = 0;

// Reflete o imposto no campo do topo da aba — chamado depois de toda carga,
// pra tela nunca mostrar um valor desatualizado.
function sincronizarControlesMargemCatalogo() {
    const inpImposto = document.getElementById('catalog-imposto-pct');
    if (inpImposto && document.activeElement !== inpImposto) inpImposto.value = catalogImpostoPct;
}

function lerCacheMargemCatalogo() {
    try {
        const bruto = localStorage.getItem(CATALOG_MARGEM_CACHE_KEY);
        if (!bruto) return null;
        const c = JSON.parse(bruto);
        if (c && Date.now() - c.em < CATALOG_MARGEM_CACHE_HORAS * 3600000) return c.porItem;
    } catch (e) { /* sem armazenamento ou JSON inválido — busca de novo */ }
    return null;
}

function salvarCacheMargemCatalogo(porItem) {
    try {
        localStorage.setItem(CATALOG_MARGEM_CACHE_KEY, JSON.stringify({ em: Date.now(), porItem }));
    } catch (e) { /* sem armazenamento — segue só em memória */ }
}

// Busca a comissão, o frete e o gasto com anúncio patrocinado reais de cada
// item "Ganhando", e o custo/imposto salvos em Patrocinados. Cacheado por
// CATALOG_MARGEM_CACHE_HORAS: o cálculo bate no Mercado Livre por anúncio, e
// reabrir a aba não deveria refazer tudo de novo.
async function carregarMargemCatalogo(forcar) {
    if (!state.currentUser || catalogMargemCarregando) return;

    const custos = await window.db.getAdsMargemDados();
    if (custos && custos.dados) {
        catalogCustoPorItem = custos.dados.custos || {};
        catalogImpostoPct = custos.dados.impostoPct != null ? custos.dados.impostoPct : 0;
    }
    sincronizarControlesMargemCatalogo();

    if (!forcar) {
        const doCache = lerCacheMargemCatalogo();
        if (doCache) {
            catalogMargemPorItem = doCache;
            renderCatalogList(catalogUltimosItens || []);
            return;
        }
    }

    catalogMargemCarregando = true;
    const statusEl = document.getElementById('catalog-margem-status');
    const btn = document.getElementById('btn-catalog-margem');
    if (statusEl) statusEl.textContent = 'Calculando margem nos anúncios ganhando (consulta o Mercado Livre, pode levar um minuto)...';
    if (btn) btn.disabled = true;

    // Até 60s: por anúncio, o servidor consulta comissão, frete e publicidade.
    const r = await mlApiFetch('/api/ml-reviews?resource=catalog-margem', 60000);
    catalogMargemCarregando = false;
    if (btn) btn.disabled = false;

    if (!r) {
        if (statusEl) statusEl.textContent = 'Não foi possível calcular a margem agora. Tente de novo em instantes.';
        return;
    }

    const porItem = {};
    for (const it of r.itens || []) porItem[it.mlItemId] = it;
    catalogMargemPorItem = porItem;
    salvarCacheMargemCatalogo(porItem);

    if (statusEl) {
        statusEl.textContent = r.cortado
            ? `Margem calculada para os ${r.itens.length} anúncios mais recentes ganhando — há mais do que isso, atualize depois de agir nestes.`
            : (r.itens.length > 0 ? `Margem calculada em ${r.itens.length} anúncio(s) ganhando.` : 'Nenhum anúncio ganhando no momento.');
    }
    renderCatalogList(catalogUltimosItens || []);
}

// Preço, comissão, frete, imposto, custo e ads — tudo o que entra na conta.
// Devolve null quando falta comissão ou custo: melhor não mostrar um número
// errado do que arriscar "lucro" onde na real não dá para saber.
function contaMargemCatalogo(margem, custoUn, impostoPct) {
    if (!margem || margem.comissaoUn == null || custoUn == null || !(margem.preco > 0)) return null;
    const imposto = margem.preco * ((impostoPct || 0) / 100);
    const frete = margem.freteUn || 0;
    const ads = margem.adsUn || 0;
    const margemUn = margem.preco - margem.comissaoUn - frete - imposto - custoUn - ads;
    return { margemUn, margemPct: margemUn / margem.preco, imposto, frete, ads };
}

// Bloco de margem de UM card do catálogo, só para quem está "Ganhando".
function buildCatalogMargemBlock(item) {
    const id = item.ml_item_id;
    const box = document.createElement('div');
    box.className = 'catalog-margem';
    box.style.marginTop = '0.6rem';
    box.style.paddingTop = '0.6rem';
    box.style.borderTop = '1px dashed var(--border-color)';

    if (catalogMargemPorItem == null) {
        // Ainda não buscado: o botão "Calcular margem" no topo da aba resolve.
        return box;
    }

    const margem = catalogMargemPorItem[id];
    if (!margem) {
        const p = document.createElement('p');
        p.className = 'small';
        p.style.color = 'var(--text-muted)';
        p.textContent = 'Margem não calculada para este anúncio ainda — clique em "Calcular margem" no topo.';
        box.appendChild(p);
        return box;
    }

    const linha = document.createElement('div');
    linha.style.display = 'flex';
    linha.style.alignItems = 'center';
    linha.style.gap = '0.5rem';
    linha.style.flexWrap = 'wrap';

    const label = document.createElement('label');
    label.className = 'small';
    label.style.color = 'var(--text-muted)';
    label.style.margin = '0';
    label.textContent = 'Custo do produto (nacionalizado):';
    label.htmlFor = `catalog-custo-${id}`;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `catalog-custo-${id}`;
    input.min = '0';
    input.step = '0.01';
    input.placeholder = 'R$';
    input.style.width = '6.5rem';
    input.style.padding = '0.3rem 0.45rem';
    const custoAtual = catalogCustoPorItem[id];
    if (custoAtual != null) input.value = custoAtual;

    const resultado = document.createElement('p');
    resultado.className = 'small';
    resultado.style.margin = '0.35rem 0 0';
    resultado.style.fontWeight = '600';

    const detalhe = document.createElement('p');
    detalhe.className = 'small';
    detalhe.style.color = 'var(--text-muted)';
    detalhe.style.margin = '0.15rem 0 0';

    function redesenhar() {
        const custoUn = catalogCustoPorItem[id];
        if (margem.comissaoUn == null) {
            resultado.style.color = 'var(--text-muted)';
            resultado.textContent = 'Não foi possível obter a comissão deste anúncio agora.';
            detalhe.textContent = '';
            return;
        }
        if (custoUn == null) {
            resultado.style.color = 'var(--text-muted)';
            resultado.textContent = 'Digite o custo do produto para ver a margem.';
            detalhe.textContent = '';
            return;
        }
        const c = contaMargemCatalogo(margem, custoUn, catalogImpostoPct);
        const lucro = c.margemUn >= 0;
        resultado.style.color = lucro ? 'var(--success)' : 'var(--danger)';
        resultado.textContent = `${lucro ? 'Lucro' : 'Prejuízo'}: ${formatBRL(Math.abs(c.margemUn))} por unidade (${(c.margemPct * 100).toFixed(1)}%)`;
        // "(estimado)" quando não há venda recente desse anúncio: o valor vem
        // da tabela do ML (comissão) ou de uma cotação (frete), não do que
        // realmente foi cobrado — mesmo rótulo que o painel de Patrocinados usa.
        const partes = [
            `Preço: ${formatBRL(margem.preco)}`,
            `Comissão: ${formatBRL(margem.comissaoUn)}${margem.comissaoFonte === 'tabela' ? ' (estimado)' : ''}`,
            `Frete: ${formatBRL(c.frete)}${margem.freteFonte === 'tabela' ? ' (estimado)' : ''}`,
            `Imposto (${catalogImpostoPct}%): ${formatBRL(c.imposto)}`,
        ];
        if (margem.temAds) partes.push(`Ads: ${formatBRL(c.ads)}`);
        detalhe.textContent = partes.join(' · ');
    }

    input.addEventListener('change', async () => {
        const v = input.value.trim() === '' ? null : Number(input.value);
        catalogCustoPorItem[id] = v != null && Number.isFinite(v) ? v : null;
        redesenhar();
        // O custo pode tirar ou colocar este anúncio na aba Prejuízo — só ela
        // precisa recalcular; Ganhando/Perdendo já têm o card certo por cima.
        renderCatalogPrejuizoTab();
        try {
            await window.db.saveItemCost(id, catalogCustoPorItem[id]);
        } catch (e) {
            console.error('Erro ao salvar custo do produto:', e);
        }
    });

    redesenhar();
    linha.appendChild(label);
    linha.appendChild(input);
    box.appendChild(linha);
    box.appendChild(resultado);
    box.appendChild(detalhe);
    return box;
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

    // Link pro anúncio no Mercado Livre quando o servidor já mandou o
    // permalink (ml_catalog_link_sku.sql); sem ele, fica só o texto, como antes.
    const title = item.permalink ? document.createElement('a') : document.createElement('strong');
    if (item.permalink) {
        title.href = item.permalink;
        title.target = '_blank';
        title.rel = 'noopener';
        title.className = 'item-card-title-link';
    }
    title.textContent = item.item_title || item.ml_item_id;
    titleGroup.appendChild(title);

    const statusInfo = CATALOG_STATUS_LABELS[item.status] || { label: item.status, color: 'var(--text-muted)' };
    const statusSpan = document.createElement('span');
    statusSpan.className = 'item-card-status';
    statusSpan.style.color = statusInfo.color;
    statusSpan.textContent = statusInfo.label;

    header.appendChild(titleGroup);
    header.appendChild(statusSpan);
    card.appendChild(header);

    if (!item.is_read && item.previous_status && item.previous_status !== item.status) {
        const oldLabel = (CATALOG_STATUS_LABELS[item.previous_status] || { label: item.previous_status }).label;
        const newLabel = statusInfo.label;
        card.appendChild(buildAlertBanner(`Mudou agora: estava "${oldLabel}" e passou a "${newLabel}"`));
    }

    const detailP = document.createElement('p');
    detailP.className = 'small';
    detailP.style.color = 'var(--text-muted)';
    detailP.style.marginBottom = '0.35rem';
    const priceParts = [];
    if (item.current_price != null) priceParts.push(`Seu preço: R$ ${Number(item.current_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    if (item.status !== 'winning' && item.price_to_win != null) priceParts.push(`Preço pra ganhar: R$ ${Number(item.price_to_win).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    if (item.seller_sku) priceParts.push(`SKU: ${item.seller_sku}`);
    detailP.textContent = priceParts.join(' · ');

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

    if (item.status === 'winning') {
        card.appendChild(buildCatalogMargemBlock(item));
    }

    return card;
}

// Última lista recebida do servidor — carregarMargemCatalogo() a reusa para
// redesenhar os cards assim que a margem chega, sem depender de uma nova
// consulta de status só para isso.
let catalogUltimosItens = [];

function renderCatalogList(items) {
    const all = items || [];
    catalogUltimosItens = all;
    const winning = all.filter(i => i.status === 'winning');
    const losing = all.filter(i => i.status !== 'winning');

    renderIntoList('catalog-list-winning', 'catalog-empty-winning', winning, buildCatalogCard);
    renderIntoList('catalog-list-losing', 'catalog-empty-losing', losing, buildCatalogCard);
    renderCatalogPrejuizoTab();
}

// ==========================================
// ABA "PREJUÍZO" — dashboard dos anúncios "Ganhando" cujo preço, hoje, não
// cobre o custo. Escopo de propósito igual ao da margem (só Ganhando, onde o
// preço é travado pela disputa de catálogo): ligar o mesmo cálculo em
// "Perdendo" multiplicaria as consultas ao Mercado Livre por verificação.
// ==========================================

// Anúncios "Ganhando", com margem calculada e custo digitado, cuja conta dá
// negativa — junto com a conta já feita, pra não recalcular duas vezes.
function catalogItensComPrejuizo() {
    if (!catalogMargemPorItem) return [];
    const achados = [];
    for (const item of catalogUltimosItens) {
        if (item.status !== 'winning') continue;
        const margem = catalogMargemPorItem[item.ml_item_id];
        const custoUn = catalogCustoPorItem[item.ml_item_id];
        if (!margem || custoUn == null) continue;
        const c = contaMargemCatalogo(margem, custoUn, catalogImpostoPct);
        if (c && c.margemUn < 0) achados.push({ item, margem, c });
    }
    // Pior margem primeiro — é o que mais precisa de atenção.
    achados.sort((a, b) => a.c.margemUn - b.c.margemUn);
    return achados;
}

function buildCatalogPrejuizoResumo(achados, totalGanhando, totalComMargemECusto) {
    const box = document.createElement('div');
    if (achados.length === 0) {
        box.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'small';
        p.style.color = 'var(--text-muted)';
        p.style.margin = '0';
        p.textContent = totalComMargemECusto > 0
            ? `Nenhum prejuízo entre os ${totalComMargemECusto} anúncio(s) com margem e custo já calculados.`
            : 'Calcule a margem e digite o custo dos anúncios em "Ganhando" para este resumo aparecer.';
        box.appendChild(p);
        return box;
    }

    const somaPrejuizo = achados.reduce((acc, a) => acc + Math.abs(a.c.margemUn), 0);
    const linha = document.createElement('div');
    linha.style.display = 'flex';
    linha.style.flexWrap = 'wrap';
    linha.style.gap = '1.5rem';

    const stat = (rotulo, valor, cor) => {
        const d = document.createElement('div');
        const l = document.createElement('div');
        l.className = 'small';
        l.style.color = 'var(--text-muted)';
        l.textContent = rotulo;
        const v = document.createElement('strong');
        v.style.display = 'block';
        v.style.fontSize = '1.15rem';
        if (cor) v.style.color = cor;
        v.textContent = valor;
        d.appendChild(l);
        d.appendChild(v);
        return d;
    };
    linha.appendChild(stat('Anúncios com prejuízo', `${achados.length} de ${totalComMargemECusto} calculado(s)`, 'var(--danger)'));
    linha.appendChild(stat('Soma do prejuízo por unidade', formatBRL(somaPrejuizo), 'var(--danger)'));
    linha.appendChild(stat('Pior caso', `${achados[0].item.item_title || achados[0].item.ml_item_id} (${(achados[0].c.margemPct * 100).toFixed(1)}%)`));
    box.appendChild(linha);
    return box;
}

function renderCatalogPrejuizoTab() {
    const achados = catalogItensComPrejuizo();
    const totalGanhando = catalogUltimosItens.filter(i => i.status === 'winning').length;
    const totalComMargemECusto = catalogMargemPorItem
        ? catalogUltimosItens.filter(i => i.status === 'winning' && catalogMargemPorItem[i.ml_item_id] && catalogCustoPorItem[i.ml_item_id] != null).length
        : 0;

    const resumo = document.getElementById('catalog-prejuizo-resumo');
    if (resumo) {
        resumo.innerHTML = '';
        resumo.appendChild(buildCatalogPrejuizoResumo(achados, totalGanhando, totalComMargemECusto));
    }

    renderIntoList('catalog-list-prejuizo', 'catalog-empty-prejuizo', achados.map(a => a.item), buildCatalogCard);

    const badge = document.getElementById('catalog-prejuizo-badge');
    if (badge) {
        badge.textContent = String(achados.length);
        badge.classList.toggle('hidden', achados.length === 0);
    }
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

    const btnMargem = document.getElementById('btn-catalog-margem');
    if (btnMargem) {
        btnMargem.addEventListener('click', () => carregarMargemCatalogo(true));
    }

    // Imposto muda só a conta no navegador — sem custo de servidor, então
    // recalcula na hora, sem precisar buscar a margem de novo.
    const inpImposto = document.getElementById('catalog-imposto-pct');
    if (inpImposto) {
        inpImposto.addEventListener('change', async () => {
            const pct = Number(inpImposto.value);
            if (!Number.isFinite(pct) || pct < 0) { inpImposto.value = catalogImpostoPct; return; }
            catalogImpostoPct = pct;
            renderCatalogList(catalogUltimosItens || []);
            try {
                await window.db.saveAdsTax(pct);
            } catch (e) {
                console.error('Erro ao salvar o imposto sobre a venda:', e);
            }
        });
    }

    const tabButtons = {
        winning: document.getElementById('catalog-tab-btn-winning'),
        losing: document.getElementById('catalog-tab-btn-losing'),
        prejuizo: document.getElementById('catalog-tab-btn-prejuizo'),
    };
    const tabPanels = {
        winning: document.getElementById('catalog-tab-winning'),
        losing: document.getElementById('catalog-tab-losing'),
        prejuizo: document.getElementById('catalog-tab-prejuizo'),
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
        loadAdsOff();
        loadCheckStatus();
    }, 5 * 60 * 1000);
}

// "Última verificação" — sem isso não tem como saber, olhando o site, se o
// cron (GitHub Actions) parou de rodar. Mesma chamada alimenta as 3 abas.
async function loadCheckStatus() {
    const elIds = ['reviews-check-status', 'catalog-check-status', 'promotions-check-status', 'ads-check-status'];
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
    // O cron marca a promoção como encerrada quando ela some da resposta da
    // API do ML, guardando o prazo que estava previsto. Então "encerrada" com
    // prazo ainda no futuro não quer dizer que o prazo acabou: quer dizer que
    // o anúncio saiu da promoção antes da hora — por preço, estoque ou porque
    // o ML tirou. São coisas diferentes e a tela precisa dizer qual foi, senão
    // aparece "Terminou em 10/08" numa data que ainda nem chegou.
    const saiuAntesDoPrazo = item.status === 'ended' && daysLeft != null && daysLeft > 0;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'item-card-status';
    if (item.status === 'ended') {
        statusSpan.style.color = saiuAntesDoPrazo ? 'var(--danger)' : 'var(--text-muted)';
        statusSpan.textContent = saiuAntesDoPrazo ? 'Saiu antes do prazo' : 'Terminou';
    } else if (daysLeft != null && daysLeft <= 3) {
        statusSpan.style.color = 'var(--danger)';
        statusSpan.textContent = daysLeft <= 0 ? 'Termina hoje' : `Termina em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`;
    } else {
        statusSpan.style.color = 'var(--success)';
        statusSpan.textContent = 'Ativa';
    }

    header.appendChild(titleGroup);
    header.appendChild(statusSpan);
    card.appendChild(header);

    if (!item.is_read) {
        if (item.status === 'ended') {
            card.appendChild(buildAlertBanner(saiuAntesDoPrazo
                ? 'O anúncio saiu desta promoção antes do prazo'
                : 'Esta promoção terminou agora'));
        } else if (daysLeft != null && daysLeft <= 3) {
            card.appendChild(buildAlertBanner(daysLeft <= 0 ? 'Está terminando hoje' : `Está terminando em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`));
        }
    }

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
        const quando = new Date(item.finish_date).toLocaleString('pt-BR');
        if (saiuAntesDoPrazo) {
            dateP.textContent = `Saiu da promoção — o prazo dela ia até ${quando}`;
        } else {
            dateP.textContent = `${item.status === 'ended' ? 'Terminou em' : 'Termina em'} ${quando}`;
        }
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

// Campo do preço mínimo: o número que MANDA na automação.
//
// Gravado por ANÚNCIO (MLB), em tabela própria. Já esteve em products_catalog,
// o que obrigava a vincular cada anúncio a um produto cadastrado só para
// digitar um valor — limitação de armazenamento aparecendo como exigência na
// tela. Quem quer apenas renovar promoções não quer catalogar nada.
//
// Sem preço mínimo, a automação ignora o anúncio. É a trava principal.
function buildMinPriceInput(mlItemId, valorAtual, aoSalvar) {
    const wrap = document.createElement('div');
    wrap.style.marginTop = '0.5rem';

    const linha = document.createElement('div');
    linha.style.display = 'flex';
    linha.style.gap = '8px';
    linha.style.alignItems = 'center';

    const rotulo = document.createElement('span');
    rotulo.className = 'small';
    rotulo.style.color = 'var(--text-muted)';
    rotulo.style.whiteSpace = 'nowrap';
    rotulo.textContent = 'Exigir no mínimo';
    linha.appendChild(rotulo);

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    // Vazio não é "desligado", é o comportamento normal — o placeholder precisa
    // dizer isso, senão o campo em branco parece pendência.
    input.placeholder = 'piso automático';
    input.value = valorAtual != null ? valorAtual : '';
    input.style.width = '8rem';
    input.style.padding = '0.45rem 0.6rem';
    input.style.fontSize = '0.95rem';
    input.style.borderRadius = 'var(--border-radius-md, 12px)';
    input.style.border = '1px solid var(--border-color)';
    input.style.background = 'var(--bg-card)';
    input.style.color = 'var(--text-primary)';
    linha.appendChild(input);

    const salvar = document.createElement('button');
    salvar.className = 'btn btn-primary btn-sm';
    salvar.textContent = 'Salvar';
    salvar.style.whiteSpace = 'nowrap';
    linha.appendChild(salvar);

    salvar.addEventListener('click', async () => {
        const bruto = input.value.trim();
        const valor = bruto === '' ? null : Number(bruto);
        if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
            showToast('Informe um preço mínimo válido.', 'error');
            return;
        }
        salvar.disabled = true;
        try {
            await window.db.setPromoItemMinPrice(mlItemId, valor);
            showToast(valor === null
                ? 'Exigência removida — este anúncio volta ao piso automático.'
                : 'Exigência salva. Vale a partir da próxima verificação.', 'success');
            if (aoSalvar) await aoSalvar();
        } catch (e) {
            console.error('Falha ao salvar preço mínimo:', e);
            showToast('Não foi possível salvar o preço mínimo.', 'error');
        } finally {
            salvar.disabled = false;
        }
    });

    // Só aparece quando há uma exigência salva. Apagá-la NÃO desliga a
    // automação no anúncio — devolve o piso automático, que é o que protege
    // todo mundo por padrão.
    if (valorAtual != null) {
        const cancelar = document.createElement('button');
        cancelar.className = 'btn btn-secondary btn-sm';
        cancelar.textContent = 'Voltar ao piso automático';
        cancelar.style.whiteSpace = 'nowrap';
        linha.appendChild(cancelar);

        cancelar.addEventListener('click', async () => {
            const ok = await showConfirm(
                'Este anúncio volta ao piso automático: a automação continua agindo nele, '
                + 'só que exigindo apenas não receber menos do que ele já deixa hoje.',
                { title: 'Voltar ao piso automático', confirmText: 'Voltar ao automático' }
            );
            if (!ok) return;

            cancelar.disabled = true;
            salvar.disabled = true;
            try {
                await window.db.setPromoItemMinPrice(mlItemId, null);
                input.value = '';
                showToast('Anúncio de volta ao piso automático.', 'success');
                if (aoSalvar) await aoSalvar();
            } catch (e) {
                console.error('Falha ao cancelar a automação:', e);
                showToast('Não foi possível cancelar a automação.', 'error');
            } finally {
                cancelar.disabled = false;
                salvar.disabled = false;
            }
        });
    }

    wrap.appendChild(linha);
    return wrap;
}

// ==========================================
// PRECIFICAÇÃO MARKETPLACES
//
// Duas naturezas de dado convivem aqui, e a tela precisa deixar isso claro:
//
//   Mercado Livre -> consultado AO VIVO na API (comissão real da categoria).
//                    É número, não estimativa.
//   Shopee,
//   Amazon,
//   TikTok Shop   -> tabela embutida abaixo, porque nenhuma das três tem API
//                    pública de tarifas. Envelhece quando eles mudarem os valores.
// ==========================================

// Tabela oficial vigente desde MARÇO/2026, isolada de propósito: quando a
// Shopee mudar as taxas, muda-se só este bloco.
//
// A data não aparece mais na tela (o usuário achou poluído), então ela vive
// aqui — ao revisar, confira contra a tabela atual da Shopee.
//
// Não modelado: vendedor CPF com mais de 450 pedidos em 90 dias paga R$ 3,00
// a mais por item. Se isso passar a valer para o usuário, entra como linha.
const SHOPEE_FAIXAS = [
    { ate: 7.99, comissao: 50, fixa: 0 },
    { ate: 79.99, comissao: 20, fixa: 4 },
    { ate: 99.99, comissao: 14, fixa: 16 },
    { ate: 199.99, comissao: 14, fixa: 20 },
    { ate: Infinity, comissao: 14, fixa: 26 },
];

// Tabela vigente desde 15/07/2026 (reajuste anunciado pelo TikTok Shop),
// isolada como a de Shopee. O TikTok Shop não tem API pública de tarifas —
// apurada em reportagens (Duoke, GEcommerce, WireConsultoria), que concordam
// entre si nesta tabela. Uma quarta fonte (Guru das IAs) tem um exemplo cuja
// conta só fecha com R$6 de taxa fixa também abaixo de R$50 — ponto isolado,
// contra três fontes concordantes, então ficou de fora; mas é o número mais
// provável de estar errado se o TikTok tiver mudado algo depois da apuração.
// Por isso o aviso na tela pede para o vendedor confirmar A TAXA FIXA no
// Seller Center antes de decidir preço, não só "conferir tudo" de forma vaga.
//
// Não modelado: taxa de saque, imposto retido na fonte e comissão de
// afiliados (5–30%, definida pelo próprio vendedor — não é tarifa da
// plataforma). Se algum desses passar a valer para o usuário, entra como linha.
const TIKTOK_FAIXAS = [
    { ate: 49.99, comissao: 10, fixa: 4 },
    { ate: Infinity, comissao: 6, fixa: 6 },
];
// Frete Grátis é ADICIONAL à comissão normal, não substitui: é descrito como
// programa à parte ("segue em 6%, independente do valor do produto"), nunca
// como uma troca de alíquota — em nenhuma das fontes.
const TIKTOK_FRETE_GRATIS_PCT = 6;

function shopeeFaixa(preco) {
    return SHOPEE_FAIXAS.find(function (f) { return preco <= f.ate; }) || SHOPEE_FAIXAS[SHOPEE_FAIXAS.length - 1];
}

function tiktokFaixa(preco) {
    return TIKTOK_FAIXAS.find(function (f) { return preco <= f.ate; }) || TIKTOK_FAIXAS[TIKTOK_FAIXAS.length - 1];
}

function pmkMoeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Monta a tabela de resultado de um canal. `linhas` são os descontos.
// Além de desenhar a tabela, devolve os números — é isso que permite a aba
// Comparativo montar o ranking sem recalcular nada nem duplicar as regras de
// cada marketplace.
function pmkRenderResultado(alvo, dados) {
    if (!alvo) return null;
    const preco = dados.preco;
    const custo = dados.custo;

    // O imposto entra aqui, e não em cada canal: ele incide sobre o preço de
    // venda igual nos três. Somar em cada calculadora seria repetir a mesma
    // regra em três lugares, com três chances de divergir.
    const campoImposto = document.getElementById('pmk-imposto');
    const impostoPct = campoImposto ? parseFloat(campoImposto.value) || 0 : 0;

    const linhas = dados.linhas.slice();
    if (impostoPct > 0) {
        linhas.push({ rotulo: 'Imposto sobre a venda (' + impostoPct + '%)', valor: preco * (impostoPct / 100) });
    }

    alvo.innerHTML = '';

    const totalTaxas = linhas.reduce(function (s, l) { return s + l.valor; }, 0);
    const recebe = preco - totalTaxas;
    const lucro = recebe - custo;
    const margem = preco > 0 ? (lucro / preco) * 100 : 0;

    const corpo = ['<tr><td>Preço de venda</td><td class="text-right">' + pmkMoeda(preco) + '</td></tr>'];
    linhas.forEach(function (l) {
        corpo.push('<tr><td>(−) ' + escapeHtml(l.rotulo) + '</td><td class="text-right" style="color:var(--danger);">'
            + pmkMoeda(l.valor) + '</td></tr>');
    });
    corpo.push('<tr style="font-weight:700;"><td>(=) Você recebe</td><td class="text-right">' + pmkMoeda(recebe) + '</td></tr>');
    corpo.push('<tr><td>(−) Custo do produto</td><td class="text-right" style="color:var(--danger);">' + pmkMoeda(custo) + '</td></tr>');

    const cor = lucro >= 0 ? 'var(--success)' : 'var(--danger)';
    corpo.push('<tr style="font-weight:800; border-top:2px solid var(--border-color);">'
        + '<td>(=) Lucro por unidade</td>'
        + '<td class="text-right" style="color:' + cor + ';">' + pmkMoeda(lucro)
        + ' <span style="font-weight:600;">(' + margem.toFixed(1) + '%)</span></td></tr>');

    const tabela = document.createElement('table');
    tabela.className = 'results-table';
    tabela.style.width = '100%';
    tabela.innerHTML = '<tbody>' + corpo.join('') + '</tbody>';
    alvo.appendChild(tabela);

    if (dados.nota) {
        const n = document.createElement('p');
        n.className = 'small';
        n.style.color = 'var(--text-muted)';
        n.style.marginTop = '0.6rem';
        n.textContent = dados.nota;
        alvo.appendChild(n);
    }
    if (dados.aviso) {
        const a = document.createElement('p');
        a.className = 'small';
        a.style.color = 'var(--danger)';
        a.style.marginTop = '0.4rem';
        a.textContent = dados.aviso;
        alvo.appendChild(a);
    }

    return { preco: preco, custo: custo, taxas: totalTaxas, recebe: recebe, lucro: lucro, margem: margem, linhas: linhas };
}

function pmkCalcularShopee(preco, custo) {
    const f = shopeeFaixa(preco);
    pmkResultados.shopee = pmkRenderResultado(document.getElementById('pmk-shopee-conteudo'), {
        preco: preco,
        custo: custo,
        linhas: [
            { rotulo: 'Comissão Shopee (' + f.comissao + '%)', valor: preco * (f.comissao / 100) },
            { rotulo: 'Taxa fixa por item', valor: f.fixa },
        ],
        // Sem nota nem aviso: a faixa e o percentual já aparecem nas próprias
        // linhas do cálculo, e o texto sobre origem da tabela poluía a tela
        // com informação que não muda a decisão de preço.
    });
}

function pmkCalcularTiktok(preco, custo) {
    const f = tiktokFaixa(preco);
    const linhas = [
        { rotulo: 'Comissão TikTok Shop (' + f.comissao + '%)', valor: preco * (f.comissao / 100) },
        { rotulo: 'Taxa fixa por item', valor: f.fixa },
    ];

    const freteGratis = document.getElementById('pmk-tiktok-frete-gratis');
    if (freteGratis && freteGratis.checked) {
        linhas.push({ rotulo: 'Programa de Frete Grátis (' + TIKTOK_FRETE_GRATIS_PCT + '%)', valor: preco * (TIKTOK_FRETE_GRATIS_PCT / 100) });
    }

    pmkResultados.tiktok = pmkRenderResultado(document.getElementById('pmk-tiktok-conteudo'), {
        preco: preco,
        custo: custo,
        linhas: linhas,
        nota: preco < 50
            ? 'Tarifas de reportagens (sem API pública do TikTok Shop). A taxa fixa abaixo de R$ 50 é o número menos certo — uma fonte diverge das demais. Confira no Seller Center.'
            : 'Tarifas de reportagens (sem API pública do TikTok Shop). Confira no Seller Center antes de decidir o preço.',
    });
}

// Tipo de anúncio escolhido na aba do Mercado Livre. Clássico e Premium têm
// comissões diferentes na MESMA categoria — o Premium cobra mais em troca de
// parcelamento sem juros, então comparar os dois é decisão de precificação.
function pmkTipoAnuncio() {
    const marcado = document.querySelector('input[name="pmk-listing"]:checked');
    return marcado ? marcado.value : 'gold_special';
}

// Guarda o último cálculo para o seletor poder refazer só a aba do ML sem
// exigir que o usuário clique em Calcular de novo.
let pmkUltimo = null;

// Resultado de cada canal, preenchido conforme cada aba calcula. A aba
// Comparativo lê daqui — assim as regras de cada marketplace ficam num lugar
// só e o ranking nunca diverge do que as abas individuais mostram.
const pmkResultados = { ml: null, shopee: null, amazon: null, tiktok: null };

async function pmkCalcularML(preco, custo) {
    const alvo = document.getElementById('pmk-ml-conteudo');
    if (!alvo) return;
    alvo.innerHTML = '<p class="small">Consultando tarifa e frete reais na sua conta do Mercado Livre...</p>';

    const valor = function (id) {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || 0 : 0;
    };

    const campoNome = document.getElementById('pmk-nome');
    const nomeProduto = campoNome ? (campoNome.value || '').trim() : '';

    // ── Comissão: vem da CATEGORIA, descoberta pelo nome do produto ────────
    let feePct = null;
    let taxaFixa = 0;
    let categoriaNome = null;
    if (nomeProduto) {
        const cat = await mlApiFetch('/api/ml-market?action=category&q=' + encodeURIComponent(nomeProduto));
        if (cat && cat.categoryId) {
            categoriaNome = cat.categoryName;
            // billableWeight vai junto: sem ele o ML avisa que a taxa fixa
            // calculada não bate com a cobrada de verdade.
            const pesoParam = valor('pmk-peso') > 0 ? '&billableWeight=' + valor('pmk-peso') : '';
            const tarifa = await mlApiFetch('/api/ml-market?action=fee&price=' + encodeURIComponent(preco)
                + '&category=' + encodeURIComponent(cat.categoryId)
                + '&listingType=' + encodeURIComponent(pmkTipoAnuncio()) + pesoParam);
            if (tarifa && typeof tarifa.percentageFee === 'number') {
                feePct = tarifa.percentageFee;
                taxaFixa = typeof tarifa.fixedFee === 'number' ? tarifa.fixedFee : 0;
            }
        }
    }
    const usouReferencia = feePct === null;
    if (usouReferencia) feePct = 13;

    // ── Frete: cotado na conta do vendedor, se houver peso e dimensões ─────
    const peso = valor('pmk-peso');
    const comp = valor('pmk-comprimento');
    const larg = valor('pmk-largura');
    const alt = valor('pmk-altura');
    const temMedidas = peso > 0 && comp > 0 && larg > 0 && alt > 0;

    let freteCusto = 0;
    let freteNota = null;
    if (temMedidas) {
        const frete = await mlApiFetch('/api/ml-freight?weight=' + peso + '&length=' + comp
            + '&width=' + larg + '&height=' + alt + '&price=' + encodeURIComponent(preco), 20000);
        if (frete && typeof frete.cost === 'number') {
            freteCusto = frete.cost;
            if (frete.freteGratisObrigatorio) {
                freteNota = 'Neste preço o Mercado Livre exige frete grátis, então o custo é seu.';
            } else if (freteCusto === 0) {
                freteNota = 'Abaixo de R$ 79 o frete não sai do seu bolso: fica com o comprador ou com o Mercado Livre.';
            }
            if (frete.discount && frete.discount.rate > 0) {
                freteNota = (freteNota ? freteNota + ' ' : '')
                    + 'Já inclui ' + Math.round(frete.discount.rate * 100) + '% de desconto pela sua reputação.';
            }
        } else {
            freteNota = 'Não foi possível cotar o frete agora — o resultado abaixo está sem ele.';
        }
    }

    const linhas = [
        { rotulo: 'Comissão Mercado Livre (' + feePct + '%)', valor: preco * (feePct / 100) },
    ];
    // Tarifa por unidade: o ML cobra em itens abaixo do limite de frete grátis.
    // Vem da própria API (sale_fee_details.fixed_fee), não de estimativa.
    if (taxaFixa > 0) {
        linhas.push({ rotulo: 'Tarifa por unidade (item de baixo valor)', valor: taxaFixa });
    }
    if (temMedidas) {
        linhas.push({ rotulo: 'Frete da plataforma', valor: freteCusto });
    }

    const notas = [];
    notas.push(usouReferencia
        ? 'Comissão de referência (13%) — informe o nome do produto para trazer a tarifa exata da categoria.'
        : 'Tarifa real da categoria "' + categoriaNome + '", consultada agora na API do Mercado Livre.');
    if (freteNota) notas.push(freteNota);
    if (!temMedidas) notas.push('Preencha peso e dimensões para incluir o frete real no cálculo.');

    pmkResultados.ml = pmkRenderResultado(alvo, {
        preco: preco,
        custo: custo,
        linhas: linhas,
        nota: (pmkTipoAnuncio() === 'gold_pro' ? 'Anúncio Premium. ' : 'Anúncio Clássico. ') + notas.join(' '),
        // Sem aviso sobre modalidade de logística: o cálculo assume sempre
        // Mercado Envios com entrega em agência (drop_off), que é o padrão do
        // vendedor. Explicar as exceções de Flex/ME1 aqui só gerava dúvida
        // sobre um cenário que não é o dele.
    });
}

// Comissão da Amazon por categoria — tabela OFICIAL.
// Fonte: https://venda.amazon.com.br/precos#comissoes-de-venda
//
// A Amazon não expõe API pública de tarifas (só dentro do Seller Central,
// logado), então isto é tabela embutida. Ao revisar, confira na URL acima.
//
// `escalonado` existe porque algumas categorias cobram DOIS percentuais na
// mesma venda: um até certo valor e outro sobre o excedente. Tratar isso como
// percentual único erraria o cálculo justamente nos produtos mais caros.
const AMAZON_CATEGORIAS = [
    { id: 'comidas', nome: 'Comidas e bebidas', pct: 10 },
    { id: 'pneus', nome: 'Pneus e rodas', pct: 10 },
    { id: 'tv', nome: 'TV, áudio e cinema em casa', pct: 10 },
    { id: 'alcoolicas', nome: 'Bebidas alcoólicas', pct: 11 },
    { id: 'linhabranca', nome: 'Eletrodomésticos de linha branca', pct: 11 },
    { id: 'celulares', nome: 'Celulares', pct: 11 },
    { id: 'camera', nome: 'Câmera e fotografia', pct: 11 },
    { id: 'videogames', nome: 'Videogames e consoles', pct: 11 },
    { id: 'ferramentas', nome: 'Ferramentas e construção', pct: 11 },
    { id: 'saude', nome: 'Saúde e cuidados pessoais', pct: 12 },
    { id: 'industria', nome: 'Indústria e ciência', pct: 12 },
    { id: 'bebes', nome: 'Produtos para bebês', pct: 12 },
    { id: 'pets', nome: 'Produtos para animais de estimação', pct: 12 },
    { id: 'eletroportateis', nome: 'Eletroportáteis de cuidado pessoal', pct: 12 },
    { id: 'cozinha', nome: 'Cozinha', pct: 12 },
    { id: 'jardim', nome: 'Jardim e piscina', pct: 12 },
    { id: 'brinquedos', nome: 'Brinquedos e jogos', pct: 12 },
    { id: 'pc', nome: 'PC', pct: 12 },
    { id: 'casa', nome: 'Casa', pct: 12 },
    { id: 'esportes', nome: 'Esportes, aventura e lazer', pct: 12 },
    { id: 'instrumentos', nome: 'Instrumentos musicais e acessórios', pct: 12 },
    { id: 'eletronicosport', nome: 'Eletrônicos portáteis', pct: 13 },
    { id: 'beleza', nome: 'Beleza', pct: 13 },
    { id: 'relogios', nome: 'Relógios', pct: 13 },
    { id: 'papelaria', nome: 'Papelaria e escritório', pct: 13 },
    { id: 'belezaluxo', nome: 'Beleza de luxo', pct: 14 },
    { id: 'bagagem', nome: 'Bagagem e acessórios de viagem', pct: 14 },
    { id: 'roupas', nome: 'Roupas e acessórios', pct: 14 },
    { id: 'calcados', nome: 'Calçados, bolsas e óculos escuros', pct: 14 },
    { id: 'joias', nome: 'Joias', pct: 14 },
    { id: 'livros', nome: 'Livros', pct: 15 },
    { id: 'video', nome: 'Vídeo e DVD', pct: 15 },
    { id: 'musica', nome: 'Música (CDs, LPs)', pct: 15 },
    { id: 'acessorios', nome: 'Acessórios para eletrônicos e PC', escalonado: { ate: 100, pctAte: 15, pctAcima: 10 } },
    { id: 'moveis', nome: 'Móveis', escalonado: { ate: 200, pctAte: 15, pctAcima: 10 } },
    { id: 'outras', nome: 'Demais categorias', pct: 15 },
];

// Piso de comissão. A Amazon informa R$ 1,00 na maioria das categorias e
// R$ 2,00 em algumas específicas — sem a lista de quais, fica no valor geral.
const AMAZON_COMISSAO_MINIMA = 1;

// Plano Individual cobra por item; o Profissional troca por mensalidade fixa
// (grátis no primeiro ano, R$ 19/mês a partir do 13º), que não entra no custo
// unitário porque se dilui no volume.
const AMAZON_TAXA_INDIVIDUAL = 2;

// Tarifas de envio da Amazon — FBA e DBA.
// Fonte: https://venda.amazon.com.br/cresca/fba (tabela vigente desde 01/08/2025)
//
// A grade do FBA cruza PESO × FAIXA DE PREÇO. Um detalhe que só a tabela
// visual revela: nas três primeiras faixas (abaixo de R$ 79) a célula é
// MESCLADA — a tarifa é a mesma para qualquer peso. Ler aquilo como "só vale
// para 1kg–1,5kg" produziria um valor errado em quase todos os produtos
// baratos.
const AMAZON_FAIXAS_PRECO = [
    { ate: 29.99, rotulo: 'abaixo de R$ 30' },
    { ate: 49.99, rotulo: 'R$ 30 a 49,99' },
    { ate: 78.99, rotulo: 'R$ 50 a 78,99' },
    { ate: 99.99, rotulo: 'R$ 79 a 99,99' },
    { ate: 119.99, rotulo: 'R$ 100 a 119,99' },
    { ate: 149.99, rotulo: 'R$ 120 a 149,99' },
    { ate: 199.99, rotulo: 'R$ 150 a 199,99' },
    { ate: Infinity, rotulo: 'acima de R$ 200' },
];

// Abaixo de R$ 79: tarifa única por faixa, sem olhar o peso.
const FBA_ABAIXO_79 = [5.65, 5.85, 6.05];

// De R$ 79 em diante: peso (limite superior em gramas) × as cinco faixas
// restantes, na ordem 79-99,99 / 100-119,99 / 120-149,99 / 150-199,99 / 200+.
const FBA_POR_PESO = [
    { ate: 100, v: [10.05, 12.05, 14.05, 15.05, 15.55] },
    { ate: 200, v: [10.45, 12.45, 14.45, 15.45, 16.05] },
    { ate: 300, v: [10.95, 12.95, 14.95, 15.95, 16.55] },
    { ate: 400, v: [11.45, 13.45, 15.45, 16.95, 17.15] },
    { ate: 500, v: [11.95, 13.95, 15.95, 17.05, 17.85] },
    { ate: 750, v: [12.05, 14.05, 16.05, 18.45, 18.55] },
    { ate: 1000, v: [12.45, 14.45, 16.45, 19.05, 19.25] },
    { ate: 1500, v: [12.95, 14.95, 16.95, 19.45, 20.35] },
    { ate: 2000, v: [13.05, 15.05, 17.05, 19.95, 21.35] },
    { ate: 3000, v: [14.05, 16.05, 18.05, 20.05, 22.35] },
    { ate: 4000, v: [15.05, 17.05, 19.05, 21.95, 23.35] },
    { ate: 5000, v: [16.05, 18.05, 20.05, 22.95, 24.35] },
    { ate: 6000, v: [24.05, 27.05, 29.05, 30.05, 30.35] },
    { ate: 7000, v: [25.05, 28.05, 30.05, 31.05, 33.35] },
    { ate: 8000, v: [26.05, 29.05, 31.05, 32.05, 35.35] },
    { ate: 9000, v: [27.05, 30.05, 32.05, 33.05, 37.35] },
    { ate: 10000, v: [35.05, 40.05, 46.05, 51.05, 51.35] },
];

// Acima de 10 kg soma-se por quilo adicional.
const FBA_KG_ADICIONAL = [3.05, 3.05, 3.05, 3.50, 3.50];

// Limite do FBA: a tabela vale só para produtos abaixo de 22 kg.
const FBA_PESO_MAXIMO_G = 22000;

// DBA (Envios pela Amazon): o vendedor embala, a Amazon coleta e entrega.
//
// Abaixo de R$ 79 é tarifa única por faixa de preço, sem olhar peso nem origem.
const DBA_ABAIXO_79 = [4.50, 6.50, 6.75];

// De R$ 79 em diante vira grade peso × preço, como no FBA — mas com valores
// próprios e, importante, VARIÁVEL POR REGIÃO DE ORIGEM. Esta é a tabela de
// "SP Capital, demais capitais do Sul e Sudeste, interior do Sul e Sudeste,
// Centro-Oeste, Norte e Nordeste", que cobre a maior parte dos vendedores.
//
// Colunas: 79-99,99 / 100-119,99 / 120-149,99 / 150-199,99.
// A faixa acima de R$ 200 não veio na tabela consultada — nela o cálculo
// avisa em vez de estimar.
const DBA_POR_PESO = [
    { ate: 250, v: [11.95, 13.95, 15.95, 17.95] },
    { ate: 500, v: [12.85, 15.00, 17.15, 19.30] },
    { ate: 1000, v: [13.45, 15.70, 17.95, 20.20] },
    { ate: 2000, v: [14.00, 16.35, 18.75, 21.10] },
    { ate: 3000, v: [14.95, 17.45, 19.95, 22.40] },
    { ate: 4000, v: [16.15, 18.85, 21.55, 24.20] },
    { ate: 5000, v: [17.00, 19.90, 22.75, 25.60] },
    { ate: 6000, v: [25.00, 30.00, 34.00, 38.00] },
    { ate: 7000, v: [26.00, 31.00, 35.00, 39.00] },
    { ate: 8000, v: [27.00, 32.00, 36.00, 40.00] },
    { ate: 9000, v: [28.00, 33.00, 37.00, 41.00] },
    { ate: 10000, v: [39.50, 46.00, 52.75, 59.00] },
];

const DBA_KG_ADICIONAL = [3.05, 3.05, 3.05, 3.50];

// Acima de R$ 200 a tabela muda de eixo: em vez de faixas de preço, as colunas
// viram REGIÕES DE ORIGEM do envio.
const DBA_REGIOES = [
    { id: 'sp', nome: 'SP - Capital' },
    { id: 'capitais', nome: 'Outras capitais do Sul e Sudeste' },
    { id: 'interior', nome: 'Interior do Sul e Sudeste' },
    { id: 'demais', nome: 'Centro-Oeste, Norte e Nordeste' },
];

const DBA_ACIMA_200 = [
    { ate: 250, v: [19.95, 19.95, 20.45, 20.45] },
    { ate: 500, v: [20.45, 20.45, 20.95, 20.95] },
    { ate: 1000, v: [21.45, 21.45, 21.95, 21.95] },
    { ate: 2000, v: [22.95, 22.95, 23.45, 23.45] },
    { ate: 3000, v: [23.95, 23.95, 24.45, 24.45] },
    { ate: 4000, v: [25.95, 25.95, 25.95, 25.95] },
    { ate: 5000, v: [27.95, 27.95, 27.95, 27.95] },
    { ate: 6000, v: [36.95, 36.95, 36.95, 36.95] },
    { ate: 7000, v: [39.45, 39.45, 39.45, 39.45] },
    { ate: 8000, v: [40.45, 40.45, 40.45, 40.45] },
    { ate: 9000, v: [45.45, 46.95, 46.95, 46.95] },
    { ate: 10000, v: [59.95, 61.45, 65.95, 65.95] },
];

const DBA_ACIMA_200_KG_ADICIONAL = 4.00;

// Peso cúbico, conforme o exemplo oficial da Amazon:
// (comprimento x largura x altura em cm) / 6.000, e a tarifa usa o MAIOR
// valor entre o peso real e o cúbico. Uma caixa grande e leve é cobrada pelo
// espaço que ocupa, não pelo que pesa.
const DBA_DIVISOR_CUBICO = 6000;

function pesoFaturavelDba(pesoRealG, compCm, largCm, altCm) {
    if (!(compCm > 0 && largCm > 0 && altCm > 0)) return pesoRealG;
    const cubicoG = (compCm * largCm * altCm / DBA_DIVISOR_CUBICO) * 1000;
    return Math.max(pesoRealG, cubicoG);
}

function amazonIndiceFaixaPreco(preco) {
    for (let i = 0; i < AMAZON_FAIXAS_PRECO.length; i++) {
        if (preco <= AMAZON_FAIXAS_PRECO[i].ate) return i;
    }
    return AMAZON_FAIXAS_PRECO.length - 1;
}

// Devolve { valor, detalhe } ou { indisponivel, motivo }.
function amazonTarifaEnvio(modalidade, preco, pesoG) {
    const idx = amazonIndiceFaixaPreco(preco);

    if (modalidade === 'dba') {
        if (idx < 3) return { valor: DBA_ABAIXO_79[idx], detalhe: AMAZON_FAIXAS_PRECO[idx].rotulo + ', tarifa única' };

        const colDba = idx - 3;

        // Acima de R$ 200 a grade é por região de origem, não por faixa de preço.
        if (colDba >= DBA_POR_PESO[0].v.length) {
            if (!(pesoG > 0)) {
                return { indisponivel: true, motivo: 'A tarifa do DBA depende do peso — preencha o peso do produto acima.' };
            }
            const regiaoSel = document.getElementById('pmk-amz-regiao');
            const regId = regiaoSel ? regiaoSel.value : 'sp';
            const colReg = Math.max(0, DBA_REGIOES.findIndex(function (r) { return r.id === regId; }));
            const nomeReg = DBA_REGIOES[colReg].nome;
            const kgTxt = (pesoG / 1000).toFixed(2).replace('.', ',') + ' kg';

            const linhaReg = DBA_ACIMA_200.find(function (f) { return pesoG <= f.ate; });
            if (linhaReg) {
                return { valor: linhaReg.v[colReg], detalhe: 'acima de R$ 200, ' + kgTxt + ', ' + nomeReg };
            }
            const baseReg = DBA_ACIMA_200[DBA_ACIMA_200.length - 1].v[colReg];
            const extrasReg = Math.ceil((pesoG - 10000) / 1000);
            return {
                valor: baseReg + extrasReg * DBA_ACIMA_200_KG_ADICIONAL,
                detalhe: 'acima de R$ 200, ' + kgTxt + ', ' + nomeReg + ' (' + extrasReg + ' kg adicional' + (extrasReg > 1 ? 'is' : '') + ')',
            };
        }
        if (!(pesoG > 0)) {
            return { indisponivel: true, motivo: 'A partir de R$ 79 a tarifa do DBA depende do peso — preencha o peso do produto acima.' };
        }

        const linhaDba = DBA_POR_PESO.find(function (f) { return pesoG <= f.ate; });
        const kg = (pesoG / 1000).toFixed(2).replace('.', ',') + ' kg';
        if (linhaDba) {
            return { valor: linhaDba.v[colDba], detalhe: AMAZON_FAIXAS_PRECO[idx].rotulo + ', ' + kg };
        }
        const baseDba = DBA_POR_PESO[DBA_POR_PESO.length - 1].v[colDba];
        const extras = Math.ceil((pesoG - 10000) / 1000);
        return {
            valor: baseDba + extras * DBA_KG_ADICIONAL[colDba],
            detalhe: AMAZON_FAIXAS_PRECO[idx].rotulo + ', ' + kg + ' (' + extras + ' kg adicional' + (extras > 1 ? 'is' : '') + ')',
        };
    }

    // FBA
    if (idx < 3) return { valor: FBA_ABAIXO_79[idx], detalhe: AMAZON_FAIXAS_PRECO[idx].rotulo + ', tarifa única' };

    if (!(pesoG > 0)) {
        return { indisponivel: true, motivo: 'A partir de R$ 79 a tarifa do FBA depende do peso — preencha o peso do produto acima.' };
    }
    if (pesoG >= FBA_PESO_MAXIMO_G) {
        return { indisponivel: true, motivo: 'O FBA nesta tabela vale para produtos abaixo de 22 kg.' };
    }

    const coluna = idx - 3; // as cinco faixas de R$ 79 em diante
    const linha = FBA_POR_PESO.find(function (f) { return pesoG <= f.ate; });

    if (linha) {
        return { valor: linha.v[coluna], detalhe: AMAZON_FAIXAS_PRECO[idx].rotulo + ', ' + (pesoG / 1000).toFixed(2).replace('.', ',') + ' kg' };
    }

    // Acima de 10 kg: base da última faixa + adicional por quilo.
    const base = FBA_POR_PESO[FBA_POR_PESO.length - 1].v[coluna];
    const kgExtras = Math.ceil((pesoG - 10000) / 1000);
    return {
        valor: base + kgExtras * FBA_KG_ADICIONAL[coluna],
        detalhe: AMAZON_FAIXAS_PRECO[idx].rotulo + ', ' + (pesoG / 1000).toFixed(2).replace('.', ',') + ' kg ('
            + kgExtras + ' kg adicional' + (kgExtras > 1 ? 'is' : '') + ')',
    };
}

function pmkPreencherCategoriasAmazon() {
    const sel = document.getElementById('pmk-amz-categoria');
    if (!sel || sel.options.length > 1) return;
    AMAZON_CATEGORIAS.forEach(function (c) {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.escalonado
            ? c.nome + ' — ' + c.escalonado.pctAte + '% até ' + pmkMoeda(c.escalonado.ate) + ', ' + c.escalonado.pctAcima + '% acima'
            : c.nome + ' — ' + c.pct + '%';
        sel.appendChild(o);
    });
}

// Devolve { valor, descricao } da comissão, respeitando escalonamento.
function amazonComissao(cat, preco) {
    if (!cat.escalonado) {
        return { valor: preco * (cat.pct / 100), descricao: cat.pct + '%' };
    }
    const e = cat.escalonado;
    const naFaixa = Math.min(preco, e.ate);
    const excedente = Math.max(0, preco - e.ate);
    return {
        valor: naFaixa * (e.pctAte / 100) + excedente * (e.pctAcima / 100),
        descricao: excedente > 0
            ? e.pctAte + '% até ' + pmkMoeda(e.ate) + ' + ' + e.pctAcima + '% sobre ' + pmkMoeda(excedente)
            : e.pctAte + '%',
    };
}

function pmkCalcularAmazon(preco, custo) {
    const alvo = document.getElementById('pmk-amazon-conteudo');
    if (!alvo) return;

    const sel = document.getElementById('pmk-amz-categoria');
    const escolhida = sel ? sel.value : '';
    const cat = AMAZON_CATEGORIAS.find(function (c) { return c.id === escolhida; });

    if (!cat) {
        alvo.innerHTML = '<p class="helper-text" style="padding:1.5rem 0; text-align:center;">'
            + 'Escolha a categoria do produto no campo acima para calcular a comissão da Amazon.</p>';
        return;
    }

    const com = amazonComissao(cat, preco);
    let comissao = com.valor;
    let aplicouMinima = false;
    if (comissao < AMAZON_COMISSAO_MINIMA) {
        comissao = AMAZON_COMISSAO_MINIMA;
        aplicouMinima = true;
    }

    const planoSel = document.getElementById('pmk-amz-plano');
    const individual = planoSel ? planoSel.value === 'individual' : false;

    const linhas = [{ rotulo: 'Comissão Amazon (' + com.descricao + ')', valor: comissao }];
    if (individual) {
        linhas.push({ rotulo: 'Taxa por item (Plano Individual)', valor: AMAZON_TAXA_INDIVIDUAL });
    }

    // Envio: reaproveita o peso já informado no bloco de medidas.
    const envioSel = document.getElementById('pmk-amz-envio');
    const modalidade = envioSel ? envioSel.value : 'proprio';
    let avisoEnvio = null;

    if (modalidade !== 'proprio') {
        const val = function (id) {
            const e = document.getElementById(id);
            return e ? parseFloat(e.value) || 0 : 0;
        };
        const pesoReal = val('pmk-peso');

        // O DBA cobra pelo MAIOR valor entre peso real e cúbico. Como as
        // dimensões já estão no formulário, dá para aplicar a regra em vez de
        // subestimar o frete de caixas grandes e leves.
        const pesoG = modalidade === 'dba'
            ? pesoFaturavelDba(pesoReal, val('pmk-comprimento'), val('pmk-largura'), val('pmk-altura'))
            : pesoReal;

        const envio = amazonTarifaEnvio(modalidade, preco, pesoG);
        const nomeEnvio = modalidade === 'fba' ? 'FBA' : 'DBA';

        if (envio.indisponivel) {
            avisoEnvio = envio.motivo;
        } else {
            linhas.push({ rotulo: 'Envio ' + nomeEnvio + ' (' + envio.detalhe + ')', valor: envio.valor });
        }
    }

    // Só o essencial na tela: a categoria escolhida e, quando ocorrer, o piso
    // de comissão. As explicações sobre mensalidade e armazenagem foram
    // retiradas a pedido — não mudam o número, e poluíam o resultado.
    const notas = [cat.nome + '.'];
    if (aplicouMinima) notas.push('Aplicada a comissão mínima de ' + pmkMoeda(AMAZON_COMISSAO_MINIMA) + '.');

    pmkResultados.amazon = pmkRenderResultado(alvo, {
        preco: preco, custo: custo, linhas: linhas,
        nota: notas.join(' '),
        aviso: avisoEnvio,
    });
}

// Marcador visual de cada canal. SVG embutido em vez do logo oficial: os
// logos são marca registrada e viriam de host externo, o que o CSP bloqueia.
// A cor da marca já basta para identificar a coluna de relance.
const PMK_MARCAS = {
    ml: { cor: '#FFE600', texto: '#2D3277', letra: 'ML' },
    shopee: { cor: '#EE4D2D', texto: '#FFFFFF', letra: 'S' },
    amazon: { cor: '#FF9900', texto: '#232F3E', letra: 'a' },
    tiktok: { cor: '#000000', texto: '#FFFFFF', letra: 'TT' },
};

function pmkIcone(chave) {
    const m = PMK_MARCAS[chave];
    if (!m) return '';
    return '<svg width="18" height="18" viewBox="0 0 20 20" style="vertical-align:-4px; margin-right:0.35rem;" aria-hidden="true">'
        + '<rect width="20" height="20" rx="5" fill="' + m.cor + '"/>'
        + '<text x="10" y="14" text-anchor="middle" font-size="' + (m.letra.length > 1 ? 8 : 11) + '"'
        + ' font-weight="800" fill="' + m.texto + '" font-family="system-ui, sans-serif">' + m.letra + '</text>'
        + '</svg>';
}

// Aba Comparativo: os três canais lado a lado, ordenados pelo que sobra.
//
// Não recalcula nada — lê o que cada aba já apurou (pmkResultados). Duplicar
// as regras aqui seria criar uma segunda fonte de verdade, e ela divergiria
// das abas individuais na primeira mudança de tarifa.
function pmkRenderComparativo() {
    const alvo = document.getElementById('pmk-comparativo-conteudo');
    if (!alvo) return;
    alvo.innerHTML = '';

    if (!pmkUltimo) {
        alvo.innerHTML = '<p class="helper-text" style="padding:1.5rem 0; text-align:center;">'
            + 'Informe custo e preço acima e clique em Calcular para comparar os canais.</p>';
        return;
    }

    const canais = [
        { chave: 'ml', nome: 'Mercado Livre', r: pmkResultados.ml },
        { chave: 'shopee', nome: 'Shopee', r: pmkResultados.shopee },
        { chave: 'amazon', nome: 'Amazon', r: pmkResultados.amazon },
        { chave: 'tiktok', nome: 'TikTok Shop', r: pmkResultados.tiktok },
    ];

    const prontos = canais.filter(function (c) { return c.r; });
    const faltando = canais.filter(function (c) { return !c.r; });

    if (prontos.length === 0) {
        alvo.innerHTML = '<p class="helper-text" style="padding:1.5rem 0; text-align:center;">'
            + 'Nenhum canal calculado ainda.</p>';
        return;
    }

    // Melhor retorno primeiro. É o critério que importa: o preço é o mesmo nos
    // três, o que muda é quanto cada um retém.
    prontos.sort(function (a, b) { return b.r.lucro - a.r.lucro; });
    const vencedor = prontos[0];

    const tabela = document.createElement('table');
    tabela.className = 'results-table';
    tabela.style.width = '100%';

    const cab = prontos.map(function (c) {
        const marca = c === vencedor && prontos.length > 1
            ? ' <span style="font-size:0.7rem; padding:0.1rem 0.4rem; border-radius:999px; background:var(--success-bg); color:var(--success);">MELHOR</span>'
            : '';
        return '<th class="text-right" style="white-space:nowrap;">'
            + pmkIcone(c.chave) + escapeHtml(c.nome) + marca + '</th>';
    }).join('');

    const linha = function (rotulo, fn, estilo) {
        return '<tr' + (estilo || '') + '><td>' + rotulo + '</td>'
            + prontos.map(function (c) { return '<td class="text-right">' + fn(c.r) + '</td>'; }).join('')
            + '</tr>';
    };

    const corpo = [
        linha('Preço de venda', function (r) { return pmkMoeda(r.preco); }),
        linha('(−) Taxas do canal', function (r) { return '<span style="color:var(--danger);">' + pmkMoeda(r.taxas) + '</span>'; }),
        linha('(=) Você recebe', function (r) { return pmkMoeda(r.recebe); }, ' style="font-weight:700;"'),
        linha('(−) Custo do produto', function (r) { return '<span style="color:var(--danger);">' + pmkMoeda(r.custo) + '</span>'; }),
        linha('(=) Lucro por unidade', function (r) {
            const cor = r.lucro >= 0 ? 'var(--success)' : 'var(--danger)';
            return '<span style="color:' + cor + ';">' + pmkMoeda(r.lucro) + '</span>';
        }, ' style="font-weight:800; border-top:2px solid var(--border-color);"'),
        linha('Margem', function (r) { return r.margem.toFixed(1) + '%'; }, ' style="font-weight:700;"'),
    ];

    tabela.innerHTML = '<thead><tr><th></th>' + cab + '</tr></thead><tbody>' + corpo.join('') + '</tbody>';
    alvo.appendChild(tabela);

    // Diferença em dinheiro entre o melhor e o pior: é o número que responde
    // "vale a pena mudar de canal?".
    if (prontos.length > 1) {
        const pior = prontos[prontos.length - 1];
        const dif = vencedor.r.lucro - pior.r.lucro;
        const p = document.createElement('p');
        p.style.marginTop = '1rem';
        p.style.fontWeight = '700';
        p.textContent = vencedor.nome + ' deixa ' + pmkMoeda(dif) + ' a mais por unidade que ' + pior.nome + '.';
        alvo.appendChild(p);
    }

    if (faltando.length > 0) {
        const f = document.createElement('p');
        f.className = 'helper-text';
        f.style.marginTop = '0.6rem';
        f.textContent = 'Fora da comparação: ' + faltando.map(function (c) { return c.nome; }).join(', ')
            + '. Abra a aba correspondente e complete o que estiver faltando (categoria da Amazon, por exemplo).';
        alvo.appendChild(f);
    }
}

function initPrecificacaoMarketplaces() {
    const btn = document.getElementById('pmk-calcular');
    if (!btn) return;

    const abas = {
        ml: ['pmk-tab-btn-ml', 'pmk-tab-ml'],
        shopee: ['pmk-tab-btn-shopee', 'pmk-tab-shopee'],
        amazon: ['pmk-tab-btn-amazon', 'pmk-tab-amazon'],
        tiktok: ['pmk-tab-btn-tiktok', 'pmk-tab-tiktok'],
        comparativo: ['pmk-tab-btn-comparativo', 'pmk-tab-comparativo'],
    };

    Object.keys(abas).forEach(function (chave) {
        const b = document.getElementById(abas[chave][0]);
        if (!b) return;
        b.addEventListener('click', function () {
            Object.keys(abas).forEach(function (k) {
                const eb = document.getElementById(abas[k][0]);
                const ep = document.getElementById(abas[k][1]);
                if (eb) eb.classList.toggle('active', k === chave);
                if (ep) ep.classList.toggle('hidden', k !== chave);
            });
            // Monta na hora de abrir: assim reflete qualquer troca de
            // categoria, plano ou tipo de anúncio feita depois do Calcular.
            if (chave === 'comparativo') pmkRenderComparativo();
        });
    });

    btn.addEventListener('click', async function () {
        const campoCusto = document.getElementById('pmk-custo');
        const campoPreco = document.getElementById('pmk-preco');
        const custo = parseFloat(campoCusto ? campoCusto.value : '') || 0;
        const preco = parseFloat(campoPreco ? campoPreco.value : '') || 0;

        if (preco <= 0) {
            showToast('Informe o preço de venda desejado.', 'error');
            return;
        }

        pmkUltimo = { preco: preco, custo: custo };
        pmkCalcularShopee(preco, custo);
        pmkCalcularAmazon(preco, custo);
        pmkCalcularTiktok(preco, custo);
        await pmkCalcularML(preco, custo);
        pmkRenderComparativo();
    });

    // Trocar Clássico/Premium recalcula na hora, sem reclicar em Calcular.
    document.querySelectorAll('input[name="pmk-listing"]').forEach(function (r) {
        r.addEventListener('change', function () {
            if (!pmkUltimo) return;
            pmkCalcularML(pmkUltimo.preco, pmkUltimo.custo).then(pmkRenderComparativo);
        });
    });

    pmkPreencherCategoriasAmazon();

    // O imposto afeta os quatro canais, então recalcula todos.
    const campoImposto = document.getElementById('pmk-imposto');
    if (campoImposto) {
        campoImposto.addEventListener('change', function () {
            if (!pmkUltimo) return;
            pmkCalcularShopee(pmkUltimo.preco, pmkUltimo.custo);
            pmkCalcularAmazon(pmkUltimo.preco, pmkUltimo.custo);
            pmkCalcularTiktok(pmkUltimo.preco, pmkUltimo.custo);
            pmkCalcularML(pmkUltimo.preco, pmkUltimo.custo).then(pmkRenderComparativo);
        });
    }

    // Ligar/desligar o Programa de Frete Grátis só muda o TikTok Shop.
    const freteGratisTiktok = document.getElementById('pmk-tiktok-frete-gratis');
    if (freteGratisTiktok) {
        freteGratisTiktok.addEventListener('change', function () {
            if (!pmkUltimo) return;
            pmkCalcularTiktok(pmkUltimo.preco, pmkUltimo.custo);
            pmkRenderComparativo();
        });
    }

    // Mesmo comportamento para categoria e plano da Amazon.
    ['pmk-amz-categoria', 'pmk-amz-plano', 'pmk-amz-envio', 'pmk-amz-regiao'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', function () {
            if (!pmkUltimo) return;
            pmkCalcularAmazon(pmkUltimo.preco, pmkUltimo.custo);
            pmkRenderComparativo();
        });
    });
}

// ==========================================
// ABA AUTOMAÇÃO
//
// Três blocos: liga/desliga com as travas, a lista de anúncios com o preço
// mínimo de cada um, e o histórico do que o robô fez — inclusive as decisões
// de NÃO agir, que são as que explicam por que um anúncio ficou de fora.
// ==========================================

const brlFmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function campoNumero(valor, min, max) {
    const i = document.createElement('input');
    i.type = 'number';
    i.min = String(min);
    if (max != null) i.max = String(max);
    i.value = valor;
    i.style.width = '5rem';
    i.style.padding = '0.35rem 0.5rem';
    i.style.borderRadius = 'var(--border-radius-md, 12px)';
    i.style.border = '1px solid var(--border-color)';
    i.style.background = 'var(--bg-card)';
    i.style.color = 'var(--text-primary)';
    return i;
}

function linhaOpcao(labelTexto, controle, ajuda) {
    const linha = document.createElement('div');
    linha.style.display = 'flex';
    linha.style.alignItems = 'flex-start';
    linha.style.gap = '0.6rem';
    linha.style.marginTop = '0.7rem';

    controle.style.marginTop = '0.15rem';
    controle.style.flexShrink = '0';
    linha.appendChild(controle);

    const textos = document.createElement('div');
    const lb = document.createElement('div');
    lb.style.fontWeight = '600';
    lb.textContent = labelTexto;
    textos.appendChild(lb);
    if (ajuda) {
        const h = document.createElement('div');
        h.className = 'small';
        h.style.color = 'var(--text-muted)';
        h.style.marginTop = '0.1rem';
        h.textContent = ajuda;
        textos.appendChild(h);
    }
    linha.appendChild(textos);
    return linha;
}

function renderPromoAutoConfig(cfg) {
    const alvo = document.getElementById('promo-auto-config');
    if (!alvo) return;
    alvo.innerHTML = '';

    const card = document.createElement('section');
    card.className = 'card';

    const titulo = document.createElement('h4');
    titulo.style.marginBottom = '0.25rem';
    titulo.textContent = 'Entrada automática em promoções';
    card.appendChild(titulo);

    // A regra inteira cabe numa frase, e ela precisa estar na tela: sem isso o
    // vendedor não tem como saber contra o que a automação está comparando.
    const regra = document.createElement('p');
    regra.style.marginTop = '0.5rem';
    regra.style.padding = '0.7rem 0.85rem';
    regra.style.borderRadius = 'var(--border-radius-md, 12px)';
    regra.style.border = '1px solid var(--border-color)';
    regra.style.background = 'var(--bg-subtle, rgba(148,163,184,0.08))';
    regra.style.fontWeight = '600';
    regra.textContent = 'Regra: entra em promoção nos anúncios que estão sem nenhuma e troca a promoção ativa quando outra cobra menos do comprador e deixa mais para você, sempre dentro do período de hoje.';
    card.appendChild(regra);

    const comoFunciona = document.createElement('p');
    comoFunciona.className = 'small';
    comoFunciona.style.color = 'var(--text-muted)';
    comoFunciona.style.marginTop = '0.5rem';
    comoFunciona.textContent = 'O preço que você já colocou em cada anúncio é o padrão. A cada convite do '
        + 'Mercado Livre a automação calcula quanto cai na sua conta hoje (preço em vigor menos tarifa e '
        + 'frete, mais o que o ML banca) e quanto cairia na promoção. Só entra se for igual ou mais — é o '
        + 'caso das campanhas cofinanciadas, em que o desconto sai do bolso do Mercado Livre e não do seu. '
        + 'O Mercado Livre não troca uma promoção pela outra: uma nova entra na fila atrás da ativa e só passa a valer '
        + 'quando a ativa termina. Por isso, quando a automação acha uma promoção que cobra menos do comprador e deixa '
        + 'mais para você, que está valendo agora e não acaba antes da atual, ela entra nela e tira a ativa. Sem essa '
        + 'vantagem o anúncio fica como está, e depois de uma troca ele descansa 24 horas. '
        + 'Não há nada para preencher: todos os seus anúncios já estão cobertos.';
    card.appendChild(comoFunciona);

    const chkEnabled = document.createElement('input');
    chkEnabled.type = 'checkbox';
    chkEnabled.checked = !!cfg.enabled;

    // Repor o desconto é o comportamento esperado, e linha antiga no banco vem
    // sem o campo — por isso a ausência conta como ligado, não como desligado.
    const chkRenovar = document.createElement('input');
    chkRenovar.type = 'checkbox';
    chkRenovar.checked = cfg.auto_renew !== false;

    const inpTeto = campoNumero(cfg.max_joins_per_day ?? 10, 1, 200);
    const inpSubida = campoNumero(cfg.max_price_increase_pct ?? 5, 0, 100);
    inpSubida.step = '0.5';

    card.appendChild(linhaOpcao('Automação ligada', chkEnabled,
        'Desligada, nada acontece — as opções abaixo ficam apenas guardadas.'));
    card.appendChild(linhaOpcao('Repor o desconto quando a promoção vencer', chkRenovar,
        'Quando uma promoção sua termina e o anúncio volta sozinho ao preço cheio, a automação devolve o mesmo desconto que você já praticava. Você recebe o mesmo de antes — só não fica sem promoção sem perceber.'));
    card.appendChild(linhaOpcao('Quanto o preço pode subir para o comprador (%)', inpSubida,
        'Ao entrar numa promoção, o preço de vitrine não passa deste percentual acima do que o comprador paga agora. Nos descontos em que o preço é seu, a automação desce até o limite em vez de usar o sugerido. 0 = nunca sobe. Na troca de uma promoção ativa por outra o preço nunca sobe: ela só troca por uma que cobre menos. Promoções que a própria automação deixou programadas acima desse limite são removidas da fila.'));
    card.appendChild(linhaOpcao('Máximo de entradas por dia', inpTeto,
        'Trava contra um convite em massa do Mercado Livre virar dezenas de entradas de uma vez.'));

    const salvar = document.createElement('button');
    salvar.className = 'btn btn-primary';
    salvar.style.marginTop = '1rem';
    salvar.textContent = 'Salvar configuração';
    salvar.addEventListener('click', async () => {
        salvar.disabled = true;
        // Campo vazio volta ao padrão; zero é escolha válida (nunca subir).
        const subida = inpSubida.value.trim() === '' ? 5 : Number(inpSubida.value);
        try {
            const r = await window.db.savePromoAutomation({
                enabled: chkEnabled.checked,
                // Deixou de ser uma escolha do vendedor. Quando a regra é
                // "não receber menos do que já recebo", não há o que autorizar:
                // uma promoção que não te custa nada nunca precisou de permissão,
                // e uma que te custa é recusada pela conta, não por esta chave.
                auto_deal: true,
                auto_renew: chkRenovar.checked,
                // Relâmpago fica de fora da automação por decisão do vendedor:
                // é irreversível uma vez ativa, e ele prefere entrar à mão pela
                // aba "Podem ter Relâmpago".
                auto_lightning: false,
                max_joins_per_day: Math.max(1, Number(inpTeto.value) || 10),
                max_price_increase_pct: Number.isFinite(subida) ? Math.min(100, Math.max(0, subida)) : 5,
            });
            // O upsert devolve o erro em vez de lançar: sem esta checagem a
            // tela dizia "salva" com o banco recusando.
            if (r && r.error) {
                if (/max_price_increase_pct/.test(r.error.message || '')) {
                    showToast('Falta rodar o supabase/ml_promo_limite_preco.sql no Supabase para guardar o limite de preço.', 'error');
                    return;
                }
                throw r.error;
            }
            showToast('Configuração salva.', 'success');
            loadPromoAutomationTab();
        } catch (e) {
            console.error('Falha ao salvar configuração da automação:', e);
            showToast('Não foi possível salvar a configuração.', 'error');
        } finally {
            salvar.disabled = false;
        }
    });
    card.appendChild(salvar);

    alvo.appendChild(card);
}

// Lista TODOS os anúncios ativos do vendedor — não só os que o Mercado Livre
// está convidando agora. É aqui que se configura o que a automação pode fazer,
// anúncio por anúncio: vincular ao produto (de onde sai o custo) e definir o
// preço mínimo (que é o que manda de fato).
function renderPromoAutoItems(anuncios, problema, configs, contagem) {
    const alvo = document.getElementById('promo-auto-items');
    if (!alvo) return;
    alvo.innerHTML = '';

    const card = document.createElement('section');
    card.className = 'card';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Seus anúncios';
    card.appendChild(titulo);

    const sub = document.createElement('p');
    sub.className = 'small';
    sub.style.color = 'var(--text-muted)';
    sub.style.marginTop = '0.2rem';
    sub.textContent = 'Todos já estão protegidos, sem precisar configurar nada: o piso de cada um é quanto '
        + 'ele deixa hoje. Só mexa aqui se quiser EXIGIR MAIS que isso em algum anúncio específico — por '
        + 'exemplo, aceitar promoção nele apenas se pagar acima do que paga agora.';
    card.appendChild(sub);

    // Sem isto, uma lista cortada parece uma lista completa — e o vendedor
    // conclui que a automação não enxerga anúncios que ele tem.
    if (contagem) {
        const nota = document.createElement('p');
        nota.className = 'small';
        nota.style.marginTop = '0.4rem';
        const mostrados = (anuncios || []).length;
        if (contagem.total > mostrados) {
            nota.style.color = 'var(--danger)';
            nota.style.fontWeight = '600';
            nota.textContent = `Mostrando ${mostrados} de ${contagem.total} anúncios ativos (limite de ${contagem.cap} por consulta). Me avise se precisar de todos.`;
        } else {
            nota.style.color = 'var(--text-muted)';
            nota.textContent = `${mostrados} anúncio${mostrados === 1 ? '' : 's'} ativo${mostrados === 1 ? '' : 's'}. Anúncios pausados ou finalizados não aparecem — eles não participam de promoção.`;
        }
        card.appendChild(nota);
    }

    if (problema) {
        const erro = document.createElement('p');
        erro.className = 'small';
        erro.style.color = 'var(--danger)';
        erro.style.marginTop = '0.8rem';
        erro.textContent = problema;
        card.appendChild(erro);
        alvo.appendChild(card);
        return;
    }

    if (!anuncios || anuncios.length === 0) {
        const vazio = document.createElement('p');
        vazio.className = 'small';
        vazio.style.color = 'var(--text-muted)';
        vazio.style.marginTop = '0.8rem';
        vazio.textContent = 'Nenhum anúncio ativo encontrado no Mercado Livre. Confira se a conta está conectada.';
        card.appendChild(vazio);
        alvo.appendChild(card);
        return;
    }

    const cfgPorItem = configs || {};

    // Já configurados sobem: a lista pode ter dezenas de itens e os que o
    // vendedor acompanha ficam à mão.
    const ordenados = [...anuncios].sort((a, b) => {
        const ca = cfgPorItem[a.ml_item_id], cb = cfgPorItem[b.ml_item_id];
        const va = ca && ca.min_price != null ? 0 : 1;
        const vb = cb && cb.min_price != null ? 0 : 1;
        return va - vb;
    });

    for (const anuncio of ordenados) {
        const cfg = cfgPorItem[anuncio.ml_item_id];
        const minimo = cfg ? cfg.min_price : null;

        const bloco = document.createElement('div');
        bloco.style.marginTop = '1rem';
        bloco.style.paddingTop = '0.9rem';
        bloco.style.borderTop = '1px solid var(--border-color)';

        const cabecalho = document.createElement('div');
        cabecalho.className = 'item-card-title-group';
        cabecalho.appendChild(buildThumbnailImg(anuncio.thumbnail, 40));
        const nome = document.createElement('strong');
        nome.textContent = anuncio.title || anuncio.ml_item_id;
        cabecalho.appendChild(nome);
        bloco.appendChild(cabecalho);

        const situacao = document.createElement('div');
        situacao.className = 'small';
        situacao.style.marginTop = '0.25rem';
        // O piso é o LÍQUIDO, não o preço de vitrine. Mostrar o preço aqui era
        // o que fazia os números não baterem: o vendedor compara com o que ele
        // RECEBE, e a tela exibia o que o comprador PAGA. São valores bem
        // diferentes depois de tarifa e frete.
        const liquido = cfg ? cfg.current_net : null;

        situacao.style.fontWeight = '700';
        if (minimo != null) {
            situacao.style.color = 'var(--warning)';
            situacao.textContent = `Exigindo receber no mínimo ${brlFmt(minimo)} — acima do piso automático`;
        } else if (liquido != null) {
            situacao.style.color = 'var(--success)';
            situacao.textContent = `✓ Protegido — hoje você recebe ${brlFmt(liquido)} limpo por venda, e a automação não aceita menos que isso`;
        } else {
            // Anúncio ainda não visitado pela verificação, ou cuja tarifa/frete
            // o ML não respondeu. Prometer um número que não existe seria pior
            // do que dizer que ele ainda vem.
            situacao.style.color = 'var(--text-muted)';
            situacao.textContent = '✓ Protegido — o valor que você recebe será calculado na próxima verificação';
        }
        bloco.appendChild(situacao);

        if (liquido != null) {
            const conta = document.createElement('div');
            conta.className = 'small';
            conta.style.color = 'var(--text-muted)';
            conta.style.marginTop = '0.15rem';
            const vitrine = cfg.current_price != null
                ? `Vendendo a ${brlFmt(cfg.current_price)} (o preço em vigor, já com a promoção ativa). `
                : '';
            conta.textContent = `${vitrine}O valor acima já desconta tarifa e frete e soma o que o Mercado Livre banca. Calculado ${timeAgoPrecise(cfg.current_net_at)}.`;
            bloco.appendChild(conta);
        }

        // O desconto guardado é o que a reposição devolve quando a promoção
        // vencer. Mostrar deixa claro que existe uma memória — e qual é ela.
        const guardado = cfg ? cfg.last_deal_price : null;
        if (guardado != null) {
            const memoria = document.createElement('div');
            memoria.className = 'small';
            memoria.style.color = 'var(--text-muted)';
            memoria.style.marginTop = '0.15rem';
            memoria.textContent = `Desconto guardado: ${brlFmt(guardado)} — se a promoção vencer, a automação repõe esse preço.`;
            bloco.appendChild(memoria);
        }

        bloco.appendChild(buildMinPriceInput(anuncio.ml_item_id, minimo, loadPromoAutomationTab));

        card.appendChild(bloco);
    }

    alvo.appendChild(card);
}

// Quantas ações de cada grupo a aba de automação busca. Serve também para o
// contador da aba mostrar "30+" em vez de fingir que 30 é o total.
const PROMO_HISTORY_LIMIT = 30;

// Aba aberta no histórico da automação. Fica fora da função porque a tela é
// redesenhada depois de salvar um piso, e voltar sempre para a primeira aba
// tiraria o vendedor do que ele estava lendo. `null` = ainda não escolheu.
let promoHistoryTab = null;

function buildPromoActionRow(a, primeira) {
    const cores = {
        joined: ['var(--success)', 'Entrou'],
        skipped: ['var(--text-muted)', 'Não entrou'],
        failed: ['var(--danger)', 'Falhou'],
    };

    const linha = document.createElement('div');
    if (!primeira) {
        linha.style.marginTop = '0.8rem';
        linha.style.paddingTop = '0.6rem';
        linha.style.borderTop = '1px solid var(--border-color)';
    }

    const [cor, rotulo] = cores[a.outcome] || ['var(--text-muted)', a.outcome];

    const cabecalho = document.createElement('div');
    cabecalho.style.fontWeight = '700';
    cabecalho.style.color = cor;
    cabecalho.textContent = `${rotulo}${a.deal_price != null ? ' por ' + brlFmt(a.deal_price) : ''}`;
    linha.appendChild(cabecalho);

    const detalhe = document.createElement('div');
    detalhe.className = 'small';
    detalhe.style.color = 'var(--text-muted)';
    detalhe.style.marginTop = '0.15rem';
    detalhe.textContent = `${a.item_title || a.ml_item_id}${a.promotion_type ? ' · ' + a.promotion_type : ''} — ${a.reason || ''}`;
    linha.appendChild(detalhe);

    const quando = document.createElement('div');
    quando.className = 'small';
    quando.style.color = 'var(--text-muted)';
    quando.style.marginTop = '0.1rem';
    quando.textContent = timeAgoPrecise(a.created_at);
    linha.appendChild(quando);

    return linha;
}

function renderPromoAutoHistory(acoes) {
    const alvo = document.getElementById('promo-auto-history');
    if (!alvo) return;
    alvo.innerHTML = '';

    const card = document.createElement('section');
    card.className = 'card';

    const titulo = document.createElement('h4');
    titulo.textContent = 'O que a automação fez';
    card.appendChild(titulo);

    if (!acoes || acoes.length === 0) {
        const vazio = document.createElement('p');
        vazio.className = 'small';
        vazio.style.color = 'var(--text-muted)';
        vazio.style.marginTop = '0.5rem';
        vazio.textContent = 'Nada registrado ainda. As decisões aparecem aqui depois da próxima verificação automática.';
        card.appendChild(vazio);
        alvo.appendChild(card);
        return;
    }

    // Com um supabase_client.js antigo em cache, o filtro por resultado é
    // ignorado e as duas buscas devolvem as mesmas linhas.
    const vistos = new Set();
    const unicas = acoes.filter(a => !vistos.has(a.id) && vistos.add(a.id));
    const recentes = (x, y) => new Date(y.created_at) - new Date(x.created_at);

    const abas = [
        {
            id: 'aprovados',
            rotulo: 'Aprovados',
            lista: unicas.filter(a => a.outcome === 'joined').sort(recentes),
            vazio: 'A automação ainda não colocou nenhum anúncio em promoção.',
        },
        {
            id: 'nao-aprovados',
            rotulo: 'Não aprovados',
            lista: unicas.filter(a => a.outcome !== 'joined').sort(recentes),
            vazio: 'Nenhuma promoção recusada nas verificações recentes.',
        },
    ];

    // Primeira visita: abre onde tem conteúdo, com os aprovados na frente.
    if (!abas.some(aba => aba.id === promoHistoryTab)) {
        promoHistoryTab = abas[0].lista.length ? abas[0].id : abas[1].id;
    }

    const barra = document.createElement('div');
    barra.className = 'results-tab-bar';
    barra.setAttribute('role', 'tablist');
    barra.style.marginTop = '0.75rem';

    const painel = document.createElement('div');
    painel.setAttribute('role', 'tabpanel');

    const botoes = abas.map(aba => {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'results-tab-btn';
        botao.setAttribute('role', 'tab');
        const qtd = aba.lista.length >= PROMO_HISTORY_LIMIT ? `${PROMO_HISTORY_LIMIT}+` : aba.lista.length;
        botao.textContent = `${aba.rotulo} (${qtd})`;
        botao.addEventListener('click', () => {
            promoHistoryTab = aba.id;
            desenhar();
        });
        barra.appendChild(botao);
        return botao;
    });

    function desenhar() {
        abas.forEach((aba, i) => {
            const ativa = aba.id === promoHistoryTab;
            botoes[i].classList.toggle('active', ativa);
            botoes[i].setAttribute('aria-selected', ativa ? 'true' : 'false');
        });

        const atual = abas.find(aba => aba.id === promoHistoryTab);
        painel.innerHTML = '';

        if (atual.lista.length === 0) {
            const vazio = document.createElement('p');
            vazio.className = 'small';
            vazio.style.color = 'var(--text-muted)';
            vazio.textContent = atual.vazio;
            painel.appendChild(vazio);
            return;
        }

        atual.lista.forEach((a, i) => painel.appendChild(buildPromoActionRow(a, i === 0)));
    }

    card.appendChild(barra);
    card.appendChild(painel);
    desenhar();

    alvo.appendChild(card);
}

async function loadPromoAutomationTab() {
    if (!state.currentUser) return;
    try {
        const [cfg, aprovadas, recusadas, listagem, configs] = await Promise.all([
            window.db.getPromoAutomation(),
            window.db.getPromoActions(PROMO_HISTORY_LIMIT, ['joined']),
            window.db.getPromoActions(PROMO_HISTORY_LIMIT, ['skipped', 'failed']),
            mlApiFetch('/api/ml-reviews?resource=listings', 25000),
            window.db.getPromoItemConfigs(),
        ]);

        renderPromoAutoConfig(cfg || {});
        renderPromoAutoItems(
            listagem ? listagem.items : null,
            listagem ? null : 'Não foi possível consultar seus anúncios no Mercado Livre agora. Verifique a conexão da conta e tente de novo.',
            configs,
            listagem ? { total: listagem.total, cap: listagem.cap } : null
        );
        renderPromoAutoHistory([...aprovadas, ...recusadas]);
    } catch (e) {
        console.error('Falha ao carregar a aba de automação:', e);
        showToast('Não foi possível carregar a automação.', 'error');
    }
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

// ==========================================
// PATROCINADOS DESLIGADOS
//
// Ao contrário das outras abas do monitoramento, esta não vem do cron: é o
// estado de agora, consultado direto na API de publicidade quando a aba é
// aberta. Por isso tem botão de atualizar em vez de "última verificação".
// ==========================================

function buildAdOffCard(item) {
    const card = document.createElement('section');
    card.className = 'card';
    card.style.marginBottom = '0.75rem';
    card.style.opacity = item.is_read ? '0.7' : '1';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'item-card-title-group';
    titleGroup.appendChild(buildThumbnailImg(item.item_thumbnail));

    const title = document.createElement('strong');
    title.textContent = item.item_title || item.ml_item_id;
    titleGroup.appendChild(title);
    card.appendChild(titleGroup);

    // Rótulos explícitos por status. Antes era "paused ou senão fora de
    // campanha", e isso escondeu um problema: anúncio ativo que entrava na
    // lista por engano aparecia como "Fora de campanha". Status desconhecido
    // agora se mostra em vez de virar afirmação errada.
    const ADS_STATUS = {
        idle: {
            etiqueta: 'Fora de campanha',
            alerta: 'Este anúncio saiu de campanha',
            detalhe: 'Disponível para publicidade e sem campanha nenhuma.',
        },
        paused: {
            etiqueta: 'Pausado na campanha',
            alerta: 'Este anúncio foi pausado na campanha',
            detalhe: 'Está numa campanha, mas pausado — não recebe impressão nenhuma.',
        },
    };
    const info = ADS_STATUS[item.status] || {
        etiqueta: `Status: ${item.status || 'desconhecido'}`,
        alerta: 'Este anúncio mudou de situação na publicidade',
        detalhe: 'O Mercado Livre retornou um status que a tela ainda não conhece.',
    };

    // Alerta só pra quem saiu de campanha depois que o monitoramento começou:
    // anúncio que já estava parado desde sempre não é novidade.
    if (!item.is_read) {
        card.appendChild(buildAlertBanner(info.alerta));
    }

    const tags = document.createElement('div');
    tags.style.display = 'flex';
    tags.style.flexWrap = 'wrap';
    tags.style.gap = '0.35rem';
    tags.style.marginTop = '0.5rem';

    const addTag = (texto, cor, fundo) => {
        const tag = document.createElement('span');
        tag.className = 'small';
        tag.textContent = texto;
        tag.style.fontWeight = '700';
        tag.style.padding = '0.15rem 0.5rem';
        tag.style.borderRadius = '999px';
        tag.style.color = cor;
        tag.style.background = fundo;
        tags.appendChild(tag);
    };

    if (item.recommended) {
        addTag('RECOMENDADO PELO ML', '#15803d', '#dcfce7');
    }
    addTag(info.etiqueta, '#b45309', '#fef3c7');

    card.appendChild(tags);

    const detail = document.createElement('p');
    detail.className = 'small';
    detail.style.color = 'var(--text-muted)';
    detail.style.marginTop = '0.5rem';
    detail.textContent = info.detalhe;
    card.appendChild(detail);

    // Quando este status foi confirmado no Mercado Livre. Sem isso não dá pra
    // saber, olhando a tela, se um anúncio que já voltou para campanha ainda
    // está aqui porque o dado é antigo ou porque o ML está reportando errado.
    if (item.updated_at) {
        const quando = document.createElement('p');
        quando.className = 'small';
        quando.style.color = 'var(--text-muted)';
        quando.style.marginTop = '0.2rem';
        quando.textContent = `Confirmado no Mercado Livre ${timeAgoPrecise(item.updated_at)}`;
        card.appendChild(quando);
    }

    card.appendChild(buildAdsPageLink(item));

    return card;
}

const ML_ADS_ADMIN_URL = 'https://www.mercadolivre.com.br/publicidade/product-ads/admin/ads';

// Abre o painel de Product Ads — é lá que se liga o Patrocinados, e não na
// Central de Promoções usada pelas outras abas.
//
// O painel não aceita filtro por URL: nem o id do anúncio nem o título como
// parâmetro de busca são reconhecidos, a página abre sempre na listagem
// completa. Em vez de insistir num parâmetro que não existe, o botão copia o
// título para a área de transferência e abre a página — daí é só colar na
// busca dela. Uma colagem resolve o que o link não consegue fazer sozinho.
function buildAdsPageLink(item) {
    const termo = item.item_title || item.ml_item_id;

    const link = document.createElement('a');
    link.className = 'btn btn-secondary btn-sm';
    link.style.marginTop = '0.5rem';
    link.style.display = 'inline-block';
    link.href = ML_ADS_ADMIN_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Copiar nome e abrir Patrocinados';

    link.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(termo);
            showToast('Nome copiado — cole na busca do painel de Patrocinados.', 'success');
        } catch (err) {
            // Sem permissão de área de transferência a navegação segue: o
            // usuário abre o painel e busca na mão.
            console.error('Não foi possível copiar o nome do anúncio:', err);
        }
    });

    return link;
}

async function loadAdsOff() {
    if (!state.currentUser) {
        renderIntoList('ads-list', 'ads-empty', [], buildAdOffCard);
        updateAdsBadge(0);
        return;
    }

    const data = await mlApiFetch('/api/ml-reviews?resource=ads');
    updateAdsBadge(data ? data.unreadCount : 0);
    renderIntoList('ads-list', 'ads-empty', data ? data.items : [], buildAdOffCard);

    // Aba vazia tem várias causas possíveis. Quando a consulta ao vivo falha,
    // mostra o motivo em vez de deixar parecendo que está tudo rodando.
    // Elemento separado do "última verificação", que é escrito por outra
    // função e sobrescreveria esta mensagem.
    const problemEl = document.getElementById('ads-problem');
    if (!problemEl) return;

    if (data && data.problema) {
        problemEl.textContent = data.message || 'Não foi possível consultar os Patrocinados.';
        problemEl.classList.remove('hidden');
        return;
    }

    // Dado velho significa que a checagem automática parou de atualizar esta
    // aba — e aí o que está na tela pode não valer mais. Melhor avisar do que
    // deixar o vendedor agir sobre informação vencida.
    const itens = (data && data.items) || [];
    const maisRecente = itens.reduce((maior, i) => {
        const t = new Date(i.updated_at || 0).getTime();
        return t > maior ? t : maior;
    }, 0);

    if (maisRecente > 0 && Date.now() - maisRecente > 60 * 60 * 1000) {
        problemEl.textContent = `A verificação automática não atualiza esta aba desde ${timeAgoPrecise(new Date(maisRecente).toISOString())}. O que está listado pode estar desatualizado.`;
        problemEl.classList.remove('hidden');
    } else {
        problemEl.classList.add('hidden');
    }
}

async function markAdsRead(payload) {
    if (!state.currentUser) return;
    try {
        await fetch('/api/ml-reviews?resource=ads', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('Erro ao marcar Patrocinados como lidos:', err);
    }
    await loadAdsOff();
}

function updateAdsBadge(count) {
    const badge = document.getElementById('nav-badge-ads');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// As 3 abas são mutuamente exclusivas: "Podem ter Relâmpago" vem de uma lista
// à parte (ml_lightning_candidates, marcada com kind: 'lightning_candidate'),
// não misturada com promoções reais.
function renderPromotionsTabs(items) {
    const all = items || [];
    const promotions = all.filter(i => i.kind === 'promotion');
    const lightning = all.filter(i => i.kind === 'lightning_candidate');

    const active = promotions.filter(i => i.status === 'active');

    // Cada linha é um par anúncio × promoção, então o mesmo anúncio pode ter
    // uma promoção encerrada e outra rodando. Nesse caso ele não é um anúncio
    // "inativo": está em promoção agora, só que em outra. Listá-lo aqui fazia
    // parecer que tinha saído de promoção, que é o oposto do que a aba
    // deveria mostrar — ela existe pra achar quem ficou sem nenhuma.
    const itensComPromocaoAtiva = new Set(
        promotions.filter(i => i.status === 'active').map(i => i.ml_item_id)
    );
    const ended = promotions.filter(i => i.status === 'ended' && !itensComPromocaoAtiva.has(i.ml_item_id));

    // Ativas: mais urgente (menos dias restantes) primeiro — assim a que está
    // prestes a vencer aparece no topo, mesmo sem uma aba própria para ela.
    // Inativas: a que terminou por último primeiro (mais relevante que uma de meses atrás).
    const byFinishDateAsc = (a, b) => new Date(a.finish_date || 0) - new Date(b.finish_date || 0);
    const byUpdatedAtDesc = (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    active.sort(byFinishDateAsc);
    ended.sort(byUpdatedAtDesc);

    renderIntoList('promo-list-active', 'promo-empty-active', active, buildPromotionCard);
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

function initAdsModule() {
    const btnMarkAll = document.getElementById('btn-mark-all-ads-read');
    if (btnMarkAll) btnMarkAll.addEventListener('click', () => markAdsRead({ all: true }));
}

function initPromotionsModule() {
    initAdsModule();

    const btnMarkAll = document.getElementById('btn-mark-all-promotions-read');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', () => markPromotionsRead({ all: true }));
    }

    const tabButtons = {
        active: document.getElementById('promo-tab-btn-active'),
        ended: document.getElementById('promo-tab-btn-ended'),
        lightning: document.getElementById('promo-tab-btn-lightning'),
        auto: document.getElementById('promo-tab-btn-auto'),
    };
    const tabPanels = {
        active: document.getElementById('promo-tab-active'),
        ended: document.getElementById('promo-tab-ended'),
        lightning: document.getElementById('promo-tab-lightning'),
        auto: document.getElementById('promo-tab-auto'),
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
            // A aba de automação lê configuração e histórico do banco, então
            // carrega sob demanda — não faz sentido buscar isso em toda visita
            // à tela de promoções.
            if (key === 'auto') loadPromoAutomationTab();
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
    'view-lote': {
        title: 'Lote salvo',
        subtitle: 'Custos, tributos e memória de cálculo',
        icon: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'
    },
    'view-shipping': {
        title: 'Navio - Container',
        subtitle: 'Acompanhe o navio no mapa e as etapas do embarque',
        icon: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>'
    },
    'view-pricing': {
        title: 'Precificação Marketplaces',
        subtitle: 'Quanto sobra em cada canal depois das taxas',
        icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
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
    },
    'view-gtin': {
        title: 'Gerador de EAN',
        subtitle: 'Códigos com dígito verificador válido para teste e validação de cadastro',
        icon: '<path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/>'
    },
    'view-ads': {
        title: 'Patrocinados',
        subtitle: 'Margem depois dos anúncios e o que ajustar em cada um',
        icon: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'
    },
    'view-ml-painel': {
        title: 'Painel do Mercado Livre',
        subtitle: 'Vendas, reputação e o que precisa de você hoje',
        icon: '<path d="M3 3v18h18"/><path d="m7 15 4-5 4 3 5-7"/>'
    },
    'view-admin': {
        title: 'Cadastros',
        subtitle: 'Quem criou conta, quem usa e quem assina',
        icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
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
        conectarMercadoLivre();
    }
});

// Leva ao login do Mercado Livre. Global de propósito: o aviso de conta não
// conectada das abas do Mercado Livre (ml-conexao.js) chama por aqui.
//
// A URL vem do servidor por um fetch com o token da sessão, e não por uma
// navegação direta: assim o servidor sabe QUEM está conectando (não confia num
// userId da URL) e grava, na mesma resposta, o cookie que amarra o fluxo a este
// navegador. Ver api/_ml-oauth.js.
let conectandoShopee = false;
async function conectarShopee() {
    if (conectandoShopee) return;
    conectandoShopee = true;
    try {
        const r = await mlApiFetch('/api/ml-auth?provider=shopee');
        if (r && r.url) {
            window.location.href = r.url;
            return;
        }
        showToast('Não foi possível iniciar a conexão com a Shopee. Entre de novo no Impoclick e tente outra vez.', 'error');
    } finally {
        conectandoShopee = false;
    }
}

let conectandoAmazonAds = false;
async function conectarAmazonAds() {
    if (conectandoAmazonAds) return;
    conectandoAmazonAds = true;
    try {
        const r = await mlApiFetch('/api/ml-auth?provider=amazon-ads');
        if (r && r.url) {
            window.location.href = r.url;
            return;
        }
        showToast('Não foi possível iniciar a conexão com os anúncios da Amazon. Entre de novo no Impoclick e tente outra vez.', 'error');
    } finally {
        conectandoAmazonAds = false;
    }
}

let conectandoMercadoLivre = false;
async function conectarMercadoLivre() {
    if (conectandoMercadoLivre) return;
    conectandoMercadoLivre = true;
    try {
        const r = await mlApiFetch('/api/ml-auth');
        if (r && r.url) {
            window.location.href = r.url;
            return;
        }
        showToast('Não foi possível iniciar a conexão com o Mercado Livre. Entre de novo no Impoclick e tente outra vez.', 'error');
    } finally {
        // Se a navegação começou, a página descarrega; se falhou, libera o botão.
        conectandoMercadoLivre = false;
    }
}

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
            
            // Abre o subgrupo que contém a tela ativa. Sem isso, entrar em
            // Promoções pela home deixaria "Monitoramento" fechado e o item
            // marcado como ativo invisível.
            const grupoAtivo = activeBtn.closest('.nav-dropdown-group');
            document.querySelectorAll('.nav-dropdown-group').forEach(g => {
                const toggle = g.querySelector('.nav-subgroup-toggle');
                const contem = g === grupoAtivo;
                if (toggle) toggle.classList.toggle('contem-ativo', contem);
                if (contem) abrirSubgrupo(g, true);
            });

            document.querySelectorAll('.nav-dropdown-toggle').forEach(t => {
                t.classList.toggle('active', !!grupoAtivo && grupoAtivo.contains(t));
            });
        }

        // Aviso genérico de troca de tela, para telas que vivem em módulo
        // próprio (navio.js) se montarem sem entrar na cadeia de ifs abaixo.
        document.dispatchEvent(new CustomEvent('impoclick:tela', { detail: { id: targetViewId } }));
    };

    // Bind dos subgrupos recolhíveis (Documentos, Monitoramento).
    document.querySelectorAll('.nav-subgroup-toggle').forEach(botao => {
        botao.addEventListener('click', (e) => {
            e.stopPropagation();
            const grupo = botao.closest('.nav-dropdown-group');
            if (grupo) abrirSubgrupo(grupo, !grupo.classList.contains('open'));
        });
    });
    restaurarSubgrupos();

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
                carregarMargemCatalogo(false);
            }
            if (viewId === 'view-promotions') {
                loadPromotionsStatus();
                loadCheckStatus();
            }
            if (viewId === 'view-ads') {
                loadAdsOff();
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
                    uploader.style.backgroundColor = 'var(--accent-soft)';
                });

                uploader.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = 'var(--primary)';
                    uploader.style.backgroundColor = 'var(--accent-soft)';
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
                    uploader.style.backgroundColor = 'var(--accent-soft)';
                });

                uploader.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploader.style.borderColor = 'var(--primary)';
                    uploader.style.backgroundColor = 'var(--accent-soft)';
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
//
// `opts` é opcional e aditivo (method/body) — painéis que só fazem GET
// (a maioria) continuam chamando com só path+timeoutMs, sem mudar nada.
async function mlApiFetch(path, timeoutMs, opts) {
    if (!state.currentUser) return null;

    try {
        const controller = new AbortController();
        // 6s cobre as consultas que leem do nosso banco. Chamadas que batem ao
        // vivo na API do ML e paginam (listar todos os anúncios, por exemplo)
        // precisam de mais tempo — quem chama informa quanto.
        const timeout = setTimeout(() => controller.abort(), timeoutMs || 6000);
        const resp = await fetch(path, {
            method: (opts && opts.method) || 'GET',
            headers: {
                'user-token': state.currentUser.id,
                'Authorization': `Bearer ${state.currentUser.access_token}`,
                ...((opts && opts.body) ? { 'Content-Type': 'application/json' } : {}),
            },
            body: opts && opts.body,
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeout);
        // 402 = o servidor recusou por plano vencido. Essa é a checagem que
        // vale (a do front é só aparência), então refletimos no estado local e
        // deixamos o updateUI abrir o paywall — antes isso caía no `return null`
        // abaixo e o recurso sumia da tela sem nenhuma explicação.
        if (resp.status === 402) {
            state.currentUser.is_pro = false;
            state.currentUser.is_subscribed = false;
            state.currentUser.isSubscribed = false;
            updateUI();
            return null;
        }
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
    };
    const tabPanels = {
        simples: panelSimples,
        formal: document.getElementById('viab-tab-formal'),
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
        // Mesmo tratamento da tabela de rateio: quando o NCM não tem alíquota
        // cadastrada, os federais saem zerados e isso PRECISA aparecer — esta é
        // a tela em que a pessoa decide se compra ou não.
        const semAliquota = ratesAreUnknown(r.rates);
        const pct = (v, d = 1) => formatRatePercent(r.rates, v, d);

        if (tbody) {
            tbody.innerHTML = `
                <tr><td>Valor Aduaneiro (Produto + Frete)</td><td class="text-right">—</td><td class="text-right">${brl(r.vaBRL)}</td></tr>
                <tr><td>Imposto de Importação (II)</td><td class="text-right">${pct(r.rates.ii)}</td><td class="text-right">${brl(r.iiBRL)}</td></tr>
                <tr><td>IPI</td><td class="text-right">${pct(r.rates.ipi)}</td><td class="text-right">${brl(r.ipiBRL)}</td></tr>
                <tr><td>PIS</td><td class="text-right">${pct(r.rates.pis, 2)}</td><td class="text-right">${brl(r.pisBRL)}</td></tr>
                <tr><td>COFINS</td><td class="text-right">${pct(r.rates.cofins, 2)}</td><td class="text-right">${brl(r.cofinsBRL)}</td></tr>
                <tr><td>ICMS</td><td class="text-right">${icmsPct}%</td><td class="text-right">${brl(r.icmsBRL)}</td></tr>
                ${otherFeesBRL > 0 ? `<tr><td>Outras Despesas Aduaneiras</td><td class="text-right">—</td><td class="text-right">${brl(otherFeesBRL)}</td></tr>` : ''}
            `;
        }
        if (tfoot) {
            tfoot.innerHTML = `
                <tr style="font-weight:700;"><td colspan="2">Custo Total do Lote</td><td class="text-right">${brl(r.totalCost)}</td></tr>
                ${semAliquota ? `
                <tr>
                    <td colspan="3" style="background: var(--danger-soft); border-top: 2px solid var(--danger); padding: 0.85rem 1rem; font-weight:600; line-height:1.5; text-align:left; white-space:normal;">
                        ⚠ Este NCM não tem alíquotas cadastradas.
                        <span style="display:block; font-weight:400; margin-top:0.35rem;">
                            <strong>II, IPI, PIS e COFINS entraram como zero</strong> no custo total acima — o custo
                            real será maior. Informe as alíquotas manualmente antes de decidir pela compra.
                        </span>
                    </td>
                </tr>` : ''}
            `;
        }
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
                <button class="btn btn-primary btn-sm" onclick="verLoteSalvo(${item.id})" title="Ver custos, gráficos e memória de cálculo">Ver</button>
                <button class="btn btn-secondary btn-sm" onclick="loadSavedImport(${item.id})" title="Abrir na calculadora para editar">Editar</button>
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

// Um lote salvo, venha do Supabase (logado) ou do navegador. Editar e Ver
// usam a mesma busca.
async function buscarLoteSalvo(id) {
    if (state.currentUser) {
        try {
            const spData = await window.db.getHistory();
            const row = spData.find(i => i.id === id);
            if (row) return { name: row.name, stateData: row.state_data, createdAt: row.created_at };
        } catch(e) {}
        return null;
    }
    let historyList = [];
    try {
        historyList = JSON.parse(localStorage.getItem('import_rateio_history')) || [];
    } catch(e) {}
    const local = historyList.find(i => i.id === id);
    return local ? { name: local.name, stateData: local.stateData, createdAt: local.id } : null;
}

// Abre o lote só para conferir: gráficos, custos e memória de cálculo, sem
// tocar no que está na calculadora. Quem desenha é lote.js, ao ouvir o
// evento; aqui só entram os dados e a conta, que é a mesma do updateUI.
async function verLoteSalvo(id) {
    const item = await buscarLoteSalvo(id);
    if (!item || !item.stateData) {
        showToast('Não foi possível abrir este lote.', 'error');
        return;
    }
    const estado = { ...ESTADO_PADRAO, ...item.stateData };
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById('view-lote').classList.remove('hidden');
    document.querySelectorAll('.nav-item, .nav-subitem').forEach(btn => btn.classList.remove('active'));
    const itemMenu = document.querySelector('[data-view="view-imports"]');
    if (itemMenu) itemMenu.classList.add('active');
    updateHeaderForView('view-lote');
    window.scrollTo({ top: 0 });
    document.dispatchEvent(new CustomEvent('impoclick:ver-lote', { detail: {
        id, nome: item.name, criadoEm: item.createdAt, estado, calculo: calcularLote(estado),
    } }));
}

async function loadSavedImport(id) {
    const item = await buscarLoteSalvo(id);
    
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
            conectarMercadoLivre();
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

    // Status da Amazon. Hoje é um app PRIVADO na SP-API (só a conta principal
    // do Impoclick está autoautorizada — ver api/_amazon-helper.js), então não
    // existe botão de "Conectar" aqui ainda: só mostramos o status e, se já
    // estiver conectado, o botão de desconectar.
    const btnDisconnectAmazon = document.getElementById('btn-disconnect-amazon');
    const statusTextAmazon = document.getElementById('amazon-connection-status');
    if (statusTextAmazon) {
        if (btnDisconnectAmazon) {
            btnDisconnectAmazon.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!state.currentUser) return;
                if (!await showConfirm('Desconectar a conta da Amazon?', { title: 'Desconectar Amazon', confirmText: 'Desconectar', danger: true })) return;

                btnDisconnectAmazon.disabled = true;
                try {
                    await fetch('/api/ml-status?provider=amazon', {
                        method: 'POST',
                        headers: { 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` }
                    });
                } catch (err) {
                    console.error('Erro ao desconectar Amazon:', err);
                }
                btnDisconnectAmazon.disabled = false;
                syncSettingsUI();
            });
        }

        mlApiFetch('/api/ml-status?provider=amazon').then(res => {
            if (res && res.connected) {
                statusTextAmazon.textContent = 'Conectado';
                statusTextAmazon.style.color = 'var(--success)';
                if (btnDisconnectAmazon) btnDisconnectAmazon.classList.remove('hidden');
            } else {
                statusTextAmazon.textContent = 'Ainda não disponível para todas as contas';
                statusTextAmazon.style.color = 'var(--text-muted)';
                if (btnDisconnectAmazon) btnDisconnectAmazon.classList.add('hidden');
            }
        });
    }

    // Status da conexão com a Shopee.
    const btnConnectShopee = document.getElementById('btn-connect-shopee');
    const btnDisconnectShopee = document.getElementById('btn-disconnect-shopee');
    const statusTextShopee = document.getElementById('shopee-connection-status');
    if (statusTextShopee) {
        if (btnConnectShopee) {
            btnConnectShopee.addEventListener('click', (e) => {
                e.preventDefault();
                conectarShopee();
            });
        }
        if (btnDisconnectShopee) {
            btnDisconnectShopee.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!state.currentUser) return;
                if (!await showConfirm('Desconectar sua conta da Shopee?', { title: 'Desconectar Shopee', confirmText: 'Desconectar', danger: true })) return;

                btnDisconnectShopee.disabled = true;
                try {
                    await fetch('/api/ml-status?provider=shopee', {
                        method: 'POST',
                        headers: { 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` }
                    });
                } catch (err) {
                    console.error('Erro ao desconectar Shopee:', err);
                }
                btnDisconnectShopee.disabled = false;
                syncSettingsUI();
            });
        }

        mlApiFetch('/api/ml-status?provider=shopee').then(res => {
            if (res && res.connected) {
                statusTextShopee.textContent = res.shopName ? `Conectado como: ${res.shopName}` : 'Conectado';
                statusTextShopee.style.color = 'var(--success)';
                if (btnConnectShopee) btnConnectShopee.classList.add('hidden');
                if (btnDisconnectShopee) btnDisconnectShopee.classList.remove('hidden');
            } else {
                statusTextShopee.textContent = 'Não conectado';
                statusTextShopee.style.color = 'var(--text-muted)';
                if (btnConnectShopee) btnConnectShopee.classList.remove('hidden');
                if (btnDisconnectShopee) btnDisconnectShopee.classList.add('hidden');
            }
        });
    }

    // Status dos anúncios da Amazon (Patrocinados) — conexão separada da
    // SP-API acima, OAuth com redirect de verdade (ver conectarAmazonAds).
    const btnConnectAmazonAds = document.getElementById('btn-connect-amazon-ads');
    const btnDisconnectAmazonAds = document.getElementById('btn-disconnect-amazon-ads');
    const statusTextAmazonAds = document.getElementById('amazon-ads-connection-status');
    if (statusTextAmazonAds) {
        if (btnConnectAmazonAds) {
            btnConnectAmazonAds.addEventListener('click', (e) => {
                e.preventDefault();
                conectarAmazonAds();
            });
        }
        if (btnDisconnectAmazonAds) {
            btnDisconnectAmazonAds.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!state.currentUser) return;
                if (!await showConfirm('Desconectar os anúncios da Amazon? O histórico de gastos salvo será apagado.', { title: 'Desconectar Amazon Ads', confirmText: 'Desconectar', danger: true })) return;

                btnDisconnectAmazonAds.disabled = true;
                try {
                    await fetch('/api/ml-status?provider=amazon-ads', {
                        method: 'POST',
                        headers: { 'user-token': state.currentUser.id, 'Authorization': `Bearer ${state.currentUser.access_token}` }
                    });
                } catch (err) {
                    console.error('Erro ao desconectar Amazon Ads:', err);
                }
                btnDisconnectAmazonAds.disabled = false;
                syncSettingsUI();
            });
        }

        mlApiFetch('/api/ml-status?provider=amazon-ads').then(res => {
            if (res && res.connected) {
                statusTextAmazonAds.textContent = 'Conectado';
                statusTextAmazonAds.style.color = 'var(--success)';
                if (btnConnectAmazonAds) btnConnectAmazonAds.classList.add('hidden');
                if (btnDisconnectAmazonAds) btnDisconnectAmazonAds.classList.remove('hidden');
            } else {
                statusTextAmazonAds.textContent = 'Não conectado';
                statusTextAmazonAds.style.color = 'var(--text-muted)';
                if (btnConnectAmazonAds) btnConnectAmazonAds.classList.remove('hidden');
                if (btnDisconnectAmazonAds) btnDisconnectAmazonAds.classList.add('hidden');
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
        // Precisa passar pelo abrirModalPagamento e não só tirar o .hidden: é
        // ele que monta o formulário de cartão. Abrindo na mão, o modal aparecia
        // com os campos vazios e o botão preso em "Carregando formulário
        // seguro...", porque o CardForm nunca chegava a ser montado.
        if (typeof window.abrirModalPagamento === 'function') {
            window.abrirModalPagamento();
            return;
        }
        const paymentModal = document.getElementById('payment-modal');
        if (paymentModal) paymentModal.classList.remove('hidden');
    };
}

// ─────────────────────────────────────────────────────────────────────────
// GERADOR DE EAN
//
// Gera códigos com dígito verificador válido para exercitar cadastro,
// importação de planilha e validação de fluxo — o mesmo uso que as ferramentas
// públicas do tipo declaram.
//
// Para VENDER, o código legítimo vem da GS1: um número gerado aqui pode já
// pertencer a uma empresa registrada, e o Mercado Livre valida o GTIN enviado.
// ─────────────────────────────────────────────────────────────────────────

function gtinDigitoVerificador(semDigito) {
    let soma = 0;
    for (let i = semDigito.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
        soma += Number(semDigito[i]) * peso;
    }
    return (10 - (soma % 10)) % 10;
}

function gtinGerarTeste() {
    const alvo = document.getElementById('gtin-teste-saida');
    if (!alvo) return;

    const qtd = Math.min(500, Math.max(1, parseInt(document.getElementById('gtin-teste-qtd').value, 10) || 1));
    const tamanho = parseInt(document.getElementById('gtin-teste-formato').value, 10) || 13;

    // O prefixo só se aplica ao EAN-13: UPC-A é numeração dos EUA e o EAN-8
    // tem alocação própria, curta demais para prefixo de país.
    const prefixo = tamanho === 13 ? '789' : '';

    const codigos = [];
    const usados = new Set();
    while (codigos.length < qtd) {
        let base = prefixo;
        while (base.length < tamanho - 1) base += Math.floor(Math.random() * 10);
        if (usados.has(base)) continue;
        usados.add(base);
        codigos.push(base + gtinDigitoVerificador(base));
    }

    const linhas = codigos.map((c, i) => '<div class="gtin-linha">'
        + '<span class="gtin-marca" style="color:var(--text-muted);">' + (i + 1) + '</span>'
        + '<div><strong class="gtin-codigo">' + c + '</strong></div>'
        + '</div>').join('');

    alvo.innerHTML = linhas
        + '<button type="button" class="btn btn-secondary" id="gtin-btn-copiar-teste" style="margin-top:1rem;">Copiar todos</button>';

    const botao = document.getElementById('gtin-btn-copiar-teste');
    botao.addEventListener('click', () => {
        navigator.clipboard.writeText(codigos.join('\n')).then(() => {
            botao.textContent = 'Copiado';
            setTimeout(() => { botao.textContent = 'Copiar todos'; }, 1800);
        });
    });
}

function initGtin() {
    const botao = document.getElementById('gtin-btn-teste');
    if (botao) botao.addEventListener('click', gtinGerarTeste);
}
