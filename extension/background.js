// Service worker — centraliza autenticação e chamadas de rede. Content
// scripts só extraem dados da página e mandam mensagem pra cá; toda a rede
// acontece aqui, onde o host_permissions do manifest libera fetch
// cross-origin sem precisar de CORS configurado nos servidores de destino.

const SUPABASE_URL = 'https://qmwvzhpyxrkyxvekcazs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5xxYDOzIcWWpz2J37MuVaw_XJCpQM5i';
const IMPOCLICK_API = 'https://www.impoclick.com.br/api';

const SEM_REDE = 'Sem conexão. Verifique a internet e tente de novo.';

// fetch que não estoura.
//
// Nenhuma chamada daqui tratava falha de REDE — só resposta de erro do
// servidor. Quando o fetch rejeita (offline, DNS, Wi-Fi caindo, servidor fora
// do ar), a rejeição subia sem tratamento: o chrome://extensions registrava
// "Uncaught (in promise) TypeError: Failed to fetch", o sendResponse nunca era
// chamado e quem perguntou esperava para sempre. Era assim que o popup dizia
// "a extensão não respondeu".
//
// O retorno imita o de um fetch normal (resp.ok, resp.status, data.error) para
// cada chamador seguir com a verificação que já fazia.
async function pedirJson(url, opcoes) {
    try {
        const resp = await fetch(url, opcoes);
        const data = await resp.json().catch(() => ({}));
        return { resp, data, semRede: false };
    } catch (e) {
        return { resp: { ok: false, status: 0 }, data: { error: SEM_REDE }, semRede: true };
    }
}

// Por que a última autenticação falhou. Sessão morta e internet caída pedem
// respostas opostas — uma manda entrar de novo, a outra manda esperar —, e
// tratar as duas como "sessão expirada" faz o usuário se deslogar à toa por
// causa de um túnel. O estado global é seguro aqui: o service worker roda numa
// linha só, e o valor é escrito imediatamente antes do return que o usa.
let ultimaFalhaDeAuth = 'not_logged_in';

function motivoDaFalha() {
    return ultimaFalhaDeAuth;
}

async function getSession() {
    const { session } = await chrome.storage.local.get('session');
    return session || null;
}

async function login(email, password) {
    const { resp, data, semRede } = await pedirJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
    });
    // Sem rede a senha pode estar certíssima: dizer "e-mail ou senha
    // incorretos" mandaria o usuário procurar erro onde não há.
    if (semRede) return { error: SEM_REDE };
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
    refreshReviewsBadge().catch(() => {});
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
    const { resp, data, semRede } = await pedirJson(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
    // Rede caída não invalida sessão nenhuma: quem diz que o refresh token
    // morreu é o Supabase, com uma resposta. Sem separar os dois casos, passar
    // por um túnel deslogava o usuário. Era exatamente aqui que estourava o
    // "Failed to fetch" que aparecia no chrome://extensions.
    if (semRede) return { semRede: true };
    if (!resp.ok) return null;
    return { dados: data };
}

// Renovação em curso, compartilhada por todos os chamadores.
//
// A extensão dispara várias chamadas em paralelo (categoria, tarifa, frete),
// e cada uma passa por getAuthHeaders. Com o token vencido, TODAS tentavam
// renovar ao mesmo tempo usando o MESMO refresh token — que no Supabase é de
// uso único. A primeira consumia, as demais falhavam, e o usuário só via
// "não foi possível calcular o frete" até sair e entrar de novo na extensão.
let renovacaoEmCurso = null;

async function ensureFreshAccessToken(session) {
    if (session.expiresAt && Date.now() < session.expiresAt) return session.accessToken;
    if (!session.refreshToken) {
        ultimaFalhaDeAuth = 'not_logged_in';
        return null;
    }

    // Quem chegar durante uma renovação espera a mesma, em vez de abrir outra.
    if (!renovacaoEmCurso) {
        renovacaoEmCurso = (async () => {
            try {
                const r = await refreshSupabaseSession(session.refreshToken);
                if (!r) {
                    ultimaFalhaDeAuth = 'not_logged_in';
                    return null;
                }
                if (r.semRede) {
                    ultimaFalhaDeAuth = 'sem_rede';
                    return null;
                }

                const refreshed = r.dados;

                const updated = {
                    ...session,
                    accessToken: refreshed.access_token,
                    refreshToken: refreshed.refresh_token || session.refreshToken,
                    expiresAt: Date.now() + (refreshed.expires_in || 3600) * 1000 - 60000,
                };
                await chrome.storage.local.set({ session: updated });
                return updated.accessToken;
            } finally {
                renovacaoEmCurso = null;
            }
        })();
    }

    // null quando a renovação falhou de verdade: aí a sessão acabou e o certo
    // é pedir login, não seguir com um token que a API vai recusar e fazer
    // parecer defeito do recurso que o usuário estava usando.
    return await renovacaoEmCurso;
}

// Força a troca do token mesmo "dentro do prazo". O relógio local não sabe
// quando o servidor encerra a sessão antes da hora — e ele encerra, por
// exemplo, quando a conta sai no site com o escopo global do Supabase.
async function renovarAgora() {
    const session = await getSession();
    if (!session || !session.refreshToken) return null;
    return ensureFreshAccessToken({ ...session, expiresAt: 0 });
}

/**
 * Chamada à API do Impoclick. Se ela recusar o token (401), renova uma vez e
 * tenta de novo. Se nem a renovação passar, a sessão acabou de verdade: sai da
 * extensão, e o popup pede login. Antes a extensão seguia mandando o token
 * morto até ele "vencer" no relógio, e o cartão ficava todo em "—" sem dizer
 * por quê.
 */
async function pedirApi(url, opcoes = {}) {
    const primeira = await pedirJson(url, opcoes);
    if (primeira.resp.status !== 401) return primeira;

    const token = await renovarAgora();
    if (!token) {
        // Sem rede a sessão pode estar ótima: não desloga por causa de túnel.
        if (ultimaFalhaDeAuth !== 'sem_rede') {
            ultimaFalhaDeAuth = 'not_logged_in';
            await logout();
        }
        return primeira;
    }
    const session = await getSession();
    const headers = { ...(opcoes.headers || {}), 'user-token': session.userId, Authorization: `Bearer ${token}` };
    return pedirJson(url, { ...opcoes, headers });
}

// Header duplo (user-token + Authorization) igual ao site: o backend valida o
// JWT de verdade e só usa o user-token como referência — não basta mais só
// saber o UUID de alguém pra ler os dados dela.
async function getAuthHeaders() {
    const session = await getSession();
    if (!session) {
        ultimaFalhaDeAuth = 'not_logged_in';
        return null;
    }
    // null aqui quer dizer "não dá para chamar a API"; o porquê fica em
    // motivoDaFalha(), porque sessão morta e internet caída pedem respostas
    // opostas na tela.
    const token = await ensureFreshAccessToken(session);
    if (!token) return null;
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
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?action=category&q=${encodeURIComponent(query)}`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível identificar a categoria deste produto.' };
    return { category: data };
}

async function getFee(price, categoryId, listingType) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    // listingType decide a alíquota: Clássico e Premium têm comissões bem
    // diferentes na mesma categoria. Quando não vier, o backend usa Clássico.
    const qs = new URLSearchParams({ action: 'fee', price: String(price), category: String(categoryId) });
    if (listingType) qs.set('listingType', listingType);

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?${qs.toString()}`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível calcular a taxa de venda.' };
    return { fee: data };
}

// Consulta pública de marcas no INPI — usada de forma OPCIONAL (só quando o
// usuário clica), pra checar se um nome de marca visto num anúncio de
// catálogo tem registro no INPI e em qual classe de Nice.
async function checkTrademark(query, page) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const qs = new URLSearchParams({ q: query, page: page || 1 });
    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/inpi-marca?${qs.toString()}`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar a marca no INPI.' };
    return { trademark: data };
}

// Avaliações novas nos anúncios — a checagem de verdade roda no backend (cron via
// GitHub Actions); aqui só lemos o resultado pra acender o badge no ícone.
async function getReviews() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-reviews`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar as avaliações.' };
    return { reviews: data };
}

// Status de catálogo (ganhando/perdendo a competição) — mesmo endpoint de
// avaliações, só muda o parâmetro resource=catalog.
async function getCatalogStatus() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-reviews?resource=catalog`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar o status de catálogo.' };
    return { catalog: data };
}

// Promoções com prazo terminando (ou já terminadas) — mesmo endpoint,
// resource=promotions.
async function getPromotionsStatus() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-reviews?resource=promotions`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar as promoções.' };
    return { promotions: data };
}

// Anúncios que saíram de campanha de publicidade — mesmo endpoint das outras
// abas do monitoramento, resource=ads.
async function getAdsStatus() {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-reviews?resource=ads`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível consultar os Patrocinados.' };
    return { ads: data };
}

// O badge do ícone soma avaliações não lidas + itens de catálogo que acabaram
// de perder a competição + promoções terminando/terminadas + anúncios que
// saíram de campanha — o popup detalha cada um separadamente.
async function refreshReviewsBadge() {
    const session = await getSession();
    if (!session) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    const [reviewsResult, catalogResult, promotionsResult, adsResult] = await Promise.all([
        getReviews(), getCatalogStatus(), getPromotionsStatus(), getAdsStatus(),
    ]);
    const reviewsUnread = (reviewsResult.reviews && reviewsResult.reviews.unreadCount) || 0;
    const catalogUnread = (catalogResult.catalog && catalogResult.catalog.unreadCount) || 0;
    const promotionsUnread = (promotionsResult.promotions && promotionsResult.promotions.unreadCount) || 0;
    const adsUnread = (adsResult.ads && adsResult.ads.unreadCount) || 0;
    const totalUnread = reviewsUnread + catalogUnread + promotionsUnread + adsUnread;

    if (totalUnread > 0) {
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        chrome.action.setBadgeText({ text: totalUnread > 99 ? '99+' : String(totalUnread) });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// O popup só mostra a contagem (o conteúdo detalhado fica no site), então ver o
// popup vale como "vi o aviso". Mas a marcação acontece quando ele FECHA, não
// quando abre: assim ele exibe o que estava pendente enquanto está na tela, e
// os avisos só somem depois — o detalhe continua no site.
async function markAllAsRead() {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders) return { error: 'not_logged_in' };

    const headers = { 'Content-Type': 'application/json', ...authHeaders };
    const body = JSON.stringify({ all: true });
    await Promise.all([
        fetch(`${IMPOCLICK_API}/ml-reviews`, { method: 'PATCH', headers, body }).catch(() => {}),
        fetch(`${IMPOCLICK_API}/ml-reviews?resource=catalog`, { method: 'PATCH', headers, body }).catch(() => {}),
        fetch(`${IMPOCLICK_API}/ml-reviews?resource=promotions`, { method: 'PATCH', headers, body }).catch(() => {}),
        fetch(`${IMPOCLICK_API}/ml-reviews?resource=ads`, { method: 'PATCH', headers, body }).catch(() => {}),
    ]);
    chrome.action.setBadgeText({ text: '' });
    return { ok: true };
}

// O popup abre uma porta ao carregar e ela se desconecta sozinha quando a
// janelinha fecha. É o sinal de fechamento confiável no Manifest V3 — evento
// de unload na página do popup não é garantido, e a porta ainda mantém o
// service worker vivo o suficiente pra concluir a marcação.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup') return;
    port.onDisconnect.addListener(() => { markAllAsRead().catch(() => {}); });
});

chrome.alarms.create('checkReviews', { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkReviews') refreshReviewsBadge().catch(() => {});
});
refreshReviewsBadge().catch(() => {});

// ── Frete pelo histórico do vendedor ────────────────────────────────────
// A cotação do Mercado Livre é aproximada e vale para o país todo; o que o
// vendedor paga de fato depende da rota de cada venda, da logística dele e
// dos descontos do momento, e costuma sair abaixo. O histórico traz o frete
// PAGO nos últimos envios, com o peso de cada pacote, e a estimativa usa os
// envios de peso parecido — os "itens semelhantes".
//
// Guardado por 12 horas: são dezenas de chamadas ao Mercado Livre, e o custo
// de envio de uma conta não muda de uma consulta para a outra.
const VALIDADE_HISTORICO_MS = 12 * 60 * 60 * 1000;
let historicoEmCurso = null;

async function historicoDeFrete() {
    const { historicoFrete } = await chrome.storage.local.get('historicoFrete');
    if (historicoFrete && Date.now() - historicoFrete.em < VALIDADE_HISTORICO_MS) return historicoFrete.dados;

    // Card e painel pedem frete ao mesmo tempo; uma leitura serve às duas.
    if (!historicoEmCurso) {
        historicoEmCurso = (async () => {
            try {
                const headers = await getAuthHeaders();
                if (!headers) return null;
                const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-freight?action=historico`, { headers });
                if (!resp.ok || !data || !Array.isArray(data.envios)) return null;
                await chrome.storage.local.set({ historicoFrete: { em: Date.now(), dados: data } });
                return data;
            } finally {
                historicoEmCurso = null;
            }
        })();
    }
    return historicoEmCurso;
}

// Mesmo critério do Mercado Livre: vale o maior entre o peso real e o cúbico
// (cm³ ÷ 6 dá gramas).
function pesoFaturavelG(weight, length, width, height) {
    return Math.round(Math.max(Number(weight), (Number(length) * Number(width) * Number(height)) / 6));
}

// Quão "parecidos" dois pesos são, em escala proporcional: 200 g e 260 g
// distam o mesmo que 2 kg e 2,6 kg.
const distanciaDePeso = (a, b) => Math.abs(Math.log(a / b));
const PARECIDO = Math.log(1.3);      // até 30% de diferença
const LONGE_DEMAIS = Math.log(2);    // o dobro já não é o mesmo pacote
const MINIMO_DE_ENVIOS = 3;

function mediana(valores) {
    const v = valores.slice().sort((a, b) => a - b);
    const meio = Math.floor(v.length / 2);
    return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Mediana do que o vendedor pagou em envios de peso faturável parecido. Só
// compara envios da mesma faixa de preço quando há bastante: acima de R$ 79 o
// frete grátis é obrigatório e o desconto é outro, então misturar faixas
// distorce. Sem pelo menos três envios parecidos, não arrisca — a tela usa a
// cotação do Mercado Livre.
function estimarPeloHistorico(historico, faturavelG, preco) {
    if (!historico || !(faturavelG > 0)) return null;
    const validos = (historico.envios || []).filter((e) => e.faturavelG > 0 && typeof e.custo === 'number');
    const acimaDoLimite = Number(preco) >= 79;
    const mesmaFaixa = validos.filter((e) => typeof e.valorPedido !== 'number' || (e.valorPedido >= 79) === acimaDoLimite);
    const universo = mesmaFaixa.length >= MINIMO_DE_ENVIOS ? mesmaFaixa : validos;

    let base = universo.filter((e) => distanciaDePeso(e.faturavelG, faturavelG) <= PARECIDO);
    if (base.length < MINIMO_DE_ENVIOS) {
        base = universo
            .slice()
            .sort((a, b) => distanciaDePeso(a.faturavelG, faturavelG) - distanciaDePeso(b.faturavelG, faturavelG))
            .slice(0, 5)
            .filter((e) => distanciaDePeso(e.faturavelG, faturavelG) <= LONGE_DEMAIS);
    }
    if (base.length < MINIMO_DE_ENVIOS) return null;

    const pesos = base.map((e) => e.faturavelG);
    return {
        custo: Math.round(mediana(base.map((e) => e.custo)) * 100) / 100,
        amostras: base.length,
        pesoMinG: Math.min(...pesos),
        pesoMaxG: Math.max(...pesos),
        faturavelG,
        logistica: historico.logisticaPrincipal || null,
    };
}

async function getFreight({ price, weight, length, width, height, freeShipping, itemId, listingType }) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    // O histórico vem antes da cotação porque diz qual logística o vendedor
    // usa de fato. Se não der para ler, a cotação segue com o padrão.
    const historico = await historicoDeFrete().catch(() => null);

    const qs = new URLSearchParams({ price, freeShipping: freeShipping ? 'true' : 'false' });
    // O desconto de frete do Mercado Livre muda com o tipo do anúncio; sem
    // este parâmetro a cotação caía no padrão Clássico para todo mundo, e
    // anúncio Premium recebia um custo que não era o dele.
    if (listingType) qs.set('listingType', listingType);
    if (historico && historico.logisticaPrincipal) qs.set('logisticType', historico.logisticaPrincipal);

    // Com as medidas da ficha técnica usamos elas; sem elas, o itemId, e o
    // Mercado Livre busca as que o anúncio tem cadastradas. Antes, anúncio sem
    // ficha técnica visível ficava sem frete nenhum.
    const temMedidas = weight && length && width && height;
    if (temMedidas) {
        qs.set('weight', weight);
        qs.set('length', length);
        qs.set('width', width);
        qs.set('height', height);
    } else if (itemId) {
        qs.set('itemId', itemId);
    }
    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-freight?${qs.toString()}`, { headers });
    if (!resp.ok) return { error: data.error || 'Não foi possível calcular o frete da plataforma.' };

    // O peso que vale para comparar com o histórico: das medidas informadas,
    // ou o que o próprio ML calculou na cotação.
    const faturavel = temMedidas ? pesoFaturavelG(weight, length, width, height) : data.billableWeightG;
    return { freight: data, historico: estimarPeloHistorico(historico, faturavel, price) };
}

// Qualidade oficial do anúncio (API /performance do Mercado Livre). Só
// responde para anúncios da própria conta conectada — o backend traduz o
// 401 do ML num erro 'not_own_item' pra gente explicar isso na tela.
// Cidade e estado do vendedor. A página do anúncio não traz isso — ela
// preenche por JavaScript depois — e a API só responde autenticada.
async function getSeller(sellerId) {
    const headers = await getAuthHeaders();
    if (!headers) return { seller: null };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?action=seller&sellerId=${encodeURIComponent(sellerId)}`, { headers });
    return { seller: (resp.ok && data.seller) || null };
}

// Data de criação dos anúncios de uma página de busca. Vem só dos que são do
// próprio vendedor — o Mercado Livre bloqueia a leitura de anúncio alheio.
async function getItemDates(ids) {
    const headers = await getAuthHeaders();
    if (!headers) return { datas: {} };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?action=dates&ids=${encodeURIComponent(ids.join(','))}`, { headers });
    return { datas: (resp.ok && data.datas) || {} };
}

// Métricas de publicidade de um anúncio, para o cálculo do TACOS. Endereço
// próprio em vez de getPerformance: aquele faz meia dúzia de consultas ao ML
// (concorrentes, vendas, ficha da categoria) que não têm nada a ver com isto.
async function getAdsMetrics(itemId) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?action=ads&itemId=${encodeURIComponent(itemId)}`, { headers });
    if (!resp.ok) return { error: data.error || 'erro', motivo: 'erro_consulta' };
    return data;
}

async function getPerformance(itemId) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?action=performance&itemId=${encodeURIComponent(itemId)}`, { headers });
    if (!resp.ok) {
        return {
            error: data.error || 'erro',
            message: data.message || data.error || 'Não foi possível analisar a qualidade deste anúncio.',
        };
    }
    return { performance: data };
}

// Análise completa do anúncio: um único pedido que já traz item, descrição,
// campos da categoria, visitas, avaliações e vendas do período. Como o
// backend consulta 6 recursos do ML em sequência/paralelo, essa chamada é
// bem mais lenta que as outras — a tela mostra "analisando..." enquanto isso.
async function getAnalise(itemId) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirApi(`${IMPOCLICK_API}/ml-market?action=analise&itemId=${encodeURIComponent(itemId)}`, { headers });
    if (!resp.ok) {
        return {
            error: data.error || 'erro',
            message: data.message || data.error || 'Não foi possível analisar este anúncio.',
        };
    }
    return { analise: data };
}

// Concorrentes e ganhador de uma página de catálogo (/p/MLB…).
//
// Vai pelo backend e não direto na API do ML porque a consulta precisa do token
// OAuth do vendedor, que vive no servidor. O endpoint devolve a lista já
// ordenada por preço e com o vendedor resolvido em nome, UF e reputação.
async function getCatalogo(productId) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirJson(
        `${IMPOCLICK_API}/ml-market?action=catalogo&product_id=${encodeURIComponent(productId)}`,
        { headers }
    );
    if (!resp.ok) {
        return {
            error: data.error || 'erro',
            message: data.message || data.error || 'Não foi possível ler os concorrentes deste catálogo.',
        };
    }
    return { catalogo: data };
}

// Visitas de um anúncio, inclusive de outro vendedor. Diferente de /items/{id},
// que é bloqueado para anúncio alheio, o recurso de visitas responde a qualquer
// token válido — é o que permite medir tráfego de concorrente.
async function getVisitas(itemId) {
    const headers = await getAuthHeaders();
    if (!headers) return { error: motivoDaFalha() };

    const { resp, data } = await pedirJson(
        `${IMPOCLICK_API}/ml-market?action=visitas&itemId=${encodeURIComponent(itemId)}`,
        { headers }
    );
    if (!resp.ok) return { error: data.error || 'sem_visitas' };
    return { visitas: data };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      // Rede de segurança do canal. Qualquer exceção daqui para dentro deixava
      // de chamar sendResponse, e quem perguntou ficava esperando uma resposta
      // que nunca vinha — além de registrar erro na extensão. Falhar com
      // mensagem é melhor do que emudecer.
      try {
        switch (message.type) {
            case 'GET_SELLER':
                sendResponse(await getSeller(message.sellerId));
                break;
            case 'GET_ITEM_DATES':
                sendResponse(await getItemDates(message.ids || []));
                break;
            case 'GET_ADS_METRICS':
                sendResponse(await getAdsMetrics(message.itemId));
                break;
            case 'GET_PERFORMANCE':
                sendResponse(await getPerformance(message.itemId));
                break;
            case 'GET_VISITAS':
                sendResponse(await getVisitas(message.itemId));
                break;
            case 'GET_CATALOGO':
                sendResponse(await getCatalogo(message.productId));
                break;
            case 'GET_ANALISE':
                sendResponse(await getAnalise(message.itemId));
                break;
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
                sendResponse(await getFee(message.price, message.categoryId, message.listingType));
                break;
            case 'GET_FREIGHT':
                sendResponse(await getFreight(message));
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
            case 'GET_ADS_STATUS':
                sendResponse(await getAdsStatus());
                break;
            case 'ABRIR_PAINEL': {
                // O Chrome exige que sidePanel.open() saia de um gesto num
                // contexto da extensão. Um clique numa página comum não conta,
                // e a chamada é recusada. Tentamos assim mesmo — em algumas
                // versões funciona — e devolvemos o resultado para o botão
                // poder dizer o que fazer em vez de morrer calado.
                try {
                    const aba = sender && sender.tab;
                    if (!aba || !aba.id) { sendResponse({ ok: false }); break; }
                    await chrome.sidePanel.open({ tabId: aba.id });
                    sendResponse({ ok: true });
                } catch (e) {
                    sendResponse({ ok: false, erro: e.message });
                }
                break;
            }
            case 'PAGE_CHANGED':
                // Recado do content script para o painel lateral. Passa por
                // aqui porque sendMessage entrega a todos os ouvintes da
                // extensão; do lado do service worker não há nada a fazer.
                sendResponse({ ok: true });
                break;
            default:
                sendResponse({ error: 'unknown_message_type' });
        }
      } catch (e) {
        console.error('[Impoclick] falha ao tratar', message && message.type, e);
        sendResponse({ error: (e && e.message) || 'erro_inesperado' });
      }
    })();
    return true; // resposta assíncrona
});

// ── Painel lateral ──────────────────────────────────────────────────────
// O painel de viabilidade saiu de dentro da página e virou um side panel do
// Chrome. Ele só fica disponível em abas do Mercado Livre: habilitado em toda
// aba é ruído, e abri-lo fora de um anúncio não teria o que mostrar.
const ML_HOST = /^https?:\/\/([a-z0-9-]+\.)*mercadoli(vre\.com\.br|bre\.com)\//i;

function ehPaginaML(url) {
    return typeof url === 'string' && ML_HOST.test(url);
}

async function ajustarPainel(tabId, url) {
    try {
        await chrome.sidePanel.setOptions({
            tabId,
            path: 'sidepanel.html',
            enabled: ehPaginaML(url),
        });
    } catch (e) {
        // A aba pode ter sido fechada entre o evento e esta chamada.
    }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    // Reage a mudança de URL e ao fim do carregamento: numa SPA como o Mercado
    // Livre a URL muda sem um novo "complete".
    if (info.url || info.status === 'complete') ajustarPainel(tabId, info.url || tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        ajustarPainel(tabId, tab.url);
    } catch (e) { /* aba fechada */ }
});

// Ao instalar ou atualizar, as abas já abertas não disparam onUpdated.
chrome.runtime.onInstalled.addListener(async () => {
    const abas = await chrome.tabs.query({});
    for (const t of abas) if (t.id) ajustarPainel(t.id, t.url);
});
