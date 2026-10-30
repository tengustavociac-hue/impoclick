// @ts-check
/**
 * Relatório de um lote salvo no Histórico de Importação — o botão "Ver".
 *
 * Só leitura: custo final por produto, composição do custo em gráfico,
 * tributos e a memória de cálculo que explica cada número. Editar continua no
 * botão "Editar", que carrega o lote na calculadora.
 *
 * A conta NÃO é refeita aqui. O app.js calcula com calcularLote() — a mesma
 * função que a calculadora usa para desenhar os resultados — e entrega o
 * resultado no evento impoclick:ver-lote. Assim o relatório e a calculadora
 * nunca discordam de um centavo de imposto.
 */
import {
  Card, Stat, Badge, Button, Input, DataTable, DonutMeter, Breadcrumbs, EmptyState, h,
} from './design-system/components/index.js';

/**
 * @typedef {{ id: number, name: string, qty: number, unitPrice: number, unitWeight: number, ncm?: string, taxation?: string, description?: string }} Produto
 * @typedef {{ name?: string, ii: number, ipi: number, pis: number, cofins: number, source?: string } | null} Aliquotas
 * @typedef {{
 *   product: Produto, fobForeign: number, fobBRL: number, weightTotal: number,
 *   freightBRL: number, insuranceBRL: number, feesBRL: number, vaBRL: number,
 *   iiBRL: number, ipiBRL?: number, pisBRL?: number, cofinsBRL?: number, icmsBRL: number,
 *   formalRatesUsed?: Aliquotas, custoTotalBRL: number, custoUnitBRL: number,
 * }} ItemCalculado
 * @typedef {{
 *   effectiveRate: number, totalQty: number, totalWeight: number,
 *   totalFobForeign: number, totalFobBRL: number, totalFobOfficialBRL: number,
 *   freightBRL: number, insuranceBRL: number, feesBRL: number,
 *   freightOfficialBRL: number, insuranceOfficialBRL: number,
 *   itemsCalculation: ItemCalculado[], totalOfficialVABRL: number, totalVAUSD: number,
 *   totalIIBRL: number, totalICMSBRL: number,
 * }} Calculo
 * @typedef {Record<string, any>} Estado
 * @typedef {{ id: string | number, nome: string, criadoEm?: string | number, estado: Estado, calculo: Calculo }} Lote
 */

const REGIMES = {
  'remessa-conforme': 'Remessa Conforme',
  'regra-geral': 'Regra geral 60%',
  'importacao-formal': 'Importação formal',
  'apenas-icms': 'Apenas ICMS',
  personalizado: 'Alíquotas personalizadas',
};

const RATEIO = { weight: 'peso', value: 'valor', quantity: 'quantidade' };

// ── Formatação ────────────────────────────────────────────────────────

const REAL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** @param {number} v */
const reais = (v) => REAL.format(Number(v) || 0);

/** @param {number} v @param {string} moeda */
function naMoeda(v, moeda) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'USD' }).format(Number(v) || 0);
  } catch {
    // Código de moeda que o Intl não conhece: mostra o código cru.
    return (moeda || '') + ' ' + (Number(v) || 0).toFixed(2);
  }
}

/** @param {number} v @param {number} [casas] */
const numero = (v, casas = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** @param {number} v */
const porcento = (v) => numero(v, 1) + '%';

/** Valor grande para o centro do gráfico: "55,3 mil", "1,2 mi". @param {number} v */
function reaisCurto(v) {
  if (v >= 1e6) return 'R$ ' + numero(v / 1e6, 1) + ' mi';
  if (v >= 1e4) return 'R$ ' + numero(v / 1e3, 1) + ' mil';
  return reais(v);
}

/** @param {number} kg */
const peso = (kg) => (kg >= 1 ? numero(kg, 2) + ' kg' : numero(kg * 1000, 0) + ' g');

/** @param {string | number | undefined} quando */
function dataDoLote(quando) {
  if (quando == null) return '';
  const d = new Date(quando);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Totais ────────────────────────────────────────────────────────────

/** @param {Calculo} c */
function totaisDe(c) {
  const soma = (/** @type {(i: ItemCalculado) => number} */ f) => c.itemsCalculation.reduce((acc, i) => acc + (f(i) || 0), 0);
  const ii = soma((i) => i.iiBRL);
  const ipi = soma((i) => i.ipiBRL || 0);
  const pis = soma((i) => i.pisBRL || 0);
  const cofins = soma((i) => i.cofinsBRL || 0);
  const icms = soma((i) => i.icmsBRL);
  const custo = soma((i) => i.custoTotalBRL);
  return {
    fob: c.totalFobBRL, frete: c.freightBRL, seguro: c.insuranceBRL, despesas: c.feesBRL,
    ii, ipi, pis, cofins, icms,
    federais: ii + ipi + pis + cofins,
    tributos: ii + ipi + pis + cofins + icms,
    custo,
  };
}

// ── Seções ────────────────────────────────────────────────────────────

/**
 * @param {Lote} lote @param {ReturnType<typeof totaisDe>} t
 * @param {number | null} margem Margem de revenda digitada; null esconde o lucro.
 */
function numeros(lote, t, margem) {
  const { calculo } = lote;
  const custoUnidade = calculo.totalQty > 0 ? t.custo / calculo.totalQty : 0;
  // Quanto cada real de produto (pela PTAX) virou de custo no fim — o mesmo
  // multiplicador que a calculadora mostra por item.
  const multiplicador = calculo.totalFobOfficialBRL > 0 ? t.custo / calculo.totalFobOfficialBRL : 0;

  const cartoes = [
    Card({ compact: true, children: Stat({ label: 'Custo total do lote', size: 'sm', value: reais(t.custo) }) }),
    Card({ compact: true, children: Stat({ label: 'Custo médio por unidade', size: 'sm', value: reais(custoUnidade) }) }),
    // A nota do Stat só aparece junto de um delta; aqui o "delta" é a fatia
    // dos tributos no custo, sem direção de alta ou queda.
    Card({ compact: true, children: Stat({
      label: 'Tributos', size: 'sm', value: reais(t.tributos),
      delta: t.custo > 0 ? porcento((t.tributos / t.custo) * 100) : undefined,
      deltaDirection: 'flat', deltaNote: 'do custo total',
    }) }),
    Card({
      compact: true,
      attrs: { title: 'Custo final do lote dividido pelo valor FOB na PTAX.' },
      children: Stat({ label: 'Multiplicador sobre o FOB', size: 'sm', value: numero(multiplicador, 2), suffix: '×' }),
    }),
  ];

  if (margem != null) {
    const receita = t.custo / (1 - margem / 100);
    cartoes.push(Card({ compact: true, children: Stat({
      label: 'Lucro projetado na revenda', size: 'sm', value: reais(receita - t.custo),
      delta: porcento(margem), deltaDirection: 'flat', deltaNote: 'de margem',
    }) }));
  }

  return h('div', { className: 'lote-numeros' }, cartoes);
}

/** @param {ReturnType<typeof totaisDe>} t */
function composicao(t) {
  // Cinco fatias, que é o que a paleta de gráfico do design system comporta
  // sem repetir cor. O detalhe tributo por tributo vai na tabela ao lado.
  const fatias = [
    { rotulo: 'Produtos (FOB)', valor: t.fob, cor: 'var(--chart-1)' },
    { rotulo: 'Frete e seguro', valor: t.frete + t.seguro, cor: 'var(--chart-4)' },
    { rotulo: 'Despesas', valor: t.despesas, cor: 'var(--chart-5)' },
    { rotulo: 'Tributos federais', valor: t.federais, cor: 'var(--chart-2)' },
    { rotulo: 'ICMS', valor: t.icms, cor: 'var(--chart-3)' },
  ].filter((f) => f.valor > 0.005);

  const pct = (/** @type {number} */ v) => (t.custo > 0 ? (v / t.custo) * 100 : 0);

  const linhas = [
    { item: 'Produtos (FOB, câmbio efetivo)', valor: t.fob, cor: 'var(--chart-1)' },
    { item: 'Frete', valor: t.frete, cor: 'var(--chart-4)' },
    { item: 'Seguro', valor: t.seguro, cor: 'var(--chart-4)' },
    { item: 'Despesas (taxas, despacho, armazenagem)', valor: t.despesas, cor: 'var(--chart-5)' },
    { item: 'II — Imposto de Importação', valor: t.ii, cor: 'var(--chart-2)' },
    { item: 'IPI', valor: t.ipi, cor: 'var(--chart-2)' },
    { item: 'PIS-Importação', valor: t.pis, cor: 'var(--chart-2)' },
    { item: 'COFINS-Importação', valor: t.cofins, cor: 'var(--chart-2)' },
    { item: 'ICMS', valor: t.icms, cor: 'var(--chart-3)' },
  ].filter((l) => l.valor > 0.005);

  return Card({
    eyebrow: 'Composição do custo',
    title: 'Para onde vai cada real',
    children: h('div', { className: 'lote-composicao' },
      h('div', { className: 'lote-rosca' },
        DonutMeter({
          segments: fatias.map((f) => ({ value: pct(f.valor), color: f.cor, label: f.rotulo })),
          value: reaisCurto(t.custo),
          label: 'custo total',
        }),
        h('ul', { className: 'lote-legenda' }, fatias.map((f) => h('li', {},
          h('span', { className: 'lote-cor', style: { background: f.cor } }),
          h('span', { className: 'lote-legenda__nome' }, f.rotulo),
          h('strong', {}, porcento(pct(f.valor))))))),
      // Lista compacta, e não DataTable: na metade da tela a tabela cortava as
      // colunas de valor e percentual, que são justamente o que se lê aqui.
      h('ul', { className: 'lote-detalhe' }, linhas.map((l) => h('li', {},
        h('span', { className: 'lote-com-cor' }, h('span', { className: 'lote-cor', style: { background: l.cor } }), l.item),
        h('strong', {}, reais(l.valor)),
        h('em', {}, porcento(pct(l.valor))))))),
  });
}

/**
 * O cartão fica fixo e só a tabela é redesenhada quando a margem muda: o campo
 * de margem mora no canto do cartão, e recriá-lo a cada tecla tiraria o foco
 * de quem está digitando.
 * @param {Lote} lote @param {ReturnType<typeof totaisDe>} t @param {Node} campoMargem
 */
function custoPorProduto(lote, t, campoMargem) {
  const area = h('div', { className: 'lote-rolagem' });
  const card = Card({ eyebrow: 'Produtos', title: 'Custo final de cada produto', action: campoMargem, children: area });
  /** @param {number | null} margem */
  const desenhar = (margem) => area.replaceChildren(tabelaDeProdutos(lote, t, margem));
  return { card, desenhar };
}

/** @param {Lote} lote @param {ReturnType<typeof totaisDe>} t @param {number | null} margem */
function tabelaDeProdutos(lote, t, margem) {
  const { estado, calculo } = lote;
  const moeda = estado.currency || 'USD';
  const ptax = moeda === 'BRL' ? 1 : Number(estado.exchangeRate) || 1;
  const maior = Math.max(...calculo.itemsCalculation.map((i) => i.custoTotalBRL), 0);

  /** @type {Array<any>} */
  const colunas = [
    { key: 'nome', label: 'Produto', primary: true },
    { key: 'qtd', label: 'Qtd.', align: 'right' },
    { key: 'fob', label: 'FOB un.', align: 'right' },
    { key: 'unit', label: 'Custo final un.', align: 'right' },
    { key: 'mult', label: 'Multiplicador', align: 'right' },
    { key: 'total', label: 'Custo total', align: 'right' },
    { key: 'parte', label: 'Peso no lote', render: (/** @type {any} */ r) => h('div', { className: 'lote-barra', attrs: { title: porcento(r.parte) + ' do custo do lote' } },
      h('span', { style: { width: (maior > 0 ? (r.total_n / maior) * 100 : 0) + '%' } }),
      h('em', {}, porcento(r.parte))) },
  ];
  if (margem != null) colunas.splice(6, 0, { key: 'venda', label: 'Preço de venda un.', align: 'right' });

  const linhas = calculo.itemsCalculation.map((i) => {
    const base = i.product.unitPrice * ptax;
    return {
      nome: i.product.name,
      qtd: numero(i.product.qty),
      fob: naMoeda(i.product.unitPrice, moeda),
      unit: reais(i.custoUnitBRL),
      mult: numero(base > 0 ? i.custoUnitBRL / base : 1, 2) + '×',
      total: reais(i.custoTotalBRL),
      total_n: i.custoTotalBRL,
      venda: margem != null ? reais(i.custoUnitBRL / (1 - margem / 100)) : '',
      parte: t.custo > 0 ? (i.custoTotalBRL / t.custo) * 100 : 0,
    };
  });

  return DataTable({ columns: colunas, rows: linhas });
}

/**
 * Margem digitada, em %. Vazio, zero ou 100 para cima não simula nada: com
 * 100% o preço de venda seria infinito (a margem é sobre o preço, como na
 * calculadora).
 * @param {string} texto
 */
function lerMargem(texto) {
  const n = Number(String(texto).replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

/**
 * A memória de cálculo em passos, na ordem em que a conta acontece: câmbio,
 * valor aduaneiro, regra do regime, rateios. Cada passo diz de onde saiu o
 * número — é para conferir, não para acreditar.
 * @param {Lote} lote @param {ReturnType<typeof totaisDe>} t
 */
function memoriaFiscal(lote, t) {
  const { estado: s, calculo: c } = lote;
  const moeda = s.currency || 'USD';
  /** @type {Array<{ titulo: string, texto: string, valor?: string }>} */
  const passos = [];

  if (moeda === 'BRL') {
    passos.push({ titulo: 'Câmbio', texto: 'Valores informados em reais: não há conversão.' });
  } else if (s.exchangeMode === 'complete') {
    passos.push({
      titulo: 'Câmbio',
      texto: 'PTAX de ' + reais(s.exchangeRate) + ' com spread de ' + porcento(s.spread || 0) + ' e IOF de ' + porcento(s.iof || 0)
        + '. O câmbio efetivo vale para o que sai do bolso; os tributos usam a PTAX.',
      valor: 'efetivo ' + reais(c.effectiveRate),
    });
  } else {
    passos.push({ titulo: 'Câmbio', texto: 'Câmbio de ' + reais(s.exchangeRate) + ', usado no custo e na base dos tributos.', valor: reais(s.exchangeRate) });
  }

  passos.push({
    titulo: 'Valor aduaneiro (base dos tributos)',
    texto: 'FOB ' + reais(c.totalFobOfficialBRL) + ' + frete ' + reais(c.freightOfficialBRL) + ' + seguro ' + reais(c.insuranceOfficialBRL) + ', pela PTAX.',
    valor: reais(c.totalOfficialVABRL),
  });

  const icms = Number(s.icmsRate) || 0;
  const icmsPorDentro = (/** @type {string} */ base) => 'ICMS de ' + porcento(icms) + ' calculado por dentro: (' + base + ') ÷ (1 − ' + porcento(icms) + ') × ' + porcento(icms) + '.';

  if (s.taxMode !== 'auto') {
    passos.push({
      titulo: 'Tributos informados à mão',
      texto: 'II de ' + reais(s.manualII) + ' e ICMS de ' + reais(s.manualICMS) + ', rateados entre os produtos por ' + (RATEIO[/** @type {keyof typeof RATEIO} */ (s.taxSplit)] || 'valor') + '.',
      valor: reais(t.tributos),
    });
  } else if (s.taxRegime === 'remessa-conforme') {
    passos.push(c.totalVAUSD <= 50
      ? { titulo: 'Remessa Conforme, até US$ 50', texto: 'Valor aduaneiro de ' + naMoeda(c.totalVAUSD, 'USD') + ': II de 20% sobre ele. ' + icmsPorDentro('valor aduaneiro + II'), valor: reais(t.tributos) }
      : { titulo: 'Remessa Conforme, acima de US$ 50', texto: 'Valor aduaneiro de ' + naMoeda(c.totalVAUSD, 'USD') + ': II de 60% com desconto de US$ 20, rateado entre os itens tributados. ' + icmsPorDentro('valor aduaneiro + II'), valor: reais(t.tributos) });
  } else if (s.taxRegime === 'regra-geral') {
    passos.push({ titulo: 'Regra geral', texto: 'II de 60% sobre o valor aduaneiro. ' + icmsPorDentro('valor aduaneiro + II'), valor: reais(t.tributos) });
  } else if (s.taxRegime === 'apenas-icms') {
    passos.push({ titulo: 'Apenas ICMS', texto: 'Sem Imposto de Importação. ' + icmsPorDentro('valor aduaneiro'), valor: reais(t.tributos) });
  } else if (s.taxRegime === 'personalizado') {
    passos.push({
      titulo: 'Alíquotas personalizadas',
      texto: 'II de ' + porcento(s.customII) + ' sobre o valor aduaneiro. ICMS de ' + porcento(s.customICMS) + ' por dentro: (valor aduaneiro + II) ÷ (1 − ' + porcento(s.customICMS) + ').',
      valor: reais(t.tributos),
    });
  } else if (s.taxRegime === 'importacao-formal') {
    passos.push({
      titulo: 'Importação formal',
      texto: 'II, IPI, PIS e COFINS pelas alíquotas do NCM de cada produto (tabela abaixo). IPI sobre valor aduaneiro + II; PIS e COFINS sobre o valor aduaneiro. '
        + icmsPorDentro('valor aduaneiro + II + IPI + PIS + COFINS + despesas'),
      valor: reais(t.tributos),
    });
  }

  const isentos = c.itemsCalculation.filter((i) => i.product.taxation === 'exempt-books' || i.product.taxation === 'exempt-meds');
  if (s.taxMode === 'auto' && isentos.length) {
    passos.push({
      titulo: 'Isenções',
      texto: isentos.map((i) => i.product.name + (i.product.taxation === 'exempt-books' ? ' (livro: sem tributos)' : ' (medicamento: sem II, só ICMS)')).join('; ') + '.',
    });
  }

  passos.push({
    titulo: 'Rateio',
    texto: 'Frete por ' + (RATEIO[/** @type {keyof typeof RATEIO} */ (s.freightSplit)] || 'valor')
      + ', seguro por ' + (RATEIO[/** @type {keyof typeof RATEIO} */ (s.insuranceSplit)] || 'valor')
      + ' e despesas por ' + (RATEIO[/** @type {keyof typeof RATEIO} */ (s.feesSplit)] || 'quantidade') + ' de cada produto.',
  });

  return Card({
    eyebrow: 'Memória fiscal',
    title: 'Como os tributos foram calculados',
    children: h('ol', { className: 'lote-memoria' }, passos.map((p, n) => h('li', {},
      h('span', { className: 'lote-memoria__n' }, String(n + 1)),
      h('div', {},
        h('div', { className: 'lote-memoria__topo' },
          h('strong', {}, p.titulo),
          p.valor ? h('span', { className: 'lote-memoria__valor' }, p.valor) : null),
        h('p', {}, p.texto))))),
  });
}

/** @param {Lote} lote @param {ReturnType<typeof totaisDe>} t */
function tributosPorProduto(lote, t) {
  const { estado: s, calculo: c } = lote;
  const formal = s.taxMode === 'auto' && s.taxRegime === 'importacao-formal';
  const temFederais = t.ipi + t.pis + t.cofins > 0.005;

  /** @param {number | undefined} aliquota @param {number | undefined} valor */
  const comAliquota = (aliquota, valor) => (formal && aliquota != null ? reais(valor || 0) + ' (' + porcento(aliquota) + ')' : reais(valor || 0));

  /** @type {Array<any>} */
  const colunas = [{ key: 'nome', label: 'Produto', primary: true }];
  if (formal) colunas.push({ key: 'ncm', label: 'NCM', render: (/** @type {any} */ r) => h('span', { className: 'ic-mono' }, r.ncm) });
  colunas.push({ key: 'base', label: 'Valor aduaneiro', align: 'right' }, { key: 'ii', label: 'II', align: 'right' });
  if (temFederais) colunas.push({ key: 'ipi', label: 'IPI', align: 'right' }, { key: 'pis', label: 'PIS', align: 'right' }, { key: 'cofins', label: 'COFINS', align: 'right' });
  colunas.push({ key: 'icms', label: 'ICMS', align: 'right' }, { key: 'total', label: 'Total', align: 'right' });

  const linhas = c.itemsCalculation.map((i) => {
    const r = i.formalRatesUsed || null;
    return {
      nome: i.product.name,
      ncm: i.product.ncm || '—',
      base: reais(i.vaBRL),
      ii: comAliquota(r ? r.ii : undefined, i.iiBRL),
      ipi: comAliquota(r ? r.ipi : undefined, i.ipiBRL),
      pis: comAliquota(r ? r.pis : undefined, i.pisBRL),
      cofins: comAliquota(r ? r.cofins : undefined, i.cofinsBRL),
      icms: reais(i.icmsBRL),
      total: reais(i.iiBRL + (i.ipiBRL || 0) + (i.pisBRL || 0) + (i.cofinsBRL || 0) + i.icmsBRL),
    };
  });

  return Card({
    eyebrow: 'Tributos por produto',
    title: formal ? 'Alíquotas e valores por NCM' : 'Valores por produto',
    children: h('div', { className: 'lote-rolagem' }, DataTable({ columns: colunas, rows: linhas })),
  });
}

/** @param {Lote} lote */
function tela(lote) {
  const { estado: s, calculo: c } = lote;
  const voltar = Breadcrumbs({ items: [{ label: 'Histórico de Importação', href: '#view-imports' }, { label: lote.nome }] });

  if (!c.itemsCalculation.length) {
    return h('div', { className: 'lote' }, voltar, Card({ children: EmptyState({
      icon: 'inventory_2', title: 'Lote sem produtos', children: 'Este lote foi salvo sem nenhum produto, então não há custo para mostrar.',
    }) }));
  }

  const t = totaisDe(c);
  const regime = s.taxMode === 'auto' ? (REGIMES[/** @type {keyof typeof REGIMES} */ (s.taxRegime)] || s.taxRegime) : 'Tributos manuais';
  const quando = dataDoLote(lote.criadoEm);

  const topo = h('div', { className: 'lote-topo' },
    h('div', {},
      h('div', { className: 'lote-titulo' },
        h('h2', { className: 'lote-h' }, lote.nome),
        Badge({ tone: 'accent', children: regime }),
        s.currency && s.currency !== 'BRL' ? Badge({ tone: 'neutral', children: s.currency }) : null),
      h('p', { className: 'lote-sub' }, [
        numero(c.itemsCalculation.length) + (c.itemsCalculation.length === 1 ? ' produto' : ' produtos'),
        numero(c.totalQty) + ' unidades',
        peso(c.totalWeight),
        quando ? 'salvo em ' + quando : '',
      ].filter(Boolean).join(' · '))),
    Button({
      variant: 'outline', iconLeft: 'edit', children: 'Editar na calculadora',
      on: { click: () => { const f = /** @type {any} */ (window).loadSavedImport; if (typeof f === 'function') f(lote.id); } },
    }));

  // Lucro e preço de venda só aparecem se a pessoa quiser simular: margem é
  // decisão de quem vende, não um dado do lote. Por isso o campo começa vazio,
  // mesmo que o lote tenha sido salvo com o modo revenda ligado.
  let blocoNumeros = numeros(lote, t, null);
  const campoMargem = Input({
    label: 'Simular revenda (margem %)',
    type: 'number',
    placeholder: 'ex.: 40',
    className: 'lote-margem',
    attrs: { min: 1, max: 99, step: 'any', inputmode: 'decimal' },
    on: {
      input: (e) => {
        const margem = lerMargem(/** @type {HTMLInputElement} */ (e.target).value);
        const novos = numeros(lote, t, margem);
        blocoNumeros.replaceWith(novos);
        blocoNumeros = novos;
        produtos.desenhar(margem);
      },
    },
  });
  const produtos = custoPorProduto(lote, t, campoMargem);
  produtos.desenhar(null);

  return h('div', { className: 'lote' },
    voltar,
    topo,
    blocoNumeros,
    h('div', { className: 'lote-duas' }, composicao(t), memoriaFiscal(lote, t)),
    produtos.card,
    tributosPorProduto(lote, t));
}

// ── Entrada ───────────────────────────────────────────────────────────

document.addEventListener('impoclick:ver-lote', (e) => {
  const lote = /** @type {CustomEvent<Lote>} */ (e).detail;
  const raiz = document.getElementById('lote-raiz');
  if (!raiz || !lote) return;
  raiz.replaceChildren(tela(lote));
});

// "Histórico de Importação" na trilha volta para a lista, pelo próprio menu —
// assim o painel, o título do topo e o item ativo trocam do jeito de sempre.
document.addEventListener('click', (e) => {
  const alvo = /** @type {HTMLElement} */ (e.target);
  const link = alvo && alvo.closest && alvo.closest('#lote-raiz a[href="#view-imports"]');
  if (!link) return;
  e.preventDefault();
  const item = /** @type {HTMLElement | null} */ (document.querySelector('[data-view="view-imports"]'));
  if (item) item.click();
});
