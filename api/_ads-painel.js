// Painel de Patrocinados: os anúncios ativos em Product Ads, com as métricas de
// publicidade e a economia real de cada um (preço praticado, comissão e frete
// cobrados nas vendas). A MARGEM não é calculada aqui: ela depende do custo do
// produto e do imposto, que o vendedor informa na tela, e a conta é refeita no
// navegador a cada custo digitado sem voltar ao Mercado Livre.
//
// Fontes (documentação "Product Ads para Catálogo e User Products", 2026):
//   - As métricas POR ANÚNCIO (/product_ads/ads/...) foram removidas pelo ML em
//     30/05/2026. O caminho atual é por Ad Group: a busca de Ad Groups do
//     anunciante e, dentro de cada um, os anúncios (MLB) com métricas.
//   - Métricas de competitividade (impressões ganhas, perdidas por orçamento e
//     por ranking) só vêm no detalhe de cada campanha.
//   - Métricas valem até 90 dias para trás e são atualizadas às 10h (GMT-3). A
//     janela de atribuição de uma venda a um clique é de 14 dias.

const { mlFetch } = require('./_ml-helper');

const SITE = 'MLB';

// 30 dias: cobre duas janelas de atribuição de 14 dias. Menos que isso, o que
// foi clicado no fim do período ainda não teve tempo de virar venda e o ROAS
// sai pessimista.
const JANELA_DIAS = 30;

const LOTE = 8;
const V2 = { headers: { 'api-version': '2' } };

const METRICAS_ANUNCIO = [
    'clicks', 'prints', 'ctr', 'cost', 'cpc', 'acos', 'tacos', 'cvr', 'roas', 'sov',
    'direct_amount', 'indirect_amount', 'total_amount',
    'direct_units_quantity', 'indirect_units_quantity', 'units_quantity',
    'organic_units_quantity', 'organic_units_amount',
].join(',');

const METRICAS_CAMPANHA = [
    'clicks', 'prints', 'ctr', 'cost', 'cpc', 'acos', 'cvr', 'roas',
    'total_amount', 'units_quantity', 'organic_units_quantity', 'organic_units_amount',
    'impression_share', 'top_impression_share',
    'lost_impression_share_by_budget', 'lost_impression_share_by_ad_rank', 'acos_benchmark',
].join(',');

// Pedidos: páginas de 50, até 1.000 pedidos no período. Acima disso a conta
// de comissão e preço médio fica com amostra, e a tela avisa.
const PEDIDOS_POR_PAGINA = 50;
const PEDIDOS_MAX_PAGINAS = 20;

// Frete real: os envios mais recentes de cada anúncio, só de compras avulsas.
// Carrinho vira VÁRIOS pedidos de um item cada, todos no mesmo envio (pack_id
// preenchido): o custo desse envio é do pacote inteiro, não do anúncio. Filtrar
// só por "pedido com um item" deixava o carrinho passar e inflava o frete.
// Mediana, e não média: um destino distante não puxa o valor típico.
const ENVIOS_POR_ANUNCIO = 5;


// ── Calendário de Brasília ──────────────────────────────────────────────
// O servidor roda em UTC. Contar os dias por ele fazia o "ontem" virar hoje
// das 21h à meia-noite de Brasília, e o período entrava com um dia sem
// métricas fechadas.
const FUSO = 'America/Sao_Paulo';

// As métricas de Product Ads fecham às 10h de Brasília (documentação de
// Product Ads). Antes disso, ontem ainda está incompleto: entrar com ele
// deixaria o fim do período com gasto e vendas pela metade.
const HORA_FECHAMENTO_METRICAS = 10;

/** Dia de hoje em Brasília, "AAAA-MM-DD". */
function diaBrasilia(agora = new Date()) {
    return agora.toLocaleDateString('en-CA', { timeZone: FUSO });
}

function horaBrasilia(agora = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' }).format(agora));
}

/** Soma dias a "AAAA-MM-DD". Meio-dia UTC para nenhum fuso virar a data. */
function somarDias(dia, n) {
    return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/**
 * Últimos N dias com métricas fechadas: até ontem depois das 10h, até
 * anteontem antes disso. Sempre no calendário de Brasília.
 */
function periodo(dias, agora = new Date()) {
    const diasFechados = horaBrasilia(agora) >= HORA_FECHAMENTO_METRICAS ? 1 : 2;
    const ate = somarDias(diaBrasilia(agora), -diasFechados);
    return { de: somarDias(ate, -(dias - 1)), ate, dias };
}

async function pedirJson(userId, caminho, opcoes) {
    try {
        const r = await mlFetch(userId, caminho, opcoes);
        if (!r.ok) return { erro: r.status };
        return { dados: await r.json() };
    } catch (err) {
        return { erro: 0 };
    }
}

async function emLotes(lista, tamanho, fn) {
    const saida = [];
    for (let i = 0; i < lista.length; i += tamanho) {
        saida.push(...(await Promise.all(lista.slice(i, i + tamanho).map(fn))));
    }
    return saida;
}

const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── Anunciante ──────────────────────────────────────────────────────────

async function anunciante(userId) {
    const r = await mlFetch(userId, '/advertising/advertisers?product_id=PADS', { headers: { 'Api-Version': '1' } }, true);
    const resp = r.resp;
    if (resp.status === 404) {
        return {
            ok: false,
            motivo: 'sem_publicidade',
            mensagem: 'Esta conta do Mercado Livre não tem Publicidade habilitada (Meu perfil > Publicidade). O ML exige reputação amarela ou melhor, 15 dias de cadastro e um mínimo de vendas.',
        };
    }
    if (!resp.ok) return { ok: false, motivo: 'erro_anunciante', mensagem: 'Não foi possível consultar a conta de anunciante (HTTP ' + resp.status + ').' };
    const dados = await resp.json();
    const lista = dados.advertisers || [];
    const conta = lista.find((a) => a.site_id === SITE) || lista[0];
    if (!conta) return { ok: false, motivo: 'sem_anunciante', mensagem: 'A API de publicidade não devolveu conta de anunciante para este usuário.' };
    return { ok: true, id: conta.advertiser_id, mlUserId: r.mlUserId };
}

// Acha o Ad Group de UM item e lê a métrica dele — o miolo de metricasDoItem e
// metricasVariosItens, já com a conta de anunciante resolvida.
async function metricasComConta(userId, conta, itemId, de, ate) {
    const grupo = await pedirJson(userId,
        `/advertising/${SITE}/advertisers/${conta.id}/product_ads/ad_groups/search?filters[item_ids]=${encodeURIComponent(itemId)}`, V2);
    const achado = grupo.dados && (grupo.dados.results || [])[0];
    if (!achado) return { habilitada: true, motivo: 'fora_de_campanha' };
    const anuncios = await pedirJson(userId,
        `/advertising/${SITE}/product_ads/ad_groups/${achado.id}/ads?date_from=${de}&date_to=${ate}&metrics=${METRICAS_ANUNCIO}`, V2);
    const linha = anuncios.dados && (anuncios.dados.results || []).find((a) => a.item_id === itemId);
    return {
        habilitada: true,
        status: (linha && linha.status) || String(achado.status || '').toLowerCase() || null,
        campanhaId: achado.campaign_id || null,
        metricas: (linha && linha.metrics) || null,
    };
}

// ── Métricas de um anúncio (MLB), pelo caminho atual ────────────────────
// Substitui a consulta por anúncio que o ML desligou em 30/05/2026: acha o Ad
// Group do item e lê as métricas dele entre os anúncios do grupo.
async function metricasDoItem(userId, itemId, dias) {
    const conta = await anunciante(userId);
    if (!conta.ok) return { habilitada: conta.motivo !== 'sem_publicidade' ? null : false, motivo: conta.motivo };
    const { de, ate } = periodo(dias);
    return { ...(await metricasComConta(userId, conta, itemId, de, ate)), dias };
}

// Mesma conta, vários itens — usada quando se quer saber o investimento em
// publicidade de uma LISTA de anúncios (ex.: a margem do catálogo) sem repetir
// a checagem "esta conta tem Publicidade habilitada?" uma vez por item, que é
// a chamada mais lenta do caminho.
//
// Devolve um mapa { itemId: metricasDoItem(...) }. Se a conta não tem
// Publicidade habilitada, devolve {} sem consultar item nenhum — em vez do
// chamador ver N vezes o mesmo "sem_publicidade".
async function metricasVariosItens(userId, itemIds, dias) {
    const conta = await anunciante(userId);
    if (!conta.ok) return {};
    const { de, ate } = periodo(dias);
    const porItem = {};
    await emLotes(itemIds, LOTE, async (itemId) => {
        porItem[itemId] = { ...(await metricasComConta(userId, conta, itemId, de, ate)), dias };
    });
    return porItem;
}

// ── Painel ──────────────────────────────────────────────────────────────

async function listarGrupos(userId, advId, de, ate) {
    const r = await pedirJson(userId,
        `/advertising/${SITE}/advertisers/${advId}/product_ads/ad_groups/search`
        + `?date_from=${de}&date_to=${ate}&limit=800&sort=desc&sort_by=cost&filters[statuses]=active&metrics=${METRICAS_ANUNCIO.toUpperCase()}`, V2);
    if (r.erro != null) return { erro: r.erro, grupos: [] };
    return { grupos: (r.dados && r.dados.results) || [] };
}

async function anunciosDoGrupo(userId, grupoId, de, ate) {
    const r = await pedirJson(userId,
        `/advertising/${SITE}/product_ads/ad_groups/${grupoId}/ads?date_from=${de}&date_to=${ate}&metrics=${METRICAS_ANUNCIO}`, V2);
    return (r.dados && r.dados.results) || [];
}

async function campanhas(userId, advId, de, ate) {
    const busca = await pedirJson(userId,
        `/advertising/${SITE}/advertisers/${advId}/product_ads/campaigns/search?limit=50&filters[status]=active`, V2);
    const lista = (busca.dados && busca.dados.results) || [];
    // Competitividade só no detalhe de cada campanha.
    return emLotes(lista, LOTE, async (c) => {
        const det = await pedirJson(userId,
            `/advertising/${SITE}/product_ads/campaigns/${c.id}?date_from=${de}&date_to=${ate}&metrics=${METRICAS_CAMPANHA}`, V2);
        const d = det.dados || c;
        const m = d.metrics || {};
        const roasObjetivo = numero(d.roas_target) || (numero(d.acos_target) > 0 ? 100 / numero(d.acos_target) : null);
        return {
            id: c.id,
            nome: d.name || c.name || 'Campanha ' + c.id,
            estrategia: d.strategy || c.strategy || null,
            roasObjetivo,
            orcamentoDiario: numero(d.budget != null ? d.budget : c.budget),
            orcamentoAutomatico: !!d.automatic_budget,
            metricas: {
                investimento: numero(m.cost),
                receita: numero(m.total_amount),
                roas: numero(m.roas),
                acos: numero(m.acos),
                cliques: numero(m.clicks),
                impressoes: numero(m.prints),
                unidadesAds: numero(m.units_quantity),
                unidadesOrganicas: numero(m.organic_units_quantity),
                impressoesGanhas: m.top_impression_share != null ? numero(m.top_impression_share) : null,
                perdidasOrcamento: m.lost_impression_share_by_budget != null ? numero(m.lost_impression_share_by_budget) : null,
                perdidasRanking: m.lost_impression_share_by_ad_rank != null ? numero(m.lost_impression_share_by_ad_rank) : null,
                acosReferencia: numero(m.acos_benchmark) || null,
            },
        };
    });
}

/**
 * Venda real de cada anúncio no período: unidades, preço médio praticado,
 * comissão cobrada e amostras de envio para o frete. Tirar isso dos PEDIDOS, e
 * não de tabela ou cotação, é o que faz a margem bater com o extrato.
 */
async function vendasDoPeriodo(userId, mlUserId, de, ate, ids) {
    const alvo = new Set(ids);
    const porItem = new Map();
    const pegar = (id) => {
        if (!porItem.has(id)) porItem.set(id, { unidades: 0, receita: 0, tarifa: 0, envios: [] });
        return porItem.get(id);
    };
    // A documentação não diz se sale_fee é por unidade ou da linha. O pagamento
    // traz a tarifa total (marketplace_fee): nos pedidos de um item com mais de
    // uma unidade dá para ver qual das duas leituras bate.
    let votosPorUnidade = 0;
    let votosPorLinha = 0;
    const linhas = [];
    let parcial = false;

    // Os pedidos vão até HOJE para a amostra de frete pegar a venda mais
    // recente; receita, unidades e comissão ficam no mesmo período das
    // métricas de anúncio, que pode terminar ontem ou anteontem.
    const fimDoPeriodo = Date.parse(`${ate}T23:59:59.999-03:00`);
    const hoje = diaBrasilia();

    for (let pagina = 0; pagina < PEDIDOS_MAX_PAGINAS; pagina += 1) {
        const qs = `seller=${mlUserId}&order.status=paid&order.date_created.from=${de}T00:00:00.000-03:00`
            + `&order.date_created.to=${hoje}T23:59:59.000-03:00&sort=date_desc&limit=${PEDIDOS_POR_PAGINA}&offset=${pagina * PEDIDOS_POR_PAGINA}`;
        const r = await pedirJson(userId, `/orders/search?${qs}`);
        if (r.erro != null) break;
        const pedidos = (r.dados && r.dados.results) || [];
        for (const p of pedidos) {
            const itens = p.order_items || [];
            const taxaPaga = (p.payments || []).reduce((acc, pg) => acc + numero(pg.marketplace_fee), 0);
            if (itens.length === 1 && numero(itens[0].quantity) > 1 && taxaPaga > 0) {
                const l = itens[0];
                const erroUnidade = Math.abs(numero(l.sale_fee) * numero(l.quantity) - taxaPaga);
                const erroLinha = Math.abs(numero(l.sale_fee) - taxaPaga);
                if (erroUnidade < erroLinha) votosPorUnidade += 1; else if (erroLinha < erroUnidade) votosPorLinha += 1;
            }
            const noPeriodo = !(Date.parse(p.date_created) > fimDoPeriodo);
            // "pack_id preenchido" NÃO quer dizer que o envio é compartilhado
            // com outro item: o checkout do ML embrulha em pack até uma compra
            // avulsa de um item só. Conferido ao vivo numa conta real — de 14
            // vendas de um mesmo anúncio em 30 dias, 12 tinham pack_id e as 5
            // checadas eram pacotes de UM pedido só, mas por causa desse
            // descarte a amostra de frete usava só as 2 sem pack_id, e o
            // resultado (mediana R$ 12,95) ficava bem diferente do que a
            // maioria das vendas de fato pagou (R$ 6,85). Por isso o pacote só
            // é descartado depois de CONFERIR (pacoteEhSoDesteAnuncio) que
            // reúne mais de um pedido — sinal real de envio dividido com outro
            // anúncio — não mais pelo pack_id existir.
            const candidato = itens.length === 1;
            for (const l of itens) {
                const id = l.item && l.item.id;
                if (!alvo.has(id)) continue;
                const acc = pegar(id);
                if (noPeriodo) linhas.push({ id, qtd: numero(l.quantity), preco: numero(l.unit_price), taxa: numero(l.sale_fee) });
                const envio = p.shipping && p.shipping.id;
                // O dobro do que se usa no fim: parte dos candidatos cai na
                // conferência do pacote, e ENVIOS_POR_ANUNCIO precisa fechar
                // mesmo assim sempre que der.
                if (envio && candidato && acc.envios.length < ENVIOS_POR_ANUNCIO * 2) {
                    acc.envios.push({ id: envio, qtd: numero(l.quantity), packId: p.pack_id || null });
                }
            }
        }
        const total = numero(r.dados && r.dados.paging && r.dados.paging.total);
        if ((pagina + 1) * PEDIDOS_POR_PAGINA >= total) break;
        if (pagina === PEDIDOS_MAX_PAGINAS - 1) parcial = true;
    }

    // Empate ou sem amostra: por unidade, que é o que a tarifa percentual faz.
    const taxaEhPorLinha = votosPorLinha > votosPorUnidade;
    for (const l of linhas) {
        const acc = pegar(l.id);
        acc.unidades += l.qtd;
        acc.receita += l.preco * l.qtd;
        acc.tarifa += taxaEhPorLinha ? l.taxa : l.taxa * l.qtd;
    }

    // Envio que só entrega ESTE pedido (pack com um pedido só) — sem isso não
    // dá pra saber se o custo do envio é só deste item ou de um pacote com
    // outro anúncio dentro. Sem pack_id nenhum, nem essa dúvida existe.
    async function pacoteEhSoDesteAnuncio(packId) {
        if (!packId) return true;
        const r = await pedirJson(userId, `/packs/${packId}`);
        return Array.isArray(r.dados && r.dados.orders) && r.dados.orders.length <= 1;
    }

    // Frete que o vendedor pagou de fato, por unidade. senders[].cost é o valor
    // final cobrado, já com os descontos (documentação "Gerenciamento de envios").
    await emLotes(Array.from(porItem.entries()), LOTE, async ([, acc]) => {
        const exclusivos = [];
        for (const e of acc.envios) {
            if (exclusivos.length >= ENVIOS_POR_ANUNCIO) break;
            if (await pacoteEhSoDesteAnuncio(e.packId)) exclusivos.push(e);
        }
        const custos = await Promise.all(exclusivos.map(async (e) => {
            const c = await pedirJson(userId, `/shipments/${e.id}/costs`, { headers: { 'x-format-new': 'true' } });
            const remetentes = (c.dados && c.dados.senders) || [];
            // A linha deste vendedor. Pegar a primeira da lista quando ela não
            // aparece podia atribuir o frete de outro vendedor do mesmo envio.
            const meu = remetentes.find((s) => String(s.user_id) === String(mlUserId))
                || (remetentes.length === 1 ? remetentes[0] : null);
            return meu && typeof meu.cost === 'number' && e.qtd > 0 ? meu.cost / e.qtd : null;
        }));
        const validos = custos.filter((v) => v != null).sort((a, b) => a - b);
        const meio = Math.floor(validos.length / 2);
        acc.fretePorUnidade = !validos.length ? null
            : validos.length % 2 ? validos[meio] : (validos[meio - 1] + validos[meio]) / 2;
        acc.amostrasFrete = validos.length;
    });

    return { porItem, parcial, taxaEhPorLinha };
}

/**
 * Comissão e frete de tabela para quem não vendeu no período — a melhor
 * estimativa possível na ausência de uma venda real pra olhar.
 *
 * O frete sempre é contado como custo do vendedor. Nunca zerado por o preço
 * estar abaixo de R$ 79 supostamente pagar 0: o Mercado Envios cobra uma
 * tarifa de frete mesmo nesses casos (regra vigente desde 02/03/2026), e é
 * exatamente essa tarifa que a venda real mostra quando existe — zerar aqui
 * era subestimar o custo e mostrar lucro que não existe (visto num anúncio de
 * R$ 41,61 que realmente pagou R$ 7,35 de frete, e a estimativa dava R$ 0).
 * mlUserId null/vazio pula a cotação de frete (freteUn sai null em vez de uma
 * chamada fadada a falhar) — a comissão não depende dele.
 */
async function custosDeTabela(userId, mlUserId, anuncio, categoria) {
    const preco = anuncio.price;
    const tipo = anuncio.listing_type_id || 'gold_special';
    const logistica = anuncio.logistic_type || 'drop_off';
    const [taxa, frete] = await Promise.all([
        categoria
            ? pedirJson(userId, `/sites/${SITE}/listing_prices?price=${preco}&category_id=${categoria}&listing_type_id=${tipo}&logistic_type=${logistica}&shipping_mode=me2`)
            : Promise.resolve({ erro: 0 }),
        mlUserId
            ? pedirJson(userId, `/users/${mlUserId}/shipping_options/free?item_id=${anuncio.item_id}&item_price=${preco}&listing_type_id=${tipo}`
                + `&mode=me2&condition=new&logistic_type=${logistica}&free_shipping=true&verbose=true`)
            : Promise.resolve({ erro: 0 }),
    ]);
    const linha = Array.isArray(taxa.dados) ? taxa.dados.find((d) => d.listing_type_id === tipo) || taxa.dados[0] : taxa.dados;
    const cobertura = frete.dados && frete.dados.coverage && frete.dados.coverage.all_country;
    return {
        comissaoUn: linha && linha.sale_fee_amount != null ? numero(linha.sale_fee_amount) : null,
        freteUn: cobertura ? numero(cobertura.list_cost) : null,
    };
}

async function painelDeAds(userId) {
    const conta = await anunciante(userId);
    if (!conta.ok) return conta;
    const { de, ate, dias } = periodo(JANELA_DIAS);

    const [grupos, listaCampanhas] = await Promise.all([
        listarGrupos(userId, conta.id, de, ate),
        campanhas(userId, conta.id, de, ate),
    ]);
    if (grupos.erro != null && !grupos.grupos.length) {
        return { ok: false, motivo: 'erro_ads', mensagem: 'Não foi possível listar os anúncios em Publicidade (HTTP ' + grupos.erro + ').' };
    }

    const porGrupo = await emLotes(grupos.grupos, LOTE, (g) => anunciosDoGrupo(userId, g.id, de, ate));
    const anuncios = [];
    porGrupo.forEach((lista, i) => {
        const g = grupos.grupos[i];
        for (const a of lista) {
            if (String(a.status || '').toLowerCase() !== 'active') continue;
            anuncios.push({ ...a, ad_group_id: g.id, campaign_id: a.campaign_id || g.campaign_id });
        }
    });

    const ids = anuncios.map((a) => a.item_id);
    const vendas = await vendasDoPeriodo(userId, conta.mlUserId, de, ate, ids);

    // Quem não vendeu no período fica com comissão e frete de tabela.
    const semVenda = anuncios.filter((a) => !(vendas.porItem.get(a.item_id) || {}).unidades);
    const detalhes = new Map();
    for (let i = 0; i < semVenda.length; i += 20) {
        const lote = semVenda.slice(i, i + 20).map((a) => a.item_id);
        const r = await pedirJson(userId, `/items?ids=${lote.join(',')}&attributes=id,category_id`);
        for (const e of (Array.isArray(r.dados) ? r.dados : [])) {
            if (e.code === 200 && e.body) detalhes.set(e.body.id, e.body);
        }
    }
    const tabela = new Map();
    await emLotes(semVenda, LOTE, async (a) => {
        const d = detalhes.get(a.item_id) || {};
        tabela.set(a.item_id, await custosDeTabela(userId, conta.mlUserId, a, d.category_id));
    });

    const linhas = anuncios.map((a) => {
        const m = a.metrics || {};
        const v = vendas.porItem.get(a.item_id);
        const t = tabela.get(a.item_id);
        const vendeu = !!(v && v.unidades);
        return {
            itemId: a.item_id,
            adGroupId: a.ad_group_id,
            campanhaId: a.campaign_id || null,
            titulo: a.title || a.item_id,
            thumbnail: a.thumbnail ? String(a.thumbnail).replace(/^http:/, 'https:') : null,
            permalink: a.permalink || null,
            preco: numero(a.price),
            logistica: a.logistic_type || null,
            tipoAnuncio: a.listing_type_id || null,
            recomendado: !!a.recommended,
            fotoBoa: a.image_quality ? a.image_quality === 'good_quality_thumbnail' : null,
            estoqueDiferido: !!a.deferred_stock,
            metricas: {
                investimento: numero(m.cost),
                receitaAds: numero(m.total_amount),
                receitaDireta: numero(m.direct_amount),
                receitaIndireta: numero(m.indirect_amount),
                cliques: numero(m.clicks),
                impressoes: numero(m.prints),
                ctr: numero(m.ctr),
                cpc: numero(m.cpc),
                cvr: numero(m.cvr),
                roas: numero(m.roas),
                acos: numero(m.acos),
                tacos: numero(m.tacos),
                unidadesAds: numero(m.units_quantity),
                unidadesDiretas: numero(m.direct_units_quantity),
                unidadesOrganicas: numero(m.organic_units_quantity),
                receitaOrganica: numero(m.organic_units_amount),
            },
            economia: {
                precoMedio: vendeu ? v.receita / v.unidades : numero(a.price),
                comissaoUn: vendeu ? v.tarifa / v.unidades : (t ? t.comissaoUn : null),
                comissaoFonte: vendeu ? 'vendas' : 'tabela',
                // Frete real vale mesmo sem venda no período: a de hoje já conta.
                freteUn: v && v.fretePorUnidade != null ? v.fretePorUnidade : (t ? t.freteUn : null),
                freteFonte: v && v.fretePorUnidade != null ? 'vendas' : 'cotacao',
                amostrasFrete: v && v.fretePorUnidade != null ? v.amostrasFrete || 0 : 0,
                unidadesVendidas: vendeu ? v.unidades : 0,
            },
        };
    });

    return {
        ok: true,
        periodo: { de, ate, dias },
        campanhas: listaCampanhas,
        anuncios: linhas,
        avisos: {
            pedidosParciais: vendas.parcial,
            tarifaPorLinha: vendas.taxaEhPorLinha,
        },
    };
}

module.exports = { painelDeAds, metricasDoItem, metricasVariosItens, custosDeTabela, periodo, vendasDoPeriodo };
