// @ts-check
/**
 * Painel da Shopee: resumo financeiro (pedidos/produtos/margem), avaliações
 * e análise por produto — equivalente ao Painel do Mercado Livre, mas
 * escopado ao que a API da Shopee realmente oferece (sem visitas por
 * anúncio, concorrentes de catálogo ou nota de qualidade, que não existem
 * do lado da Shopee).
 *
 * Conexão (OAuth) fica em Configurações → Integrações, não aqui — ver
 * api/_shopee-helper.js e a memória do projeto.
 */
import { Card, Badge, Button, Alert, EmptyState, DataTable, h } from './design-system/components/index.js';

/**
 * @typedef {{ id: string, status: string, criadoEm: string, total: number | null,
 *   moeda: string | null, itens: { itemId: string, nome: string | null, quantidade: number }[] }} PedidoShopee
 * @typedef {{ id: string, nome: string | null, sku: string | null, imagem: string | null,
 *   preco: number | null, estoque: number | null }} ProdutoShopee
 * @typedef {{ id: number, shopee_item_id: string, item_name: string | null, item_thumbnail: string | null,
 *   item_rating_average: number | null, rating: number | null, comment: string | null, reviewed_at: string | null, is_read: boolean }} AvaliacaoShopee
 */

const estado = {
  /** @type {{ connected: boolean, motivo?: string, shopName?: string } | null} */
  status: null,
  /** @type {any} */
  resumo: null,
  resumoCarregando: false,
  /** @type {string | null} */
  resumoErro: null,
  /** @type {PedidoShopee[]} */
  pedidos: [],
  pedidosCarregando: false,
  /** @type {Record<string, { carregando?: boolean, erro?: boolean, taxas?: number, moeda?: string | null }>} */
  taxasPorPedido: {},
  /** @type {ProdutoShopee[]} */
  produtos: [],
  produtosCarregando: false,
  /** @type {number | null} */
  produtosProximoOffset: null,
  /** @type {string | null} */
  analiseAberta: null,
  /** @type {Record<string, any>} */
  analisePorProduto: {},
  /** @type {AvaliacaoShopee[]} */
  reviews: [],
  reviewsUnread: 0,
  reviewsCarregando: false,
};

/** @param {string} path @param {number} [timeoutMs] */
async function shopeeApiFetch(path, timeoutMs) {
  const api = /** @type {any} */ (window).mlApiFetch;
  if (typeof api !== 'function') return null;
  return await api(path, timeoutMs);
}

// ── Formatação ────────────────────────────────────────────────────────

/** @param {number} v */
const num = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** @param {number | null | undefined} v @param {string | null | undefined} moeda */
const dinheiro = (v, moeda) => (v == null ? '—' : (moeda === 'BRL' || !moeda ? 'R$ ' : moeda + ' ') + num(v));
/** @param {string | null | undefined} iso */
const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
/** @param {number | null | undefined} v */
const pct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`);

/** @type {Record<string, { rotulo: string, tom: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }>} */
const STATUS_SHOPEE = {
  UNPAID: { rotulo: 'Aguardando pagamento', tom: 'neutral' },
  READY_TO_SHIP: { rotulo: 'Pronto para enviar', tom: 'warning' },
  PROCESSED: { rotulo: 'Em processamento', tom: 'warning' },
  SHIPPED: { rotulo: 'Enviado', tom: 'accent' },
  COMPLETED: { rotulo: 'Concluído', tom: 'success' },
  CANCELLED: { rotulo: 'Cancelado', tom: 'danger' },
  IN_CANCEL: { rotulo: 'Cancelamento em andamento', tom: 'warning' },
  TO_RETURN: { rotulo: 'Em devolução', tom: 'danger' },
};

/** @param {PedidoShopee} pedido */
function statusBadge(pedido) {
  const info = STATUS_SHOPEE[pedido.status] || null;
  if (info) return Badge({ tone: info.tom, dot: true, children: info.rotulo });
  return Badge({ tone: /** @type {const} */ ('neutral'), dot: true, children: pedido.status || '—' });
}

/** @param {number} v */
function estrelas(v) {
  if (v == null) return '—';
  return '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));
}

// ── Dados ────────────────────────────────────────────────────────────

async function buscarStatus() {
  const r = await shopeeApiFetch('/api/ml-status?provider=shopee', 10000);
  estado.status = r || { connected: false, motivo: 'falha_rede' };
  desenhar();
  if (estado.status.connected) {
    await Promise.all([buscarResumo(), buscarPedidos(), buscarProdutos(), buscarReviews()]);
  }
}

async function buscarResumo() {
  estado.resumoCarregando = true;
  estado.resumoErro = null;
  desenhar();
  const r = await shopeeApiFetch('/api/ml-status?provider=shopee&action=resumo', 45000);
  estado.resumoCarregando = false;
  if (!r) {
    estado.resumoErro = 'Não foi possível carregar o resumo agora. Tente de novo em instantes.';
  } else {
    estado.resumo = r;
  }
  desenhar();
}

async function buscarPedidos() {
  estado.pedidosCarregando = true;
  desenhar();
  const r = await shopeeApiFetch('/api/ml-status?provider=shopee&action=pedidos', 30000);
  estado.pedidosCarregando = false;
  estado.pedidos = (r && r.pedidos) || [];
  desenhar();
}

/** @param {number} [offset] */
async function buscarProdutos(offset) {
  estado.produtosCarregando = true;
  desenhar();
  const r = await shopeeApiFetch(`/api/ml-status?provider=shopee&action=produtos${offset ? `&offset=${offset}` : ''}`, 20000);
  estado.produtosCarregando = false;
  if (r) {
    estado.produtos = offset ? [...estado.produtos, ...(r.produtos || [])] : (r.produtos || []);
    estado.produtosProximoOffset = r.proximoOffset != null ? r.proximoOffset : null;
  }
  desenhar();
}

async function buscarReviews() {
  estado.reviewsCarregando = true;
  desenhar();
  const r = await shopeeApiFetch('/api/ml-reviews?provider=shopee', 15000);
  estado.reviewsCarregando = false;
  estado.reviews = (r && r.reviews) || [];
  estado.reviewsUnread = (r && r.unreadCount) || 0;
  desenhar();
}

async function marcarTodasLidas() {
  const api = /** @type {any} */ (window).mlApiFetch;
  if (typeof api === 'function') {
    await api('/api/ml-reviews?provider=shopee', 10000, { method: 'PATCH', body: JSON.stringify({ all: true }) });
  }
  await buscarReviews();
}

/** @param {string} orderId */
async function verTaxas(orderId) {
  estado.taxasPorPedido[orderId] = { carregando: true };
  desenhar();
  const r = await shopeeApiFetch(`/api/ml-status?provider=shopee&action=financas&orderSn=${encodeURIComponent(orderId)}`, 15000);
  estado.taxasPorPedido[orderId] = r ? { taxas: r.taxasCobradas, moeda: r.moeda } : { erro: true };
  desenhar();
}

/** @param {string} itemId */
async function abrirAnalise(itemId) {
  estado.analiseAberta = estado.analiseAberta === itemId ? null : itemId;
  desenhar();
  if (estado.analiseAberta && !estado.analisePorProduto[itemId]) {
    const r = await shopeeApiFetch(`/api/ml-market?provider=shopee&action=analise&itemId=${encodeURIComponent(itemId)}`, 15000);
    estado.analisePorProduto[itemId] = r || { erro: true };
    desenhar();
  }
}

// ── Tela ─────────────────────────────────────────────────────────────

function blocoResumo() {
  if (estado.resumoCarregando && !estado.resumo) {
    return Card({ children: h('p', { style: { color: 'var(--text-muted)' } }, 'Calculando o resumo do período…') });
  }
  if (estado.resumoErro && !estado.resumo) {
    return Card({ children: Alert({ tone: 'danger', title: 'Erro ao carregar o resumo', children: estado.resumoErro }) });
  }
  if (!estado.resumo) return null;

  const v = estado.resumo.vendas || {};
  const c = estado.resumo.comparacao || {};
  const linhaStat = (rotulo, valor, variacao) => h('div', { className: 'shp-stat' },
    h('span', { className: 'shp-stat-label' }, rotulo),
    h('strong', { className: 'shp-stat-valor' }, valor),
    variacao !== undefined && h('span', { style: { color: variacao == null ? 'var(--text-muted)' : (variacao >= 0 ? 'var(--success)' : 'var(--danger)'), fontSize: '0.8rem' } }, pct(variacao)));

  return Card({
    eyebrow: `Shopee · Resumo (últimos ${estado.resumo.periodo?.dias || 30} dias)`,
    title: 'Faturamento, pedidos e margem',
    children: h('div', {},
      h('div', { className: 'shp-stats-row' },
        linhaStat('Faturamento', dinheiro(v.receita, 'BRL'), c.receita),
        linhaStat('Unidades vendidas', (v.unidades || 0).toLocaleString('pt-BR'), c.unidades),
        linhaStat('Pedidos', (v.pedidos || 0).toLocaleString('pt-BR'), c.pedidos),
        linhaStat('Ticket médio', dinheiro(v.ticket, 'BRL'))),
      (v.topProdutos && v.topProdutos.length > 0) ? h('div', { style: { marginTop: '1.25rem' } },
        h('h3', { style: { fontSize: '0.95rem', marginBottom: '0.5rem' } }, 'Produtos que mais venderam no período'),
        DataTable({
          columns: [
            { key: 'nome', label: 'Produto', primary: true },
            { key: 'unidades', label: 'Unidades', align: 'right', render: (/** @type {any} */ p) => (p.unidades || 0).toLocaleString('pt-BR') },
            { key: 'receita', label: 'Receita', align: 'right', render: (/** @type {any} */ p) => dinheiro(p.receita, 'BRL') },
            { key: 'taxa', label: 'Taxa média / pedido', align: 'right', render: (/** @type {any} */ p) => dinheiro(p.taxaMediaPorPedido, 'BRL') },
          ],
          rows: v.topProdutos,
        })) : EmptyState({ icon: 'storefront', title: 'Nenhuma venda no período', children: 'Quando houver pedidos pagos nesta loja, os produtos mais vendidos aparecem aqui.' })),
  });
}

/** @param {PedidoShopee} pedido */
function celulaTaxas(pedido) {
  const info = estado.taxasPorPedido[pedido.id];
  if (!info) return Button({ variant: 'ghost', size: 'sm', children: 'Ver taxas', on: { click: () => verTaxas(pedido.id) } });
  if (info.carregando) return h('span', { style: { color: 'var(--text-muted)' } }, 'Calculando…');
  if (info.erro) return h('span', { style: { color: 'var(--danger)' } }, 'Erro ao buscar taxas');
  const taxas = info.taxas || 0;
  const liquido = pedido.total != null ? pedido.total - taxas : null;
  return h('div', {},
    h('span', { style: { color: 'var(--text-muted)' } }, `Taxas: ${dinheiro(taxas, info.moeda)}`),
    liquido != null && h('div', {}, h('strong', {}, `Líquido: ${dinheiro(liquido, info.moeda)}`)));
}

function blocoPedidos() {
  if (!estado.pedidos.length && !estado.pedidosCarregando) {
    return Card({
      eyebrow: 'Shopee', title: 'Pedidos (últimos 30 dias)',
      children: EmptyState({ icon: 'receipt_long', title: 'Nenhum pedido nos últimos 30 dias', children: 'Quando houver vendas nesta loja, elas aparecem aqui.' }),
    });
  }
  return Card({
    eyebrow: 'Shopee', title: 'Pedidos (últimos 30 dias)',
    children: DataTable({
      columns: [
        { key: 'id', label: 'Pedido', primary: true },
        { key: 'criadoEm', label: 'Data', render: (/** @type {PedidoShopee} */ p) => dataCurta(p.criadoEm) },
        { key: 'status', label: 'Status', render: statusBadge },
        { key: 'total', label: 'Total', align: 'right', render: (/** @type {PedidoShopee} */ p) => dinheiro(p.total, p.moeda) },
        { key: 'taxas', label: 'Taxas Shopee / líquido', render: celulaTaxas },
      ],
      rows: estado.pedidos,
    }),
  });
}

/** @param {any} analise */
function painelAnalise(analise) {
  if (!analise) return h('p', { style: { color: 'var(--text-muted)', padding: '0.75rem 0' } }, 'Carregando análise…');
  if (analise.erro) return h('p', { style: { color: 'var(--danger)', padding: '0.75rem 0' } }, 'Não foi possível carregar a análise deste produto.');

  const item = analise.item || {};
  const reviews = analise.reviews;
  return h('div', { className: 'shp-analise' },
    h('div', { className: 'shp-analise-grid' },
      h('div', {}, h('span', { style: { color: 'var(--text-muted)' } }, 'Preço'), h('strong', {}, dinheiro(item.preco, item.moeda))),
      h('div', {}, h('span', { style: { color: 'var(--text-muted)' } }, 'Estoque'), h('strong', {}, item.estoque != null ? item.estoque.toLocaleString('pt-BR') : '—')),
      h('div', {}, h('span', { style: { color: 'var(--text-muted)' } }, 'SKU'), h('strong', {}, item.sku || '—')),
      h('div', {}, h('span', { style: { color: 'var(--text-muted)' } }, 'Avaliação média'), h('strong', {}, reviews && reviews.average != null ? `${estrelas(reviews.average)} (${reviews.average})` : '—'))),
    reviews && reviews.latest && reviews.latest.length > 0 && h('div', { style: { marginTop: '0.75rem' } },
      h('span', { style: { color: 'var(--text-muted)', fontSize: '0.85rem' } }, 'Últimas avaliações:'),
      reviews.latest.map((/** @type {any} */ r) => h('div', { style: { padding: '0.35rem 0', borderTop: '1px solid var(--border)' } },
        h('span', {}, estrelas(r.rate)), r.comment && h('span', { style: { marginLeft: '0.5rem' } }, r.comment)))));
}

function blocoProdutos() {
  if (!estado.produtos.length && !estado.produtosCarregando) {
    return Card({
      eyebrow: 'Shopee', title: 'Produtos',
      children: EmptyState({ icon: 'inventory_2', title: 'Nenhum produto ativo encontrado', children: 'Produtos cadastrados e ativos nesta loja aparecem aqui.' }),
    });
  }
  return Card({
    eyebrow: 'Shopee', title: 'Produtos (clique para ver preço, estoque e avaliações)',
    children: h('div', {},
      DataTable({
        columns: [
          { key: 'nome', label: 'Produto', primary: true, render: (/** @type {ProdutoShopee} */ p) => h('button', { className: 'shp-link-btn', on: { click: () => abrirAnalise(p.id) } }, p.nome || p.id) },
          { key: 'preco', label: 'Preço', align: 'right', render: (/** @type {ProdutoShopee} */ p) => dinheiro(p.preco, 'BRL') },
          { key: 'estoque', label: 'Estoque', align: 'right', render: (/** @type {ProdutoShopee} */ p) => (p.estoque != null ? p.estoque.toLocaleString('pt-BR') : '—') },
        ],
        rows: estado.produtos,
      }),
      estado.analiseAberta && estado.produtos.some((p) => p.id === estado.analiseAberta)
        && painelAnalise(estado.analisePorProduto[estado.analiseAberta]),
      estado.produtosProximoOffset != null && h('div', { style: { textAlign: 'center', marginTop: '1rem' } },
        Button({
          variant: 'outline', size: 'sm',
          children: estado.produtosCarregando ? 'Carregando…' : 'Carregar mais produtos',
          disabled: estado.produtosCarregando,
          on: { click: () => buscarProdutos(estado.produtosProximoOffset || undefined) },
        }))),
  });
}

/** @param {AvaliacaoShopee} r */
function linhaReview(r) {
  return h('div', { style: { padding: '0.6rem 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '1rem' } },
    h('div', {},
      !r.is_read && Badge({ tone: 'accent', dot: true, children: 'Novo' }),
      h('strong', {}, r.item_name || r.shopee_item_id),
      h('div', { style: { color: 'var(--text-muted)', fontSize: '0.85rem' } }, estrelas(r.rating), r.comment ? ` — ${r.comment}` : '')),
    h('span', { style: { color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' } }, dataCurta(r.reviewed_at)));
}

function blocoAvaliacoes() {
  if (!estado.reviews.length && !estado.reviewsCarregando) {
    return Card({
      eyebrow: 'Shopee', title: 'Avaliações',
      children: EmptyState({ icon: 'star', title: 'Nenhuma avaliação encontrada ainda', children: 'Verificamos automaticamente a cada hora — quando houver avaliações novas, elas aparecem aqui.' }),
    });
  }
  return Card({
    eyebrow: 'Shopee' + (estado.reviewsUnread > 0 ? ` · ${estado.reviewsUnread} não lida(s)` : ''),
    title: 'Avaliações (último comentário de cada produto)',
    children: h('div', {},
      estado.reviewsUnread > 0 && h('div', { style: { textAlign: 'right', marginBottom: '0.5rem' } },
        Button({ variant: 'secondary', size: 'sm', children: 'Marcar todas como lidas', on: { click: marcarTodasLidas } })),
      estado.reviews.map(linhaReview)),
  });
}

function blocoStatus() {
  if (estado.status == null) {
    return Card({ children: h('p', { style: { color: 'var(--text-muted)' } }, 'Verificando conexão com a Shopee…') });
  }
  if (!estado.status.connected) {
    return Card({
      children: EmptyState({
        icon: 'storefront',
        title: 'Shopee não conectada',
        children: 'Conecte em Configurações → Integrações → "Shopee" para ver pedidos, produtos, margem e avaliações.',
      }),
    });
  }
  return null;
}

function tela() {
  if (estado.status && !estado.status.connected) return h('div', { className: 'shp-grid' }, blocoStatus());
  if (estado.status == null) return h('div', { className: 'shp-grid' }, blocoStatus());
  return h('div', { className: 'shp-grid' }, blocoResumo(), blocoPedidos(), blocoProdutos(), blocoAvaliacoes());
}

function desenhar() {
  const raiz = document.getElementById('shopee-painel-raiz');
  if (!raiz) return;
  try {
    raiz.replaceChildren(tela());
  } catch (e) {
    console.error('[Impoclick] falha ao desenhar o painel da Shopee:', e);
    raiz.replaceChildren(Alert({
      tone: 'danger', title: 'O painel não conseguiu montar a tela',
      children: 'Recarregue a página (F5). Se continuar, me avise: ' + (e instanceof Error ? e.message : String(e)),
    }));
  }
}

let carregouUmaVez = false;
async function abrir() {
  desenhar();
  if (!carregouUmaVez) {
    carregouUmaVez = true;
    await buscarStatus();
  }
}

document.addEventListener('impoclick:tela', (e) => {
  const d = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (d && d.id === 'view-shopee-painel') abrir();
});

document.addEventListener('click', (e) => {
  const alvo = e.target;
  if (alvo instanceof Element && alvo.closest('[data-view="view-shopee-painel"]')) setTimeout(abrir, 0);
});

desenhar();
