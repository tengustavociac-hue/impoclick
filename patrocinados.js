// @ts-check
/**
 * Painel de Patrocinados: os anúncios ativos em Product Ads da conta, com a
 * margem depois da publicidade e o que fazer em cada um.
 *
 * Os números de publicidade e a economia de cada anúncio (preço praticado,
 * comissão e frete cobrados nas vendas) vêm do servidor
 * (/api/ml-reviews?resource=ads-painel). O custo do produto e o imposto vêm do
 * vendedor; a conta de margem e os diagnósticos ficam em
 * patrocinados-regras.js e são refeitos aqui, sem voltar ao Mercado Livre.
 */
import {
  Card, Stat, Badge, Button, IconButton, Input, Alert, EmptyState, h,
} from './design-system/components/index.js';
import { contaDoAnuncio, diagnosticar, diagnosticarCampanha, mediana, roasParaDigitar, ORDEM } from './patrocinados-regras.js';
import { conexaoMercadoLivre, precisaConectar } from './ml-conexao.js';

/**
 * @typedef {import('./patrocinados-regras.js').AnuncioBruto & { thumbnail?: string | null, permalink?: string | null, logistica?: string | null }} Anuncio
 * @typedef {import('./patrocinados-regras.js').Campanha & { orcamentoAutomatico?: boolean }} Campanha
 * @typedef {import('./patrocinados-regras.js').Diagnostico} Diagnostico
 * @typedef {{ a: Anuncio, c: import('./patrocinados-regras.js').Conta, camp: Campanha | undefined, diagnosticos: Diagnostico[] }} Linha
 * @typedef {{ ok: boolean, motivo?: string, mensagem?: string, periodo?: { de: string, ate: string, dias: number },
 *   campanhas?: Campanha[], anuncios?: Anuncio[], avisos?: { pedidosParciais?: boolean } }} Painel
 */

const CACHE = 'impoclick-ads-painel';
const CACHE_HORAS = 6;
const MARGEM_MINIMA = 'impoclick-ads-margem-minima';

/** @type {{ painel: Painel | null, em: number | null, custos: Record<string, number>, impostoPct: number,
 *   margemMinimaPct: number, erroCustos: string | null, abertos: Set<string>, carregando: boolean,
 *   premissasAbertas: boolean, graficoTodos: boolean }} */
const estado = {
  painel: null, em: null, custos: {}, impostoPct: 0, margemMinimaPct: 10,
  erroCustos: null, abertos: new Set(), carregando: false, premissasAbertas: false, graficoTodos: false,
};

// Quantos anúncios o gráfico de resultado mostra antes de "ver todos": os de
// maior valor, para cima ou para baixo, que é onde está o dinheiro.
const GRAFICO_MAX = 10;

// ── Formatação ────────────────────────────────────────────────────────

/** @param {number} v @param {number} [casas] */
const num = (v, casas = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (/** @type {number} */ v) => 'R$ ' + num(v, 2);
/** Com sinal na frente do R$: "−R$ 0,74", nunca "R$ -0,74". @param {number} v */
const dinheiro = (v) => (v < -0.005 ? '−' : '') + 'R$ ' + num(Math.abs(v), 2);
/** @param {number} n @param {string} um @param {string} varios */
const plural = (n, um, varios) => num(n, 0) + ' ' + (n === 1 ? um : varios);
/** Classe do valor pelo sinal: o "−" já diz, a cor só reforça. @param {number | null} v */
const tomDoValor = (v) => (v == null ? '' : v < -0.005 ? ' pa-ruim' : v > 0.005 ? ' pa-bom' : '');
const diasDoPeriodo = () => (estado.painel && estado.painel.periodo ? estado.painel.periodo.dias : 30);
// O mesmo sinal de menos dos valores em reais ("−9,2%", não "-9,2%").
const pct = (/** @type {number | null} */ v) => (v == null ? '—' : num(v * 100).replace('-', '−') + '%');
const vezes = (/** @type {number | null} */ v) => (v == null ? '—' : num(v) + '×');
/** @param {string} iso */
const dataCurta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

const ESTRATEGIA = { PROFITABILITY: 'Rentabilidade', INCREASE: 'Crescimento', VISIBILITY: 'Visibilidade' };
const TOM = /** @type {const} */ ({ critico: 'danger', atencao: 'warning', pendente: 'neutral', oportunidade: 'accent', ok: 'success' });
// "Crítico", e não "Prejuízo": o nível mais grave também cobre o anúncio
// que nem aparece (estoque com prazo), que não é perda de margem.
const ROTULO = { critico: 'Crítico', atencao: 'Atenção', pendente: 'Falta custo', oportunidade: 'Oportunidade', ok: 'Saudável' };

// ── Dados ─────────────────────────────────────────────────────────────

function lerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c && Date.now() - c.em < CACHE_HORAS * 3600000) return c;
  } catch { /* cache ilegível: busca de novo */ }
  return null;
}

async function buscarPainel() {
  estado.carregando = true;
  desenhar();
  const api = /** @type {any} */ (window).mlApiFetch;
  // Até 60 s: o servidor lê anúncios, campanhas, pedidos e envios do ML.
  const r = typeof api === 'function' ? await api('/api/ml-reviews?resource=ads-painel', 60000) : null;
  estado.carregando = false;
  if (r) {
    estado.painel = r;
    estado.em = Date.now();
    try { localStorage.setItem(CACHE, JSON.stringify({ em: estado.em, painel: r })); } catch { /* sem armazenamento */ }
  } else if (!estado.painel) {
    estado.painel = { ok: false, motivo: 'erro', mensagem: 'Não foi possível falar com o servidor agora. Tente atualizar em instantes.' };
  }
  desenhar();
}

async function buscarCustos() {
  const db = /** @type {any} */ (window).db;
  if (!db || typeof db.getAdsMargemDados !== 'function') return;
  const r = await db.getAdsMargemDados();
  if (r.erro) {
    estado.erroCustos = r.erro;
    if (r.erro === 'sem_tabela') console.warn('[Impoclick] tabelas do painel de Patrocinados não existem: rode supabase/ml_ads_margem.sql no SQL Editor do Supabase.');
    return;
  }
  estado.custos = r.dados.custos || {};
  if (r.dados.impostoPct != null) estado.impostoPct = r.dados.impostoPct;
}

/** @param {string} texto */
function lerNumero(texto) {
  const v = Number(String(texto).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** @param {string} itemId @param {string} texto */
async function salvarCusto(itemId, texto) {
  const valor = String(texto).trim() === '' ? null : lerNumero(texto);
  if (valor == null && String(texto).trim() !== '') return;
  if (valor == null) delete estado.custos[itemId]; else estado.custos[itemId] = valor;
  desenhar();
  const db = /** @type {any} */ (window).db;
  if (db && typeof db.saveItemCost === 'function') {
    const r = await db.saveItemCost(itemId, valor);
    if (r && r.erro) { estado.erroCustos = r.erro; desenhar(); }
  }
}

// ── Cálculo da tela ───────────────────────────────────────────────────

function calcular() {
  const p = estado.painel;
  const anuncios = (p && p.anuncios) || [];
  const campanhas = (p && p.campanhas) || [];
  const porId = new Map(campanhas.map((c) => [c.id, c]));
  // Medianas da própria conta: CTR e conversão bons variam muito por
  // categoria, então a comparação é com os outros anúncios do vendedor.
  const referencia = {
    ctr: mediana(anuncios.filter((a) => a.metricas.impressoes >= 500).map((a) => a.metricas.ctr)),
    cvr: mediana(anuncios.filter((a) => a.metricas.cliques >= 20).map((a) => a.metricas.cvr)),
  };
  const linhas = anuncios.map((a) => {
    const premissas = { custoUn: estado.custos[a.itemId], impostoPct: estado.impostoPct, margemMinimaPct: estado.margemMinimaPct };
    const c = contaDoAnuncio(a, premissas);
    const camp = a.campanhaId != null ? porId.get(a.campanhaId) : undefined;
    return { a, c, camp, diagnosticos: diagnosticar(a, c, camp, referencia, premissas) };
  }).sort((x, y) => ORDEM[x.diagnosticos[0].nivel] - ORDEM[y.diagnosticos[0].nivel] || y.a.metricas.investimento - x.a.metricas.investimento);

  const campanhasCalc = campanhas.map((camp) => ({
    camp,
    linhas: linhas.filter((l) => l.a.campanhaId === camp.id),
    diagnosticos: diagnosticarCampanha(camp, linhas.filter((l) => l.a.campanhaId === camp.id)),
  }));
  return { linhas, campanhasCalc };
}

// ── Seções ────────────────────────────────────────────────────────────

/** @param {ReturnType<typeof calcular>} calc */
function numeros(calc) {
  const soma = (/** @type {(l: any) => number} */ f) => calc.linhas.reduce((acc, l) => acc + (f(l) || 0), 0);
  const investimento = soma((l) => l.a.metricas.investimento);
  const receitaAds = soma((l) => l.a.metricas.receitaAds);
  const comCusto = calc.linhas.filter((l) => l.c.lucroPosAds != null);
  const resultado = (/** @type {Linha} */ l) => /** @type {number} */ (l.c.lucroPosAds);
  const lucro = comCusto.reduce((acc, l) => acc + resultado(l), 0);
  const noPrejuizo = comCusto.filter((l) => resultado(l) < 0);
  const gastoNoPrejuizo = noPrejuizo.reduce((acc, l) => acc + l.a.metricas.investimento, 0);
  const semCusto = calc.linhas.length - comCusto.length;

  /** @param {string} rotulo @param {string} valor @param {string} nota @param {string} [fracao] */
  const cartao = (rotulo, valor, nota, fracao) => Card({ compact: true, children: [
    Stat({ label: rotulo, size: 'sm', value: valor, fraction: fracao }),
    h('p', { className: 'pa-nota' }, nota),
  ] });

  return h('div', { className: 'pa-numeros' },
    cartao('Gasto com anúncios', reais(investimento), 'Soma de todos os anúncios nos ' + diasDoPeriodo() + ' dias.'),
    cartao('Vendas que os anúncios trouxeram', reais(receitaAds),
      investimento > 0 ? 'Cada R$ 1 gasto trouxe ' + reais(receitaAds / investimento) + ' em vendas.' : 'Sem gasto no período.'),
    cartao('Lucro depois dos anúncios', comCusto.length ? dinheiro(lucro) : '—',
      !comCusto.length ? 'Informe o custo dos produtos na lista para calcular.'
        : semCusto ? 'Em ' + comCusto.length + ' de ' + calc.linhas.length + ' anúncios; os outros ainda estão sem custo.'
          : 'Todas as vendas desses produtos, menos o gasto com anúncio.'),
    cartao('Anúncios dando prejuízo', comCusto.length ? String(noPrejuizo.length) : '—',
      !comCusto.length ? 'Informe o custo dos produtos na lista.'
        : noPrejuizo.length ? reais(gastoNoPrejuizo) + ' de gasto com anúncio neles.' : 'Nenhum no período.',
      comCusto.length ? ' de ' + comCusto.length : undefined));
}

/**
 * Gráfico: o resultado de cada anúncio no período, prejuízo à esquerda e
 * lucro à direita do zero, numa escala só. Barras horizontais porque o nome
 * do produto é longo; valor escrito ao lado de cada barra, em cor de texto.
 * A tabela logo abaixo tem os mesmos números: é a versão em texto dele.
 * @param {ReturnType<typeof calcular>} calc
 */
function graficoResultados(calc) {
  const resultado = (/** @type {Linha} */ l) => /** @type {number} */ (l.c.lucroPosAds);
  const comCusto = calc.linhas.filter((l) => l.c.lucroPosAds != null);
  if (!comCusto.length) return null;

  const porPeso = [...comCusto].sort((x, y) => Math.abs(resultado(y)) - Math.abs(resultado(x)));
  const visiveis = (estado.graficoTodos ? porPeso : porPeso.slice(0, GRAFICO_MAX))
    .sort((x, y) => resultado(x) - resultado(y));
  const maiorPrejuizo = Math.max(0, ...visiveis.map((l) => -resultado(l)));
  const maiorLucro = Math.max(0, ...visiveis.map((l) => resultado(l)));
  const escala = maiorPrejuizo + maiorLucro || 1;
  const zero = (maiorPrejuizo / escala) * 100;

  const barras = visiveis.map((l) => {
    const v = resultado(l);
    const largura = (Math.abs(v) / escala) * 100;
    const inicio = v < 0 ? zero - largura : zero;
    const descricao = l.a.titulo + ': ' + (v < 0 ? 'prejuízo de ' : 'lucro de ') + reais(Math.abs(v)) + ' em ' + diasDoPeriodo() + ' dias';
    return h('button', {
      className: 'pa-grafico__linha',
      attrs: { type: 'button', title: descricao, 'aria-label': descricao + '. Abrir a conta deste anúncio.' },
      on: { click: () => abrirAnuncio(l.a.itemId) },
    },
    h('span', { className: 'pa-grafico__nome' }, l.a.titulo),
    h('span', { className: 'pa-grafico__trilho' },
      h('span', { className: 'pa-grafico__zero', style: { left: zero + '%' } }),
      h('span', {
        className: 'pa-grafico__barra ' + (v < 0 ? 'is-prejuizo' : 'is-lucro'),
        style: { left: inicio + '%', width: Math.max(largura, 0.6) + '%' },
      })),
    h('span', { className: 'pa-grafico__valor' + tomDoValor(v) }, dinheiro(v)));
  });

  const escondidos = porPeso.length - visiveis.length;
  return Card({
    eyebrow: 'Resultado de cada anúncio · ' + diasDoPeriodo() + ' dias',
    title: 'Quem dá lucro e quem dá prejuízo',
    children: [
      h('p', { className: 'pa-texto' }, 'Lucro de todas as vendas de cada produto no período, já descontado o gasto com anúncio. '
        + 'Clique numa barra para ver a conta.'),
      h('ul', { className: 'pa-legenda', attrs: { 'aria-label': 'Legenda' } },
        h('li', {}, h('i', { className: 'is-prejuizo' }), 'Prejuízo'),
        h('li', {}, h('i', { className: 'is-lucro' }), 'Lucro')),
      h('div', { className: 'pa-grafico' }, barras),
      escondidos > 0 || estado.graficoTodos
        ? Button({
          variant: 'ghost', size: 'sm',
          children: estado.graficoTodos ? 'Mostrar só os ' + GRAFICO_MAX + ' maiores' : 'Ver todos os ' + porPeso.length + ' anúncios',
          on: { click: () => { estado.graficoTodos = !estado.graficoTodos; desenhar(); } },
        })
        : null,
      comCusto.length < calc.linhas.length
        ? h('p', { className: 'pa-nota' }, plural(calc.linhas.length - comCusto.length, 'anúncio fica', 'anúncios ficam') + ' de fora por estar sem custo.')
        : null,
    ],
  });
}

/** Abre o anúncio na lista e rola até ele — o clique vindo do gráfico. @param {string} itemId */
function abrirAnuncio(itemId) {
  estado.abertos.add(itemId);
  desenhar();
  const alvo = document.querySelector('.pa-anuncio[data-item="' + CSS.escape(itemId) + '"]');
  if (alvo) {
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const botao = alvo.querySelector('.pa-linha button');
    if (botao instanceof HTMLElement) botao.focus({ preventScroll: true });
  }
}

/** @param {ReturnType<typeof calcular>} calc */
function oQueFazer(calc) {
  /** @type {Array<{ d: Diagnostico, onde: string }>} */
  const todos = [];
  // Um item por anúncio, o mais grave: "gasto sem venda" e "margem negativa"
  // costumam ser o mesmo problema visto de dois lados, e repetir o anúncio
  // empurrava outros para fora da lista. O detalhe completo fica no anúncio.
  calc.linhas.forEach((l) => {
    const d = l.diagnosticos.find((x) => x.nivel !== 'ok' && x.nivel !== 'pendente');
    if (d) todos.push({ d, onde: l.a.titulo });
  });
  calc.campanhasCalc.forEach((cc) => cc.diagnosticos.forEach((d) => todos.push({ d, onde: 'Campanha "' + cc.camp.nome + '"' })));
  const top = todos.sort((x, y) => ORDEM[x.d.nivel] - ORDEM[y.d.nivel] || y.d.emJogo - x.d.emJogo).slice(0, 6);

  if (!top.length) {
    return Card({ eyebrow: 'O que fazer agora', title: 'Nada urgente',
      children: h('p', { className: 'pa-texto' }, 'Nenhum anúncio com prejuízo ou gasto sem venda no período. Acompanhe semanalmente.') });
  }
  return Card({
    eyebrow: 'O que fazer agora',
    title: 'Por ordem de dinheiro em jogo',
    children: h('ol', { className: 'pa-acoes' }, top.map(({ d, onde }) => h('li', {},
      Badge({ tone: TOM[d.nivel], dot: true, children: ROTULO[d.nivel] }),
      h('div', {},
        h('div', { className: 'pa-acoes__titulo' }, d.titulo, h('span', { className: 'pa-acoes__onde' }, ' · ' + onde)),
        h('p', { className: 'pa-texto' }, d.acao))))),
  });
}

/** @param {{ camp: Campanha, linhas: Linha[], diagnosticos: Diagnostico[] }} cc */
function cartaoCampanha(cc) {
  const { camp } = cc;
  const m = camp.metricas;
  const ganhas = m.impressoesGanhas;
  const temCompetitividade = ganhas != null && m.perdidasOrcamento != null && m.perdidasRanking != null;
  /** @param {number | null} v */
  const largura = (v) => ({ width: Math.max(0, Math.min(100, (v || 0) * 100)) + '%' });

  return Card({
    compact: true,
    eyebrow: ESTRATEGIA[/** @type {keyof typeof ESTRATEGIA} */ (camp.estrategia)] || camp.estrategia || 'Campanha',
    title: camp.nome,
    children: [
      h('dl', { className: 'pa-kv' },
        h('div', {}, h('dt', {}, 'ROAS pedido na campanha'), h('dd', {}, vezes(camp.roasObjetivo))),
        h('div', {}, h('dt', {}, 'ROAS alcançado'), h('dd', {}, m.roas ? vezes(m.roas) + ' · R$ ' + num(m.roas, 2) + ' por R$ 1' : '—')),
        h('div', {}, h('dt', {}, 'Orçamento'), h('dd', {}, reais(camp.orcamentoDiario) + '/dia')),
        h('div', {}, h('dt', {}, 'Gasto'), h('dd', {}, reais(m.investimento)))),
      temCompetitividade
        ? h('div', { className: 'pa-compet' },
          h('div', { className: 'pa-compet__barra', attrs: { role: 'img', 'aria-label': 'Impressões ganhas ' + pct(ganhas) + ', perdidas por orçamento ' + pct(m.perdidasOrcamento) + ', perdidas por ranking ' + pct(m.perdidasRanking) } },
            h('span', { className: 'pa-compet__ganhas', style: largura(ganhas) }),
            h('span', { className: 'pa-compet__orcamento', style: largura(m.perdidasOrcamento) }),
            h('span', { className: 'pa-compet__ranking', style: largura(m.perdidasRanking) })),
          h('ul', { className: 'pa-compet__legenda' },
            h('li', {}, h('i', { className: 'pa-compet__ganhas' }), 'Ganhas ' + pct(ganhas)),
            h('li', {}, h('i', { className: 'pa-compet__orcamento' }), 'Perdidas por orçamento ' + pct(m.perdidasOrcamento)),
            h('li', {}, h('i', { className: 'pa-compet__ranking' }), 'Por ranking ' + pct(m.perdidasRanking))))
        : null,
      cc.diagnosticos.length
        ? h('ul', { className: 'pa-diag' }, cc.diagnosticos.map((d) => h('li', {},
          Badge({ tone: TOM[d.nivel], dot: true, children: d.titulo }),
          h('p', { className: 'pa-texto' }, d.detalhe + ' ' + d.acao))))
        : null,
    ],
  });
}

function cabecalhoLista() {
  return h('div', { className: 'pa-linha pa-linha--cabecalho' },
    h('span', {}, 'Produto'),
    h('span', {}, 'Custo do produto (R$)'),
    h('span', { className: 'pa-dir' }, 'Sobra por venda'),
    h('span', { className: 'pa-dir' }, 'Margem pós ads'),
    h('span', { className: 'pa-dir' }, 'Gasto com anúncio'),
    h('span', { className: 'pa-dir' }, 'Resultado ' + diasDoPeriodo() + ' dias'),
    h('span', {}, 'Situação'),
    h('span', {}));
}

/**
 * Uma linha do extrato: rótulo, barra do tamanho do valor e o valor.
 * @param {{ rotulo: string, nota?: string, valor: string, largura?: number | null, tipo?: 'preco' | 'custo' | 'lucro' | 'prejuizo', total?: boolean, sinal?: number | null }} o
 */
function linhaExtrato(o) {
  return h('div', { className: 'pa-ext__linha' + (o.total ? ' is-total' : '') },
    h('span', { className: 'pa-ext__rotulo' }, o.rotulo, o.nota ? h('small', {}, o.nota) : null),
    h('span', { className: 'pa-ext__trilho' },
      o.largura != null && o.largura > 0
        ? h('span', { className: 'pa-ext__barra is-' + (o.tipo || 'custo'), style: { width: Math.min(100, o.largura) + '%' } })
        : null),
    h('span', { className: 'pa-ext__valor' + tomDoValor(o.sinal == null ? null : o.sinal) }, o.valor));
}

/**
 * "A conta de uma venda": o preço e tudo o que sai dele, até o que sobra. As
 * barras são proporcionais ao preço — mostram de relance o que mais pesa.
 * @param {Linha} l
 */
function extrato(l) {
  const { a, c } = l;
  const e = a.economia;
  const preco = e.precoMedio || a.preco;
  const custo = estado.custos[a.itemId];
  const imposto = preco * (estado.impostoPct / 100);
  const escala = Math.max(preco, e.freteUn || 0, custo || 0, e.comissaoUn || 0, 0.01);
  const fatia = (/** @type {number} */ v) => (v / escala) * 100;
  const doPreco = (/** @type {number} */ v) => ' · ' + num((v / preco) * 100, 0) + '% do preço';

  const linhas = [
    linhaExtrato({ rotulo: 'Preço praticado', nota: e.comissaoFonte === 'vendas' ? 'média das vendas' : 'preço do anúncio',
      valor: reais(preco), largura: fatia(preco), tipo: 'preco' }),
    linhaExtrato({ rotulo: '− Comissão do Mercado Livre',
      nota: e.comissaoUn == null ? 'sem dado' : (e.comissaoFonte === 'vendas' ? 'cobrada nas vendas' : 'tabela do ML') + doPreco(e.comissaoUn),
      valor: e.comissaoUn == null ? '—' : reais(e.comissaoUn), largura: e.comissaoUn == null ? null : fatia(e.comissaoUn) }),
    linhaExtrato({ rotulo: '− Frete',
      nota: e.freteUn == null ? 'sem dado'
        : e.freteUn === 0 ? 'o comprador paga'
          : (e.freteFonte === 'vendas' ? 'pago em ' + plural(e.amostrasFrete, 'envio recente', 'envios recentes') : 'cotação do ML') + doPreco(e.freteUn),
      valor: e.freteUn == null ? '—' : reais(e.freteUn), largura: e.freteUn == null ? null : fatia(e.freteUn) }),
    linhaExtrato({ rotulo: '− Imposto (' + num(estado.impostoPct, 1) + '%)', nota: 'ajuste nas premissas, acima',
      valor: reais(imposto), largura: fatia(imposto) }),
    linhaExtrato({ rotulo: '− Custo do produto', nota: custo == null ? 'digite na coluna "Custo do produto"' : doPreco(custo).slice(3),
      valor: custo == null ? '—' : reais(custo), largura: custo == null ? null : fatia(custo) }),
  ];

  if (c.margemUn == null) {
    linhas.push(linhaExtrato({ rotulo: '= Sobra por venda', nota: 'falta o custo do produto', valor: '—', total: true }));
    return h('div', { className: 'pa-ext' }, linhas);
  }

  linhas.push(linhaExtrato({ rotulo: '= Sobra por venda', nota: 'antes de pagar o anúncio', valor: dinheiro(c.margemUn),
    largura: fatia(Math.abs(c.margemUn)), tipo: c.margemUn < 0 ? 'prejuizo' : 'lucro', total: true, sinal: c.margemUn }));

  if (c.custoAdsPorVenda != null) {
    const viaAnuncio = c.margemUn - c.custoAdsPorVenda;
    linhas.push(
      linhaExtrato({ rotulo: '− Anúncio por venda', nota: 'gasto ÷ ' + plural(a.metricas.unidadesAds, 'venda', 'vendas') + ' do anúncio',
        valor: reais(c.custoAdsPorVenda), largura: fatia(c.custoAdsPorVenda) }),
      linhaExtrato({ rotulo: '= Cada venda que veio do anúncio', valor: dinheiro(viaAnuncio),
        largura: fatia(Math.abs(viaAnuncio)), tipo: viaAnuncio < 0 ? 'prejuizo' : 'lucro', total: true, sinal: viaAnuncio }));
  }
  return h('div', { className: 'pa-ext' }, linhas);
}

/** A conta do período inteiro, que fecha no "Resultado" da tabela. @param {Linha} l */
function resultadoPeriodo(l) {
  const { a, c } = l;
  const m = a.metricas;
  if (c.margemUn == null || c.lucroPosAds == null) return null;
  const linha = (/** @type {string} */ rotulo, /** @type {string} */ valor, /** @type {number | null} */ sinal, total = false) =>
    h('div', { className: 'pa-conta__linha' + (total ? ' is-total' : '') }, h('span', {}, rotulo), h('span', { className: tomDoValor(sinal).trim() }, valor));
  return h('div', { className: 'pa-conta' },
    h('h4', { className: 'pa-h4' }, 'Resultado em ' + diasDoPeriodo() + ' dias'),
    linha('Sobra por venda × ' + plural(c.unidadesTotais, 'venda', 'vendas')
      + ' (' + num(m.unidadesAds, 0) + ' pelo anúncio + ' + num(m.unidadesOrganicas, 0) + ' sem anúncio)',
    dinheiro(c.margemUn * c.unidadesTotais), c.margemUn),
    linha('− Gasto com anúncio', reais(m.investimento), null),
    linha('= Resultado' + (c.margemPosAdsPct == null ? '' : ' · margem pós ads de ' + pct(c.margemPosAdsPct)),
      dinheiro(c.lucroPosAds), c.lucroPosAds, true));
}

/** O anúncio em frases, sem sigla solta. @param {Linha} l */
function desempenho(l) {
  const { a, c } = l;
  const m = a.metricas;
  const frases = [
    'Gastou ' + reais(m.investimento) + '.',
    m.impressoes > 0
      ? 'Apareceu ' + num(m.impressoes, 0) + ' vezes e recebeu ' + plural(m.cliques, 'clique', 'cliques') + ' (' + num(m.ctr, 2) + '% de quem viu clicou).'
      : 'Ainda não apareceu no período.',
    m.cliques > 0
      ? num(m.cvr, 2) + '% dos cliques viraram venda: ' + plural(m.unidadesAds, 'venda', 'vendas') + ' pelo anúncio, fora '
        + plural(m.unidadesOrganicas, 'venda', 'vendas') + ' que vieram sem anúncio.'
      : null,
    m.roas > 0
      ? 'Cada R$ 1 gasto trouxe ' + reais(m.roas) + ' em vendas (ROAS ' + vezes(m.roas) + ').'
      : m.investimento > 0 ? 'O gasto ainda não trouxe nenhuma venda.' : null,
    c.roasEquilibrio != null
      ? 'Para o anúncio não dar prejuízo, cada R$ 1 precisa trazer ' + reais(c.roasEquilibrio) + ' (ROAS ' + vezes(c.roasEquilibrio) + ').'
      : c.margemUn != null && c.margemUn <= 0 ? 'Como cada venda já sai no negativo, nenhum retorno do anúncio cobre o prejuízo.' : null,
    c.roasAlvo != null
      ? 'Para sobrar ' + num(estado.margemMinimaPct, 0) + '% depois do anúncio, use ROAS objetivo ' + vezes(roasParaDigitar(c.roasAlvo)) + ' na campanha.'
      : null,
  ].filter(Boolean);
  return h('ul', { className: 'pa-frases' }, frases.map((f) => h('li', {}, f)));
}

/** @param {Linha} l */
function linhaAnuncio(l) {
  const { a, c } = l;
  const m = a.metricas;
  const principal = l.diagnosticos[0];
  const aberto = estado.abertos.has(a.itemId);
  const custo = estado.custos[a.itemId];

  const campoCusto = Input({
    type: 'text',
    placeholder: 'Digite o custo',
    value: custo != null ? num(custo, 2) : '',
    className: 'pa-custo',
    attrs: { inputmode: 'decimal', 'aria-label': 'Custo do produto, em reais, de ' + a.titulo },
    on: {
      change: (e) => salvarCusto(a.itemId, /** @type {HTMLInputElement} */ (e.target).value),
      keydown: (e) => { if (e.key === 'Enter') /** @type {HTMLInputElement} */ (e.target).blur(); },
    },
  });

  const alternar = () => {
    if (estado.abertos.has(a.itemId)) estado.abertos.delete(a.itemId); else estado.abertos.add(a.itemId);
    desenhar();
  };

  /** @param {string} rotulo @param {string} valor @param {number | null} sinal */
  const celula = (rotulo, valor, sinal) => h('div', { className: 'pa-cel pa-dir' + tomDoValor(sinal), attrs: { 'data-rotulo': rotulo } }, valor);

  const resumo = h('div', {
    className: 'pa-linha',
    // A linha inteira abre o anúncio; campo, link e botão cuidam do próprio clique.
    on: { click: (ev) => { if (ev.target instanceof Element && ev.target.closest('input, a, button')) return; alternar(); } },
  },
  h('div', { className: 'pa-produto' },
    a.thumbnail ? h('img', { className: 'pa-foto', attrs: { src: a.thumbnail, alt: '', loading: 'lazy' } }) : h('span', { className: 'pa-foto' }),
    h('div', {},
      h('a', { className: 'pa-produto__titulo', attrs: { href: a.permalink || '#', target: '_blank', rel: 'noopener' } }, a.titulo),
      h('span', { className: 'pa-produto__sub' }, a.itemId + (l.camp ? ' · ' + l.camp.nome : '')))),
  h('div', { className: 'pa-cel pa-cel--custo', attrs: { 'data-rotulo': 'Custo do produto (R$)' } }, campoCusto),
  celula('Sobra por venda', c.margemUn == null ? (custo == null ? 'sem custo' : '—') : dinheiro(c.margemUn), c.margemUn),
  celula('Margem pós ads', pct(c.margemPosAdsPct), c.margemPosAdsPct),
  celula('Gasto com anúncio', reais(m.investimento), null),
  celula('Resultado ' + diasDoPeriodo() + ' dias', c.lucroPosAds == null ? '—' : dinheiro(c.lucroPosAds), c.lucroPosAds),
  h('div', { className: 'pa-cel' }, Badge({ tone: TOM[principal.nivel], dot: true, children: ROTULO[principal.nivel] })),
  IconButton({
    icon: aberto ? 'expand_less' : 'expand_more', label: aberto ? 'Fechar a conta deste anúncio' : 'Ver a conta deste anúncio',
    size: 'sm', variant: 'bare', attrs: { 'aria-expanded': String(aberto) }, on: { click: alternar },
  }));

  if (!aberto) return h('div', { className: 'pa-anuncio', attrs: { 'data-item': a.itemId } }, resumo);

  const detalhe = h('div', { className: 'pa-detalhe' },
    h('div', { className: 'pa-bloco' },
      h('h4', { className: 'pa-h4' }, 'A conta de uma venda'),
      extrato(l),
      resultadoPeriodo(l)),
    h('div', { className: 'pa-bloco' },
      h('h4', { className: 'pa-h4' }, 'O anúncio em ' + diasDoPeriodo() + ' dias'),
      desempenho(l),
      h('h4', { className: 'pa-h4' }, 'O que fazer'),
      h('ul', { className: 'pa-diag' }, l.diagnosticos.map((d) => h('li', {},
        h('div', { className: 'pa-diag__topo' }, Badge({ tone: TOM[d.nivel], dot: true, children: ROTULO[d.nivel] }), h('strong', {}, d.titulo)),
        h('p', { className: 'pa-texto' }, d.detalhe),
        h('p', { className: 'pa-texto pa-texto--acao' }, d.acao))))));

  return h('div', { className: 'pa-anuncio is-aberto', attrs: { 'data-item': a.itemId } }, resumo, detalhe);
}

function premissas() {
  const imposto = Input({
    label: 'Imposto sobre a venda (%)',
    type: 'text',
    value: num(estado.impostoPct, 2),
    className: 'pa-premissa',
    attrs: { inputmode: 'decimal' },
    hint: 'Simples, lucro presumido… o que sai de cada nota.',
    on: {
      change: async (e) => {
        const v = lerNumero(/** @type {HTMLInputElement} */ (e.target).value);
        if (v == null || v >= 100) return;
        estado.impostoPct = v;
        desenhar();
        const db = /** @type {any} */ (window).db;
        if (db && typeof db.saveAdsTax === 'function') await db.saveAdsTax(v);
      },
    },
  });
  const minima = Input({
    label: 'Margem mínima depois do anúncio (%)',
    type: 'text',
    value: num(estado.margemMinimaPct, 0),
    className: 'pa-premissa',
    attrs: { inputmode: 'decimal' },
    hint: 'O quanto você aceita sobrar. Define o ROAS que o painel recomenda.',
    on: {
      change: (e) => {
        const v = lerNumero(/** @type {HTMLInputElement} */ (e.target).value);
        if (v == null || v >= 100) return;
        estado.margemMinimaPct = v;
        try { localStorage.setItem(MARGEM_MINIMA, String(v)); } catch { /* sem armazenamento */ }
        desenhar();
      },
    },
  });
  // Recolhidas: mudam pouco e empurravam a tela para baixo. O resumo na
  // linha mostra os valores em uso, e o estado aberto sobrevive ao redesenho
  // que cada alteração dispara.
  return h('details', {
    className: 'pa-premissas-box',
    attrs: { open: estado.premissasAbertas },
    on: { toggle: (e) => { estado.premissasAbertas = /** @type {HTMLDetailsElement} */ (e.target).open; } },
  },
  h('summary', {}, 'Premissas da conta: imposto de ' + num(estado.impostoPct, 1) + '% e margem mínima de '
    + num(estado.margemMinimaPct, 0) + '% depois do anúncio'),
  h('div', { className: 'pa-premissas' }, imposto, minima));
}

function boasPraticas() {
  const dicas = [
    ['Anúncio não corrige margem', 'Publicidade multiplica o resultado do produto: se a margem é ruim, ela só acelera o prejuízo. Calcule a margem de contribuição (depois de comissão, frete, imposto e custo) antes de colocar um anúncio em campanha.'],
    ['ROAS de equilíbrio = 100 ÷ margem', 'Margem de 40% se paga com ROAS 2,5; margem de 20% precisa de ROAS 5; margem de 10%, ROAS 10. Dê à campanha um ROAS objetivo acima do equilíbrio dos produtos dela.'],
    ['Agrupe por margem, não por categoria', 'Uma campanha tem um ROAS objetivo só. Misturar produtos de margens diferentes faz o de margem alta esconder o prejuízo do de margem baixa. Grupos de 15 a 30 anúncios parecidos dão volume para o algoritmo aprender.'],
    ['Olhe TACOS, não só ROAS', 'O ROAS mede as vendas que vieram do clique. O TACOS divide o investimento por todo o faturamento: se ele sobe e as vendas totais não sobem junto, o anúncio está só comprando venda que viria de graça.'],
    ['Paciência com o algoritmo', 'A venda é atribuída ao clique por até 14 dias. Mude o ROAS objetivo ou o orçamento uma vez e espere 14 a 21 dias para julgar. Mexer todo dia reinicia o aprendizado.'],
    ['Orçamento ou ranking?', 'Impressões perdidas por orçamento se resolvem com mais orçamento, mas só em campanha rentável. Perdidas por ranking pedem anúncio melhor (foto, preço, avaliações) ou ROAS objetivo mais baixo, se a margem permitir.'],
    ['Pause devagar', 'Cortar de uma vez um anúncio que vende derruba também o orgânico dele. Quando precisar reduzir, suba o ROAS objetivo ou tire aos poucos.'],
  ];
  return h('details', { className: 'pa-dicas' },
    h('summary', {}, 'Boas práticas de Mercado Ads'),
    h('ul', {}, dicas.map(([t, x]) => h('li', {}, h('strong', {}, t), h('p', { className: 'pa-texto' }, x)))));
}

function tela() {
  const p = estado.painel;
  const atualizado = estado.em ? new Date(estado.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  const topo = h('div', { className: 'pa-topo' },
    h('div', {},
      h('h2', { className: 'pa-h' }, 'Painel de Patrocinados'),
      h('p', { className: 'pa-sub' }, p && p.periodo
        ? 'Últimos ' + p.periodo.dias + ' dias, de ' + dataCurta(p.periodo.de) + ' a ' + dataCurta(p.periodo.ate) + (atualizado ? ' · dados das ' + atualizado : '')
        : 'Anúncios ativos em Product Ads, com a margem depois da publicidade.')),
    Button({ variant: 'outline', iconLeft: 'refresh', children: estado.carregando ? 'Atualizando…' : 'Atualizar',
      disabled: estado.carregando, on: { click: () => { if (!estado.carregando) buscarPainel(); } } }));

  if (!p) {
    return h('div', { className: 'pa' }, topo,
      Card({ children: h('p', { className: 'pa-texto' }, 'Buscando seus anúncios, campanhas e vendas no Mercado Livre… pode levar até um minuto.') }));
  }
  if (!p.ok) {
    return h('div', { className: 'pa' }, topo, p.motivo === 'sem_publicidade'
      ? Card({ children: EmptyState({ icon: 'campaign', title: 'Publicidade não habilitada', children: p.mensagem || '' }) })
      : Alert({ tone: 'danger', title: 'Não foi possível montar o painel', children: p.mensagem || '' }));
  }

  const calc = calcular();
  const semCusto = calc.linhas.filter((l) => estado.custos[l.a.itemId] == null).length;

  /** @type {Node[]} */
  const avisos = [];
  if (estado.erroCustos === 'sem_tabela') {
    avisos.push(Alert({ tone: 'warning', title: 'Os custos ainda não podem ser guardados',
      children: 'Esta parte do painel está sendo preparada. As métricas de publicidade já funcionam; a margem aparece quando os custos puderem ser salvos.' }));
  }
  if (p.avisos && p.avisos.pedidosParciais) {
    avisos.push(Alert({ tone: 'info', title: 'Muitos pedidos no período',
      children: 'Preço médio, comissão e frete foram calculados com os 1.000 pedidos mais recentes.' }));
  }
  if (semCusto && !estado.erroCustos) {
    avisos.push(Alert({ tone: 'info', title: semCusto + (semCusto === 1 ? ' anúncio sem custo' : ' anúncios sem custo'),
      children: 'Digite o custo unitário de cada produto (já nacionalizado) na coluna de custo. É o que libera a margem e os diagnósticos de prejuízo.' }));
  }

  if (!calc.linhas.length) {
    return h('div', { className: 'pa' }, topo, premissas(), ...avisos,
      Card({ children: EmptyState({ icon: 'campaign', title: 'Nenhum anúncio ativo em Patrocinados',
        children: 'Quando houver anúncios rodando em campanhas de Product Ads, eles aparecem aqui com a margem de cada um.' }) }));
  }

  return h('div', { className: 'pa' },
    topo,
    premissas(),
    ...avisos,
    numeros(calc),
    graficoResultados(calc),
    oQueFazer(calc),
    h('section', {},
      h('h3', { className: 'pa-h3' }, 'Anúncios ativos (' + calc.linhas.length + ')'),
      h('p', { className: 'pa-texto pa-lista-legenda' },
        'Sobra por venda é o que fica de cada venda antes de pagar o anúncio. Margem pós ads é esse lucro já sem o anúncio, '
        + 'em porcentagem de tudo que o produto vendeu. Resultado é o mesmo lucro em reais, nos ' + diasDoPeriodo()
        + ' dias. Clique num anúncio para ver a conta completa.'),
      h('div', { className: 'pa-lista' }, cabecalhoLista(), calc.linhas.map(linhaAnuncio))),
    calc.campanhasCalc.length
      ? h('section', {}, h('h3', { className: 'pa-h3' }, 'Campanhas'), h('div', { className: 'pa-campanhas' }, calc.campanhasCalc.map(cartaoCampanha)))
      : null,
    boasPraticas());
}

function desenhar() {
  const raiz = document.getElementById('ads-painel-raiz');
  if (!raiz) return;
  raiz.replaceChildren(tela());
}

async function abrir() {
  // Conta sem Mercado Livre: o aviso de ml-conexao.js, no topo da aba, explica.
  // O painel nem pergunta ao servidor — seria até um minuto de espera para
  // terminar num erro logo abaixo do aviso.
  if (precisaConectar(await conexaoMercadoLivre())) {
    const raiz = document.getElementById('ads-painel-raiz');
    if (raiz) raiz.replaceChildren();
    return;
  }
  try {
    const m = Number(localStorage.getItem(MARGEM_MINIMA));
    if (Number.isFinite(m) && m >= 0 && m < 100 && localStorage.getItem(MARGEM_MINIMA) !== null) estado.margemMinimaPct = m;
  } catch { /* sem armazenamento */ }
  const cache = lerCache();
  if (cache && !estado.painel) { estado.painel = cache.painel; estado.em = cache.em; }
  desenhar();
  await buscarCustos();
  desenhar();
  if (!cache) await buscarPainel();
}

document.addEventListener('impoclick:tela', (e) => {
  const d = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (d && d.id === 'view-ads') abrir();
});
