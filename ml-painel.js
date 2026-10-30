// @ts-check
/**
 * Painel do Mercado Livre: a visão geral da conta em uma tela.
 *
 * Os números da conta vêm de /api/ml-market?action=resumo, que lê os pedidos e
 * o perfil direto no Mercado Livre. O bloco "precisa de você hoje" reaproveita
 * os monitores que o site já mantém (avaliações, catálogos, promoções e
 * patrocinados), que leem do nosso banco e respondem rápido.
 *
 * A conta do faturamento sai dos PEDIDOS PAGOS do período, que é o que o
 * vendedor vê no extrato — não de métrica agregada do ML. O período anterior,
 * do mesmo tamanho, vem na mesma leitura: é o que permite dizer "cresceu 12%".
 *
 * O lucro por anúncio junta duas fontes: o servidor devolve o preço, a comissão
 * e o frete REAIS das vendas; o custo do produto e o imposto são do vendedor
 * (os mesmos que o painel de Patrocinados usa) e a conta é refeita aqui a cada
 * custo digitado, sem voltar ao Mercado Livre.
 */
import {
  Card, Stat, Badge, Button, Input, SegmentedControl, Alert, EmptyState, DataTable, h,
} from './design-system/components/index.js';
// A conta de margem pós-ads é a mesma do painel de Patrocinados — importada
// em vez de duplicada, porque os dois são módulo ES. A do Catálogo não dá
// para importar: app.js não é módulo (ver margemCatalogoItem abaixo).
import { contaDoAnuncio } from './patrocinados-regras.js';

/**
 * @typedef {{ dia: string, receita: number }} DiaDeVenda
 * @typedef {{ id: string, titulo: string, unidades: number, receita: number, visitas: number | null,
 *   conversao: number | null, full: boolean | null, freteGratis: boolean | null, estoque: number | null, link: string | null,
 *   precoMedio: number | null, comissaoUn: number | null, freteUn: number | null, freteAmostras: number,
 *   velocidade: number, diasDeEstoque: number | null }} ItemVendido
 * @typedef {{ id: string, titulo: string, estoque: number, velocidade: number, diasRestantes: number, link: string | null }} EstoqueEmRisco
 * @typedef {{ id: string, titulo: string, preco: number, estoque: number, link: string | null }} ItemParado
 * @typedef {{
 *   versao?: number,
 *   periodo: { de: string, ate: string, dias: number },
 *   anterior: { de: string, ate: string },
 *   conta: { nickname: string | null, reputacao: string | null, mercadoLider: string | null, vendasConcluidas: number | null,
 *     reclamacoes: number | null, atrasos: number | null, cancelamentos: number | null } | null,
 *   vendas: { receita: number, unidades: number, pedidos: number, ticket: number | null, porDia: DiaDeVenda[],
 *     porDiaSemana: number[], porHora: number[], topItens: ItemVendido[], parcial: boolean, cancelados: number | null,
 *     clientes: { total: number, recorrentes: number }, anunciosPara80: number | null, anunciosQueVenderam: number },
 *   comparacao: { receita: number | null, unidades: number | null, pedidos: number | null, ticket: number | null, receitaAnterior: number },
 *   projecao: { mes: number, ateAgora: number, diaDoMes: number, diasNoMes: number } | null,
 *   visitas: number | null, conversao: number | null,
 *   anuncios: { ativos: number | null, pausados: number | null, semVenda: number, semVendaExemplos: ItemParado[] },
 *   perguntasSemResposta: number | null, estoqueEmRisco: EstoqueEmRisco[],
 * }} Resumo
 * @typedef {{ avaliacoes: number, catalogo: number, promocoes: number, patrocinados: number,
 *   catalogoItens: Array<{ ml_item_id: string, status: string }> | null }} Pendencias
 * @typedef {{ margemUn: number, margemPct: number, lucro: number }} ContaDoItem
 */

const CACHE = 'impoclick-ml-painel';
const PERIODO_GUARDADO = 'impoclick-ml-painel-dias';
// Precisa bater com RESUMO_VERSAO do servidor (api/ml-market.js): resumo
// guardado de um formato antigo é descartado em vez de renderizar pela metade.
const VERSAO = 3;
// 30 minutos: é um painel de acompanhamento, não tempo real, e cada carga faz
// várias consultas ao Mercado Livre.
const CACHE_MINUTOS = 30;
const PERIODOS = [7, 30, 60, 90];
// Abaixo destes dias de estoque o anúncio está perto de acabar.
const DIAS_CRITICO = 3;

// Mesmos caches que a aba Catálogo e a de Patrocinados mantêm (6h). O Painel
// os lê E os preenche sozinho ao abrir (ver buscarMargemCatalogo/
// buscarPainelAdsSeNecessario): o vendedor pediu os dois blocos sempre
// carregados, sem precisar visitar as outras abas primeiro. Dentro da
// validade de 6h, abrir o Painel de novo não refaz a consulta ao ML.
const CACHE_CATALOGO_MARGEM = 'impoclick-catalog-margem';
const CACHE_ADS_PAINEL = 'impoclick-ads-painel';
const CACHE_HORAS_MARGEM = 6;

/** @type {{ resumo: Resumo | null, pendencias: Pendencias | null, em: number | null, carregando: boolean, erro: string | null,
 *   dias: number, custos: Record<string, number>, impostoPct: number, erroCustos: string | null, custosCarregados: boolean,
 *   catalogoMargemCarregando: boolean, adsPainelCarregando: boolean }} */
const estado = {
  resumo: null, pendencias: null, em: null, carregando: false, erro: null,
  dias: 30, custos: {}, impostoPct: 0, erroCustos: null, custosCarregados: false,
  catalogoMargemCarregando: false, adsPainelCarregando: false,
};

// ── Formatação ────────────────────────────────────────────────────────

/** @param {number} v @param {number} [casas] */
const num = (v, casas = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** @param {number | null} v */
const reais = (v) => (v == null ? '—' : 'R$ ' + num(v, 2));
/** Sem centavos, para o número grande do cartão. @param {number | null} v */
const reaisCurto = (v) => (v == null ? '—' : 'R$ ' + num(v));
/** Com o mesmo sinal de menos em tudo: "−R$ 1.234". @param {number} v */
const dinheiroCurto = (v) => (v < 0 ? '−' : '') + 'R$ ' + num(Math.abs(v));
/** @param {number} v */
const dinheiro = (v) => (v < -0.005 ? '−' : '') + 'R$ ' + num(Math.abs(v), 2);
/** @param {number | null} v @param {number} [casas] */
const pct = (v, casas = 2) => (v == null ? '—' : num(v * 100, casas).replace('-', '−') + '%');
/** Variação com sinal: "+12%" / "−8%". @param {number | null} v */
const variacao = (v) => (v == null ? null : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v) * 100) + '%');
/** @param {string} iso "AAAA-MM-DD" */
const diaCurto = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
/** @param {number} n @param {string} um @param {string} varios */
const plural = (n, um, varios) => num(n) + ' ' + (n === 1 ? um : varios);
/** Só a palavra, sem o número: nas tarefas quem conta é o selo ao lado. */
const palavra = (/** @type {number} */ n, /** @type {string} */ um, /** @type {string} */ varios) => (n === 1 ? um : varios);
/** "3 dias", "1 dia", "menos de 1 dia". @param {number} d */
const diasTexto = (d) => (d < 1 ? 'menos de 1 dia' : plural(Math.round(d), 'dia', 'dias'));
/** Classe do valor pelo sinal: o "−" já diz, a cor só reforça. @param {number | null} v */
const tomDoValor = (v) => (v == null ? '' : v < -0.005 ? ' mlp-ruim' : v > 0.005 ? ' mlp-bom' : '');

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Os cinco níveis do termômetro do Mercado Livre, na ordem dele.
const REPUTACAO = /** @type {Record<string, { rotulo: string, tom: 'danger' | 'warning' | 'success' | 'neutral' }>} */ ({
  '1_red': { rotulo: 'Vermelho', tom: 'danger' },
  '2_orange': { rotulo: 'Laranja', tom: 'warning' },
  '3_yellow': { rotulo: 'Amarelo', tom: 'warning' },
  '4_light_green': { rotulo: 'Verde claro', tom: 'success' },
  '5_green': { rotulo: 'Verde', tom: 'success' },
});

const MERCADO_LIDER = /** @type {Record<string, string>} */ ({
  silver: 'MercadoLíder', gold: 'MercadoLíder Gold', platinum: 'MercadoLíder Platinum',
});

const api = () => /** @type {any} */ (window).mlApiFetch;
const banco = () => /** @type {any} */ (window).db;

/** @param {string} texto */
function lerNumero(texto) {
  const v = Number(String(texto).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// ── Dados ─────────────────────────────────────────────────────────────

/** @param {number} dias */
function lerCache(dias) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE + '-' + dias) || 'null');
    if (c && c.resumo && c.resumo.versao === VERSAO && Date.now() - c.em < CACHE_MINUTOS * 60000) return c;
  } catch { /* cache ilegível: busca de novo */ }
  return null;
}

/** Os quatro monitores que o site já mantém, em paralelo. Falha de um não derruba os outros. */
async function buscarPendencias() {
  const chamar = api();
  if (typeof chamar !== 'function') return null;
  const [av, cat, promo, ads] = await Promise.all([
    chamar('/api/ml-reviews'), chamar('/api/ml-reviews?resource=catalog'),
    chamar('/api/ml-reviews?resource=promotions'), chamar('/api/ml-reviews?resource=ads'),
  ]);
  const contar = (/** @type {any} */ r) => (r && Number.isFinite(Number(r.unreadCount)) ? Number(r.unreadCount) : 0);
  return {
    avaliacoes: contar(av), catalogo: contar(cat), promocoes: contar(promo), patrocinados: contar(ads),
    // Lista completa (não só a contagem de novidades): usada para achar quem
    // está "Ganhando" e cruzar com a margem calculada lá, em catalogoEmPrejuizo.
    catalogoItens: cat && Array.isArray(cat.items) ? cat.items : null,
  };
}

async function buscar() {
  const chamar = api();
  if (typeof chamar !== 'function' || estado.carregando) return;
  const dias = estado.dias;
  estado.carregando = true;
  estado.erro = null;
  desenhar();

  // Até 60 s: o resumo lê pedidos de dois períodos, perfil, perguntas, visitas,
  // estoque, o frete dos envios e os anúncios sem venda.
  const [resumo, pendencias] = await Promise.all([chamar('/api/ml-market?action=resumo&dias=' + dias, 60000), buscarPendencias()]);
  estado.carregando = false;

  // O vendedor trocou o período no meio da busca: o que chegou é de outro.
  if (dias !== estado.dias) {
    buscar();
    return;
  }
  if (!resumo) {
    estado.erro = 'Não foi possível falar com o Mercado Livre agora. Tente atualizar em instantes.';
    desenhar();
    return;
  }
  estado.resumo = resumo;
  estado.pendencias = pendencias;
  estado.em = Date.now();
  try { localStorage.setItem(CACHE + '-' + dias, JSON.stringify({ em: estado.em, resumo, pendencias })); } catch { /* sem armazenamento */ }
  desenhar();
}

/** Custo de cada produto e imposto: os mesmos do painel de Patrocinados. */
async function carregarCustos() {
  const b = banco();
  if (estado.custosCarregados || !b || typeof b.getAdsMargemDados !== 'function') return;
  const r = await b.getAdsMargemDados();
  estado.custosCarregados = true;
  if (r.erro) {
    estado.erroCustos = r.erro;
    return;
  }
  estado.custos = r.dados.custos || {};
  if (r.dados.impostoPct != null) estado.impostoPct = r.dados.impostoPct;
  desenhar();
}

/** @param {string} itemId @param {string} texto */
async function salvarCusto(itemId, texto) {
  const vazio = String(texto).trim() === '';
  const valor = vazio ? null : lerNumero(texto);
  if (valor == null && !vazio) return;
  if (valor == null) delete estado.custos[itemId]; else estado.custos[itemId] = valor;
  desenhar();
  const b = banco();
  if (b && typeof b.saveItemCost === 'function') {
    const r = await b.saveItemCost(itemId, valor);
    if (r && r.erro) { estado.erroCustos = r.erro; desenhar(); }
  }
}

/** @param {string} texto */
async function salvarImposto(texto) {
  const v = lerNumero(texto);
  if (v == null || v >= 100) return;
  estado.impostoPct = v;
  desenhar();
  const b = banco();
  if (b && typeof b.saveAdsTax === 'function') await b.saveAdsTax(v);
}

/** @param {number} dias */
function trocarPeriodo(dias) {
  if (dias === estado.dias) return;
  estado.dias = dias;
  try { localStorage.setItem(PERIODO_GUARDADO, String(dias)); } catch { /* sem armazenamento */ }
  const guardado = lerCache(dias);
  if (guardado) {
    estado.resumo = guardado.resumo;
    estado.pendencias = guardado.pendencias;
    estado.em = guardado.em;
    desenhar();
    return;
  }
  // Sem cache desse período: some o resumo do outro, senão a tela mostraria
  // "últimos 30 dias" enquanto busca 90.
  estado.resumo = null;
  buscar();
}

// ── Catálogo e Patrocinados em prejuízo ──────────────────────────────
//
// As duas telas já calculam margem real por anúncio e guardam o resultado em
// cache (6h): aqui só se lê esse cache e conta quem está no negativo, para
// aparecer em "Precisa de você hoje". Sem cache ainda (vendedor nunca abriu
// aquela aba, ou já venceu), devolve null — e oQueFaltou() explica o porquê
// em vez de a tarefa simplesmente não aparecer.

/** @returns {Record<string, any> | null} */
function lerMargemCatalogo() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_CATALOGO_MARGEM) || 'null');
    if (c && c.porItem && Date.now() - c.em < CACHE_HORAS_MARGEM * 3600000) return c.porItem;
  } catch { /* sem cache ou ilegível — trata como ainda não calculado */ }
  return null;
}

/**
 * A mesma conta de contaMargemCatalogo (app.js): preço − comissão − frete −
 * imposto − custo − ads. Duplicada de propósito: app.js não é módulo ES e
 * não dá para importar dele (ver o comentário da importação de contaDoAnuncio).
 * @param {any} margem @param {number | undefined} custoUn @param {number} impostoPct @returns {number | null}
 */
function margemCatalogoItem(margem, custoUn, impostoPct) {
  if (!margem || margem.comissaoUn == null || custoUn == null || !(margem.preco > 0)) return null;
  const imposto = margem.preco * ((impostoPct || 0) / 100);
  return margem.preco - margem.comissaoUn - (margem.freteUn || 0) - imposto - custoUn - (margem.adsUn || 0);
}

/** @param {Pendencias | null} p @returns {{ quantos: number } | null} */
function catalogoEmPrejuizo(p) {
  if (!p || !p.catalogoItens) return null;
  const margens = lerMargemCatalogo();
  if (!margens) return null;
  let quantos = 0;
  for (const item of p.catalogoItens) {
    if (item.status !== 'winning') continue;
    const v = margemCatalogoItem(margens[item.ml_item_id], estado.custos[item.ml_item_id], estado.impostoPct);
    if (v != null && v < 0) quantos += 1;
  }
  return { quantos };
}

/** @returns {{ anuncios: any[] } | null} */
/** Devolve o painel do cache, do jeito que veio (ok ou não) — quem decide o que fazer com cada motivo é patrocinadosEmPrejuizo. */
function lerPainelAds() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_ADS_PAINEL) || 'null');
    if (c && c.painel && Date.now() - c.em < CACHE_HORAS_MARGEM * 3600000) return c.painel;
  } catch { /* sem cache ou ilegível — trata como ainda não calculado */ }
  return null;
}

// Conta sem Product Ads, ou nunca anunciou: não é erro, é "zero anúncios em
// prejuízo" — e esse resultado vale os mesmos 6h, senão o Painel bateria no
// Mercado Livre de novo a cada abertura só para ouvir "sem anúncio" de novo.
const ADS_SEM_CAMPANHA = ['sem_publicidade', 'sem_anunciante'];

/** @returns {{ quantos: number } | null} */
function patrocinadosEmPrejuizo() {
  const painel = lerPainelAds();
  if (!painel) return null;
  if (!painel.ok) return ADS_SEM_CAMPANHA.includes(painel.motivo) ? { quantos: 0 } : null;
  // margemMinimaPct não entra na conta de lucroPosAds (só no ROAS alvo, que
  // não é usado aqui) — qualquer valor serve.
  let quantos = 0;
  for (const a of painel.anuncios || []) {
    const c = contaDoAnuncio(a, { custoUn: estado.custos[a.itemId], impostoPct: estado.impostoPct, margemMinimaPct: 10 });
    if (c.lucroPosAds != null && c.lucroPosAds < 0) quantos += 1;
  }
  return { quantos };
}

/** Abre o Catálogo já na aba "Prejuízo", em vez de cair na "Ganhando". */
function irParaCatalogoPrejuizo() {
  irPara('view-catalog');
  setTimeout(() => {
    const botao = document.getElementById('catalog-tab-btn-prejuizo');
    if (botao instanceof HTMLElement) botao.click();
  }, 0);
}

/**
 * Mesma consulta do botão "Calcular margem" da aba Catálogo
 * (carregarMargemCatalogo em app.js), disparada sozinha ao abrir o Painel.
 * Só roda se o cache de 6h estiver vencido ou nunca ter existido — reabrir o
 * Painel dentro da validade não bate no Mercado Livre de novo.
 */
async function buscarMargemCatalogo() {
  if (estado.catalogoMargemCarregando || lerMargemCatalogo()) return;
  const chamar = api();
  if (typeof chamar !== 'function') return;
  estado.catalogoMargemCarregando = true;
  desenhar();
  // Até 60 s: o servidor consulta comissão, frete e publicidade por anúncio.
  const r = await chamar('/api/ml-reviews?resource=catalog-margem', 60000);
  estado.catalogoMargemCarregando = false;
  if (r && Array.isArray(r.itens)) {
    const porItem = /** @type {Record<string, any>} */ ({});
    for (const it of r.itens) porItem[it.mlItemId] = it;
    try { localStorage.setItem(CACHE_CATALOGO_MARGEM, JSON.stringify({ em: Date.now(), porItem })); } catch { /* sem armazenamento */ }
  }
  desenhar();
}

/**
 * Mesma consulta de buscarPainel em patrocinados.js, disparada sozinha ao
 * abrir o Painel. Mesma regra de cache de 6h de buscarMargemCatalogo.
 */
async function buscarPainelAdsSeNecessario() {
  if (estado.adsPainelCarregando || lerPainelAds()) return;
  const chamar = api();
  if (typeof chamar !== 'function') return;
  estado.adsPainelCarregando = true;
  desenhar();
  // Até 60 s: o servidor lê anúncios, campanhas, pedidos e envios do ML.
  const r = await chamar('/api/ml-reviews?resource=ads-painel', 60000);
  estado.adsPainelCarregando = false;
  if (r) {
    try { localStorage.setItem(CACHE_ADS_PAINEL, JSON.stringify({ em: Date.now(), painel: r })); } catch { /* sem armazenamento */ }
  }
  desenhar();
}

// ── Lucro por anúncio ─────────────────────────────────────────────────

/**
 * A mesma conta do painel de Patrocinados: preço − comissão − frete − imposto
 * − custo. É o lucro ANTES do gasto com anúncio: o custo de Patrocinados por
 * produto fica na aba dele.
 * @param {ItemVendido} i @returns {ContaDoItem | null}
 */
function contaDoItem(i) {
  const custo = estado.custos[i.id];
  if (custo == null || i.precoMedio == null || i.comissaoUn == null || !(i.precoMedio > 0)) return null;
  const imposto = i.precoMedio * (estado.impostoPct / 100);
  const margemUn = i.precoMedio - i.comissaoUn - (i.freteUn || 0) - imposto - custo;
  return { margemUn, margemPct: margemUn / i.precoMedio, lucro: margemUn * i.unidades };
}

/** Soma dos anúncios com custo cadastrado e quanto do faturamento eles cobrem. @param {Resumo} r */
function lucroEstimado(r) {
  let total = 0;
  let coberto = 0;
  let quantos = 0;
  for (const i of r.vendas.topItens) {
    const c = contaDoItem(i);
    if (!c) continue;
    total += c.lucro;
    coberto += i.receita;
    quantos += 1;
  }
  return quantos ? { total, quantos, cobertura: r.vendas.receita > 0 ? coberto / r.vendas.receita : 0 } : null;
}

// ── Exportação ────────────────────────────────────────────────────────

/**
 * Baixa um CSV que o Excel brasileiro abre certo: ponto e vírgula, vírgula
 * decimal e BOM para os acentos. Texto que começa com = + - @ ganha um
 * apóstrofo: título de anúncio vem de fora, e uma planilha executaria isso
 * como fórmula.
 * @param {string} nome @param {string[]} cabecalho @param {Array<Array<string | number | null>>} linhas
 */
function baixarCsv(nome, cabecalho, linhas) {
  /** @param {string | number | null} v */
  const celula = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
    const t = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
    return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const corpo = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + corpo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** @param {Resumo} r */
function exportarAnuncios(r) {
  baixarCsv(`impoclick-anuncios-${r.periodo.de}-a-${r.periodo.ate}.csv`,
    ['Anúncio', 'Código', 'Unidades', 'Visitas', 'Conversão (%)', 'Faturamento', 'Preço médio', 'Comissão por unidade',
      'Frete por unidade', 'Custo por unidade', 'Lucro', 'Margem (%)', 'Estoque', 'Dias de estoque', 'Full', 'Frete grátis'],
    r.vendas.topItens.map((i) => {
      const c = contaDoItem(i);
      return [i.titulo, i.id, i.unidades, i.visitas, i.conversao == null ? null : i.conversao * 100, i.receita, i.precoMedio,
        i.comissaoUn, i.freteUn, estado.custos[i.id] == null ? null : estado.custos[i.id], c ? c.lucro : null,
        c ? c.margemPct * 100 : null, i.estoque, i.diasDeEstoque, i.full == null ? null : (i.full ? 'Sim' : 'Não'),
        i.freteGratis == null ? null : (i.freteGratis ? 'Sim' : 'Não')];
    }));
}

/** @param {Resumo} r */
function exportarDias(r) {
  baixarCsv(`impoclick-faturamento-por-dia-${r.periodo.de}-a-${r.periodo.ate}.csv`,
    ['Data', 'Faturamento'],
    r.vendas.porDia.map((d) => [d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) + '/' + d.dia.slice(0, 4), d.receita]));
}

// ── Blocos da tela ────────────────────────────────────────────────────

/** @param {Resumo} r */
function numeros(r) {
  const v = r.vendas;
  const c = r.comparacao || {};
  const lucro = lucroEstimado(r);

  /**
   * @param {string} rotulo @param {string} valor @param {number | null} delta @param {string} nota
   */
  const cartao = (rotulo, valor, delta, nota) => Card({ compact: true, children: [
    Stat({
      label: rotulo, size: 'sm', value: valor,
      delta: variacao(delta) || undefined,
      deltaDirection: delta == null || Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down',
      deltaNote: delta == null ? undefined : 'vs. período anterior',
    }),
    h('p', { className: 'mlp-nota' }, nota),
  ] });

  return h('div', { className: 'mlp-numeros' },
    cartao('Faturamento', reaisCurto(v.receita), c.receita, 'Média de ' + reais(v.receita / r.periodo.dias) + ' por dia.'),
    lucro
      ? cartao('Lucro estimado', dinheiroCurto(lucro.total), null,
        'Nos ' + plural(lucro.quantos, 'anúncio com custo', 'anúncios com custo') + ' (' + num(lucro.cobertura * 100)
        + '% do faturamento), antes do gasto com Patrocinados.')
      : cartao('Lucro estimado', '—', null, 'Digite o custo dos produtos na tabela de anúncios para ver o lucro depois de comissão, frete e imposto.'),
    cartao('Unidades vendidas', num(v.unidades), c.unidades, plural(v.pedidos, 'pedido pago', 'pedidos pagos') + ' no período.'),
    cartao('Ticket médio', reais(v.ticket), c.ticket, 'Valor médio de cada pedido.'),
    cartao('Conversão', pct(r.conversao), null,
      r.visitas == null ? 'O ML não devolveu as visitas agora.' : num(r.visitas) + ' visitas nos seus anúncios.'),
    r.projecao
      ? Card({ compact: true, children: [
        Stat({ label: 'Projeção do mês', size: 'sm', value: reaisCurto(r.projecao.mes) }),
        h('p', { className: 'mlp-nota' }, reais(r.projecao.ateAgora) + ' até o dia ' + r.projecao.diaDoMes
          + '; no mesmo ritmo, fecha assim no dia ' + r.projecao.diasNoMes + '.'),
      ] })
      : null);
}

/**
 * Faturamento por dia. Barra por dia, uma cor só (é magnitude, não categoria),
 * com o valor no title de cada barra e rótulos espaçados — trinta rótulos não
 * cabem e viram borrão.
 * @param {Resumo} r
 */
function grafico(r) {
  const serie = r.vendas.porDia;
  const maior = Math.max(...serie.map((d) => d.receita), 0);
  const melhor = serie.findIndex((d) => d.receita === maior && maior > 0);
  const media = r.vendas.receita / r.periodo.dias;
  const passo = r.periodo.dias > 45 ? 10 : r.periodo.dias > 20 ? 5 : 1;

  const barras = serie.map((d, i) => h('div', {
    className: 'mlp-barra' + (i === melhor ? ' is-melhor' : ''),
    attrs: { title: diaCurto(d.dia) + ': ' + reais(d.receita) },
  },
  // Dia sem venda ainda mostra um traço: some do gráfico seria confundido
  // com "sem dado".
  h('span', { style: { height: Math.max(2, (d.receita / maior) * 100) + '%' } })));

  const rotulos = serie.map((d, i) => h('span', {}, i % passo === 0 || i === serie.length - 1 ? diaCurto(d.dia) : ''));

  return Card({
    eyebrow: 'Últimos ' + r.periodo.dias + ' dias',
    title: 'Faturamento por dia',
    action: Button({ variant: 'ghost', size: 'sm', iconLeft: 'download', children: 'Exportar CSV', on: { click: () => exportarDias(r) } }),
    children: maior > 0
      ? [
        h('div', { className: 'mlp-grafico', attrs: { role: 'img', 'aria-label': 'Faturamento por dia; melhor dia: ' + diaCurto(serie[melhor].dia) + ', ' + reais(maior) } },
          // A linha da média mostra o dia ruim sem precisar contar barra a barra.
          h('span', { className: 'mlp-media', style: { bottom: (media / maior) * 100 + '%' }, attrs: { title: 'Média do período: ' + reais(media) } }),
          barras),
        h('div', { className: 'mlp-grafico-eixo' }, rotulos),
        h('p', { className: 'mlp-nota' }, 'Melhor dia: ' + diaCurto(serie[melhor].dia) + ' com ' + reais(maior)
          + '. A linha pontilhada é a média de ' + reais(media) + ' por dia.'),
      ]
      : h('p', { className: 'mlp-texto' }, 'Nenhuma venda paga no período.'),
  });
}

/**
 * Quando a loja vende: por dia da semana e por hora. É o corte que diz quando
 * anunciar, publicar e ficar de olho nas perguntas.
 * @param {Resumo} r
 */
function quandoVende(r) {
  const semana = r.vendas.porDiaSemana || [];
  const horas = r.vendas.porHora || [];
  if (!semana.some((n) => n > 0)) return null;

  const maiorSemana = Math.max(...semana);
  const maiorHora = Math.max(...horas);
  const melhorDia = semana.indexOf(maiorSemana);
  const melhorHora = horas.indexOf(maiorHora);

  /** @param {number[]} dados @param {(i: number) => string} rotulo @param {(i: number) => string} dica */
  const mini = (dados, rotulo, dica) => {
    const maior = Math.max(...dados, 1);
    return h('div', { className: 'mlp-mini' },
      h('div', { className: 'mlp-mini-barras' }, dados.map((n, i) => h('div', {
        className: 'mlp-barra' + (n === maior && n > 0 ? ' is-melhor' : ''),
        attrs: { title: dica(i) + ': ' + plural(n, 'pedido', 'pedidos') },
      }, h('span', { style: { height: Math.max(2, (n / maior) * 100) + '%' } })))),
      h('div', { className: 'mlp-mini-eixo' }, dados.map((_, i) => h('span', {}, rotulo(i)))));
  };

  return Card({
    eyebrow: 'Quando a sua loja vende',
    title: 'Pedidos por dia da semana e por hora',
    children: [
      h('div', { className: 'mlp-minis' },
        h('div', {}, h('h4', { className: 'mlp-h4' }, 'Por dia da semana'), mini(semana, (i) => SEMANA[i], (i) => SEMANA[i])),
        h('div', {}, h('h4', { className: 'mlp-h4' }, 'Por hora do dia'),
          mini(horas, (i) => (i % 6 === 0 ? i + 'h' : ''), (i) => i + 'h às ' + (i + 1) + 'h'))),
      h('p', { className: 'mlp-nota' }, 'Vende mais ' + (melhorDia === 0 || melhorDia === 6 ? 'no ' : 'na ') + SEMANA[melhorDia].toLowerCase()
        + ' e por volta das ' + melhorHora + 'h, no horário de Brasília.'),
    ],
  });
}

/** @param {ItemVendido} i */
function campoCusto(i) {
  const atual = estado.custos[i.id];
  return Input({
    type: 'text',
    placeholder: 'Custo',
    value: atual != null ? num(atual, 2) : '',
    className: 'mlp-custo',
    attrs: { inputmode: 'decimal', 'aria-label': 'Custo unitário, em reais, de ' + i.titulo },
    on: {
      change: (e) => salvarCusto(i.id, /** @type {HTMLInputElement} */ (e.target).value),
      keydown: (e) => { if (e.key === 'Enter') /** @type {HTMLInputElement} */ (e.target).blur(); },
    },
  });
}

/** Estoque e quanto tempo ele dura no ritmo de venda. @param {ItemVendido} i */
function celulaEstoque(i) {
  if (i.estoque == null) return '—';
  const d = i.diasDeEstoque;
  return h('div', {},
    plural(i.estoque, 'unidade', 'unidades'),
    d == null
      ? h('span', { className: 'mlp-celula-nota' }, 'sem venda no período')
      : h('span', { className: 'mlp-celula-nota' + (d <= DIAS_CRITICO ? ' mlp-ruim' : '') }, 'dura ' + diasTexto(d)));
}

/** @param {Resumo} r */
function maisVendidos(r) {
  const itens = r.vendas.topItens;
  if (!itens.length) return null;

  const tabela = DataTable({
    columns: [
      { key: 'titulo', label: 'Anúncio', primary: true, render: (/** @type {ItemVendido} */ i) => h('div', {},
        i.link ? h('a', { className: 'mlp-link', attrs: { href: i.link, target: '_blank', rel: 'noopener' } }, i.titulo) : h('span', {}, i.titulo),
        h('div', { className: 'mlp-selos-linha' },
          h('span', { className: 'mlp-detalhe' }, i.id),
          i.full ? Badge({ tone: 'accent', children: 'Full' }) : null,
          i.freteGratis ? Badge({ tone: 'neutral', children: 'Frete grátis' }) : null)) },
      { key: 'unidades', label: 'Unidades', align: 'right', render: (/** @type {ItemVendido} */ i) => num(i.unidades) },
      { key: 'visitas', label: 'Visitas', align: 'right', render: (/** @type {ItemVendido} */ i) => h('div', {},
        i.visitas == null ? '—' : num(i.visitas),
        h('span', { className: 'mlp-celula-nota' }, i.conversao == null ? 'sem conversão' : pct(i.conversao) + ' compram')) },
      { key: 'receita', label: 'Faturamento', align: 'right', render: (/** @type {ItemVendido} */ i) => h('div', {},
        reais(i.receita),
        h('span', { className: 'mlp-celula-nota' }, r.vendas.receita > 0 ? num((i.receita / r.vendas.receita) * 100) + '% do total' : '')) },
      { key: 'custo', label: 'Custo un. (R$)', align: 'right', render: campoCusto },
      { key: 'lucro', label: 'Lucro', align: 'right', render: (/** @type {ItemVendido} */ i) => {
        const c = contaDoItem(i);
        if (!c) return h('span', { className: 'mlp-celula-nota' }, estado.custos[i.id] == null ? 'digite o custo' : 'sem comissão');
        return h('div', { className: tomDoValor(c.lucro).trim() },
          dinheiro(c.lucro),
          h('span', { className: 'mlp-celula-nota', attrs: { title: 'Por unidade: preço ' + reais(i.precoMedio) + ' − comissão ' + reais(i.comissaoUn)
            + ' − frete ' + (i.freteUn == null ? 'não lido' : reais(i.freteUn)) + ' − imposto − custo.' } },
          pct(c.margemPct, 1) + ' de margem'));
      } },
      { key: 'estoque', label: 'Estoque', align: 'right', render: celulaEstoque },
    ],
    rows: itens,
  });

  // Conversão baixa com visita alta é o achado mais valioso desta tabela: o
  // anúncio tem público e perde a venda no preço, na foto ou na ficha.
  const media = r.conversao;
  const oportunidade = itens.find((i) => i.conversao != null && media != null && i.visitas != null
    && i.visitas > 200 && i.conversao < media * 0.6);

  const imposto = Input({
    label: 'Imposto sobre a venda (%)',
    type: 'text',
    value: num(estado.impostoPct, 2),
    className: 'mlp-imposto',
    attrs: { inputmode: 'decimal' },
    hint: 'O mesmo do painel de Patrocinados.',
    on: { change: (e) => salvarImposto(/** @type {HTMLInputElement} */ (e.target).value) },
  });

  return Card({
    eyebrow: 'Onde está o seu faturamento',
    title: 'Anúncios que mais venderam',
    action: Button({ variant: 'ghost', size: 'sm', iconLeft: 'download', children: 'Exportar CSV', on: { click: () => exportarAnuncios(r) } }),
    children: [
      estado.erroCustos === 'sem_tabela'
        ? Alert({ tone: 'warning', title: 'Os custos ainda não podem ser guardados',
          children: 'Esta parte está sendo preparada. As vendas e as visitas já funcionam; o lucro aparece quando os custos puderem ser salvos.' })
        : null,
      h('div', { className: 'mlp-imposto-linha' }, imposto,
        h('p', { className: 'mlp-nota' }, 'Lucro por unidade = preço − comissão − frete − imposto − custo do produto. '
          + 'Comissão e frete vêm das suas vendas reais do período. É o lucro antes do gasto com anúncio.')),
      tabela,
      r.vendas.anunciosPara80
        ? h('p', { className: 'mlp-nota' }, plural(r.vendas.anunciosPara80, 'anúncio faz', 'anúncios fazem') + ' 80% do seu faturamento, de '
          + plural(r.vendas.anunciosQueVenderam, 'que vendeu', 'que venderam') + ' no período.'
          + (r.vendas.anunciosPara80 <= 2 ? ' Concentração alta: um problema num deles derruba o mês.' : ''))
        : null,
      oportunidade
        ? Alert({ tone: 'warning', title: 'Muita visita, pouca venda',
          children: '"' + oportunidade.titulo + '" teve ' + num(oportunidade.visitas || 0) + ' visitas e converteu '
            + pct(oportunidade.conversao) + ', abaixo da sua média de ' + pct(media) + '. Preço, foto, ficha e avaliações são o que costuma travar.' })
        : null,
    ],
  });
}

/** Leva para outra aba do site, pelo próprio menu. @param {string} view */
function irPara(view) {
  const botao = document.querySelector('[data-view="' + view + '"]');
  if (botao instanceof HTMLElement) botao.click();
}

/** @param {Resumo} r @param {Pendencias | null} p */
function precisaDeVoce(r, p) {
  const linhas = [];
  /** @param {number} quantos @param {string} texto @param {string} acao @param {() => void} ir @param {'danger' | 'warning' | 'accent'} tom */
  const tarefa = (quantos, texto, acao, ir, tom) => {
    if (!quantos) return;
    linhas.push(h('li', {},
      Badge({ tone: tom, dot: true, children: num(quantos) }),
      h('div', {}, h('div', { className: 'mlp-tarefa' }, texto), h('p', { className: 'mlp-texto' }, acao)),
      Button({ variant: 'ghost', size: 'sm', children: 'Abrir', on: { click: ir } })));
  };

  if (r.perguntasSemResposta) {
    linhas.push(h('li', {},
      Badge({ tone: 'danger', dot: true, children: num(r.perguntasSemResposta) }),
      h('div', {},
        h('div', { className: 'mlp-tarefa' }, palavra(r.perguntasSemResposta, 'pergunta sem resposta', 'perguntas sem resposta')),
        h('p', { className: 'mlp-texto' }, 'Responder rápido é o que mais mexe na conversão. As perguntas ficam no Mercado Livre.')),
      Button({ variant: 'ghost', size: 'sm', as: 'a', href: 'https://www.mercadolivre.com.br/vendas/perguntas', children: 'Abrir no ML' })));
  }

  // Ruptura: quem vende mais perde mais quando o estoque acaba. O prazo sai do
  // ritmo de venda do período, não de um número fixo de unidades.
  const risco = r.estoqueEmRisco || [];
  if (risco.length) {
    const critico = risco.some((i) => i.diasRestantes <= DIAS_CRITICO);
    linhas.push(h('li', {},
      Badge({ tone: critico ? 'danger' : 'warning', dot: true, children: num(risco.length) }),
      h('div', {},
        h('div', { className: 'mlp-tarefa' }, palavra(risco.length, 'anúncio pode ficar sem estoque em até 7 dias', 'anúncios podem ficar sem estoque em até 7 dias')),
        h('p', { className: 'mlp-texto' }, 'No ritmo de vendas dos últimos ' + r.periodo.dias + ' dias. Reponha antes de acabar: anúncio sem estoque perde posição.'),
        h('ul', { className: 'mlp-lista' }, risco.slice(0, 5).map((i) => h('li', {},
          i.link ? h('a', { className: 'mlp-link', attrs: { href: i.link, target: '_blank', rel: 'noopener' } }, i.titulo) : h('span', {}, i.titulo),
          h('strong', { className: i.diasRestantes <= DIAS_CRITICO ? 'mlp-ruim' : '' },
            plural(i.estoque, 'unidade', 'unidades') + ' · acaba em ' + diasTexto(i.diasRestantes)))))),
      null));
  }

  // Prejuízo é dinheiro saindo agora, não só "mudou algo" — por isso entra
  // antes dos avisos genéricos dos monitores, com o tom mais grave (danger).
  const catPrejuizo = catalogoEmPrejuizo(p);
  if (catPrejuizo) {
    tarefa(catPrejuizo.quantos, palavra(catPrejuizo.quantos, 'anúncio no catálogo em prejuízo', 'anúncios no catálogo em prejuízo'),
      'Está ganhando a disputa de catálogo, mas vendendo no negativo depois de comissão, frete, imposto, custo e anúncio.',
      irParaCatalogoPrejuizo, 'danger');
  }
  const adsPrejuizo = patrocinadosEmPrejuizo();
  if (adsPrejuizo) {
    tarefa(adsPrejuizo.quantos, palavra(adsPrejuizo.quantos, 'anúncio patrocinado em prejuízo', 'anúncios patrocinados em prejuízo'),
      'A venda já sai no negativo, ou o gasto com o anúncio consome todo o lucro do produto no período.',
      () => irPara('view-ads'), 'danger');
  }

  if (p) {
    tarefa(p.catalogo, palavra(p.catalogo, 'novidade no catálogo', 'novidades no catálogo'),
      'Mudou quem está ganhando a disputa de catálogo dos seus anúncios.', () => irPara('view-catalog'), 'warning');
    tarefa(p.promocoes, palavra(p.promocoes, 'novidade em promoções', 'novidades em promoções'),
      'Promoção acabando ou convite novo do Mercado Livre.', () => irPara('view-promotions'), 'warning');
    tarefa(p.patrocinados, palavra(p.patrocinados, 'aviso em patrocinados', 'avisos em patrocinados'),
      'Anúncio saiu de campanha ou parou de rodar.', () => irPara('view-ads'), 'accent');
    tarefa(p.avaliacoes, palavra(p.avaliacoes, 'avaliação nova', 'avaliações novas'),
      'Avaliações recentes nos seus anúncios.', () => irPara('view-reviews'), 'accent');
  }

  if (!linhas.length) {
    return Card({ eyebrow: 'Precisa de você hoje', title: 'Nada pendente',
      children: EmptyState({ icon: 'task_alt', title: 'Tudo em dia', children: 'Sem perguntas sem resposta, estoque em risco, anúncio em prejuízo ou novidades nos monitores.' }) });
  }
  return Card({ eyebrow: 'Precisa de você hoje', title: 'Por ordem de urgência',
    children: h('ul', { className: 'mlp-tarefas' }, linhas) });
}

/** Anúncios ativos que não venderam nada no período. @param {Resumo} r */
function parados(r) {
  if (!r.anuncios.semVenda) return null;
  return Card({
    eyebrow: 'Estoque parado',
    title: plural(r.anuncios.semVenda, 'anúncio ativo sem vender', 'anúncios ativos sem vender'),
    children: [
      h('p', { className: 'mlp-texto' }, 'Nenhuma venda nos últimos ' + r.periodo.dias + ' dias. Vale rever preço, foto e título — '
        + 'ou recolher o estoque, se ele estiver no Full pagando armazenagem.'),
      h('ul', { className: 'mlp-lista mlp-lista--larga' }, r.anuncios.semVendaExemplos.map((i) => h('li', {},
        i.link ? h('a', { className: 'mlp-link', attrs: { href: i.link, target: '_blank', rel: 'noopener' } }, i.titulo) : h('span', {}, i.titulo),
        h('strong', {}, reais(i.preco) + ' · ' + plural(i.estoque, 'unidade', 'unidades'))))),
    ],
  });
}

/**
 * Por que um bloco não apareceu. Cada um depende de um dado que pode não vir
 * (conta nova, período sem venda, consulta que o ML recusou) — e sumir calado
 * faz parecer que o recurso não existe.
 * @param {Resumo} r @param {Pendencias | null} p
 */
function oQueFaltou(r, p) {
  const v = r.vendas;
  const faltas = [];
  const semVendas = v.pedidos === 0;

  if (!r.comparacao || r.comparacao.receita == null) {
    faltas.push(['Comparação com o período anterior', semVendas
      ? 'sem pedidos no período atual.'
      : 'não houve faturamento nos ' + r.periodo.dias + ' dias anteriores, então não há com o que comparar.']);
  }
  if (!r.projecao) {
    faltas.push(['Projeção do mês', 'o período carregado não cobre o mês inteiro (escolha 30 dias ou mais), ou o mês começou há menos de três dias.']);
  }
  if (!v.porDiaSemana || !v.porDiaSemana.some((n) => n > 0)) {
    faltas.push(['Quando a sua loja vende', 'nenhum pedido pago no período.']);
  }
  if (v.topItens.length && v.topItens.every((i) => i.visitas == null)) {
    faltas.push(['Visitas e conversão por anúncio', 'o Mercado Livre não devolveu as visitas destes anúncios agora.']);
  }
  if (v.topItens.length && v.topItens.every((i) => i.comissaoUn == null)) {
    faltas.push(['Lucro por anúncio', 'o Mercado Livre não devolveu a comissão cobrada nestes pedidos.']);
  }
  if (!v.anunciosPara80) {
    faltas.push(['Curva ABC (80% do faturamento)', semVendas ? 'sem vendas no período.' : 'ainda sem faturamento para distribuir.']);
  }
  if (!r.anuncios.semVenda) {
    faltas.push(['Estoque parado', 'todos os seus anúncios ativos venderam no período — ou o ML não devolveu a lista de ativos.']);
  }
  if (!v.clientes || !v.clientes.total) {
    faltas.push(['Clientes que voltaram a comprar', 'sem compradores no período.']);
  }
  if (v.cancelados == null) {
    faltas.push(['Pedidos cancelados', 'o Mercado Livre não devolveu os cancelados agora.']);
  }
  if (catalogoEmPrejuizo(p) == null) {
    faltas.push(['Catálogo em prejuízo', estado.catalogoMargemCarregando
      ? 'calculando agora (pode levar até um minuto) — a lista atualiza sozinha quando terminar.'
      : p && p.catalogoItens && p.catalogoItens.some((i) => i.status === 'winning')
        ? 'não foi possível calcular agora. Atualize o Painel para tentar de novo.'
        : 'nenhum anúncio ganhando a disputa de catálogo agora, ou o monitor de catálogo não respondeu.']);
  }
  if (patrocinadosEmPrejuizo() == null) {
    faltas.push(['Patrocinados em prejuízo', estado.adsPainelCarregando
      ? 'calculando agora (pode levar até um minuto) — a lista atualiza sozinha quando terminar.'
      : 'não foi possível calcular agora (sem anúncio em Product Ads, ou o Mercado Livre não respondeu). Atualize o Painel para tentar de novo.']);
  }

  if (!faltas.length) return null;
  return h('details', { className: 'mlp-faltas' },
    h('summary', {}, plural(faltas.length, 'bloco não apareceu', 'blocos não apareceram') + ' nesta carga — ver por quê'),
    h('ul', { className: 'mlp-lista mlp-lista--larga' }, faltas.map(([nome, motivo]) => h('li', {},
      h('span', {}, nome), h('strong', {}, motivo)))));
}

/** @param {Resumo} r */
function conta(r) {
  const c = r.conta;
  if (!c) return null;
  const nivel = c.reputacao ? REPUTACAO[c.reputacao] : null;
  const lider = c.mercadoLider ? MERCADO_LIDER[c.mercadoLider] : null;
  const v = r.vendas;

  // Sem pintar de vermelho por limite: cada uma dessas taxas tem um teto
  // diferente no Mercado Livre, e um número só serviria para dar alarme falso.
  /** @param {string} rotulo @param {string} valor @param {string} dica */
  const linha = (rotulo, valor, dica) => h('div', { className: 'mlp-taxa', attrs: { title: dica } },
    h('span', {}, rotulo), h('strong', {}, valor));

  const clientes = v.clientes || { total: 0, recorrentes: 0 };
  const taxaCancelamento = v.cancelados != null && v.pedidos + v.cancelados > 0
    ? v.cancelados / (v.pedidos + v.cancelados)
    : null;

  return Card({
    eyebrow: 'Sua conta no Mercado Livre',
    title: c.nickname || 'Conta conectada',
    children: [
      h('div', { className: 'mlp-selos' },
        nivel ? Badge({ tone: nivel.tom, dot: true, children: 'Reputação ' + nivel.rotulo }) : Badge({ tone: 'neutral', children: 'Reputação não informada' }),
        lider ? Badge({ tone: 'accent', children: lider }) : null,
        r.anuncios.ativos != null ? Badge({ tone: 'neutral', children: plural(r.anuncios.ativos, 'anúncio ativo', 'anúncios ativos') }) : null,
        r.anuncios.pausados ? Badge({ tone: 'warning', children: plural(r.anuncios.pausados, 'pausado', 'pausados') }) : null),
      h('div', { className: 'mlp-taxas' },
        linha('Reclamações', pct(c.reclamacoes), 'Reclamações abertas sobre as suas vendas, em % dos pedidos. É a taxa que mais pesa no termômetro.'),
        linha('Envios com atraso', pct(c.atrasos), 'Pedidos despachados fora do prazo, em % dos envios.'),
        linha('Cancelamentos por você', pct(c.cancelamentos), 'Vendas canceladas por sua iniciativa, em % dos pedidos.'),
        linha('Pedidos cancelados no período', v.cancelados == null ? '—' : num(v.cancelados) + (taxaCancelamento ? ' · ' + pct(taxaCancelamento, 1) : ''),
          'Pedidos do período que acabaram cancelados, por qualquer motivo.'),
        linha('Compradores no período', num(clientes.total), 'Quantas pessoas diferentes compraram de você no período.'),
        linha('Compraram mais de uma vez', num(clientes.recorrentes)
          + (clientes.total > 0 ? ' · ' + pct(clientes.recorrentes / clientes.total, 1) : ''),
        'Clientes com dois ou mais pedidos no período — a recompra da sua loja.')),
      c.vendasConcluidas
        ? h('p', { className: 'mlp-nota' }, num(c.vendasConcluidas) + ' vendas concluídas na conta, desde sempre.')
        : null,
    ],
  });
}

// ── Tela ──────────────────────────────────────────────────────────────

function tela() {
  const r = estado.resumo;
  const atualizado = estado.em ? new Date(estado.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

  // Resumo de formato antigo (cache de antes da atualização): busca de novo
  // sozinha, senão os blocos novos ficariam faltando sem explicação.
  if (r && r.versao !== VERSAO && !estado.carregando) setTimeout(buscar, 0);

  const topo = h('div', { className: 'mlp-topo' },
    h('div', {},
      h('h2', { className: 'mlp-h' }, 'Painel do Mercado Livre'),
      h('p', { className: 'mlp-sub' }, r
        ? 'Últimos ' + r.periodo.dias + ' dias, de ' + diaCurto(r.periodo.de) + ' a ' + diaCurto(r.periodo.ate)
          + ' · comparado com ' + diaCurto(r.anterior.de) + ' a ' + diaCurto(r.anterior.ate)
          + (atualizado ? ' · dados das ' + atualizado : '')
        : 'Vendas, reputação e pendências da sua conta, em uma tela.')),
    h('div', { className: 'mlp-acoes' },
      SegmentedControl({
        options: PERIODOS.map((d) => ({ value: String(d), label: d + ' dias' })),
        value: String(estado.dias),
        onChange: (v) => trocarPeriodo(Number(v)),
      }),
      Button({ variant: 'outline', iconLeft: 'refresh', children: estado.carregando ? 'Atualizando…' : 'Atualizar',
        disabled: estado.carregando, on: { click: () => { buscar(); } } })));

  if (estado.erro && !r) return h('div', { className: 'mlp' }, topo, Alert({ tone: 'danger', title: 'Não foi possível carregar o painel', children: estado.erro }));
  if (!r) {
    return h('div', { className: 'mlp' }, topo, Card({ children: [
      h('div', { className: 'mlp-carregando' },
        h('span', { className: 'mlp-girando', attrs: { 'aria-hidden': 'true' } }),
        h('div', {},
          h('div', { className: 'mlp-tarefa' }, estado.carregando ? 'Buscando os seus dados no Mercado Livre…' : 'Pronto para buscar os seus dados.'),
          h('p', { className: 'mlp-texto' }, 'A primeira busca leva até um minuto: o painel lê os pedidos de dois períodos, '
            + 'o seu perfil, as visitas, as perguntas, o estoque e o frete dos envios direto no Mercado Livre. Depois disso, fica guardado por '
            + CACHE_MINUTOS + ' minutos e abre na hora.'))),
      estado.carregando ? null : Button({ variant: 'outline', iconLeft: 'refresh', children: 'Buscar agora', on: { click: () => { buscar(); } } }),
    ] }));
  }

  return h('div', { className: 'mlp' },
    topo,
    estado.erro ? Alert({ tone: 'warning', title: 'Mostrando os últimos dados carregados', children: estado.erro }) : null,
    r.vendas.parcial
      ? Alert({ tone: 'info', title: 'Muitos pedidos no período',
        children: 'A conta usou os pedidos mais recentes; os mais antigos podem ter ficado de fora. Escolha um período menor para ver tudo.' })
      : null,
    numeros(r),
    precisaDeVoce(r, estado.pendencias),
    grafico(r),
    quandoVende(r),
    maisVendidos(r),
    parados(r),
    conta(r),
    oQueFaltou(r, estado.pendencias));
}

function desenhar() {
  const raiz = document.getElementById('ml-painel-raiz');
  if (!raiz) return;
  try {
    raiz.replaceChildren(tela());
  } catch (e) {
    // Tela em branco é o pior desfecho possível: sem isso, um erro em um bloco
    // apagava o painel inteiro e nem o botão de atualizar sobrava.
    console.error('[Impoclick] falha ao desenhar o painel do Mercado Livre:', e);
    raiz.replaceChildren(Alert({
      tone: 'danger', title: 'O painel não conseguiu montar a tela',
      children: 'Recarregue a página (F5). Se continuar, me avise: ' + (e instanceof Error ? e.message : String(e)),
    }));
  }
}

async function abrir() {
  const cache = lerCache(estado.dias);
  if (cache && !estado.resumo) {
    estado.resumo = cache.resumo;
    estado.pendencias = cache.pendencias;
    estado.em = cache.em;
  }
  desenhar();
  carregarCustos();
  buscarMargemCatalogo();
  buscarPainelAdsSeNecessario();
  if (!cache) await buscar();
}

// O período escolhido da última vez volta na próxima visita.
try {
  const guardado = Number(localStorage.getItem(PERIODO_GUARDADO));
  if (PERIODOS.includes(guardado)) estado.dias = guardado;
} catch { /* sem armazenamento */ }

document.addEventListener('impoclick:tela', (e) => {
  const d = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (d && d.id === 'view-ml-painel') abrir();
});

// Rede de segurança: o clique no item do menu também abre o painel. Se o
// evento de troca de tela não chegar (ordem de carga, versão antiga do app.js
// em cache), a tela ainda monta em vez de ficar em branco.
document.addEventListener('click', (e) => {
  const alvo = e.target;
  if (alvo instanceof Element && alvo.closest('[data-view="view-ml-painel"]')) setTimeout(abrir, 0);
});

// E o esqueleto (cabeçalho, aviso e botão) aparece assim que a página carrega,
// sem depender de evento nenhum.
desenhar();
