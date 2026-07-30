// Service worker — centraliza autenticação e chamadas de rede. Content
// scripts só extraem dados da página e mandam mensagem pra cá; toda a rede
// acontece aqui, onde o host_permissions do manifest libera fetch
// cross-origin sem precisar de CORS configurado nos servidores de destino.

const SUPABASE_URL = 'https://qmwvzhpyxrkyxvekcazs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5xxYDOzIcWWpz2J37MuVaw_XJCpQM5i';
const IMPOCLICK_API = 'https://www.impoclick.com.br/api';

async function getSession() {
    const { session } = await chrome.storage.local.get('session');
    return session || null;
}

async function login(email, password) {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) {
        return { error: data.error_description || data.msg || 'E-mail ou senha incorretos.' };
    }
    const session = {
        userId: data.user.id,
        email: data.user.email,
        name: (data.user.user_metadata && data.user.user_metadata.name) || data.user.email,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000 - 60000, // 1 min de margem
    };
    await chrome.storage.local.set({ session });
    refreshReviewsBadge();
    return { session };
}

async function logout() {
    await chrome.storage.local.remove('session');
    chrome.action.setBadgeText({ text: '' });
    return { ok: true };
}

// A sessão do popup é feita "na mão" (grant_type=password) em vez de usar o
// supabase-js, que renovaria sozinho — por isso replicamos aqui o mesmo padrão
// de refresh usado no backend (_ml-helper.js): se o access_token já vai vencer,
// troca pelo refresh_token antes de usar.
async function refreshSupabaseSession(refreshToken) {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!resp.ok) return null;
    return resp.json();
}

async function ensureFreshAccessToken(session) {
    if (session.expiresAt && Date.now() < session.expiresAt) return session.accessToken;
    if (!session.refreshToken) return session.accessToken;

    const refreshed = await refreshSupabaseSession(session.refreshToken);
    if (!refreshed) return session.accessToken; // refresh falhou — segue com o que tem, a API vai recusar se estiver vencido

    const updated = {
        ...session,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || session.refreshToken,
        expiresAt: Date.now() + (refreshed.expires_in || 3600) * 1000 - 60000,
    };
    await chrome.storage.local.set({ session: updated });
    return updated.accessToken;
}

// Header duplo (user-token + Authorization) igual ao site: o backend valida o
// JWT de verdade e só usa o user-token como referência — não basta mais só
// saber o UUID de alguém pra ler os dados dela.
async function getAuthHeaders() {
    const session = await getSession();
    if (!session) return null;
    const token = await ensureFreshAccessToken(session);
    return { 'user-token': session.userId, 'Authorization': `Bearer ${token}` };
}

// A API do Mercado Livre bloqueia (403) consultar /items/{id} de anúncios
// que não pertencem ao token OAuth usado — tanto anônimo quanto autenticado
// só enxerga os PRÓPRIOS itens do vendedor logado. Não dá pra usar isso para
// ver o anúncio de outra pessoa. Por isso o título/preço são extraídos da
// própria página pelo content script (que já está renderizada no navegador
// do usuário) e mandados aqui só pra resolver a categoria — reaproveitando
// a mesma busca por nome que a Comparação de Mercado do site já usa.
async function resolveCategory(query) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const resp = await fetch(`${IMPOCLICK_API}/ml-market?action=category&q=${encodeURIComponent(query)}`, { headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível identificar a categoria deste produto.' };
    return { category: data };
}

async function getFee(price, categoryId) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const resp = await fetch(
        `${IMPOCLICK_API}/ml-market?action=fee&price=${encodeURIComponent(price)}&category=${encodeURIComponent(categoryId)}`,
        { headers }
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível calcular a taxa de venda.' };
    return { fee: data };
}

// Consulta pública de marcas no INPI — usada de forma OPCIONAL (só quando o
// usuário clica), pra checar se um nome de marca visto num anúncio de
// catálogo tem registro no INPI e em qual classe de Nice.
async function checkTrademark(query, page) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const qs = new URLSearchParams({ q: query, page: page || 1 });
    const resp = await fetch(`${IMPOCLICK_API}/inpi-marca?${qs.toString()}`, { headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar a marca no INPI.' };
    return { trademark: data };
}

// Avaliações novas nos anúncios — a checagem de verdade roda no backend (cron via
// GitHub Actions); aqui só lemos o resultado pra acender o badge no ícone.
async function getReviews() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const resp = await fetch(`${IMPOCLICK_API}/ml-reviews`, { headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar as avaliações.' };
    return { reviews: data };
}

// Status de catálogo (ganhando/perdendo a competição) — mesmo endpoint de
// avaliações, só muda o parâmetro resource=catalog.
async function getCatalogStatus() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const resp = await fetch(`${IMPOCLICK_API}/ml-reviews?resource=catalog`, { headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar o status de catálogo.' };
    return { catalog: data };
}

// Promoções com prazo terminando (ou já terminadas) — mesmo endpoint,
// resource=promotions.
async function getPromotionsStatus() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const resp = await fetch(`${IMPOCLICK_API}/ml-reviews?resource=promotions`, { headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar as promoções.' };
    return { promotions: data };
}

// O badge do ícone soma avaliações não lidas + itens de catálogo que acabaram
// de perder a competição + promoções terminando/terminadas — o popup detalha
// cada um separadamente.
async function refreshReviewsBadge() {
    const session = await getSession();
    if (!session) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    const [reviewsResult, catalogResult, promotionsResult] = await Promise.all([getReviews(), getCatalogStatus(), getPromotionsStatus()]);
    const reviewsUnread = (reviewsResult.reviews && reviewsResult.reviews.unreadCount) || 0;
    const catalogUnread = (catalogResult.catalog && catalogResult.catalog.unreadCount) || 0;
    const promotionsUnread = (promotionsResult.promotions && promotionsResult.promotions.unreadCount) || 0;
    const totalUnread = reviewsUnread + catalogUnread + promotionsUnread;

    if (totalUnread > 0) {
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        chrome.action.setBadgeText({ text: totalUnread > 99 ? '99+' : String(totalUnread) });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// O popup só mostra a contagem (o conteúdo detalhado fica no site), então abrir
// o popup já vale como "vi o aviso" — marca tudo como lido e zera o badge na hora,
// em vez de esperar os até 15 min do próximo alarme pra refletir o que já foi visto.
async function markAllAsRead() {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) return { error: 'not_logged_in' };

    const headers = { 'Content-Type': 'application/json', ...authHeaders };
    const body = JSON.stringify({ all: true });
    await Promise.all([
        fetch(`${IMPOCLICK_API}/ml-reviews`, { method: 'PATCH', headers, body }).catch(() => {}),
        fetch(`${IMPOCLICK_API}/ml-reviews?resource=catalog`, { method: 'PATCH', headers, body }).catch(() => {}),
        fetch(`${IMPOCLICK_API}/ml-reviews?resource=promotions`, { method: 'PATCH', headers, body }).catch(() => {}),
    ]);
    chrome.action.setBadgeText({ text: '' });
    return { ok: true };
}

chrome.alarms.create('checkReviews', { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkReviews') refreshReviewsBadge();
});
refreshReviewsBadge();

async function getFreight(price, weight, length, width, height, freeShipping) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: 'not_logged_in' };

    const qs = new URLSearchParams({ price, weight, length, width, height, freeShipping: freeShipping ? 'true' : 'false' });
    const resp = await fetch(`${IMPOCLICK_API}/ml-freight?${qs.toString()}`, { headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível calcular o frete da plataforma.' };
    return { freight: data };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        switch (message.type) {
            case 'GET_SESSION':
                sendResponse({ session: await getSession() });
                break;
            case 'LOGIN':
                sendResponse(await login(message.email, message.password));
                break;
            case 'LOGOUT':
                sendResponse(await logout());
                break;
            case 'RESOLVE_CATEGORY':
                sendResponse(await resolveCategory(message.query));
                break;
            case 'GET_FEE':
                sendResponse(await getFee(message.price, message.categoryId));
                break;
            case 'GET_FREIGHT':
                sendResponse(await getFreight(message.price, message.weight, message.length, message.width, message.height, message.freeShipping));
                break;
            case 'CHECK_TRADEMARK':
                sendResponse(await checkTrademark(message.query, message.page));
                break;
            case 'GET_REVIEWS':
                sendResponse(await getReviews());
                break;
            case 'GET_CATALOG_STATUS':
                sendResponse(await getCatalogStatus());
                break;
            case 'GET_PROMOTIONS_STATUS':
                sendResponse(await getPromotionsStatus());
                break;
            case 'MARK_ALL_READ':
                sendResponse(await markAllAsRead());
                break;
            default:
                sendResponse({ error: 'unknown_message_type' });
        }
    })();
    return true; // resposta assíncrona
});
