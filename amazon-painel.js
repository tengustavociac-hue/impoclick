// @ts-check
/**
 * Painel da Amazon: pedidos/taxas (SP-API) e gasto com anúncios (Ads API) —
 * duas conexões independentes, cada uma com seu próprio card nesta tela.
 *
 * SP-API: app PRIVADO — só a conta principal do Impoclick está autoautorizada
 * (ver api/_amazon-helper.js e a memória do projeto). Por isso esse card não
 * tem botão de "Conectar": quem não está conectado só vê um aviso.
 *
 * Amazon Ads: conexão separada, com OAuth de redirect de verdade (botão
 * "Conectar" fica em Configurações → Integrações, não aqui — ver
 * api/_amazon-ads-helper.js). O gasto por produto vem de um relatório
 * ASSÍNCRONO da Amazon (pode levar até 3h a primeira vez) que um cron diário
 * busca e grava no banco; esta tela só LÊ o que já foi salvo, nunca pede o
 * relatório na hora do clique.
 *
 * Produtos/catálogo da Amazon (fora de anúncios) ficam de fora por enquanto —
 * a SP-API exige um fluxo assíncrono de relatório pra listar anúncios.
 */
import { Card, Badge, Button, Alert, EmptyState, DataTable, h } from './design-system/components/index.js';

/**
 * @typedef {{ id: string, status: string, criadoEm: string, atualizadoEm: string,
 *   total: number | null, moeda: string | null, canal: string | null }} Pedido
 */

/**
 * @typedef {{ asin: string, sku: string | null, campaign_id: string, campaign_name: string | null,
 *   impressoes: number, cliques: number, gasto: number, vendas_atribuidas: number,
 *   pedidos_atribuidos: number, periodo_inicio: string, periodo_fim: string }} ProdutoAnunciado
 */

const estado = {
  /** @type {{ connected: boolean, motivo?: string, error?: string } | null} */
  status: null,
  /** @type {Pedido[]} */
  pedidos: [],
  /** @type {string | null} */
  nextToken: null,
  carregando: false,
  /** @type {string | null} */
  erro: null,
  /** @type {Record<string, { carregando?: boolean, erro?: boolean, taxas?: number, moeda?: string | null }>} */
  taxasPorPedido: {},
  ads: {
    /** @type {{ connected: boolean, motivo?: string, error?: string, relatorioAtualizadoEm?: string | null } | null} */
    status: null,
    /** @type {ProdutoAnunciado[]} */
    produtos: [],
    /** @type {string | null} */
    erro: null,
  },
};

/** @param {string} path @param {number} [timeoutMs] */
async function amazonApiFetch(path, timeoutMs) {
  const api = /** @type {any} */ (window).mlApiFetch;
  if (typeof api !== 'function') return null;
  return await api(path, timeoutMs);
}

// ── Formatação ────────────────────────────────────────────────────────

/** @param {number} v */
const num = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** @param {number | null | undefined} v @param {string | null | undefined} moeda */
const dinheiro = (v, moeda) => (v == null ? '—' : (moeda === 'USD' ? 'US$ ' : 'R$ ') + num(v));
/** @param {string | null | undefined} iso */
const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
/** @param {number} gasto @param {number} vendas */
const acos = (gasto, vendas) => (vendas > 0 ? num((gasto / vendas) * 100) + '%' : '—');
/** @param {string | null | undefined} iso */
function tempoRelativo(iso) {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** @type {Record<string, { rotulo: string, tom: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }>} */
const STATUS_AMAZON = {
  Pending: { rotulo: 'Pendente', tom: 'warning' },
  Unshipped: { rotulo: 'Aguardando envio', tom: 'warning' },
  PartiallyShipped: { rotulo: 'Enviado parcialmente', tom: 'warning' },
  Shipped: { rotulo: 'Enviado', tom: 'success' },
  Canceled: { rotulo: 'Cancelado', tom: 'danger' },
  Unfulfillable: { rotulo: 'Não atendível', tom: 'danger' },
  InvoiceUnconfirmed: { rotulo: 'Nota fiscal pendente', tom: 'warning' },
  PendingAvailability: { rotulo: 'Pendente de disponibilidade', tom: 'neutral' },
};

/** @param {string} status */
function statusBadge(status) {
  const info = STATUS_AMAZON[status] || { rotulo: status || '—', tom: /** @type {const} */ ('neutral') };
  return Badge({ tone: info.tom, dot: true, children: info.rotulo });
}

// ── Dados ────────────────────────────────────────────────────────────

async function buscarStatus() {
  const r = await amazonApiFetch('/api/ml-status?provider=amazon', 10000);
  estado.status = r || { connected: false, motivo: 'falha_rede' };
  desenhar();
  if (estado.status.connected) await buscarPedidos();
}

/** @param {string} [nextToken] */
async function buscarPedidos(nextToken) {
  estado.carregando = true;
  estado.erro = null;
  desenhar();

  const qs = nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '';
  const r = await amazonApiFetch(`/api/ml-status?provider=amazon&action=pedidos${qs}`, 20000);

  estado.carregando = false;
  if (!r) {
    estado.erro = 'Não foi possível carregar os pedidos da Amazon agora. Tente de novo em instantes.';
    desenhar();
    return;
  }
  estado.pedidos = nextToken ? [...estado.pedidos, ...(r.pedidos || [])] : (r.pedidos || []);
  estado.nextToken = r.nextToken || null;
  desenhar();
}

async function buscarStatusAds() {
  const r = await amazonApiFetch('/api/ml-status?provider=amazon-ads', 10000);
  estado.ads.status = r || { connected: false, motivo: 'falha_rede' };
  desenhar();
  if (estado.ads.status.connected) await buscarProdutosAds();
}

async function buscarProdutosAds() {
  const r = await amazonApiFetch('/api/ml-status?provider=amazon-ads&action=dados', 15000);
  if (!r) {
    estado.ads.erro = 'Não foi possível carregar os dados de anúncios agora. Tente de novo em instantes.';
    desenhar();
    return;
  }
  estado.ads.erro = null;
  estado.ads.produtos = r.produtos || [];
  desenhar();
}

/** @param {string} orderId */
async function verTaxas(orderId) {
  estado.taxasPorPedido[orderId] = { carregando: true };
  desenhar();

  const r = await amazonApiFetch(`/api/ml-status?provider=amazon&action=financas&orderId=${encodeURIComponent(orderId)}`, 15000);
  estado.taxasPorPedido[orderId] = r
    ? { taxas: r.taxasCobradas, moeda: r.moeda }
    : { erro: true };
  desenhar();
}

// ── Tela ─────────────────────────────────────────────────────────────

/** @param {Pedido} pedido */
function celulaTaxas(pedido) {
  const info = estado.taxasPorPedido[pedido.id];
  if (!info) {
    return Button({ variant: 'ghost', size: 'sm', children: 'Ver taxas', on: { click: () => verTaxas(pedido.id) } });
  }
  if (info.carregando) return h('span', { style: { color: 'var(--text-muted)' } }, 'Calculando…');
  if (info.erro) return h('span', { style: { color: 'var(--danger)' } }, 'Erro ao buscar taxas');

  const taxas = info.taxas || 0;
  const liquido = pedido.total != null ? pedido.total - taxas : null;
  return h('div', { className: 'amp-taxas-cel' },
    h('span', { style: { color: 'var(--text-muted)' } }, `Taxas: ${dinheiro(taxas, info.moeda)}`),
    liquido != null && h('strong', {}, `Líquido: ${dinheiro(liquido, info.moeda)}`));
}

function blocoPedidos() {
  if (!estado.pedidos.length && !estado.carregando) {
    return EmptyState({
      icon: 'receipt_long',
      title: 'Nenhum pedido nos últimos 30 dias',
      children: 'Quando houver vendas na sua conta da Amazon, elas aparecem aqui.',
    });
  }

  return h('div', {},
    DataTable({
      columns: [
        { key: 'id', label: 'Pedido', primary: true },
        { key: 'criadoEm', label: 'Data', render: (/** @type {Pedido} */ p) => dataCurta(p.criadoEm) },
        { key: 'status', label: 'Status', render: (/** @type {Pedido} */ p) => statusBadge(p.status) },
        { key: 'total', label: 'Total', align: 'right', render: (/** @type {Pedido} */ p) => dinheiro(p.total, p.moeda) },
        { key: 'taxas', label: 'Taxas Amazon / líquido', render: celulaTaxas },
      ],
      rows: estado.pedidos,
    }),
    estado.nextToken && h('div', { style: { textAlign: 'center', marginTop: '1rem' } },
      Button({
        variant: 'outline', size: 'sm',
        children: estado.carregando ? 'Carregando…' : 'Carregar mais pedidos',
        disabled: estado.carregando,
        on: { click: () => buscarPedidos(estado.nextToken || undefined) },
      })));
}

function blocoSpApi() {
  if (estado.status == null) {
    return Card({ children: h('p', { style: { color: 'var(--text-muted)' } }, 'Verificando conexão com a Amazon…') });
  }

  if (!estado.status.connected) {
    const motivo = estado.status.motivo;
    if (motivo === 'nao_conectado') {
      return Card({
        children: EmptyState({
          icon: 'storefront',
          title: 'Conexão com a Amazon ainda não disponível para esta conta',
          children: 'Hoje a integração com a Amazon funciona só para a conta principal do Impoclick (app privado na SP-API). Em breve, qualquer usuário vai poder conectar a própria conta de vendedor da Amazon por aqui.',
        }),
      });
    }
    const mensagens = {
      expirado: 'O acesso à sua conta da Amazon expirou ou foi revogado. É preciso autoautorizar o app de novo no Seller Central e salvar um novo token.',
      falha_rede: 'Não foi possível falar com o servidor agora. Tente recarregar a página (F5).',
    };
    return Card({
      children: Alert({
        tone: 'danger',
        title: 'Não foi possível verificar a conexão com a Amazon',
        children: mensagens[motivo] || (estado.status.error || 'Tente recarregar a página (F5). Se persistir, me avise.') + ' (motivo: ' + motivo + ')',
      }),
    });
  }

  return Card({
    eyebrow: 'Amazon · Selling Partner API',
    title: 'Pedidos (últimos 30 dias)',
    children: h('div', {},
      estado.erro && Alert({ tone: 'danger', title: 'Erro ao carregar', children: estado.erro }),
      blocoPedidos()),
  });
}

/** @param {ProdutoAnunciado} p */
function celulaResultadoAds(p) {
  const resultado = p.vendas_atribuidas - p.gasto;
  return h('strong', { style: { color: resultado >= 0 ? 'var(--success)' : 'var(--danger)' } }, dinheiro(resultado, 'BRL'));
}

function blocoAnuncios() {
  const status = estado.ads.status;
  if (status == null) {
    return Card({ children: h('p', { style: { color: 'var(--text-muted)' } }, 'Verificando conexão com os anúncios da Amazon…') });
  }

  if (!status.connected) {
    return Card({
      eyebrow: 'Amazon Ads',
      children: EmptyState({
        icon: 'ads_click',
        title: 'Anúncios da Amazon não conectados',
        children: 'Conecte em Configurações → Integrações → "Amazon Ads" para ver o gasto por produto e a margem depois dos anúncios.',
      }),
    });
  }

  if (!status.relatorioAtualizadoEm) {
    return Card({
      eyebrow: 'Amazon Ads',
      children: EmptyState({
        icon: 'hourglass_empty',
        title: 'Primeiro relatório sendo gerado',
        children: 'A Amazon pode levar algumas horas para liberar o primeiro relatório de gastos com anúncios depois de conectar. Volte mais tarde — os dados aparecem aqui sozinhos, sem precisar fazer nada.',
      }),
    });
  }

  const atualizado = tempoRelativo(status.relatorioAtualizadoEm);
  if (!estado.ads.produtos.length) {
    return Card({
      eyebrow: 'Amazon Ads' + (atualizado ? ` · atualizado ${atualizado}` : ''),
      children: EmptyState({
        icon: 'ads_click',
        title: 'Nenhum produto anunciado nos últimos 30 dias',
        children: 'Quando suas campanhas de Sponsored Products tiverem gasto, os produtos aparecem aqui.',
      }),
    });
  }

  return Card({
    eyebrow: 'Amazon Ads · Sponsored Products' + (atualizado ? ` · atualizado ${atualizado}` : ''),
    title: 'Gasto por produto anunciado (últimos 30 dias)',
    children: h('div', {},
      estado.ads.erro && Alert({ tone: 'danger', title: 'Erro ao carregar', children: estado.ads.erro }),
      DataTable({
        columns: [
          { key: 'asin', label: 'ASIN / SKU', primary: true, render: (/** @type {ProdutoAnunciado} */ p) => h('div', {}, h('strong', {}, p.asin), p.sku && h('div', { style: { color: 'var(--text-muted)', fontSize: '0.8rem' } }, p.sku)) },
          { key: 'campaign_name', label: 'Campanha', render: (/** @type {ProdutoAnunciado} */ p) => p.campaign_name || p.campaign_id },
          { key: 'impressoes', label: 'Impressões', align: 'right', render: (/** @type {ProdutoAnunciado} */ p) => p.impressoes.toLocaleString('pt-BR') },
          { key: 'cliques', label: 'Cliques', align: 'right', render: (/** @type {ProdutoAnunciado} */ p) => p.cliques.toLocaleString('pt-BR') },
          { key: 'gasto', label: 'Gasto com ads', align: 'right', render: (/** @type {ProdutoAnunciado} */ p) => dinheiro(p.gasto, 'BRL') },
          { key: 'vendas', label: 'Vendas atribuídas', align: 'right', render: (/** @type {ProdutoAnunciado} */ p) => dinheiro(p.vendas_atribuidas, 'BRL') },
          { key: 'acos', label: 'ACOS', align: 'right', render: (/** @type {ProdutoAnunciado} */ p) => acos(p.gasto, p.vendas_atribuidas) },
          { key: 'resultado', label: 'Vendas − gasto', align: 'right', render: celulaResultadoAds },
        ],
        rows: estado.ads.produtos,
      })),
  });
}

function tela() {
  return h('div', { className: 'amp-grid' }, blocoSpApi(), blocoAnuncios());
}

function desenhar() {
  const raiz = document.getElementById('amazon-painel-raiz');
  if (!raiz) return;
  try {
    raiz.replaceChildren(tela());
  } catch (e) {
    console.error('[Impoclick] falha ao desenhar o painel da Amazon:', e);
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
    await Promise.all([buscarStatus(), buscarStatusAds()]);
  }
}

document.addEventListener('impoclick:tela', (e) => {
  const d = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (d && d.id === 'view-amazon-painel') abrir();
});

// Rede de segurança, mesmo motivo do ml-painel.js: o clique no item do menu
// também abre o painel, caso o evento de troca de tela não chegue.
document.addEventListener('click', (e) => {
  const alvo = e.target;
  if (alvo instanceof Element && alvo.closest('[data-view="view-amazon-painel"]')) setTimeout(abrir, 0);
});

desenhar();
