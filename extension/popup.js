function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function showView(id) {
    document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

async function refreshReviewsSummary() {
    const countEl = document.getElementById('reviews-count');
    if (!countEl) return;
    const result = await sendMessage({ type: 'GET_REVIEWS' });
    if (result.error || !result.reviews) {
        countEl.textContent = 'Não foi possível verificar as avaliações agora.';
        return;
    }
    const unread = result.reviews.unreadCount || 0;
    countEl.textContent = unread > 0
        ? `${unread} avaliação${unread > 1 ? 'ões' : ''} nova${unread > 1 ? 's' : ''}`
        : 'Nenhuma avaliação nova.';
}

async function refreshCatalogSummary() {
    const countEl = document.getElementById('catalog-count');
    if (!countEl) return;
    const result = await sendMessage({ type: 'GET_CATALOG_STATUS' });
    if (result.error || !result.catalog) {
        countEl.textContent = 'Não foi possível verificar os catálogos agora.';
        return;
    }
    const unread = result.catalog.unreadCount || 0;
    countEl.textContent = unread > 0
        ? `${unread} anúncio${unread > 1 ? 's' : ''} perdendo a competição`
        : 'Nenhuma mudança de status em catálogo.';
}

async function refreshPromotionsSummary() {
    const countEl = document.getElementById('promotions-count');
    if (!countEl) return;
    const result = await sendMessage({ type: 'GET_PROMOTIONS_STATUS' });
    if (result.error || !result.promotions) {
        countEl.textContent = 'Não foi possível verificar as promoções agora.';
        return;
    }
    const unread = result.promotions.unreadCount || 0;
    countEl.textContent = unread > 0
        ? `${unread} promoção${unread > 1 ? 'ões' : ''} terminando ou terminada${unread > 1 ? 's' : ''}`
        : 'Nenhuma promoção terminando.';
}

async function refreshAdsSummary() {
    const countEl = document.getElementById('ads-count');
    if (!countEl) return;
    const result = await sendMessage({ type: 'GET_ADS_STATUS' });
    if (result.error || !result.ads) {
        countEl.textContent = 'Não foi possível verificar os Patrocinados agora.';
        return;
    }
    const unread = result.ads.unreadCount || 0;
    countEl.textContent = unread > 0
        ? `${unread} anúncio${unread > 1 ? 's saíram' : ' saiu'} de campanha`
        : 'Nenhum anúncio saiu de campanha.';
}

async function refresh() {
    const { session } = await sendMessage({ type: 'GET_SESSION' });
    if (session) {
        document.getElementById('user-name').textContent = session.name;
        showView('view-session');
        await Promise.all([
            refreshReviewsSummary(),
            refreshCatalogSummary(),
            refreshPromotionsSummary(),
            refreshAdsSummary(),
        ]);
    } else {
        showView('view-login');
    }
}

// Enquanto esta porta existir, o popup está aberto. Ao fechar, ela se
// desconecta e o service worker marca os avisos como lidos — por isso os
// números continuam visíveis o tempo todo em que a janelinha está na tela, e
// só depois disso o detalhe passa a viver só no site.
const portaDoPopup = chrome.runtime.connect({ name: 'popup' });
window.addEventListener('pagehide', () => portaDoPopup.disconnect());

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');

    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    const result = await sendMessage({ type: 'LOGIN', email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';

    if (result.error) {
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
        return;
    }
    await refresh();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await sendMessage({ type: 'LOGOUT' });
    await refresh();
});

refresh();
