function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function showView(id) {
    document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// Cada linha mostra só o essencial: um número quando há algo pendente, um
// visto quando não há. A frase completa ("Nenhuma avaliação nova") dizia o
// mesmo ocupando duas linhas — e quatro delas empilhadas viravam um bloco de
// texto que ninguém lia.
function marcarEstado(id, quantidade, motivo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('tem-alerta', 'tudo-certo', 'falhou');

    if (quantidade === null) {
        el.textContent = 'erro';
        el.classList.add('falhou');
        // O motivo vem junto: antes todas as linhas diziam só "erro", e sessão
        // expirada — o caso mais comum — ficava indistinguível de API fora do ar.
        el.title = motivo || 'Não foi possível consultar agora.';
        return;
    }
    if (quantidade > 0) {
        el.textContent = String(quantidade);
        el.classList.add('tem-alerta');
        el.title = quantidade + ' item' + (quantidade > 1 ? 's' : '') + ' para ver';
        return;
    }
    el.textContent = '✓';
    el.classList.add('tudo-certo');
    el.title = 'Nada novo';
}

// Motivo da última falha de consulta, para a mensagem do topo saber o que dizer.
let sessaoCaiu = false;
let semRede = false;

// O que o botão da faixa faz. Sessão expirada se resolve entrando de novo;
// internet caída, não — e deslogar por causa de um túnel jogaria fora uma
// sessão que continua válida.
let acaoDoAviso = 'reentrar';

function avisarSessao(texto, acao) {
    const caixa = document.getElementById('sessao-aviso');
    const alvo = document.getElementById('sessao-aviso-texto');
    const botao = document.getElementById('btn-reentrar');
    if (!caixa || !alvo) return;
    alvo.textContent = texto;
    acaoDoAviso = acao || 'reentrar';
    if (botao) botao.textContent = acaoDoAviso === 'reentrar' ? 'Entrar de novo' : 'Tentar de novo';
    caixa.classList.remove('hidden');
}

// Traduz o código que o service worker devolve. Os dois chegavam como "erro"
// na linha, e só um deles tem conserto do lado do usuário.
function textoDoErro(codigo) {
    if (codigo === 'not_logged_in') return 'Sua sessão expirou. Entre de novo.';
    if (codigo === 'sem_rede') return 'Sem conexão. Verifique a internet e tente de novo.';
    return codigo || 'Resposta inesperada do servidor.';
}

/**
 * Devolve { conta } quando deu certo, ou { erro } com o motivo.
 * `not_logged_in` significa que o refresh token não vale mais: o certo é pedir
 * login de novo, não repetir "erro" em quatro linhas.
 */
async function consultar(tipo, campo) {
    const result = await sendMessage({ type: tipo });
    if (!result) return { erro: 'A extensão não respondeu. Recarregue a página e tente de novo.' };
    if (result.error === 'not_logged_in') sessaoCaiu = true;
    if (result.error === 'sem_rede') semRede = true;
    if (result.error) return { erro: textoDoErro(result.error) };
    if (!result[campo]) return { erro: 'Resposta inesperada do servidor.' };
    return { conta: result[campo].unreadCount || 0 };
}

/** Aplica o resultado de consultar() numa linha do popup. */
function mostrarLinha(id, r) {
    marcarEstado(id, r.erro ? null : r.conta, r.erro);
}

const DEZ_DIAS_MS = 10 * 24 * 60 * 60 * 1000;

// Os atalhos de promoção só aparecem quando têm o que mostrar, e cada um leva
// o próprio número. O critério de cada sub-aba é o mesmo de renderPromotionsTabs
// no site — se divergir, o popup promete uma lista que a página não entrega.
// A caixa (#promo-atalhos) fica escondida na tela por pedido do usuário — a
// regra é só de CSS (popup.css), a conta abaixo continua rodando.
function atualizarAtalhosPromo(items) {
    const caixa = document.getElementById('promo-atalhos');
    if (!caixa) return;

    const lista = items || [];
    const promocoes = lista.filter((i) => i.kind === 'promotion');
    const agora = Date.now();

    const vencemLogo = promocoes.filter((i) =>
        i.status === 'active' && i.finish_date && (new Date(i.finish_date).getTime() - agora) <= DEZ_DIAS_MS
    ).length;

    // Um anúncio com outra promoção rodando não está "sem promoção", mesmo que
    // uma das suas tenha terminado.
    const comPromocaoAtiva = new Set(
        promocoes.filter((i) => i.status === 'active').map((i) => i.ml_item_id)
    );
    const semPromocao = promocoes.filter(
        (i) => i.status === 'ended' && !comPromocaoAtiva.has(i.ml_item_id)
    ).length;

    const relampago = lista.filter((i) => i.kind === 'lightning_candidate').length;

    const contagens = { soon: vencemLogo, ended: semPromocao, lightning: relampago };
    let algum = false;

    caixa.querySelectorAll('a').forEach((a) => {
        const chave = (a.getAttribute('href').split('/').pop() || '').trim();
        const n = contagens[chave] || 0;
        a.classList.toggle('hidden', n === 0);
        if (n > 0) {
            algum = true;
            const base = a.dataset.rotulo || a.textContent.trim();
            a.dataset.rotulo = base;
            a.textContent = base + ' (' + n + ')';
        }
    });

    caixa.classList.toggle('hidden', !algum);
}

async function refreshPromotionsSummary() {
    const result = await sendMessage({ type: 'GET_PROMOTIONS_STATUS' });
    if (!result || result.error || !result.promotions) {
        if (result && result.error === 'not_logged_in') sessaoCaiu = true;
        if (result && result.error === 'sem_rede') semRede = true;
        mostrarLinha('promotions-count', {
            erro: !result ? 'A extensão não respondeu.' : textoDoErro(result.error),
        });
        atualizarAtalhosPromo([]);
        return;
    }
    mostrarLinha('promotions-count', { conta: result.promotions.unreadCount || 0 });
    atualizarAtalhosPromo(result.promotions.items);
}

async function refresh() {
    const { session } = await sendMessage({ type: 'GET_SESSION' });
    if (!session) {
        showView('view-login');
        return;
    }

    document.getElementById('user-name').textContent = session.name;
    showView('view-session');

    sessaoCaiu = false;
    semRede = false;
    document.getElementById('sessao-aviso').classList.add('hidden');
    await Promise.all([
        consultar('GET_REVIEWS', 'reviews').then((r) => mostrarLinha('reviews-count', r)),
        consultar('GET_CATALOG_STATUS', 'catalog').then((r) => mostrarLinha('catalog-count', r)),
        consultar('GET_ADS_STATUS', 'ads').then((r) => mostrarLinha('ads-count', r)),
        refreshPromotionsSummary(),
    ]);

    // Sessão expirada não é falha de cada recurso: é uma só, e tem conserto
    // (entrar de novo). Sem isto, as quatro linhas diziam "erro" e o usuário
    // ficava sem saber o que fazer.
    if (sessaoCaiu) {
        avisarSessao('Sua sessão expirou. Entre de novo para ver seus alertas.', 'reentrar');
    } else if (semRede) {
        // Sem rede a sessão continua válida: o que falta é internet, e o
        // aviso precisa dizer isso em vez de mandar entrar de novo.
        avisarSessao('Sem conexão. Seus alertas voltam quando a internet voltar.', 'tentar');
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

// O painel de viabilidade vive no side panel do Chrome, e chrome.sidePanel.open()
// só vale dentro de um gesto do usuário — por isso o botão mora aqui, no popup.
//
// Duas coisas que a primeira versão errou:
//
// 1. Ela dava await em chrome.tabs.query() DENTRO do clique. O await encerra o
//    contexto do gesto, e o open() logo depois é recusado. A aba é resolvida
//    antes, para o clique chamar open() de forma síncrona.
// 2. Ela desabilitava o botão quando não conseguia ler a URL da aba. Como
//    consulta que falha devolve URL vazia, o botão ficava morto sem dizer por
//    quê. Agora só desabilita quando SABE que a aba não é do Mercado Livre.
const botaoPainel = document.getElementById('btn-painel');
const erroPainel = document.getElementById('painel-erro');
let abaAtual = null;

function avisarErroPainel(texto) {
    erroPainel.textContent = texto;
    erroPainel.classList.remove('hidden');
}

chrome.tabs.query({ active: true, currentWindow: true }, (abas) => {
    abaAtual = (abas && abas[0]) || null;
    const url = (abaAtual && abaAtual.url) || '';
    // Comparação direta em vez de expressão regular: o domínio é fixo e não
    // há o que interpretar.
    const ehML = url.includes('mercadolivre.com.br') || url.includes('mercadolibre.com');
    const foraDoML = !!url && !ehML;
    botaoPainel.disabled = foraDoML;
    botaoPainel.title = foraDoML ? 'Abra um anúncio no Mercado Livre para usar o painel.' : '';
});

botaoPainel.addEventListener('click', () => {
    if (!chrome.sidePanel || !chrome.sidePanel.open) {
        avisarErroPainel('Este Chrome não tem painel lateral (precisa da versão 114 ou mais nova).');
        return;
    }
    if (!abaAtual || !abaAtual.id) {
        avisarErroPainel('Não consegui identificar a aba ativa.');
        return;
    }

    // Sem await antes daqui: o gesto do clique precisa continuar valendo.
    const aberto = chrome.sidePanel.open({ tabId: abaAtual.id });
    if (aberto && aberto.then) {
        aberto.then(() => window.close()).catch((e) => avisarErroPainel(e.message || String(e)));
    } else {
        window.close();
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await sendMessage({ type: 'LOGOUT' });
    await refresh();
});

// Entrar de novo é a mesma coisa que sair e logar: a sessão guardada já não
// serve, e insistir nela só repetiria o erro.
document.getElementById('btn-reentrar').addEventListener('click', async () => {
    // Só desloga quando a sessão realmente morreu. Em falha de rede a sessão
    // guardada continua boa, e sair dela obrigaria a digitar senha por causa de
    // um sinal ruim.
    if (acaoDoAviso === 'reentrar') await sendMessage({ type: 'LOGOUT' });
    document.getElementById('sessao-aviso').classList.add('hidden');
    await refresh();
});

refresh();
