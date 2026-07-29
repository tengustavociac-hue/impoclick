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
    };
    await chrome.storage.local.set({ session });
    return { session };
}

async function logout() {
    await chrome.storage.local.remove('session');
    return { ok: true };
}

// A API do Mercado Livre bloqueia (403) consultar /items/{id} de anúncios
// que não pertencem ao token OAuth usado — tanto anônimo quanto autenticado
// só enxerga os PRÓPRIOS itens do vendedor logado. Não dá pra usar isso para
// ver o anúncio de outra pessoa. Por isso o título/preço são extraídos da
// própria página pelo content script (que já está renderizada no navegador
// do usuário) e mandados aqui só pra resolver a categoria — reaproveitando
// a mesma busca por nome que a Comparação de Mercado do site já usa.
async function resolveCategory(query) {
    const session = await getSession();
    if (!session) return { error: 'not_logged_in' };

    const resp = await fetch(`${IMPOCLICK_API}/ml-market?action=category&q=${encodeURIComponent(query)}`, {
        headers: { 'user-token': session.userId },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível identificar a categoria deste produto.' };
    return { category: data };
}

async function getFee(price, categoryId) {
    const session = await getSession();
    if (!session) return { error: 'not_logged_in' };

    const resp = await fetch(
        `${IMPOCLICK_API}/ml-market?action=fee&price=${encodeURIComponent(price)}&category=${encodeURIComponent(categoryId)}`,
        { headers: { 'user-token': session.userId } }
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data.error || 'Não foi possível calcular a taxa de venda.' };
    return { fee: data };
}

async function getFreight(price, weight, length, width, height) {
    const session = await getSession();
    if (!session) return { error: 'not_logged_in' };

    const qs = new URLSearchParams({ price, weight, length, width, height });
    const resp = await fetch(`${IMPOCLICK_API}/ml-freight?${qs.toString()}`, {
        headers: { 'user-token': session.userId },
    });
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
                sendResponse(await getFreight(message.price, message.weight, message.length, message.width, message.height));
                break;
            default:
                sendResponse({ error: 'unknown_message_type' });
        }
    })();
    return true; // resposta assíncrona
});
