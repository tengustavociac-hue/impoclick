// @ts-check
/**
 * Regras do painel de Patrocinados: a conta de margem e os diagnósticos.
 *
 * Separadas da tela (patrocinados.js) por dois motivos: a margem é refeita a
 * cada custo digitado, sem voltar ao Mercado Livre, e as regras precisam ser
 * testáveis sem navegador.
 *
 * A ideia central, que é a de qualquer boa prática de Mercado Ads: um anúncio
 * só se paga se o ROAS dele ficar ACIMA do ROAS de equilíbrio da margem.
 *   margem de contribuição = preço − comissão − frete − imposto − custo
 *   ROAS de equilíbrio     = preço ÷ margem   (margem de 20% → ROAS 5)
 * Abaixo disso, cada venda que veio do anúncio custou mais do que deixou.
 */

/**
 * @typedef {{
 *   investimento: number, receitaAds: number, cliques: number, impressoes: number,
 *   ctr: number, cvr: number, roas: number, acos: number, tacos: number,
 *   unidadesAds: number, unidadesOrganicas: number, receitaOrganica: number,
 * }} Metricas
 * @typedef {{
 *   precoMedio: number, comissaoUn: number | null, comissaoFonte: string,
 *   freteUn: number | null, freteFonte: string, amostrasFrete: number, unidadesVendidas: number,
 * }} Economia
 * @typedef {{
 *   itemId: string, campanhaId: number | null, titulo: string, preco: number,
 *   fotoBoa: boolean | null, estoqueDiferido: boolean, recomendado: boolean,
 *   metricas: Metricas, economia: Economia,
 * }} AnuncioBruto
 * @typedef {{
 *   id: number, nome: string, estrategia: string | null, roasObjetivo: number | null,
 *   orcamentoDiario: number,
 *   metricas: { investimento: number, receita: number, roas: number,
 *     perdidasOrcamento: number | null, perdidasRanking: number | null, impressoesGanhas: number | null },
 * }} Campanha
 * @typedef {'critico' | 'atencao' | 'oportunidade' | 'ok' | 'pendente'} Nivel
 * @typedef {{ nivel: Nivel, titulo: string, detalhe: string, acao: string, emJogo: number }} Diagnostico
 * @typedef {{
 *   margemUn: number | null, margemPct: number | null, roasEquilibrio: number | null,
 *   roasAlvo: number | null, lucroPosAds: number | null, margemPosAdsPct: number | null,
 *   custoAdsPorVenda: number | null, receitaTotal: number, unidadesTotais: number,
 * }} Conta
 * @typedef {{ custoUn?: number, impostoPct: number, margemMinimaPct: number }} Premissas
 */

/** Ordem de gravidade: o que perde dinheiro primeiro. */
export const ORDEM = { critico: 0, atencao: 1, pendente: 2, oportunidade: 3, ok: 4 };

// Abaixo disto os números oscilam demais para decidir. A janela de atribuição
// do ML é de 14 dias: com poucos cliques, uma venda a mais ou a menos muda o
// ROAS inteiro.
export const CLIQUES_MINIMOS = 30;

/**
 * A conta de margem de um anúncio. Sem custo ou sem comissão, a margem não
 * existe — devolve nulo em vez de inventar.
 * @param {AnuncioBruto} a @param {Premissas} p @returns {Conta}
 */
export function contaDoAnuncio(a, p) {
  const m = a.metricas;
  const e = a.economia;
  const preco = e.precoMedio || a.preco;
  const unidadesTotais = m.unidadesAds + m.unidadesOrganicas;
  const receitaTotal = m.receitaAds + m.receitaOrganica;
  const custoAdsPorVenda = m.unidadesAds > 0 ? m.investimento / m.unidadesAds : null;

  if (p.custoUn == null || e.comissaoUn == null || !(preco > 0)) {
    return { margemUn: null, margemPct: null, roasEquilibrio: null, roasAlvo: null, lucroPosAds: null,
      margemPosAdsPct: null, custoAdsPorVenda, receitaTotal, unidadesTotais };
  }

  const imposto = preco * (p.impostoPct / 100);
  const margemUn = preco - e.comissaoUn - (e.freteUn || 0) - imposto - p.custoUn;
  const margemPct = margemUn / preco;
  const roasEquilibrio = margemUn > 0 ? preco / margemUn : null;
  // ROAS que ainda deixa a margem mínima escolhida depois de pagar o anúncio.
  const folga = margemUn - preco * (p.margemMinimaPct / 100);
  const roasAlvo = folga > 0 ? preco / folga : null;
  const lucroPosAds = margemUn * unidadesTotais - m.investimento;
  const margemPosAdsPct = receitaTotal > 0 ? lucroPosAds / receitaTotal : null;

  return { margemUn, margemPct, roasEquilibrio, roasAlvo, lucroPosAds, margemPosAdsPct, custoAdsPorVenda, receitaTotal, unidadesTotais };
}

/** @param {number[]} valores */
export function mediana(valores) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** ROAS arredondado PARA CIMA em 0,5: é o número que se digita na campanha. */
export const roasParaDigitar = (/** @type {number} */ r) => Math.ceil(r * 2) / 2;

// Acima disto o ROAS objetivo é teórico: o ML aceita até 35×, mas campanha
// que exige 15× ou mais praticamente não ganha leilão. Recomendar 30× para
// um produto de margem fina é conta certa e conselho inútil.
export const ROAS_REALISTA = 15;

/**
 * O ROAS a digitar na campanha, e o aviso quando a margem não comporta.
 * @param {Conta} c @param {Premissas} p
 */
export function recomendacaoRoas(c, p) {
  const eq = /** @type {number} */ (c.roasEquilibrio);
  if (c.roasAlvo != null && c.roasAlvo <= ROAS_REALISTA) {
    return { roas: roasParaDigitar(c.roasAlvo), nota: '' };
  }
  const minimo = roasParaDigitar(Math.min(eq * 1.2, Math.max(eq, ROAS_REALISTA)));
  return {
    roas: minimo,
    nota: ' A margem deste produto é fina: para sobrar ' + n(p.margemMinimaPct, 0) + '% depois do anúncio seria preciso ROAS '
      + (c.roasAlvo != null ? n(c.roasAlvo) + '×' : 'impossível') + ', o que dificilmente se atinge. Rever preço ou custo rende mais do que ajustar o anúncio.',
  };
}

/**
 * @param {number} v
 * @param {number} [casas]
 */
const n = (v, casas = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (/** @type {number} */ v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (/** @type {number} */ v) => n(v * 100) + '%';

/**
 * Diagnósticos de um anúncio, do mais grave ao mais leve. Cada um diz o que
 * está acontecendo, com os números, e o que fazer — sempre sem sacrificar a
 * margem. `emJogo` é quanto dinheiro o problema (ou a chance) movimenta, e é o
 * que ordena a lista "O que fazer agora".
 * @param {AnuncioBruto} a @param {Conta} c @param {Campanha | undefined} camp
 * @param {{ ctr: number | null, cvr: number | null }} referencia medianas da conta
 * @param {Premissas} p
 * @returns {Diagnostico[]}
 */
export function diagnosticar(a, c, camp, referencia, p) {
  const m = a.metricas;
  /** @type {Diagnostico[]} */
  const d = [];
  const temDados = m.cliques >= CLIQUES_MINIMOS;

  if (a.estoqueDiferido) {
    d.push({ nivel: 'critico', titulo: 'Anúncio com prazo de disponibilidade não aparece nos anúncios',
      detalhe: 'O Mercado Livre deixa de exibir em Product Ads o anúncio com tempo de fabricação ou disponibilidade, e prioriza quem tem estoque imediato.',
      acao: 'Tire o prazo de disponibilidade ou tire o anúncio da campanha até ter estoque imediato.', emJogo: m.investimento });
  }

  if (c.margemUn == null) {
    d.push({ nivel: 'pendente', titulo: 'Informe o custo para ver a margem',
      detalhe: 'Sem o custo do produto não dá para saber se o ROAS de ' + n(m.roas) + '× paga o anúncio.',
      acao: 'Digite o custo unitário (produto já nacionalizado) na linha deste anúncio.', emJogo: m.investimento });
  } else if (c.margemUn <= 0) {
    d.push({ nivel: 'critico', titulo: 'Prejuízo antes mesmo do anúncio',
      detalhe: 'Preço de ' + reais(a.economia.precoMedio) + ' não cobre custo, comissão, frete e imposto: sobra ' + reais(c.margemUn) + ' por venda.',
      acao: 'Anúncio pago não corrige margem, só multiplica o resultado. Revise preço ou custo e pause este anúncio no Patrocinados até a conta fechar.',
      emJogo: Math.abs(c.margemUn) * c.unidadesTotais + m.investimento });
  } else {
    const eq = /** @type {number} */ (c.roasEquilibrio);
    const rec = recomendacaoRoas(c, p);
    if (c.lucroPosAds != null && c.lucroPosAds < 0 && temDados) {
      d.push({ nivel: 'critico', titulo: 'Margem pós ads negativa',
        detalhe: 'No período o anúncio deu prejuízo de ' + reais(-c.lucroPosAds) + ': o investimento de ' + reais(m.investimento) + ' passou do que as vendas deixaram. ROAS de ' + n(m.roas) + '× contra equilíbrio de ' + n(eq) + '×.',
        acao: 'Suba o ROAS objetivo da campanha para pelo menos ' + n(rec.roas) + '× (ou mova o anúncio para uma campanha de rentabilidade com esse objetivo). Mude uma vez e espere 14 a 21 dias: ajustar todo dia atrapalha o aprendizado. Se não reagir, desescale aos poucos em vez de pausar de uma vez.' + rec.nota,
        emJogo: -c.lucroPosAds });
    } else if (m.roas > 0 && m.roas < eq && temDados) {
      d.push({ nivel: 'atencao', titulo: 'Cada venda por anúncio dá prejuízo',
        detalhe: 'ROAS de ' + n(m.roas) + '× abaixo do equilíbrio de ' + n(eq) + '×: o anúncio custa ' + reais(c.custoAdsPorVenda || 0) + ' por venda e a margem é de ' + reais(c.margemUn) + '. As vendas orgânicas estão pagando a conta.',
        acao: rec.nota
          ? 'Suba o ROAS objetivo para pelo menos ' + n(rec.roas) + '×, para ao menos parar de perder dinheiro em cada venda por anúncio.' + rec.nota
          : 'Suba o ROAS objetivo para ' + n(rec.roas) + '× para manter ' + n(p.margemMinimaPct, 0) + '% de margem depois do anúncio.',
        emJogo: (eq > 0 ? m.investimento - m.receitaAds / eq : m.investimento) });
    }
    if (camp && camp.roasObjetivo != null && camp.roasObjetivo < eq) {
      d.push({ nivel: 'atencao', titulo: 'O objetivo da campanha aceita vender com prejuízo',
        detalhe: 'A campanha "' + camp.nome + '" busca ROAS ' + n(camp.roasObjetivo) + '×, abaixo do equilíbrio deste produto (' + n(eq) + '×). O algoritmo vai comprar vendas que não se pagam.',
        acao: 'Mova o anúncio para uma campanha com ROAS objetivo de pelo menos ' + n(rec.roas) + '×, junto de produtos de margem parecida.' + rec.nota,
        emJogo: m.investimento });
    }
    if (m.roas >= eq * 1.5 && camp && temDados) {
      if (camp.metricas.perdidasOrcamento != null && camp.metricas.perdidasOrcamento >= 0.2) {
        d.push({ nivel: 'oportunidade', titulo: 'Rentável e travado pelo orçamento',
          detalhe: 'ROAS de ' + n(m.roas) + '× com folga sobre o equilíbrio (' + n(eq) + '×), mas a campanha deixou de aparecer em ' + pct(camp.metricas.perdidasOrcamento) + ' das oportunidades por falta de orçamento.',
          acao: 'Aumente o orçamento diário da campanha "' + camp.nome + '" (hoje ' + reais(camp.orcamentoDiario) + ') aos poucos, uns 20% por vez, conferindo se o ROAS se mantém.',
          emJogo: m.receitaAds * camp.metricas.perdidasOrcamento });
      } else if (camp.metricas.perdidasRanking != null && camp.metricas.perdidasRanking >= 0.3 && c.roasAlvo != null && m.roas > c.roasAlvo * 1.2) {
        d.push({ nivel: 'oportunidade', titulo: 'Há margem para disputar mais leilões',
          detalhe: 'A campanha perdeu ' + pct(camp.metricas.perdidasRanking) + ' das oportunidades por ranking, e este anúncio roda com ROAS ' + n(m.roas) + '×, bem acima do necessário (' + n(c.roasAlvo) + '×).',
          acao: 'Dá para baixar o ROAS objetivo em direção a ' + n(roasParaDigitar(c.roasAlvo)) + '× sem passar da margem mínima de ' + n(p.margemMinimaPct, 0) + '% — mais leilões, mais vendas.',
          emJogo: m.receitaAds * camp.metricas.perdidasRanking });
      }
    }
  }

  if (m.unidadesAds === 0 && (m.cliques >= CLIQUES_MINIMOS || (c.margemUn != null && m.investimento >= c.margemUn * 2))) {
    d.push({ nivel: m.investimento >= 50 ? 'critico' : 'atencao', titulo: 'Gasto sem venda',
      detalhe: reais(m.investimento) + ' investidos em ' + m.cliques + ' cliques, e nenhuma venda atribuída no período.',
      acao: 'Quem clica chegou até a página e não comprou: compare preço e frete com os concorrentes, reveja fotos, descrição e avaliações. Se nada mudar em 14 dias, tire o anúncio da campanha.',
      emJogo: m.investimento });
  }

  if (m.impressoes >= 1000 && referencia.ctr != null && m.ctr < referencia.ctr * 0.5) {
    d.push({ nivel: 'atencao', titulo: 'Aparece, mas quase ninguém clica',
      detalhe: 'CTR de ' + n(m.ctr, 2) + '%, menos da metade da mediana dos seus anúncios (' + n(referencia.ctr, 2) + '%).',
      acao: 'Na busca o comprador só vê foto, título e preço. ' + (a.fotoBoa === false ? 'A foto de capa deste anúncio não passou no critério de qualidade do ML: comece por ela.' : 'Teste outra foto de capa e confira se o preço está competitivo.'),
      emJogo: m.investimento * 0.5 });
  } else if (m.cliques >= 50 && referencia.cvr != null && m.cvr < referencia.cvr * 0.5 && m.unidadesAds > 0) {
    d.push({ nivel: 'atencao', titulo: 'Clicam, mas não compram',
      detalhe: 'Conversão de ' + n(m.cvr, 2) + '%, menos da metade da mediana dos seus anúncios (' + n(referencia.cvr, 2) + '%).',
      acao: 'O anúncio atrai, a página não fecha: preço e frete frente aos concorrentes, variações disponíveis, descrição, perguntas sem resposta e nota das avaliações.',
      emJogo: m.investimento * 0.5 });
  }

  if (c.unidadesTotais >= 10 && m.unidadesAds / c.unidadesTotais > 0.8 && c.margemPct != null && c.margemPosAdsPct != null && c.margemPosAdsPct < c.margemPct / 2) {
    d.push({ nivel: 'atencao', titulo: 'Vendas dependem do anúncio',
      detalhe: pct(m.unidadesAds / c.unidadesTotais) + ' das vendas vieram de anúncio, e a publicidade come mais da metade da margem.',
      acao: 'Antes de escalar, fortaleça o orgânico: reputação, preço competitivo, Full e perguntas respondidas fazem o anúncio aparecer sem pagar clique.',
      emJogo: m.investimento * 0.3 });
  }

  if (!d.length) {
    d.push({ nivel: 'ok', titulo: 'Saudável',
      detalhe: c.roasEquilibrio != null
        ? 'ROAS de ' + n(m.roas) + '× acima do equilíbrio (' + n(c.roasEquilibrio) + '×), margem pós ads de ' + pct(c.margemPosAdsPct || 0) + '.'
        : 'Sem sinal de problema nos números do período.',
      acao: temDados ? 'Mantenha e acompanhe semanalmente.' : 'Ainda com poucos cliques: espere o período de aprendizado (14 a 21 dias) antes de mexer.',
      emJogo: 0 });
  }

  return d.sort((x, y) => ORDEM[x.nivel] - ORDEM[y.nivel] || y.emJogo - x.emJogo);
}

/**
 * Diagnóstico da campanha: o que só aparece olhando o grupo.
 * @param {Campanha} camp @param {Array<{ a: AnuncioBruto, c: Conta }>} doGrupo
 * @returns {Diagnostico[]}
 */
export function diagnosticarCampanha(camp, doGrupo) {
  /** @type {Diagnostico[]} */
  const d = [];
  const eqs = doGrupo.map((x) => x.c.roasEquilibrio).filter((v) => v != null && Number.isFinite(v));
  if (eqs.length >= 2) {
    const min = Math.min(.../** @type {number[]} */ (eqs));
    const max = Math.max(.../** @type {number[]} */ (eqs));
    if (max / min >= 2) {
      d.push({ nivel: 'atencao', titulo: 'Campanha mistura margens muito diferentes',
        detalhe: 'Os produtos desta campanha precisam de ROAS entre ' + n(min) + '× e ' + n(max) + '× para se pagar, mas a campanha tem um objetivo só. O produto de margem alta esconde o prejuízo do de margem baixa.',
        acao: 'Separe em campanhas por faixa de margem, com 15 a 30 anúncios de margem parecida em cada, e dê a cada uma o ROAS objetivo que a faixa exige.',
        emJogo: camp.metricas.investimento });
    }
  }
  const p = camp.metricas;
  if (p.perdidasOrcamento != null && p.perdidasOrcamento >= 0.3) {
    d.push({ nivel: p.roas > 0 && eqs.length && p.roas >= Math.max(.../** @type {number[]} */ (eqs)) ? 'oportunidade' : 'atencao',
      titulo: 'Orçamento curto',
      detalhe: 'A campanha deixou de aparecer em ' + pct(p.perdidasOrcamento) + ' das oportunidades por falta de orçamento (hoje ' + reais(camp.orcamentoDiario) + ' por dia).',
      acao: 'Só aumente o orçamento se os anúncios dela estiverem acima do equilíbrio; senão, primeiro corrija o ROAS objetivo.',
      emJogo: p.receita * p.perdidasOrcamento });
  }
  if (p.perdidasRanking != null && p.perdidasRanking >= 0.5) {
    d.push({ nivel: 'atencao', titulo: 'Perdendo leilões por ranking',
      detalhe: 'Em ' + pct(p.perdidasRanking) + ' das oportunidades os anúncios não apareceram porque o ranking ficou abaixo dos concorrentes.',
      acao: 'Ranking é qualidade do anúncio mais ROAS objetivo. Tire da campanha os anúncios que não convertem e melhore foto e preço antes de baixar o objetivo.',
      emJogo: p.receita * p.perdidasRanking * 0.5 });
  }
  return d;
}
