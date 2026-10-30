const crypto = require('crypto');
const { mlFetch, supabaseAdmin, requireAccess } = require('./_ml-helper');
const { painelDeAds, metricasVariosItens, custosDeTabela, vendasDoPeriodo, periodo: periodoAds } = require('./_ads-painel');
const { shopeeFetch } = require('./_shopee-helper');

const ITEMS_PER_USER_CAP = 100; // 1 página de /items/search (máx permitido pela API); evita estourar o tempo de execução da function
const ITEM_CHECK_CONCURRENCY = 8; // chamadas simultâneas à API do ML por item, pra caber no limite de 60s da function

// Usuários verificados em paralelo por rodada. Baixo de propósito: cada usuário
// já abre ITEM_CHECK_CONCURRENCY chamadas ao ML, e a cota de API é da
// aplicação — estourá-la derruba a automação de todos os clientes ao mesmo tempo.
const USER_CHECK_CONCURRENCY = 3;

// Orçamento de tempo da rodada. A function morre em 60s no plano Hobby da
// Vercel; parando de iniciar usuários aos 45s sobra folga para os que já estão
// rodando terminarem e gravarem status.
const RUN_BUDGET_MS = 45000;

// Avaliação escrita há mais que isso, quando aparece pela primeira vez, é
// histórico e não novidade. O cron roda a cada 15 minutos, então uma
// avaliação nova de verdade é vista em minutos; três dias cobre folgado uma
// pane do agendador sem deixar o passado virar alerta.
const JANELA_AVALIACAO_NOVA_MS = 3 * 24 * 60 * 60 * 1000;
const JANELA_MS = 15 * 60 * 1000; // cadência do cron; define de quanto em quanto tempo a janela de anúncios avança

// Normaliza URL de imagem do Mercado Livre para https. Vários endpoints do ML
// ainda devolvem http:// no campo thumbnail, e como o Impoclick é servido em
// https isso vira mixed content: o navegador promove a requisição sozinho, mas
// registra violação de CSP — eram ~115 avisos no console por carregamento.
// Guardamos já normalizado no banco pra não ter que tratar em cada leitura.
function toHttps(url) {
    if (!url) return null;
    return String(url).replace(/^http:\/\//i, 'https://');
}

// Converte para número ou null. Nada de `Number(v) || null`: preço 0 e estoque
// 0 são valores legítimos e virariam null com o operador ||.
function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// Roda fn(item) para cada item da lista, com no máximo `limit` chamadas em paralelo.
// Sem isso, checar reviews + catálogo + promoções item por item em série estoura os
// 60s da function assim que a base de itens/usuários cresce um pouco.
async function mapWithConcurrency(items, limit, fn) {
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const current = idx++;
            await fn(items[current], current);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Também traz catalog_product_id: em anúncios de catálogo, as opiniões ficam
// atreladas ao produto do catálogo, não à publicação — sem esse id na chamada
// de /reviews/item, a API devolve a lista vazia mesmo quando o produto tem avaliações.
async function fetchItemMeta(userId, itemIds) {
    const meta = {};
    for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        // secure_thumbnail junto com thumbnail: o campo `thumbnail` do Mercado
        // Livre vem em http://, o que gera mixed content na página (servida em
        // https) — o navegador promove sozinho, mas registra violação de CSP e
        // enchia o console com centenas de avisos. O secure_thumbnail já vem em
        // https; o thumbnail fica só como fallback, normalizado abaixo.
        const resp = await mlFetch(userId, `/items?ids=${batch.join(',')}&attributes=id,title,thumbnail,secure_thumbnail,catalog_product_id,user_product_id,status,available_quantity,category_id,listing_type_id,shipping,price,original_price`);
        if (!resp.ok) continue;
        const data = await resp.json();
        for (const entry of data) {
            if (entry.code === 200 && entry.body) {
                meta[entry.body.id] = {
                    title: entry.body.title,
                    thumbnail: toHttps(entry.body.secure_thumbnail || entry.body.thumbnail),
                    catalogProductId: entry.body.catalog_product_id || null,
                    userProductId: entry.body.user_product_id || null,
                    status: entry.body.status || null,
                    estoque: typeof entry.body.available_quantity === 'number' ? entry.body.available_quantity : null,
                    // Necessários para saber quanto sobra numa promoção: a
                    // tarifa depende de categoria + tipo de anúncio, e o frete
                    // depende do tipo de logística.
                    categoryId: entry.body.category_id || null,
                    listingTypeId: entry.body.listing_type_id || null,
                    logisticType: (entry.body.shipping && entry.body.shipping.logistic_type) || 'drop_off',
                    // Preço em vigor AGORA (já reflete a promoção ativa, se
                    // houver) e o preço cheio. É daqui que sai o piso da
                    // automação: quanto o anúncio deixa hoje, e não um número
                    // digitado à mão anúncio por anúncio.
                    price: typeof entry.body.price === 'number' ? entry.body.price : null,
                    originalPrice: typeof entry.body.original_price === 'number' ? entry.body.original_price : null,
                };
            }
        }
    }
    return meta;
}

// Link do anúncio (permalink) e o SKU que o vendedor cadastrou (atributo
// SELLER_SKU) — só para os itens de catálogo, à parte de fetchItemMeta (que
// roda pra TODOS os itens ativos a cada 15 min) pra não pedir o array de
// atributos — pesado — de anúncios que nem entram nesta tela.
async function fetchLinkESku(userId, itemIds) {
    const porItem = {};
    for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        const resp = await mlFetch(userId, `/items?ids=${batch.join(',')}&attributes=id,permalink,attributes`);
        if (!resp.ok) continue;
        const data = await resp.json();
        for (const entry of data) {
            if (entry.code !== 200 || !entry.body) continue;
            const atributos = Array.isArray(entry.body.attributes) ? entry.body.attributes : [];
            const sku = atributos.find(a => a.id === 'SELLER_SKU');
            porItem[entry.body.id] = {
                permalink: entry.body.permalink || null,
                sellerSku: (sku && (sku.value_name || sku.value_id)) || null,
            };
        }
    }
    return porItem;
}

// Status de competição de catálogo (GET /items/{id}/price_to_win?version=v2) só se
// aplica a anúncios com catalog_product_id. "is_read=false" marca só transições reais
// de ganhando -> perdendo (perder é a notificação; recuperar resolve sozinho) — não
// alerta na primeira vez que o item é visto, pra não inundar com status que já existia.
//
// listaCompleta indica que itemIds cobre todos os anúncios ativos da conta — só nesse
// caso dá para concluir que uma linha ausente é de um anúncio que saiu do catálogo
// (pausado, encerrado, ou perdeu o catalog_product_id) e não só de uma janela parcial.
async function checkCatalogCompetition(userId, itemIds, meta, listaCompleta) {
    const catalogItemIds = itemIds.filter(id => meta[id] && meta[id].catalogProductId);

    // Linhas de anúncio que saiu do catálogo. Sem isso, um anúncio que parou
    // de aparecer aqui (pausado, sem estoque, ML tirou do catálogo) ficava
    // "Ganhando" pra sempre — foi visto assim 12 dias depois de sair do ar,
    // ainda pedindo custo do produto como se fosse uma oportunidade viva.
    //
    // CUIDADO: a primeira versão disto usava `catalogItemIds` (que também
    // depende de fetchItemMeta ter respondido pra cada item) como a lista do
    // que "continua no catálogo" — e um lote de /items?ids= que falhasse por
    // instabilidade (nada raro) fazia itens ATIVOS, inclusive "Perdendo",
    // sumirem como se tivessem saído do catálogo. Agora só é órfão quem:
    //   a) nem está mais em itemIds (que vem de /items/search, sem essa
    //      segunda chamada no meio) — de fato não está mais ativo; ou
    //   b) está ativo, o detalhe do item respondeu (meta[id] existe) e ele
    //      não tem mais catalog_product_id.
    // meta[id] ausente (falha pontual de buscar o detalhe) não é motivo pra
    // apagar nada — fica pra próxima rodada tentar de novo.
    if (listaCompleta) {
        const { data: todas, error: erroLeitura } = await supabaseAdmin
            .from('ml_catalog_status')
            .select('ml_item_id')
            .eq('user_id', userId);
        if (erroLeitura) {
            console.error('Erro ao listar status de catálogo para limpeza:', erroLeitura.message);
        } else {
            const aindaAtivo = new Set(itemIds);
            const orfaos = (todas || []).map(r => r.ml_item_id).filter((id) => {
                if (!aindaAtivo.has(id)) return true;
                const m = meta[id];
                return !!m && !m.catalogProductId;
            });
            for (let i = 0; i < orfaos.length; i += 20) {
                const lote = orfaos.slice(i, i + 20);
                const { error } = await supabaseAdmin
                    .from('ml_catalog_status')
                    .delete()
                    .eq('user_id', userId)
                    .in('ml_item_id', lote);
                if (error) console.error('Erro ao limpar status de catálogo de anúncio fora do ar:', error.message);
            }
        }
    }

    if (catalogItemIds.length === 0) return { catalogChecked: 0, catalogLost: 0 };

    const linkESku = await fetchLinkESku(userId, catalogItemIds);

    const { data: existingRows, error: existingError } = await supabaseAdmin
        .from('ml_catalog_status')
        .select('ml_item_id, status, is_read, previous_status')
        .eq('user_id', userId)
        .in('ml_item_id', catalogItemIds);
    if (existingError) throw new Error(existingError.message);

    const oldByItemId = {};
    for (const row of existingRows || []) oldByItemId[row.ml_item_id] = row;

    const rows = [];
    let catalogLost = 0;

    await mapWithConcurrency(catalogItemIds, ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const resp = await mlFetch(userId, `/items/${itemId}/price_to_win?version=v2`);
        if (!resp.ok) return;

        const data = await resp.json();
        const status = data.status;
        const old = oldByItemId[itemId];

        // previousStatus guarda o status de ANTES da transição que gerou o alerta
        // atual (ex: "winning" antes de virar "competing") — carregado adiante sem
        // mudar enquanto o alerta seguir sem leitura, pra o card conseguir mostrar
        // "estava Ganhando, passou a Perder" mesmo em checagens seguintes, não só
        // na primeira em que a mudança foi detectada.
        let isRead;
        let previousStatus = old ? old.previous_status : null;
        if (!old) {
            isRead = true; // primeira vez que vemos este item — não é uma transição
        } else if (old.status === 'winning' && status !== 'winning') {
            isRead = false;
            previousStatus = old.status;
            catalogLost++;
        } else if (old.status !== 'winning' && status === 'winning') {
            isRead = true; // recuperou a posição, resolve o alerta sozinho
            previousStatus = null;
        } else {
            isRead = old.is_read;
        }

        const link = linkESku[itemId] || {};
        rows.push({
            user_id: userId,
            ml_item_id: itemId,
            item_title: meta[itemId].title || null,
            item_thumbnail: meta[itemId].thumbnail || null,
            catalog_product_id: meta[itemId].catalogProductId,
            user_product_id: meta[itemId].userProductId,
            status,
            previous_status: previousStatus,
            current_price: data.current_price ?? null,
            price_to_win: data.price_to_win ?? null,
            winner_item_id: (data.winner && data.winner.item_id) || null,
            winner_price: (data.winner && data.winner.price) ?? null,
            reason: Array.isArray(data.reason) && data.reason.length > 0 ? data.reason.join(', ') : null,
            is_read: isRead,
            updated_at: new Date().toISOString(),
            permalink: link.permalink || null,
            seller_sku: link.sellerSku || null,
        });
    });

    if (rows.length > 0) {
        let { error } = await supabaseAdmin
            .from('ml_catalog_status')
            .upsert(rows, { onConflict: 'user_id,ml_item_id' });
        // permalink/seller_sku são colunas novas (ml_catalog_link_sku.sql).
        // Sem elas ainda no banco, grava sem as duas em vez de travar a
        // checagem de catálogo inteira até o SQL rodar.
        if (error && /permalink|seller_sku/.test(error.message || '')) {
            ({ error } = await supabaseAdmin
                .from('ml_catalog_status')
                .upsert(rows.map(({ permalink, seller_sku, ...resto }) => resto), { onConflict: 'user_id,ml_item_id' }));
        }
        if (error) throw new Error(error.message);
    }

    return { catalogChecked: catalogItemIds.length, catalogLost };
}

// Promoções (GET /seller-promotions/items/{id}?app_version=v2) se dividem em dois
// conceitos bem diferentes, guardados em tabelas separadas:
//   - ml_promotions: promoções REAIS com prazo definido (finish_date sempre presente).
//     Dois gatilhos de alerta, via soon_alerted salvo (pra não re-notificar a cada
//     checagem depois que o usuário já viu):
//       1) faltam <= 3 dias pro fim
//       2) a promoção estava ativa e sumiu da lista da API = terminou
//   - ml_lightning_candidates: anúncios elegíveis pra Oferta Relâmpago (status=candidate,
//     type=LIGHTNING) — modalidade sem prazo fixo, então é só uma lista informativa de
//     oportunidade, sem alerta e sem is_read.
// ==========================================
// AUTOMAÇÃO DA CENTRAL DE PROMOÇÕES
//
// Entra sozinho nas promoções em que os anúncios foram convidados, respeitando
// um piso de preço calculado a partir do custo REAL de importação.
//
// Por que o piso vem gravado do banco e não é calculado aqui: o motor fiscal
// (alíquotas por NCM, câmbio, ICMS) vive no front. Duplicá-lo no servidor
// significaria manter duas versões da mesma regra tributária, e elas
// divergiriam na primeira mudança. O front calcula e grava; aqui só se compara.
//
// Travas, todas deliberadas:
//   - desligado por padrão (enabled = false)
//   - LIGHTNING desligado à parte: oferta relâmpago ativa NÃO pode ser
//     removida, só pausando o anúncio inteiro
//   - piso vencido (padrão 7 dias) faz o robô se recusar a agir — câmbio muda
//   - teto de entradas por dia, contra convite em massa virar liquidação
//   - toda decisão vai pra ml_promo_actions, inclusive as de NÃO agir
// ==========================================

// Data no "formato local" que o ML exige nos descontos individuais:
// YYYY-MM-DDTHH:mm:ss-03:00. ISO em UTC (terminando em Z) é recusado com
// "Start and finish dates must be in local format".
function dataLocalML(d) {
    const p = (n) => String(n).padStart(2, '0');
    // Horário de Brasília, referência do MLB.
    const local = new Date(d.getTime() - 3 * 3600 * 1000);
    // SEM o sufixo de fuso. "Local format" para o ML é a data já convertida,
    // sem offset — é assim que ele devolve as próprias campanhas
    // ("start_date": "2026-08-10T00:00:00"). Mandar "-03:00" junto era o que
    // vinha sendo recusado com "Start and finish dates must be in local format".
    return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}`
        + `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}`;
}

// Duração do desconto individual criado pela automação. Curto de propósito:
// a cada rodada a promoção é reavaliada, então um prazo longo prenderia o
// anúncio num preço que pode deixar de ser o melhor.
const DIAS_DESCONTO_INDIVIDUAL = 7;

// Formata valor para as mensagens do histórico, que o vendedor lê na tela.
function moeda(v) {
    return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

// A campanha está valendo AGORA?
//
// Os candidatos trazem a janela da campanha (start_date e end_date, ou
// finish_date dependendo do tipo). Sem checar isso, a automação podia escolher
// uma campanha que só começa semana que vem só porque pagava um pouco melhor —
// e o anúncio ficaria sem promoção nenhuma no presente, que é justamente o
// período que gera venda hoje.
//
// Na dúvida (campanha sem datas) considera vigente: vários tipos não informam
// janela, e descartá-los por omissão eliminaria promoções boas.
function estaVigente(p, agora) {
    const ini = p.start_date ? new Date(p.start_date).getTime() : null;
    const fim = p.finish_date ? new Date(p.finish_date).getTime()
              : p.end_date ? new Date(p.end_date).getTime() : null;

    if (ini != null && !isNaN(ini) && ini > agora) return false;   // ainda não começou
    if (fim != null && !isNaN(fim) && fim <= agora) return false;  // já terminou
    return true;
}

// Quanto o VENDEDOR realmente recebe numa promoção.
//
// O preço que o comprador vê engana: em campanha cofinanciada o Mercado Livre
// banca parte do desconto, e nos campos de boost ele ainda devolve uma redução
// nos custos por venda. Duas promoções com o mesmo preço de vitrine podem
// deixar valores bem diferentes no bolso.
//
// Modelo, a partir dos campos que a API devolve:
//
//   seller_percentage  -> a fatia do desconto bancada por VOCÊ. Se existe, o
//                         que você "sente" é original_price menos só essa
//                         fatia, não o desconto cheio que aparece na vitrine.
//   meli_percentage    -> a fatia bancada pelo ML. É de graça pra você.
//   discount_meli_boost_amount -> abatimento direto no custo por venda
//                         (tarifa), quando boosted_offer = true. Entra somando.
//
// Sem seller_percentage, assume-se o pior caso: o desconto inteiro sai de você.
// Quanto CAI NA CONTA do vendedor a um dado preço de venda.
//
// A versão anterior devolvia `original_price × (1 − seller_percentage/100)`,
// que é um PREÇO, não um recebimento: não descontava tarifa de venda nem
// frete. Comparado com o "mínimo a receber" do vendedor — que é líquido —
// aprovava quase tudo. No anúncio que expôs o problema, o cálculo antigo dava
// R$ 87 onde o vendedor recebia R$ 59,43, contra um piso de R$ 60.
//
// Modelo, conferido contra o número que o próprio ML mostra no painel:
//
//   preço 83,26 − tarifa 13,74 + abatimento 3,75 − frete 13,85 = 59,42
//   (o ML exibia 59,43; a diferença é arredondamento)
//
//   tarifa      -> /sites/MLB/listing_prices, pela categoria e tipo do anúncio
//   abatimento  -> em campanha cofinanciada o ML devolve meli_percentage sobre
//                  o preço cheio como redução de tarifa ("Reduzimos R$ X das
//                  suas tarifas por cada venda")
//   frete       -> /users/{id}/shipping_options/free aceita item_id no lugar
//                  das dimensões, que este anúncio nem tem cadastradas
//
// Devolve null quando qualquer peça faltar. Quem chama NÃO deve entrar na
// promoção nesse caso: chutar para cima é exatamente o erro que se corrige aqui.
async function recebimentoLiquido(userId, itemId, m, p, preco) {
    if (!m || !m.categoryId || !m.listingTypeId || !(preco > 0)) return null;

    try {
        const qsTarifa = new URLSearchParams({
            price: String(preco),
            category_id: m.categoryId,
            logistic_type: m.logisticType || 'drop_off',
            shipping_mode: 'me2',
        });
        const qsFrete = new URLSearchParams({
            item_id: itemId,
            item_price: String(preco),
            listing_type_id: m.listingTypeId,
            mode: 'me2',
            condition: 'new',
            logistic_type: m.logisticType || 'drop_off',
            free_shipping: 'true',
            verbose: 'true',
        });

        const [rTarifa, rFrete] = await Promise.all([
            mlFetch(userId, `/sites/MLB/listing_prices?${qsTarifa.toString()}`),
            mlFetch(userId, mlUserId => `/users/${mlUserId}/shipping_options/free?${qsFrete.toString()}`),
        ]);
        if (!rTarifa.ok || !rFrete.ok) return null;

        const tabela = await rTarifa.json();
        const linha = Array.isArray(tabela) ? tabela.find(t => t.listing_type_id === m.listingTypeId) : null;
        if (!linha || typeof linha.sale_fee_amount !== 'number') return null;

        const cobertura = await rFrete.json();
        const todoPais = cobertura.coverage && cobertura.coverage.all_country;
        // Frete ausente é anúncio sem cobertura, não frete zero.
        if (!todoPais || typeof todoPais.list_cost !== 'number') return null;

        const meliPct = num(p.meli_percentage);
        const original = num(p.original_price);
        const abatimento = meliPct != null && original != null ? (meliPct / 100) * original : 0;

        // Desconto que o Mercado Livre dá nos CUSTOS POR VENDA quando a oferta
        // é "boosted" (campos boosted_offer / discount_meli_boost_amount da
        // documentação de Gerenciar promoções). Não mexe no preço que o
        // comprador paga: volta pra você como tarifa menor.
        //
        // Ignorá-lo subestimava o que a campanha deixa — e como a automação só
        // entra em quem paga igual ou mais, isso fazia recusar promoção que na
        // verdade pagava mais.
        const boost = p.boosted_offer ? (num(p.discount_meli_boost_amount) || 0) : 0;

        const recebe = preco - linha.sale_fee_amount + abatimento + boost - todoPais.list_cost;
        return {
            recebe: Math.round(recebe * 100) / 100,
            tarifa: linha.sale_fee_amount,
            frete: todoPais.list_cost,
            abatimento: Math.round(abatimento * 100) / 100,
            boost: Math.round(boost * 100) / 100,
        };
    } catch (e) {
        return null;
    }
}

// Corpo de erro do ML achatado numa linha. JSON cru sai escapado no log da
// Vercel e fica ilegível justamente quando mais importa.
function resumoErroML(bruto) {
    try {
        const j = JSON.parse(bruto);
        const causas = Array.isArray(j.cause)
            ? j.cause.map(c => c.error_code || c.code || c.message || '').filter(Boolean).join(' / ')
            : '';
        return [j.error, j.message, causas].filter(Boolean).join(' — ').slice(0, 200);
    } catch (e) {
        return bruto.slice(0, 200);   // não era JSON, devolve o texto cru
    }
}

// Explica a conta numa linha, omitindo as parcelas que são zero.
function detalheLiquido(preco, l) {
    const partes = [`vitrine ${moeda(preco)}`, `− tarifa ${moeda(l.tarifa)}`];
    if (l.abatimento > 0) partes.push(`+ abatimento ${moeda(l.abatimento)}`);
    if (l.boost > 0) partes.push(`+ desconto na tarifa ${moeda(l.boost)}`);
    partes.push(`− frete ${moeda(l.frete)}`);
    return partes.join(' ');
}

// Preço que o comprador paga AGORA.
//
// A CAMPANHA EM VIGOR É A AUTORIDADE, não o /items: o preço do anúncio e o
// preço praticado dentro da campanha não são a mesma coisa, e usar o do anúncio
// inflava a base de comparação. Em oferta "boosted" quem manda é
// total_price_for_boosted_offer — a documentação de Gerenciar promoções diz
// explicitamente que é esse o preço que o comprador vê.
function precoPraticado(m, emVigor) {
    if (emVigor) {
        const boosted = num(emVigor.total_price_for_boosted_offer);
        if (boosted > 0) return boosted;
        const naCampanha = num(emVigor.price);
        if (naCampanha > 0) return naCampanha;
    }
    return m.price;
}

// A promoção que vale AGORA no anúncio: a "started". A "pending" só serve de
// reserva quando nada começou (a que acabou de ser aceita e ainda não
// sincronizou). Sem essa ordem, quem tem uma ativa e outra na fila podia ter a
// da fila tomada como o preço de agora, conforme a ordem da resposta do ML.
// Relâmpago fica de fora: não é automatizada e sai sozinha quando acaba.
function promocaoEmVigor(list) {
    const serve = (p) => p.type !== 'LIGHTNING';
    return list.find(p => p.status === 'started' && serve(p))
        || list.find(p => p.status === 'pending' && serve(p));
}

// Quanto o anúncio deixa HOJE, do jeito que está agora.
//
// É o piso da automação: o preço praticado na campanha em vigor, menos tarifa e
// frete, mais o que o Mercado Livre banca nela. Relâmpago fica de fora — não é
// automatizada e sai sozinha quando acaba.
async function liquidoDeHoje(userId, itemId, m, list) {
    if (!m) return null;
    const emVigor = promocaoEmVigor(list);
    const preco = precoPraticado(m, emVigor);
    if (!(preco > 0)) return null;
    const l = await recebimentoLiquido(userId, itemId, m, emVigor || {}, preco);
    // O preço volta junto: é ele que as mensagens do histórico precisam citar,
    // e não o do anúncio.
    return l ? { ...l, preco } : null;
}

// Tipos dos quais dá pra SAIR depois (DELETE em /seller-promotions/items),
// conforme a seção "Excluir itens" da documentação. Só estes são
// automatizados pela chave "Campanhas e descontos" — o Relâmpago fica à parte
// porque é irreversível.
//
// A lista começou menor e deixava de fora justamente as campanhas que mais
// aparecem no dia a dia (SMART e PRICE_MATCHING são as cofinanciadas
// automáticas, as que reduzem tarifa).
// Duas famílias, conforme a tabela "Características das promoções" da
// documentação do ML:
//
//   DEFINE  -> o vendedor escolhe o preço dentro de min/max_discounted_price.
//              Ex.: DEAL, PRICE_DISCOUNT, SELLER_CAMPAIGN, LIGHTNING.
//   ACEITA  -> o preço já vem pronto do ML e o vendedor só aceita. Estas NÃO
//              trazem faixa de preço, e é por isso que a versão anterior as
//              descartava com "o ML não informou faixa" — justamente as
//              cofinanciadas, que são as que mais pagam.
const PROMO_TIPOS_ACEITA = new Set(['SMART', 'PRICE_MATCHING', 'MARKETPLACE_CAMPAIGN', 'VOLUME', 'PRE_NEGOTIATED', 'UNHEALTHY_STOCK']);

const PROMO_TIPOS_REVERSIVEIS = new Set([
    'DEAL',
    'PRICE_DISCOUNT',
    'SELLER_CAMPAIGN',
    'MARKETPLACE_CAMPAIGN',
    'SMART',
    'PRICE_MATCHING',
    'PRE_NEGOTIATED',
    'VOLUME',
]);

// Quanto o preço para o comprador pode subir numa troca de campanha, quando o
// vendedor ainda não escolheu (ou a coluna ainda não existe no banco).
const LIMITE_SUBIDA_PADRAO_PCT = 5;
// Até onde olhar para trás ao reconhecer o que foi a automação que inscreveu.
const JANELA_ENTRADAS_DIAS = 30;

async function carregarContextoAutomacao(userId) {
    const [cfgRes, catalogoRes, hojeRes, entradasRes] = await Promise.all([
        supabaseAdmin.from('ml_promo_automation').select('*').eq('user_id', userId).maybeSingle(),
        // Mínimo por anúncio. Deixou de ser obrigatório: hoje o piso padrão é
        // quanto o anúncio já deixa, e este valor só serve para quem quer
        // EXIGIR MAIS que isso em algum anúncio específico.
        // Sem filtro de min_price: a linha agora também guarda o desconto que
        // o anúncio praticava, e essa memória existe em anúncio que nunca teve
        // mínimo nenhum.
        supabaseAdmin
            .from('ml_promo_item_config')
            .select('ml_item_id, min_price, last_deal_price, last_original_price')
            .eq('user_id', userId),
        supabaseAdmin
            .from('ml_promo_actions')
            .select('id')
            .eq('user_id', userId)
            .eq('outcome', 'joined')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        // O que a PRÓPRIA automação inscreveu. Serve para limpar da fila só o
        // que foi ela quem colocou: promoção que o vendedor programou por
        // conta própria nunca é tocada.
        supabaseAdmin
            .from('ml_promo_actions')
            .select('ml_item_id, promotion_type, promotion_id, deal_price, created_at')
            .eq('user_id', userId)
            .eq('outcome', 'joined')
            .not('deal_price', 'is', null)
            .gte('created_at', new Date(Date.now() - JANELA_ENTRADAS_DIAS * 86400000).toISOString())
            .order('created_at', { ascending: false })
            .limit(2000),
    ]);

    const cfg = cfgRes.data;
    if (!cfg || !cfg.enabled) return null;

    // Sem este histórico a limpeza da fila não sabe o que é da automação e não
    // remove nada: errar para o lado de não apagar.
    if (entradasRes.error) console.error('Sem o histórico de entradas da automação:', entradasRes.error.message);
    const entradasDaAutomacao = {};
    for (const e of entradasRes.data || []) {
        const preco = num(e.deal_price);
        if (preco == null) continue;
        const em = e.created_at ? new Date(e.created_at).getTime() : null;
        (entradasDaAutomacao[e.ml_item_id] = entradasDaAutomacao[e.ml_item_id] || [])
            .push({ tipo: e.promotion_type, id: e.promotion_id || null, preco, em: em != null && !isNaN(em) ? em : null });
    }
    const pctSalvo = num(cfg.max_price_increase_pct);

    const pisoPorItem = {};
    const descontoAnterior = {};
    for (const c of catalogoRes.data || []) {
        if (c.min_price != null) pisoPorItem[c.ml_item_id] = { price_floor: c.min_price };
        if (c.last_deal_price != null) descontoAnterior[c.ml_item_id] = c;
    }

    return {
        cfg,
        pisoPorItem,
        descontoAnterior,
        entradasHoje: (hojeRes.data || []).length,
        limiteSubidaPct: pctSalvo != null && pctSalvo >= 0 ? pctSalvo : LIMITE_SUBIDA_PADRAO_PCT,
        entradasDaAutomacao,
        // Anúncios que já tinham promoção ativa ou na fila e foram deixados
        // como estão, e promoções tiradas da fila: só para o resumo do log.
        jaComPromocao: 0,
        removidasDaFila: 0,
        trocas: 0,
        acoes: [],
        // O que a varredura aprendeu sobre o desconto praticado em cada
        // anúncio. Gravado de uma vez no fim, como as ações.
        lembrancas: [],
    };
}

// Até onde a automação pode levar o preço que o comprador vê.
//
// Receber mais porque o preço SUBIU não é o ganho que a automação procura: é o
// mesmo que reprecificar o anúncio, e cobra em vendas. O ganho de verdade vem
// da cofinanciada, em que o ML paga parte do desconto.
//
// A referência é o preço que o comprador paga AGORA: o da promoção ativa ou,
// sem nenhuma, o do anúncio. O limite só vale para subir; descer nunca é
// problema, e por isso o teto nunca fica abaixo do preço de agora.
function tetoDoComprador(ctx, precoAgora) {
    return {
        pct: ctx.limiteSubidaPct,
        teto: Math.floor(precoAgora * (1 + ctx.limiteSubidaPct / 100) * 100) / 100,
    };
}

// Tipos entre os quais a automação sabe TROCAR: o preço é comparável ao que o
// comprador paga e a remoção tem contrato documentado. Volume, pré-acordada,
// liquidação Full, oferta do dia e relâmpago ficam de fora: ou não se comparam
// por preço, ou não dá para sair delas sem consequência.
const PROMO_TIPOS_TROCA = new Set(['DEAL', 'PRICE_DISCOUNT', 'SELLER_CAMPAIGN', 'MARKETPLACE_CAMPAIGN', 'SMART', 'PRICE_MATCHING']);

// Só vale trocar se sobrar algo que se perceba: pelo menos R$ 0,50 ou 2% do que
// o anúncio deixa hoje, o que for maior. Sem isso, diferença de centavos de
// arredondamento faria a automação ficar trocando de promoção à toa.
const GANHO_MINIMO_TROCA_REAIS = 0.5;
const GANHO_MINIMO_TROCA_PCT = 2;
// Depois de a automação entrar numa promoção o anúncio fica em paz por este
// tempo: é o que impede a troca de virar vai-e-volta.
const TROCA_INTERVALO_HORAS = 24;
// A promoção nova precisa estar valendo agora e durar pelo menos isto, e não
// pode acabar antes da que ela substitui (com esta folga): senão o anúncio
// ficaria sem promoção antes da hora.
const TROCA_DURACAO_MINIMA_HORAS = 24;
const TROCA_TOLERANCIA_FIM_HORAS = 12;

// Quando a promoção termina, em ms; null se o ML não informa.
function fimDaPromocao(p) {
    const bruto = p.finish_date || p.end_date;
    const t = bruto ? new Date(bruto).getTime() : null;
    return t != null && !isNaN(t) ? t : null;
}

// Foi a PRÓPRIA automação que inscreveu esta promoção? Tipo e preço têm que
// bater com o histórico dela — promoção que o vendedor programou à mão nunca é
// tomada por da automação.
function foiInscritaPelaAutomacao(ctx, itemId, p) {
    const minhas = ctx.entradasDaAutomacao[itemId];
    if (!minhas) return false;
    const precos = [num(p.price), num(p.total_price_for_boosted_offer)].filter(v => v != null);
    return minhas.some(e => e.tipo === p.type && precos.some(v => Math.abs(v - e.preco) < 0.02));
}

// Parâmetros do DELETE que tira a promoção do anúncio, na ordem da documentação.
// Devolve null quando não dá para montar com segurança (sem id, ou sem o
// offer_id que a cofinanciada automatizada exige): quem chama não remove.
function consultaDeRemocao(p) {
    if (!PROMO_TIPOS_TROCA.has(p.type)) return null;
    const q = [`promotion_type=${encodeURIComponent(p.type)}`];
    // Desconto individual não tem id: o DELETE remove o desconto inteiro.
    if (p.type !== 'PRICE_DISCOUNT') {
        if (!p.id) return null;
        q.push(`promotion_id=${encodeURIComponent(p.id)}`);
        const usaOferta = p.type === 'SMART' || p.type === 'PRICE_MATCHING' || p.type === 'MARKETPLACE_CAMPAIGN';
        if (usaOferta && p.ref_id) q.push(`offer_id=${encodeURIComponent(p.ref_id)}`);
        else if (p.type === 'SMART' || p.type === 'PRICE_MATCHING') return null;
    }
    q.push('app_version=v2');
    return q.join('&');
}

// Tira a promoção do anúncio. Nunca lança: devolve { ok, motivo }.
async function removerPromocao(userId, itemId, p) {
    const consulta = consultaDeRemocao(p);
    if (!consulta) return { ok: false, motivo: 'faltam dados para sair desta promoção (id ou oferta)' };
    try {
        const resp = await mlFetch(userId, `/seller-promotions/items/${encodeURIComponent(itemId)}?${consulta}`, { method: 'DELETE' });
        if (resp.ok) return { ok: true };
        const texto = resumoErroML(await resp.text());
        console.error(`[promo-remover] ${itemId} ${p.type} promo=${p.id || '-'} status=${resp.status} :: ${texto}`);
        return { ok: false, motivo: `ML recusou (${resp.status}): ${texto}` };
    } catch (err) {
        return { ok: false, motivo: `erro de rede: ${err.message}`.slice(0, 200) };
    }
}

// Tira da FILA as promoções que a própria automação inscreveu e que, quando a
// ativa terminar, subiriam o preço além do limite.
//
// Regras de segurança, todas para o lado de não apagar:
//  - só "pending" (a ativa nunca é tocada aqui);
//  - só o que consta no histórico da automação, com o mesmo tipo e o mesmo preço;
//  - só os tipos em que o vendedor define o preço. Cofinanciada não entra: o
//    preço é do ML;
//  - desconto individual não tem id e o DELETE remove o desconto inteiro, então
//    com outro desconto individual ativo no anúncio nada é removido.
async function limparFilaAcimaDoLimite(userId, itemId, list, ctx, meta, registrar) {
    const m = meta[itemId];
    const fila = list.filter(p => p.status === 'pending' && PROMO_TIPOS_REPONIVEIS.has(p.type));
    if (!m || !ctx.entradasDaAutomacao[itemId] || fila.length === 0) return;

    const ativa = list.find(p => p.status === 'started' && p.type !== 'LIGHTNING');
    const agora = precoPraticado(m, ativa || null);
    if (!(agora > 0)) return;
    const { pct, teto } = tetoDoComprador(ctx, agora);

    for (const p of fila) {
        // Preço que o comprador veria com ela. Sem preço informado cai no do
        // anúncio, que nunca passa do teto: na dúvida, não remove.
        const preco = precoPraticado(m, p);
        if (!(preco > teto + 0.01)) continue;
        if (!foiInscritaPelaAutomacao(ctx, itemId, p)) continue;
        if (p.type === 'PRICE_DISCOUNT' && list.some(x => x.type === 'PRICE_DISCOUNT' && x.status === 'started')) continue;

        const r = await removerPromocao(userId, itemId, p);
        const extra = { promotion_id: p.id || null, promotion_type: p.type, deal_price: preco };
        if (!r.ok) {
            registrar('failed', `não deu para tirar da fila a ${p.type} a ${moeda(preco)}, acima do limite de ${pct}%: ${r.motivo}`, extra);
            continue;
        }
        ctx.removidasDaFila++;
        registrar('skipped', `${p.type} na fila a ${moeda(preco)} foi removida: o anúncio já tem promoção a ${moeda(agora)}, e quando ela terminasse esta subiria o preço ${variacaoPct(agora, preco)}, acima do limite de ${String(pct).replace('.', ',')}%. Foi a automação que a inscreveu.`, extra);
    }
}

// Variação do preço para o comprador, para as mensagens do histórico.
function variacaoPct(de, para) {
    const v = ((para - de) / de) * 100;
    return `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`;
}

// Quanto o vendedor recebe em cada promoção avaliada (a.liquido). Duas
// consultas por preço distinto (tarifa e frete); o abatimento e o desconto na
// tarifa são por CAMPANHA, não por preço, e são refeitos para cada uma.
async function pontuarPorRecebimento(userId, itemId, m, lista) {
    const mesmoPreco = new Map();
    for (const a of lista) {
        const chave = a.preco.toFixed(2);
        if (!mesmoPreco.has(chave)) mesmoPreco.set(chave, await recebimentoLiquido(userId, itemId, m, a.p, a.preco));
        const base = mesmoPreco.get(chave);
        if (base) {
            const meliPct = num(a.p.meli_percentage);
            const original = num(a.p.original_price);
            const abat = meliPct != null && original != null ? Math.round((meliPct / 100) * original * 100) / 100 : 0;
            const boost = a.p.boosted_offer ? Math.round((num(a.p.discount_meli_boost_amount) || 0) * 100) / 100 : 0;
            a.liquido = {
                ...base, abatimento: abat, boost,
                recebe: Math.round((a.preco - base.tarifa + abat + boost - base.frete) * 100) / 100,
            };
        } else {
            a.liquido = null;
        }
    }
}

// Corpo do POST que inscreve o anúncio na promoção avaliada.
//
// Nos tipos "aceita" não se envia deal_price: o preço é do ML, e mandar um
// valor devolveria 400. PRICE_DISCOUNT é desconto individual do item: não
// pertence a campanha nenhuma e não tem promotion_id.
function corpoDaEntrada(a) {
    if (a.tipo === 'PRICE_DISCOUNT' || !a.p.id) {
        // Desconto individual: sem promotion_id e com janela de vigência em
        // formato local.
        const inicio = new Date();
        const fim = new Date(inicio.getTime() + DIAS_DESCONTO_INDIVIDUAL * 86400000);
        return {
            deal_price: a.preco,
            promotion_type: a.tipo,
            start_date: dataLocalML(inicio),
            finish_date: dataLocalML(fim),
        };
    }
    if (a.soAceita) {
        // Preço definido pelo ML. O que ele pede aqui é o offer_id, que vem no
        // ref_id do candidato ("CANDIDATE-MLB...") — sem ele responde "Offer id
        // is required".
        const corpo = { promotion_id: a.p.id, promotion_type: a.tipo };
        if (a.p.ref_id) corpo.offer_id = a.p.ref_id;
        return corpo;
    }
    return { deal_price: a.preco, promotion_id: a.p.id, promotion_type: a.tipo };
}

// Troca a promoção ATIVA por outra que cobra MENOS do comprador e deixa MAIS
// para o vendedor. É a única jogada com promoção ativa (ver o comentário em
// automatizarPromocoesDoItem). Devolve true quando entrou numa nova.
//
// Tudo é conferido ANTES de mexer, e na ordem que nunca deixa o anúncio pior:
// ENTRA na nova (que fica na fila) e só então TIRA a ativa. Se a entrada falhar
// nada é removido; se a remoção falhar, a nova segue na fila e a próxima
// verificação conclui a troca.
//
// Fica em silêncio quando não há troca boa: com promoção ativa quase todo
// anúncio tem candidata mais cara ou fora do período, e isso não pode virar
// uma linha de histórico a cada 15 minutos.
async function trocarDePromocao(userId, itemId, list, ctx, meta, registrar, ativas, avaliadas) {
    const m = meta[itemId];
    if (!m) return false;
    const agora = Date.now();
    const horas = (h) => h * 3600000;

    // Só se sai de promoção de tipo conhecido e com dados para o DELETE. Nunca
    // se entra na nova sem certeza de que dá para tirar a antiga.
    if (!ativas.every(p => consultaDeRemocao(p))) return false;
    const temIndividualAtiva = ativas.some(p => p.type === 'PRICE_DISCOUNT');

    const precoAgora = precoPraticado(m, promocaoEmVigor(list));
    if (!(precoAgora > 0)) return false;
    const restanteAtiva = Math.max(...ativas.map(p => {
        const f = fimDaPromocao(p);
        return f == null ? Infinity : f - agora;
    }));
    const ultimaEntrada = Math.max(0, ...(ctx.entradasDaAutomacao[itemId] || []).map(e => e.em || 0));
    const emIntervalo = agora - ultimaEntrada < horas(TROCA_INTERVALO_HORAS);

    // Filtros que não custam chamada ao ML.
    const alvos = avaliadas.filter(a => {
        if (!PROMO_TIPOS_TROCA.has(a.tipo)) return false;
        // Cobra menos do comprador. Não basta ficar dentro do limite de subida:
        // a troca só existe para melhorar o preço de vitrine.
        if (!(a.preco < precoAgora - 0.01)) return false;
        // Trocar um desconto individual por outro exigiria apagar e recriar.
        if (a.tipo === 'PRICE_DISCOUNT' && temIndividualAtiva) return false;
        // Depois de entrar, o anúncio fica em paz: sem vai-e-volta. A que já
        // está na fila é a troca em andamento e não conta.
        if (emIntervalo && !a.naFila) return false;
        // Dentro do período (estaVigente já foi checado ao avaliar), durando o
        // suficiente e sem acabar antes da que ela substitui.
        const fim = a.tipo === 'PRICE_DISCOUNT' ? agora + DIAS_DESCONTO_INDIVIDUAL * 86400000 : fimDaPromocao(a.p);
        const restante = fim == null ? Infinity : fim - agora;
        if (restante < horas(TROCA_DURACAO_MINIMA_HORAS)) return false;
        if (restante + horas(TROCA_TOLERANCIA_FIM_HORAS) < restanteAtiva) return false;
        return true;
    });
    if (alvos.length === 0) return false;

    const hoje = await liquidoDeHoje(userId, itemId, m, list);
    if (!hoje) return false;
    await pontuarPorRecebimento(userId, itemId, m, alvos);

    const override = ctx.pisoPorItem[itemId];
    const exigido = override && override.price_floor != null ? Number(override.price_floor) : null;
    const ganhoMin = Math.max(GANHO_MINIMO_TROCA_REAIS, hoje.recebe * GANHO_MINIMO_TROCA_PCT / 100);
    const vantajosas = alvos
        .filter(a => a.liquido && a.liquido.recebe >= hoje.recebe + ganhoMin - 0.005 && (exigido == null || a.liquido.recebe >= exigido))
        .sort((a, b) => (b.liquido.recebe - a.liquido.recebe) || (a.preco - b.preco));
    if (vantajosas.length === 0) return false;

    const melhor = vantajosas[0];
    // Concluir uma troca que ficou na fila não é entrada nova e não conta no teto.
    if (!melhor.naFila && ctx.entradasHoje >= ctx.cfg.max_joins_per_day) return false;

    const ganho = Math.round((melhor.liquido.recebe - hoje.recebe) * 100) / 100;
    const ativasTxt = ativas.map(p => p.type).join(' + ');
    const extra = {
        promotion_id: melhor.p.id || null, promotion_type: melhor.tipo,
        deal_price: melhor.preco, floor_price: hoje.recebe,
        min_price: melhor.minPermitido, max_price: melhor.maxPermitido,
        previous_price: hoje.preco,
    };
    const fimNovo = melhor.tipo === 'PRICE_DISCOUNT' ? agora + DIAS_DESCONTO_INDIVIDUAL * 86400000 : fimDaPromocao(melhor.p);
    const vale = fimNovo != null ? ` Vale até ${new Date(fimNovo).toLocaleDateString('pt-BR')}.` : '';
    const dePara = `o comprador passa a pagar ${moeda(melhor.preco)} em vez de ${moeda(hoje.preco)} (${variacaoPct(hoje.preco, melhor.preco)}) e você recebe ${moeda(melhor.liquido.recebe)} em vez de ${moeda(hoje.recebe)} (${moeda(ganho)} a mais). ${detalheLiquido(melhor.preco, melhor.liquido)}.${vale}`;
    console.log(`[promo-troca] ${itemId}: ${ativasTxt} (${moeda(hoje.preco)}) -> ${melhor.tipo}${melhor.naFila ? ' (já na fila)' : ''} (${moeda(melhor.preco)}), recebe ${moeda(hoje.recebe)} -> ${moeda(melhor.liquido.recebe)}`);

    // 1) ENTRA na nova. Quem já estava na fila pula esta etapa.
    if (!melhor.naFila) {
        try {
            const resp = await mlFetch(userId, `/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpoDaEntrada(melhor)),
            });
            if (!resp.ok) {
                const texto = resumoErroML(await resp.text());
                console.error(`[promo-erro] ${itemId} troca ${melhor.tipo} promo=${melhor.p.id} status=${resp.status} :: ${texto}`);
                registrar('failed', `troca não feita: o ML recusou a entrada na ${melhor.tipo} (${resp.status}): ${texto}. A ${ativasTxt} ativa foi mantida.`, extra);
                return false;
            }
        } catch (err) {
            registrar('failed', `troca não feita: erro de rede na entrada na ${melhor.tipo}: ${err.message}. A ${ativasTxt} ativa foi mantida.`.slice(0, 220), extra);
            return false;
        }
        ctx.entradasHoje++;
    }

    // 2) TIRA a ativa, para a nova sair da fila e valer.
    const falhas = [];
    for (const a of ativas) {
        const r = await removerPromocao(userId, itemId, a);
        if (!r.ok) falhas.push(`${a.type}: ${r.motivo}`);
    }

    if (falhas.length === 0) {
        ctx.trocas++;
        registrar('joined', `Trocou a ${ativasTxt} ativa pela ${melhor.tipo}${melhor.naFila ? ' (que já estava na fila)' : ''}: ${dePara} A ${ativasTxt} foi removida para a nova valer.`, extra);
        return true;
    }
    if (!melhor.naFila) {
        registrar('joined', `Entrou na ${melhor.tipo}: ${dePara} Mas a ${ativasTxt} ativa não saiu, e enquanto ela estiver ativa a nova fica só programada; a troca é concluída na próxima verificação.`, extra);
    }
    registrar('failed', `não deu para tirar a ${ativasTxt} ativa e deixar a ${melhor.tipo} valer — ${falhas.join('; ')}`, extra);
    return !melhor.naFila;
}

// Decide e executa a entrada de UM item nas promoções em que é candidato.
async function automatizarPromocoesDoItem(userId, itemId, list, ctx, meta) {
    if (!ctx) return;

    const titulo = (meta[itemId] && meta[itemId].title) || null;
    const registrar = (outcome, reason, extra = {}) => {
        ctx.acoes.push({
            user_id: userId, ml_item_id: itemId, item_title: titulo,
            outcome, reason, ...extra,
        });
    };

    // ── ANÚNCIO QUE JÁ TEM PROMOÇÃO: SÓ TROCA, NUNCA EMPILHA ─────────────
    // O Mercado Livre não TROCA uma promoção pela outra: o anúncio fica com UMA
    // ativa e as demais viram "programadas", esperando na fila. (O desconto
    // individual, por exemplo, "não será aplicado até que o DEAL associado seja
    // finalizado", diz a documentação.) Entrar em outra por cima não muda o
    // preço de agora — e, quando a ativa termina, a da fila passa a valer no
    // preço que tiver. Foi assim que anúncios ficaram com várias promoções
    // empilhadas e uma delas 25% acima do preço que o comprador via.
    //
    // Então, com promoção ativa, a única jogada é a TROCA de verdade: uma
    // promoção que cobra menos do comprador e deixa mais para o vendedor entra
    // e a ativa sai, na mesma hora. Fora isso o anúncio fica como está. Se houver
    // na fila algo que a automação colocou e passa do limite de preço, tira.
    const ativas = list.filter(p => p.status === 'started' && p.type !== 'LIGHTNING');
    const naFila = list.filter(p => p.status === 'pending' && p.type !== 'LIGHTNING');
    const modoTroca = ativas.length > 0;
    if (modoTroca || naFila.length > 0) {
        await limparFilaAcimaDoLimite(userId, itemId, list, ctx, meta, registrar);
    }
    // Só há promoção na fila, nenhuma valendo: não há o que trocar e não se
    // empilha outra.
    if (!modoTroca && naFila.length > 0) {
        ctx.jaComPromocao++;
        return;
    }

    // ── AVALIAÇÃO ────────────────────────────────────────────────────────
    // Antes o código entrava na PRIMEIRA promoção candidata que encontrasse.
    // Errado: o mesmo anúncio costuma ser convidado para várias ao mesmo tempo,
    // e elas pagam de forma bem diferente. Agora todas são pontuadas pelo que
    // sobra pra você, e só a melhor é aceita.
    const avaliadas = [];
    // Com promoção ativa quase todo anúncio tem candidata fora do período, de
    // tipo que não se automatiza ou sem faixa de preço. Isso é normal e não
    // pode virar aviso a cada verificação: só fala quem está sem promoção.
    const avisar = (outcome, reason, extra) => { if (!modoTroca) registrar(outcome, reason, extra); };

    // Diagnóstico: mostra o que o ML ofereceu e o que foi considerado. Sem
    // isso, "não entrou" é indistinguível de "não havia convite".
    const candidatos = list.filter(x => x.status === 'candidate');
    if (candidatos.length > 0) {
        console.log(`[promo] ${itemId}: ${candidatos.length} candidata(s) -> ${candidatos.map(x => `${x.type}(${x.start_date || '?'}→${x.finish_date || x.end_date || '?'} vig=${estaVigente(x, Date.now())} sug=${x.suggested_discounted_price})`).join(' | ')}`);

    }

    for (const p of list) {
        // Com uma ativa, também entram na conta as que a automação já deixou
        // na fila: é a troca que ficou pela metade (entrou, mas o ML não deixou
        // sair da ativa). Falta só tirar a ativa.
        const naFilaDela = modoTroca && p.status === 'pending' && PROMO_TIPOS_TROCA.has(p.type)
            && foiInscritaPelaAutomacao(ctx, itemId, p);
        if (p.status !== 'candidate' && !naFilaDela) continue;

        const tipo = p.type;
        // Relâmpago NUNCA é automatizada: uma vez ativa não pode ser cancelada
        // (só pausando o anúncio inteiro) e o estoque fica reservado. Entrar
        // nela é decisão manual, pela aba "Podem ter Relâmpago".
        // Relâmpago NUNCA é automatizada.
        if (tipo === 'LIGHTNING') continue;

        if (!PROMO_TIPOS_REVERSIVEIS.has(tipo)) {
            avisar('skipped', `tipo ${tipo} não é automatizado (não há como sair da campanha depois)`, { promotion_id: p.id || null, promotion_type: tipo });
            continue;
        }

        // Já inscrita: o preço está definido e não há faixa a consultar. Fora
        // do período, espera em silêncio — o histórico não pode encher de aviso
        // a cada rodada de uma promoção que a automação mesma colocou.
        if (naFilaDela) {
            const precoFila = num(p.price);
            if (precoFila == null || !estaVigente(p, Date.now())) continue;
            avaliadas.push({ p, tipo, soAceita: true, naFila: true, preco: Math.round(precoFila * 100) / 100, minPermitido: null, maxPermitido: null });
            continue;
        }

        const minPermitido = num(p.min_discounted_price);
        const maxPermitido = num(p.max_discounted_price);
        const sugerido = num(p.suggested_discounted_price);
        const soAceita = PROMO_TIPOS_ACEITA.has(tipo);

        let preco;
        if (soAceita) {
            // Preço já definido pelo ML. Só entra na comparação; não se escolhe.
            preco = num(p.price);
            if (preco == null) {
                avisar('skipped', `${tipo} veio sem preço definido pelo ML`, { promotion_id: p.id || null, promotion_type: tipo });
                continue;
            }
        } else {
            if (maxPermitido == null) {
                avisar('skipped', 'o ML não informou faixa de preço para esta promoção', { promotion_id: p.id || null, promotion_type: tipo });
                continue;
            }
            // O sugerido é preferido: preço fora da faixa "crível" devolve
            // 400 ERROR_CREDIBILITY_DISCOUNTED_PRICE.
            preco = sugerido != null ? sugerido : maxPermitido;
            if (minPermitido != null && preco < minPermitido) preco = minPermitido;
            if (preco > maxPermitido) preco = maxPermitido;
        }
        preco = Math.round(preco * 100) / 100;

        // Só entra em campanha que está valendo agora. Programada para o
        // futuro fica de fora: aceitar hoje uma que começa em 20/ago deixaria
        // o anúncio sem desconto no período que interessa.
        if (!estaVigente(p, Date.now())) {
            const quando = p.start_date ? new Date(p.start_date).toLocaleDateString('pt-BR') : 'data não informada';
            avisar('skipped', `${tipo} só começa em ${quando} — a automação usa apenas campanhas vigentes`, {
                promotion_id: p.id || null, promotion_type: tipo, deal_price: preco,
            });
            continue;
        }

        avaliadas.push({ p, tipo, soAceita, preco, minPermitido, maxPermitido });
    }

    if (avaliadas.length === 0) return;

    // Com promoção ativa só existe a troca; o que vem abaixo é a entrada em
    // anúncio SEM promoção.
    if (modoTroca) return await trocarDePromocao(userId, itemId, list, ctx, meta, registrar, ativas, avaliadas);

    // ── TRAVA QUE NÃO CUSTA CHAMADA ──────────────────────────────────────
    // Vem antes do cálculo: com o teto do dia batido não há por que gastar
    // consulta de tarifa e frete.
    if (ctx.entradasHoje >= ctx.cfg.max_joins_per_day) {
        registrar('skipped', `teto diário de ${ctx.cfg.max_joins_per_day} entradas atingido`, { promotion_id: avaliadas[0].p.id || null, promotion_type: avaliadas[0].tipo });
        return;
    }

    // ── O PISO SAI DO PRÓPRIO ANÚNCIO ────────────────────────────────────
    // Antes o piso era um valor DIGITADO anúncio por anúncio, e quem estivesse
    // sem número era ignorado. Na prática isso deixava a automação parada:
    // ninguém preenche um valor em centenas de anúncios, e o que ficava sem
    // preencher era a maioria.
    //
    // Agora o piso é quanto o anúncio deixa HOJE. O vendedor já colocou nele o
    // preço que considera certo, então a regra é só não receber menos do que
    // já recebe — e isso não exige configurar nada.
    const hoje = await liquidoDeHoje(userId, itemId, meta[itemId], list);
    if (!hoje) {
        registrar('skipped', 'não deu para calcular quanto este anúncio deixa hoje (preço, tarifa ou frete indisponível) — sem essa base não há com o que comparar', {
            promotion_id: avaliadas[0].p.id || null, promotion_type: avaliadas[0].tipo,
        });
        return;
    }

    // O mínimo digitado, quando existe, só serve para EXIGIR MAIS que o
    // atual — nunca para aceitar menos. "Nunca receber menos do que a campanha
    // de agora" é a regra, e um número antigo não pode furá-la.
    const comprador = tetoDoComprador(ctx, hoje.preco);
    const pctTexto = `${String(comprador.pct).replace('.', ',')}%`;

    const override = ctx.pisoPorItem[itemId];
    const exigido = override && override.price_floor != null ? Number(override.price_floor) : null;
    const piso = exigido != null ? Math.max(exigido, hoje.recebe) : hoje.recebe;
    const comoPiso = exigido != null && exigido > hoje.recebe
        ? `seu mínimo de ${moeda(exigido)}`
        : `os ${moeda(hoje.recebe)} que este anúncio já deixa hoje`;

    // ── LIMITE DE PREÇO PARA O COMPRADOR ─────────────────────────────────
    // Vem antes da conta de tarifa e frete: preço fora do limite nem é
    // calculado.
    const barradas = [];
    for (const a of avaliadas) {
        if (a.preco <= comprador.teto + 0.01) continue;
        // No desconto que é seu o preço é escolhido: em vez de desistir da
        // campanha, desce até o limite, se a faixa do ML deixar.
        if (!a.soAceita && (a.minPermitido == null || a.minPermitido <= comprador.teto)) {
            a.preco = Math.round(comprador.teto * 100) / 100;
            continue;
        }
        barradas.push(a);
    }
    const dentro = avaliadas.filter(a => !barradas.includes(a));

    if (dentro.length === 0) {
        const b = barradas.slice().sort((x, y) => x.preco - y.preco)[0];
        const motivo = `${b.tipo} subiria o preço para o comprador de ${moeda(hoje.preco)} para ${moeda(b.preco)} (${variacaoPct(hoje.preco, b.preco)}), acima do limite de ${pctTexto}`;
        registrar('skipped', motivo, {
            promotion_id: b.p.id || null, promotion_type: b.tipo,
            deal_price: b.preco, floor_price: piso,
            min_price: b.minPermitido, max_price: b.maxPermitido,
        });
        return;
    }

    // ── QUANTO SOBRA DE VERDADE ──────────────────────────────────────────
    // Duas consultas por candidata (tarifa e frete). São poucas por anúncio, e
    // só rodam para quem tem convite aberto.
    await pontuarPorRecebimento(userId, itemId, meta[itemId], dentro);

    // Sem conseguir calcular, não entra. Assumir que "deu certo" foi
    // exatamente o que fez a automação aceitar promoção abaixo do mínimo.
    for (const a of dentro.filter(x => !x.liquido)) {
        registrar('skipped', `não deu para calcular quanto sobraria (tarifa ou frete indisponível) — a automação não entra sem essa conta`, {
            promotion_id: a.p.id || null, promotion_type: a.tipo, deal_price: a.preco, floor_price: piso,
        });
    }

    const calculadas = dentro.filter(a => a.liquido);
    if (calculadas.length === 0) return;

    // Maior recebimento primeiro. Empate desempata pelo preço de vitrine mais
    // BAIXO: pagando o mesmo para você, o mais barato vende mais.
    calculadas.sort((a, b) => (b.liquido.recebe - a.liquido.recebe) || (a.preco - b.preco));

    const melhor = calculadas[0];
    const descarte = calculadas.slice(1);

    // O piso é o que CAI NA CONTA, não o preço de vitrine: uma campanha
    // cofinanciada pode mostrar menos ao comprador e ainda deixar mais para
    // você, porque o ML abate parte da tarifa.
    // Um centavo de folga: os dois lados são arredondados, e recusar por
    // arredondamento uma promoção que paga igual jogaria fora de graça o
    // ganho de vitrine que ela traz.
    if (melhor.liquido.recebe < piso - 0.01) {
        registrar('skipped', `a melhor promoção deixaria ${moeda(melhor.liquido.recebe)} (${detalheLiquido(melhor.preco, melhor.liquido)}), menos que ${comoPiso}`, {
            promotion_id: melhor.p.id || null, promotion_type: melhor.tipo,
            deal_price: melhor.preco, floor_price: piso,
            min_price: melhor.minPermitido, max_price: melhor.maxPermitido,
        });
        return;
    }

    // Mesmo recebimento sem baixar o preço para o comprador: trocar não traz
    // nada e só gastaria uma entrada do dia. Com o limite é o caso comum — o
    // desconto que é seu desce justamente até o preço de agora.
    if (melhor.liquido.recebe < hoje.recebe + 0.01 && melhor.preco >= hoje.preco - 0.01) return;

    // ── AÇÃO ─────────────────────────────────────────────────────────────
    const corpo = corpoDaEntrada(melhor);

    const comparativo = (descarte.length > 0
        ? ` Escolhida entre ${calculadas.length}: ${descarte.map(d => `${d.tipo} deixaria ${moeda(d.liquido.recebe)}`).join(', ')}.`
        : '')
        + (barradas.length > 0
            ? ` ${barradas.map(b => b.tipo).join(', ')} ficou de fora por subir o preço além de ${pctTexto}.`
            : '');

    try {
        const resp = await mlFetch(userId, `/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
        });

        if (!resp.ok) {
            const texto = resumoErroML(await resp.text());
            console.error(`[promo-erro] ${itemId} ${melhor.tipo} promo=${melhor.p.id} status=${resp.status} :: ${texto}`);
            registrar('failed', `ML recusou (${resp.status}): ${texto}`, {
                promotion_id: melhor.p.id || null, promotion_type: melhor.tipo,
                deal_price: melhor.preco, floor_price: piso,
                min_price: melhor.minPermitido, max_price: melhor.maxPermitido,
            });
            return;
        }

        ctx.entradasHoje++;
        const variacao = Math.round((melhor.liquido.recebe - hoje.recebe) * 100) / 100;
        const efeito = variacao >= 0.01 ? `${moeda(variacao)} a mais que hoje` : 'sem perda pra você';
        const paraComprador = Math.abs(melhor.preco - hoje.preco) >= 0.01
            ? ` Para o comprador: ${moeda(hoje.preco)} → ${moeda(melhor.preco)} (${variacaoPct(hoje.preco, melhor.preco)}).`
            : '';
        registrar('joined', `${detalheLiquido(melhor.preco, melhor.liquido)} = você recebe ${moeda(melhor.liquido.recebe)} — ${efeito}, contra ${moeda(hoje.recebe)} que o anúncio deixava sem promoção (a ${moeda(hoje.preco)}).${paraComprador}${comparativo}`, {
            promotion_id: melhor.p.id || null, promotion_type: melhor.tipo,
            deal_price: melhor.preco, floor_price: piso,
            min_price: melhor.minPermitido, max_price: melhor.maxPermitido,
            // Preço que o comprador pagava antes desta entrada.
            previous_price: hoje.preco,
        });
        return true;
    } catch (err) {
        registrar('failed', `erro de rede: ${err.message}`.slice(0, 200), {
            promotion_id: melhor.p.id || null, promotion_type: melhor.tipo,
            deal_price: melhor.preco, floor_price: piso,
        });
    }
}

// Tipos em que o PREÇO sozinho determina o que você recebe: o vendedor
// escolheu o valor e o Mercado Livre não banca nada. Só estes entram na
// memória de reposição, porque repor o mesmo preço devolve exatamente o mesmo
// líquido — não é uma concessão nova.
//
// Cofinanciada fica de fora de propósito: nela o preço baixo só se sustenta
// porque o ML paga a diferença. Repor aquele preço por conta própria depois
// que a campanha acabou seria vender mais barato com o abatimento que sumiu,
// ou seja, receber menos — exatamente o que a regra proíbe.
const PROMO_TIPOS_REPONIVEIS = new Set(['PRICE_DISCOUNT', 'SELLER_CAMPAIGN', 'DEAL']);

// Mantém vivo o desconto que o vendedor JÁ tinha escolhido.
//
// Duas metades que nunca rodam juntas: enquanto a promoção está no ar, anota o
// preço praticado; depois que ela vence e o anúncio volta sozinho ao preço
// cheio, repõe o mesmo desconto. O vendedor já decidiu esse preço uma vez — ele
// só não tem como vigiar a data de término de cada campanha.
async function manterDescontoDoItem(userId, itemId, list, ctx, meta) {
    if (!ctx || !ctx.cfg.auto_renew) return;
    const m = meta[itemId];
    if (!m || !(m.price > 0)) return;

    const emVigor = promocaoEmVigor(list);

    // ── METADE 1: ANOTAR ─────────────────────────────────────────────────
    // Depois que a campanha vence o Mercado Livre não informa mais qual era o
    // preço. Se não for anotado agora, não há o que repor depois.
    if (emVigor) {
        // Preço e preço cheio saem da CAMPANHA, não do anúncio: guardar o preço
        // do /items faria a reposição devolver um valor que nunca foi
        // praticado.
        const praticado = precoPraticado(m, emVigor);
        const cheio = num(emVigor.original_price) != null ? num(emVigor.original_price) : num(m.originalPrice);
        const semAbatimento = !(num(emVigor.meli_percentage) > 0);
        if (PROMO_TIPOS_REPONIVEIS.has(emVigor.type) && semAbatimento && cheio != null && praticado < cheio) {
            const agora = new Date().toISOString();
            ctx.lembrancas.push({
                user_id: userId,
                ml_item_id: itemId,
                last_deal_price: praticado,
                last_original_price: cheio,
                last_promotion_type: emVigor.type,
                last_seen_at: agora,
                updated_at: agora,
            });
        }
        return;   // com promoção rodando não há o que repor
    }

    // ── METADE 2: REPOR ──────────────────────────────────────────────────
    const lembrado = ctx.descontoAnterior[itemId];
    if (!lembrado || lembrado.last_deal_price == null) return;

    const alvo = Number(lembrado.last_deal_price);

    // Já está no preço: sem esta guarda o robô tentaria repor a cada 15
    // minutos um desconto que existe.
    if (m.price <= alvo + 0.01) return;

    const registrar = (outcome, reason, extra = {}) => {
        ctx.acoes.push({
            user_id: userId, ml_item_id: itemId, item_title: m.title || null,
            outcome, reason, promotion_type: 'PRICE_DISCOUNT', ...extra,
        });
    };

    // Preço cheio diferente do da época significa que o vendedor reprecificou o
    // anúncio. O desconto guardado virou referência de outro preço, e repor às
    // cegas venderia por um valor que ninguém decidiu.
    const cheioAntes = num(lembrado.last_original_price);
    const cheioAgora = num(m.originalPrice) != null ? num(m.originalPrice) : m.price;
    if (cheioAntes != null && Math.abs(cheioAgora - cheioAntes) > 0.01) {
        registrar('skipped', `o preço cheio mudou de ${moeda(cheioAntes)} para ${moeda(cheioAgora)} — o desconto anterior de ${moeda(alvo)} deixou de ser referência e foi esquecido`, { deal_price: alvo });
        ctx.lembrancas.push({
            user_id: userId, ml_item_id: itemId,
            last_deal_price: null, last_original_price: null,
            last_promotion_type: null, last_seen_at: null,
            updated_at: new Date().toISOString(),
        });
        return;
    }

    if (ctx.entradasHoje >= ctx.cfg.max_joins_per_day) {
        registrar('skipped', `teto diário de ${ctx.cfg.max_joins_per_day} entradas atingido — reposição fica para a próxima verificação`, { deal_price: alvo });
        return;
    }

    // A reposição sai como desconto individual, que é o que não depende de
    // campanha nenhuma do ML. Os limites vêm do próprio candidato: fora deles
    // o ML devolve 400.
    const individual = list.find(p => p.type === 'PRICE_DISCOUNT' && p.status === 'candidate');
    if (!individual) {
        registrar('skipped', `o Mercado Livre não está oferecendo desconto individual neste anúncio agora — não deu para repor os ${moeda(alvo)}`, { deal_price: alvo });
        return;
    }

    const minOk = num(individual.min_discounted_price);
    const maxOk = num(individual.max_discounted_price);
    if ((minOk != null && alvo < minOk) || (maxOk != null && alvo > maxOk)) {
        registrar('skipped', `o Mercado Livre só aceita entre ${moeda(minOk)} e ${moeda(maxOk)} neste anúncio, e o desconto que você praticava era ${moeda(alvo)}`, {
            deal_price: alvo, min_price: minOk, max_price: maxOk,
        });
        return;
    }

    const inicio = new Date();
    const fim = new Date(inicio.getTime() + DIAS_DESCONTO_INDIVIDUAL * 86400000);

    try {
        const resp = await mlFetch(userId, `/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deal_price: alvo,
                promotion_type: 'PRICE_DISCOUNT',
                start_date: dataLocalML(inicio),
                finish_date: dataLocalML(fim),
            }),
        });

        if (!resp.ok) {
            const texto = resumoErroML(await resp.text());
            console.error(`[promo-repor] ${itemId} status=${resp.status} :: ${texto}`);
            registrar('failed', `ML recusou a reposição (${resp.status}): ${texto}`, { deal_price: alvo });
            return;
        }

        ctx.entradasHoje++;
        registrar('joined', `desconto reposto: a promoção venceu e o anúncio tinha voltado a ${moeda(m.price)} — devolvido aos ${moeda(alvo)} que você já praticava, pelos próximos ${DIAS_DESCONTO_INDIVIDUAL} dias`, { deal_price: alvo, previous_price: m.price });
    } catch (err) {
        registrar('failed', `erro de rede ao repor: ${err.message}`.slice(0, 200), { deal_price: alvo });
    }
}

// A memória do desconto praticado vai junto com as ações, num upsert só. As
// colunas omitidas ficam intactas — em especial min_price, que é do vendedor.
async function gravarLembrancasAutomacao(ctx) {
    if (!ctx || ctx.lembrancas.length === 0) return;
    const { error } = await supabaseAdmin
        .from('ml_promo_item_config')
        .upsert(ctx.lembrancas, { onConflict: 'user_id,ml_item_id' });
    if (error) console.error('Falha ao guardar o desconto praticado:', error.message);
}

async function gravarAcoesAutomacao(ctx) {
    if (!ctx) return 0;

    // Espelha o resumo no log. As decisões vão para ml_promo_actions, que só a
    // tela do usuário lê — sem isto, "não entrou em nada" fica indistinguível
    // de "nem chegou a avaliar" quando se olha só o log do servidor.
    const porMotivo = {};
    for (const a of ctx.acoes) {
        const chave = `${a.outcome}: ${a.reason || 'sem motivo'}`.slice(0, 90);
        porMotivo[chave] = (porMotivo[chave] || 0) + 1;
    }
    const resumo = Object.entries(porMotivo).map(([k, n]) => `${n}x ${k}`).join(' | ');
    console.log(`[promo-resumo] ${ctx.acoes.length} decisão(ões) — ${resumo || 'nenhuma'} | ${ctx.jaComPromocao} anúncio(s) já com promoção, deixados como estão | ${ctx.removidasDaFila} tirada(s) da fila`);

    if (ctx.acoes.length === 0) return 0;
    let { error } = await supabaseAdmin.from('ml_promo_actions').insert(ctx.acoes);
    // Coluna previous_price ainda não criada (ml_promo_limite_preco.sql): grava
    // sem ela em vez de perder o histórico inteiro da rodada.
    if (error && /previous_price/.test(error.message || '')) {
        ({ error } = await supabaseAdmin.from('ml_promo_actions').insert(ctx.acoes.map((a) => {
            const semPreco = { ...a };
            delete semPreco.previous_price;
            return semPreco;
        })));
    }
    if (error) {
        console.error('Falha ao gravar histórico da automação de promoções:', error.message);
        return 0;
    }
    return ctx.acoes.filter(a => a.outcome === 'joined').length;
}

// A aba "Sem promoção" é uma lista de coisas a fazer. Anúncio pausado, em
// revisão ou sem estoque não tem o que fazer — não dá para promover o que não
// está à venda —, então as linhas "encerradas" desses anúncios são removidas.
// As linhas de promoção ATIVA continuam intactas: quem some é só o alerta.
//
// listaCompleta indica que itemIds cobre todos os anúncios ativos da conta.
// Só nesse caso dá para concluir que um anúncio ausente da lista está pausado;
// se a varredura estiver em janelas, ausência não prova nada.
async function checkPromotions(userId, itemIds, meta, listaCompleta) {
    const [activeRes, candidateRes, liquidoRes] = await Promise.all([
        supabaseAdmin
            .from('ml_promotions')
            .select('ml_item_id, promotion_id, item_title, item_thumbnail, promotion_type, promotion_name, finish_date, soon_alerted, is_read')
            .eq('user_id', userId)
            .eq('status', 'active'),
        supabaseAdmin
            .from('ml_lightning_candidates')
            .select('ml_item_id')
            .eq('user_id', userId),
        // Líquido já calculado antes. Serve para não refazer duas consultas de
        // tarifa e frete por anúncio a cada 15 minutos: só recalcula quando o
        // preço praticado muda ou quando o valor envelhece.
        supabaseAdmin
            .from('ml_promo_item_config')
            .select('ml_item_id, current_price, current_net, current_net_at')
            .eq('user_id', userId),
    ]);
    if (activeRes.error) throw new Error(activeRes.error.message);
    if (candidateRes.error) throw new Error(candidateRes.error.message);

    const liquidoGuardado = {};
    for (const r of liquidoRes.data || []) liquidoGuardado[r.ml_item_id] = r;
    // O que esta rodada calculou, gravado de uma vez no fim.
    const liquidosNovos = [];

    const oldByKey = {};
    for (const row of activeRes.data || []) oldByKey[`${row.ml_item_id}|${row.promotion_id}`] = row;
    const oldCandidateItemIds = new Set((candidateRes.data || []).map(r => r.ml_item_id));

    const seenKeys = new Set();
    const seenCandidateItemIds = new Set();
    // Itens com QUALQUER promoção rodando agora — inclusive as sem prazo
    // (SMART, PRICE_DISCOUNT), que não entram em ml_promotions por não terem
    // finish_date. É o que distingue "ficou sem promoção" de "trocou de
    // promoção".
    const itensComPromocaoAtiva = new Set();
    // Só os anúncios cuja consulta ao ML REALMENTE respondeu. Anúncio em
    // revisão devolve 400 (`Item status is not allowed (under_review)`), e
    // tratar essa falha como "não tem promoção nenhuma" inventava um fim de
    // campanha que não aconteceu.
    const itensConsultadosComSucesso = new Set();

    // Sem meta não dá para julgar: uma falha na consulta do /items não pode
    // virar "está pausado". Na dúvida, o anúncio fica como está.
    const itensVendaveis = new Set(
        itemIds.filter(id => meta[id] && meta[id].status === 'active' && (meta[id].estoque === null || meta[id].estoque > 0))
    );
    const itensNaoVendaveis = new Set(
        itemIds.filter(id => meta[id] && !itensVendaveis.has(id))
    );
    const promotionRows = [];
    const candidateRows = [];
    let endingSoon = 0;

    // Null quando a automação está desligada — aí nada abaixo age, só observa.
    const ctxAuto = await carregarContextoAutomacao(userId);

    await mapWithConcurrency(itemIds, ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const resp = await mlFetch(userId, `/seller-promotions/items/${itemId}?app_version=v2`);
        if (!resp.ok) return;
        itensConsultadosComSucesso.add(itemId);

        const promos = await resp.json();
        const list = Array.isArray(promos) ? promos : [];

        // A automação roda ANTES da parte que só observa: se ela entrar numa
        // promoção agora, o item deixa de ser "candidato" e não faz sentido
        // continuar listando como oportunidade pendente na tela.
        //
        // A reposição vem depois e só quando nada foi aceito: `list` foi lida
        // antes da entrada acima e não reflete uma promoção aceita agora mesmo,
        // então ela veria o anúncio como "sem promoção" e tentaria repor por
        // cima do que acabou de entrar.
        const entrouAgora = await automatizarPromocoesDoItem(userId, itemId, list, ctxAuto, meta);
        if (!entrouAgora) await manterDescontoDoItem(userId, itemId, list, ctxAuto, meta);

        // ── LÍQUIDO DE HOJE, PARA A TELA ─────────────────────────────────
        // A aba mostra quanto cada anúncio deixa LIMPO, que é o número da
        // regra. Calcular isso na hora de abrir a tela custaria duas consultas
        // ao ML por anúncio e deixaria a aba lenta, então fica guardado aqui.
        //
        // Só é refeito quando o preço praticado muda ou quando o valor passa de
        // meio dia. Sem essa guarda seriam duas consultas por anúncio a cada 15
        // minutos, repetindo uma conta que quase nunca muda.
        if (meta[itemId]) {
            const emVigorAgora = promocaoEmVigor(list);
            const precoAgora = precoPraticado(meta[itemId], emVigorAgora);
            const guardado = liquidoGuardado[itemId];
            const mesmoPreco = guardado && guardado.current_price != null
                && Math.abs(Number(guardado.current_price) - precoAgora) < 0.01;
            const fresco = guardado && guardado.current_net_at
                && (Date.now() - new Date(guardado.current_net_at).getTime()) < 12 * 3600 * 1000;

            if (!(mesmoPreco && fresco && guardado.current_net != null)) {
                const l = await liquidoDeHoje(userId, itemId, meta[itemId], list);
                if (l) {
                    const agora = new Date().toISOString();
                    liquidosNovos.push({
                        user_id: userId,
                        ml_item_id: itemId,
                        current_price: l.preco,
                        current_net: l.recebe,
                        current_net_at: agora,
                        updated_at: agora,
                    });
                }
            }
        }

        // Relâmpago é tratado uma vez por item, olhando TODAS as entradas LIGHTNING
        // juntas: a API pode devolver "candidate" (nova oportunidade) e "pending"/
        // "started" (já agendada/rodando) ao mesmo tempo pro mesmo anúncio. Só entra
        // como candidato de verdade quem não tem nada agendado nem ativo ainda.
        const lightningCandidate = list.find(p => p.type === 'LIGHTNING' && p.status === 'candidate');
        const hasLightningScheduledOrActive = list.some(p => p.type === 'LIGHTNING' && (p.status === 'pending' || p.status === 'started'));
        if (lightningCandidate && !hasLightningScheduledOrActive) {
            seenCandidateItemIds.add(itemId);
            // Os limites de preço e estoque vinham na resposta e eram jogados
            // fora. São eles que permitem decidir se vale entrar: min_price é o
            // maior desconto que o ML permite, e o piso de margem real sai do
            // custo importado do produto (calculado no front, onde vivem a
            // tabela de NCMs e o motor de impostos).
            const estoque = lightningCandidate.stock || {};
            candidateRows.push({
                user_id: userId,
                ml_item_id: itemId,
                item_title: (meta[itemId] && meta[itemId].title) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].thumbnail) || null,
                original_price: num(lightningCandidate.original_price),
                suggested_price: num(lightningCandidate.suggested_discounted_price),
                min_price: num(lightningCandidate.min_discounted_price),
                max_price: num(lightningCandidate.max_discounted_price),
                stock_min: num(estoque.min),
                stock_max: num(estoque.max),
                updated_at: new Date().toISOString(),
            });
        }

        for (const p of list) {
            // 'pending' conta tanto quanto 'started': o anúncio JÁ está inscrito,
            // só que a campanha ainda não começou a valer. Contar só 'started'
            // colocava em "Sem promoção" anúncio que estava em três campanhas —
            // era o caso do anúncio que o vendedor abria e via a promoção lá.
            // O trecho do Relâmpago logo acima já tratava os dois juntos; aqui
            // tinha ficado de fora.
            if (p.status === 'started' || p.status === 'pending') itensComPromocaoAtiva.add(itemId);
            if (p.type === 'LIGHTNING') continue; // já resolvido acima — Relâmpago não entra como promoção "com prazo"

            if (p.status !== 'started' || !p.finish_date || !p.id) continue;

            const key = `${itemId}|${p.id}`;
            seenKeys.add(key);
            const old = oldByKey[key];
            const daysLeft = (new Date(p.finish_date).getTime() - Date.now()) / 86400000;
            const withinWindow = daysLeft <= 3;

            let soonAlerted = old ? old.soon_alerted : false;
            let isRead = old ? old.is_read : true;
            if (withinWindow && !soonAlerted) {
                isRead = false;
                soonAlerted = true;
                endingSoon++;
            } else if (!withinWindow) {
                soonAlerted = false; // data foi estendida pra frente — reseta pra poder alertar de novo depois
            }

            promotionRows.push({
                user_id: userId,
                ml_item_id: itemId,
                item_title: (meta[itemId] && meta[itemId].title) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].thumbnail) || null,
                promotion_id: p.id,
                promotion_type: p.type || null,
                promotion_name: p.name || null,
                finish_date: p.finish_date,
                status: 'active',
                soon_alerted: soonAlerted,
                is_read: isRead,
                updated_at: new Date().toISOString(),
            });
        }
    });

    // Promoções que estavam ativas e sumiram da resposta da API = terminaram. finish_date
    // agora é NOT NULL na tabela, então reaproveita o último valor conhecido (old) em vez
    // de omitir a coluna — cada linha do upsert sempre tem o mesmo formato completo.
    let justEnded = 0;
    const chavesParaRemover = [];
    for (const key of Object.keys(oldByKey)) {
        if (seenKeys.has(key)) continue;
        const [itemId, promotionId] = key.split('|');
        const old = oldByKey[key];

        // "Sumiu da resposta" só significa "terminou" se este anúncio foi
        // consultado nesta rodada. Como a varredura vê uma janela de anúncios
        // por vez, um anúncio fora da janela não aparece em seenKeys — e
        // marcá-lo como encerrado inventava um fim que não aconteceu. Era isso
        // que jogava na aba "Sem promoção" anúncios que estavam em promoção o
        // tempo todo.
        if (!itensConsultadosComSucesso.has(itemId)) continue;

        // Trocou de promoção em vez de ficar sem: a campanha antiga acabou,
        // mas o anúncio já está em outra. Aparecer na aba "Sem promoção" seria
        // alarme falso — o vendedor não precisa fazer nada.
        if (itensComPromocaoAtiva.has(itemId) || itensNaoVendaveis.has(itemId)) {
            chavesParaRemover.push({ ml_item_id: itemId, promotion_id: promotionId });
            continue;
        }

        promotionRows.push({
            user_id: userId,
            ml_item_id: itemId,
            item_title: old.item_title,
            item_thumbnail: old.item_thumbnail,
            promotion_id: promotionId,
            promotion_type: old.promotion_type,
            promotion_name: old.promotion_name,
            finish_date: old.finish_date,
            status: 'ended',
            soon_alerted: old.soon_alerted,
            is_read: false,
            updated_at: new Date().toISOString(),
        });
        justEnded++;
    }

    for (const alvo of chavesParaRemover) {
        const { error } = await supabaseAdmin
            .from('ml_promotions')
            .delete()
            .eq('user_id', userId)
            .eq('ml_item_id', alvo.ml_item_id)
            .eq('promotion_id', alvo.promotion_id);
        if (error) console.error('Erro ao limpar promoção substituída:', error.message);
    }

    // Linhas "ended" ANTIGAS de anúncios que hoje estão em promoção. O bloco
    // acima só cobre a transição do momento: assim que uma linha vira 'ended'
    // ela nunca mais é reavaliada, porque a consulta do início desta função só
    // lê status='active'. E promoção sem prazo (SMART, PRICE_MATCHING) não gera
    // linha nenhuma em ml_promotions — logo o anúncio entrava numa dessas e
    // continuava para sempre na aba "Sem promoção", que é justamente a lista de
    // quem precisa de atenção.
    const itensAindaEmPromocao = [...itensComPromocaoAtiva];
    for (let i = 0; i < itensAindaEmPromocao.length; i += 20) {
        const lote = itensAindaEmPromocao.slice(i, i + 20);
        const { error } = await supabaseAdmin
            .from('ml_promotions')
            .delete()
            .eq('user_id', userId)
            .eq('status', 'ended')
            .in('ml_item_id', lote);
        if (error) console.error('Erro ao limpar promoções encerradas de anúncio que voltou a ter promoção:', error.message);
    }

    if (promotionRows.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_promotions')
            .upsert(promotionRows, { onConflict: 'user_id,ml_item_id,promotion_id' });
        if (error) throw new Error(error.message);
    }

    // Falha aqui não derruba a varredura: isto alimenta o número que a tela
    // mostra, não a decisão da automação — que recalcula o líquido por conta
    // própria toda vez que vai decidir.
    if (liquidosNovos.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_promo_item_config')
            .upsert(liquidosNovos, { onConflict: 'user_id,ml_item_id' });
        if (error) console.error('Falha ao guardar o líquido de cada anúncio:', error.message);
    }

    // Alertas antigos de anúncios que saíram do ar. Anúncio pausado, encerrado
    // ou em revisão não volta em /items/search?status=active, então nenhuma
    // rodada o "visita" para limpar — a linha ficaria em "Sem promoção" para
    // sempre. Só é seguro concluir isso quando a lista de ativos veio inteira.
    if (listaCompleta) {
        const { data: encerradas, error: erroLeitura } = await supabaseAdmin
            .from('ml_promotions')
            .select('ml_item_id')
            .eq('user_id', userId)
            .eq('status', 'ended');

        if (erroLeitura) {
            console.error('Erro ao listar promoções encerradas para limpeza:', erroLeitura.message);
        } else {
            const orfaos = [...new Set((encerradas || []).map(r => r.ml_item_id))]
                .filter(id => !itensVendaveis.has(id));
            for (let i = 0; i < orfaos.length; i += 20) {
                const lote = orfaos.slice(i, i + 20);
                const { error } = await supabaseAdmin
                    .from('ml_promotions')
                    .delete()
                    .eq('user_id', userId)
                    .eq('status', 'ended')
                    .in('ml_item_id', lote);
                if (error) console.error('Erro ao limpar alerta de anúncio fora do ar:', error.message);
            }
        }
    }

    if (candidateRows.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_lightning_candidates')
            .upsert(candidateRows, { onConflict: 'user_id,ml_item_id' });
        if (error) throw new Error(error.message);
    }

    // Itens que eram candidatos a Relâmpago e não são mais (já foram inscritos,
    // deixaram de ser elegíveis, etc.) — remove pra não mostrar oportunidade que já passou.
    // Mesmo cuidado da lista de promoções: "não apareceu" só quer dizer "não é
    // mais candidato" para anúncio que foi consultado nesta janela. Sem o
    // filtro, cada rodada apagaria os candidatos das outras janelas.
    const staleCandidateItemIds = [...oldCandidateItemIds]
        .filter(id => itensConsultadosComSucesso.has(id) && !seenCandidateItemIds.has(id));
    if (staleCandidateItemIds.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_lightning_candidates')
            .delete()
            .eq('user_id', userId)
            .in('ml_item_id', staleCandidateItemIds);
        if (error) throw new Error(error.message);
    }

    const promoJoins = await gravarAcoesAutomacao(ctxAuto);
    await gravarLembrancasAutomacao(ctxAuto);

    return { promotionsChecked: seenKeys.size, endingSoon, justEnded, lightningCandidates: seenCandidateItemIds.size, promoJoins };
}

// Verifica as avaliações, o status de catálogo e as promoções de um usuário conectado,
// gravando tudo que for novo/mudou no Supabase. A dedupe de avaliações acontece via
// upsert com a constraint unique(user_id, ml_item_id, ml_review_id) — inclui user_id
// porque duas contas Impoclick podem estar ligadas à mesma conta do Mercado Livre
// (mesmos itens).
// offsetForcado: pula o rodízio por tempo e varre exatamente a janela pedida.
// Serve para corrigir dados de uma vez em vez de esperar o ciclo inteiro — sem
// ele, disparos manuais dentro dos mesmos 15 minutos repetem sempre a mesma
// janela e não adiantam nada.
async function checkUser(userId, offsetForcado) {
    // A API devolve no máximo 100 anúncios por página e o tempo da function não
    // dá para varrer tudo numa rodada só. Olhar sempre os mesmos 100 primeiros
    // deixava quem tem mais anúncios com o restante nunca verificado. Agora
    // cada rodada avança uma janela: com o cron de 15 minutos, 500 anúncios são
    // varridos por inteiro em 1h15. O total já vem gravado da rodada anterior,
    // então isso não custa nenhuma chamada extra ao Mercado Livre.
    const statusRes = await supabaseAdmin
        .from('ml_check_status')
        .select('total_active_items')
        .eq('user_id', userId)
        .maybeSingle();
    const totalConhecido = (statusRes.data && statusRes.data.total_active_items) || 0;
    // /items/search não pagina além de offset 1000 — passar disso devolve erro
    // em vez de página vazia, o que derrubaria a verificação do usuário inteiro.
    const MAX_JANELAS = Math.floor(1000 / ITEMS_PER_USER_CAP);
    const janelas = Math.min(MAX_JANELAS, Math.max(1, Math.ceil(totalConhecido / ITEMS_PER_USER_CAP)));
    let offset = offsetForcado != null
        ? offsetForcado
        : (Math.floor(Date.now() / JANELA_MS) % janelas) * ITEMS_PER_USER_CAP;

    const buscarPagina = async (desloc) => {
        const resp = await mlFetch(userId, mlUserId => `/users/${mlUserId}/items/search?status=active&limit=${ITEMS_PER_USER_CAP}&offset=${desloc}`);
        if (!resp.ok) throw new Error(`items/search falhou (${resp.status})`);
        return resp.json();
    };

    let searchData = await buscarPagina(offset);
    // O total gravado pode ter envelhecido (anúncios pausados desde a última
    // rodada). Se a janela caiu no vazio, recomeça do início em vez de perder
    // o ciclo inteiro.
    if ((searchData.results || []).length === 0 && offset > 0 && offsetForcado == null) {
        offset = 0;
        searchData = await buscarPagina(0);
    }
    const itemIds = searchData.results || [];
    const totalActiveItems = (searchData.paging && searchData.paging.total) || itemIds.length;
    if (itemIds.length === 0) return { itemsChecked: 0, newReviews: 0, catalogChecked: 0, catalogLost: 0, promotionsChecked: 0, endingSoon: 0, justEnded: 0, promoJoins: 0, lightningCandidates: 0, totalActiveItems };

    const meta = await fetchItemMeta(userId, itemIds);

    const rows = [];
    await mapWithConcurrency(itemIds, ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const catalogProductId = meta[itemId] && meta[itemId].catalogProductId;
        const reviewsPath = catalogProductId
            ? `/reviews/item/${itemId}?catalog_product_id=${encodeURIComponent(catalogProductId)}`
            : `/reviews/item/${itemId}`;

        const resp = await mlFetch(userId, reviewsPath);
        if (!resp.ok) return; // item sem reviews habilitadas ou erro pontual — segue para o próximo

        const data = await resp.json();
        const levels = data.rating_levels || {};
        const itemRatingCount = ['one_star', 'two_star', 'three_star', 'four_star', 'five_star']
            .reduce((sum, key) => sum + (levels[key] || 0), 0);

        for (const r of data.reviews || []) {
            rows.push({
                user_id: userId,
                ml_item_id: itemId,
                ml_review_id: String(r.id),
                item_title: (meta[itemId] && meta[itemId].title) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].thumbnail) || null,
                item_rating_average: data.rating_average ?? null,
                item_rating_count: itemRatingCount,
                rating: r.rate,
                comment: r.content || null,
                reviewed_at: r.date_created || null,
            });
        }
    });

    // ── O que conta como avaliação NOVA ────────────────────────────────
    //
    // Antes, toda linha que entrava na tabela nascia não lida (o default da
    // coluna), e isso gerava falso alerta de dois jeitos, ambos medidos no
    // banco de uma conta real:
    //
    //   1. A mesma avaliação sob vários anúncios. Variações e kits do mesmo
    //      produto recebem a mesma avaliação do ML, e cada uma virava uma
    //      linha — 400 não lidas eram só 260 avaliações. Lendo uma, as cópias
    //      seguiam não lidas e o alerta nunca sumia.
    //   2. Histórico entrando como novidade. Quando um anúncio passa a ser
    //      consultado pela primeira vez, TODAS as avaliações antigas dele
    //      entravam. A mediana entre o comprador escrever e nós gravarmos era
    //      de 45 dias: o ícone acusava novidade e o painel mostrava coisa velha.
    //
    // Agora uma linha só nasce não lida se a avaliação foi escrita há pouco E
    // é a primeira vez que essa avaliação aparece para o usuário, em qualquer
    // anúncio. O resto entra como histórico: fica no banco, sem alertar.
    let newReviews = 0;
    if (rows.length > 0) {
        const { data: jaGravadas, error: erroLeitura } = await supabaseAdmin
            .from('ml_reviews')
            .select('ml_item_id, ml_review_id')
            .eq('user_id', userId);
        if (erroLeitura) throw new Error(erroLeitura.message);

        const chaves = new Set((jaGravadas || []).map((r) => r.ml_item_id + '|' + r.ml_review_id));
        const reviewsConhecidos = new Set((jaGravadas || []).map((r) => r.ml_review_id));
        const vistosNestaRodada = new Set();
        const agora = Date.now();

        const novas = [];
        const existentes = [];
        for (const row of rows) {
            if (chaves.has(row.ml_item_id + '|' + row.ml_review_id)) {
                existentes.push(row);
                continue;
            }
            const escritaEm = row.reviewed_at ? Date.parse(row.reviewed_at) : NaN;
            const recente = Number.isFinite(escritaEm) && agora - escritaEm <= JANELA_AVALIACAO_NOVA_MS;
            const primeiraCopia = !reviewsConhecidos.has(row.ml_review_id) && !vistosNestaRodada.has(row.ml_review_id);
            vistosNestaRodada.add(row.ml_review_id);

            novas.push({ ...row, is_read: !(recente && primeiraCopia) });
        }

        if (novas.length > 0) {
            // ignoreDuplicates: se outra rodada gravou a mesma linha entre a
            // leitura acima e agora, não sobrescreve o is_read dela.
            const { error } = await supabaseAdmin
                .from('ml_reviews')
                .upsert(novas, { onConflict: 'user_id,ml_item_id,ml_review_id', ignoreDuplicates: true });
            if (error) throw new Error(error.message);
            newReviews = novas.filter((r) => !r.is_read).length;
        }

        if (existentes.length > 0) {
            // Atualiza título, foto e nota do anúncio. is_read fica de fora do
            // payload de propósito, para o que o usuário já leu continuar lido.
            const { error } = await supabaseAdmin
                .from('ml_reviews')
                .upsert(existentes, { onConflict: 'user_id,ml_item_id,ml_review_id' });
            if (error) throw new Error(error.message);
        }
    }

    // itemIds cobre a conta inteira quando a janela deu conta de todos os ativos.
    const listaCompleta = itemIds.length >= totalActiveItems;
    const catalogResult = await checkCatalogCompetition(userId, itemIds, meta, listaCompleta);
    const promotionsResult = await checkPromotions(userId, itemIds, meta, listaCompleta);

    // Publicidade não depende da lista de itens ativos: a própria API de ads
    // devolve os anúncios do anunciante. Conta sem Publicidade habilitada
    // volta zerada e não interrompe o resto da checagem.
    let adsResult = { adsChecked: 0, adsJustOff: 0 };
    try {
        adsResult = await checkAdsStatus(userId);
    } catch (err) {
        console.error('Erro ao checar Patrocinados:', err.message);
    }

    return { itemsChecked: itemIds.length, newReviews, ...catalogResult, ...promotionsResult, ...adsResult, totalActiveItems };
}

const PROMOTION_RETENTION_DAYS = 180;

// ml_reviews e ml_catalog_status não crescem sem limite (reviews têm valor
// histórico, catálogo é upsert por item) — só ml_promotions acumula uma linha
// por promoção encerrada pra sempre. Uma limpeza leve, 1x por rodada (não por
// usuário), evita a tabela crescer indefinidamente com campanhas antigas.
async function cleanupOldPromotions() {
    const cutoff = new Date(Date.now() - PROMOTION_RETENTION_DAYS * 86400000).toISOString();
    const { error } = await supabaseAdmin
        .from('ml_promotions')
        .delete()
        .eq('status', 'ended')
        .lt('updated_at', cutoff);
    if (error) console.error('Erro na limpeza de promoções antigas:', error.message);
}

// O histórico da automação registra TODA decisão, inclusive as de não agir —
// é o que permite auditar por que um anúncio ficou de fora. Só que ele cresce
// com clientes × anúncios × 96 rodadas por dia: com 10 clientes e 100 anúncios
// cada, são centenas de milhares de linhas por mês, contra os 500 MB do plano
// gratuito do Supabase.
//
// 90 dias é bem mais do que se olha na prática e mantém a tabela estável.
const PROMO_ACTIONS_RETENTION_DAYS = 90;

async function cleanupOldPromoActions() {
    const cutoff = new Date(Date.now() - PROMO_ACTIONS_RETENTION_DAYS * 86400000).toISOString();
    const { error } = await supabaseAdmin
        .from('ml_promo_actions')
        .delete()
        .lt('created_at', cutoff);
    if (error) console.error('Erro na limpeza do histórico da automação:', error.message);
}

async function runCheck(res, offsetForcado) {
    await cleanupOldPromotions();
    await cleanupOldPromoActions();

    const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('ml_access_token', 'is', null);

    if (error) return res.status(500).json({ error: error.message });

    let itemsChecked = 0;
    let newReviews = 0;
    let catalogChecked = 0;
    let catalogLost = 0;
    let promotionsChecked = 0;
    let endingSoon = 0;
    let justEnded = 0;
    let lightningCandidates = 0;
    let promoJoins = 0;
    const errors = [];

    // Usuários eram processados em FILA (for...of com await), o que dava ~8 a 12
    // segundos cada. Com o limite de 60s da function, a partir de 5 a 7 clientes
    // a rodada estourava no meio: quem estava no fim da fila simplesmente não
    // era verificado, e o único sinal era o cron marcar falha.
    //
    // Agora vão em lotes paralelos. A concorrência é baixa de propósito: cada
    // usuário já dispara ITEM_CHECK_CONCURRENCY (8) chamadas simultâneas ao
    // Mercado Livre, então 3 usuários significam até 24 em voo. Subir demais
    // troca o timeout por 429 (Too Many Requests), que é pior porque a cota é
    // da aplicação e afeta todos os clientes de uma vez.
    const inicio = Date.now();
    let pulados = 0;
    const totaisPorUsuario = [];

    await mapWithConcurrency(profiles || [], USER_CHECK_CONCURRENCY, async (profile) => {
        // Parada graciosa: em vez de ser morto no meio de um usuário, para de
        // começar novos quando o tempo aperta. Quem ficou de fora é verificado
        // na rodada seguinte, 15 minutos depois, e o número aparece na resposta
        // em vez de sumir.
        if (Date.now() - inicio > RUN_BUDGET_MS) { pulados++; return; }

        try {
            const result = await checkUser(profile.id, offsetForcado);
            totaisPorUsuario.push({
                user: profile.id.slice(0, 8),
                totalAtivos: result.totalActiveItems,
                verificadosAgora: result.itemsChecked,
            });
            itemsChecked += result.itemsChecked;
            newReviews += result.newReviews;
            catalogChecked += result.catalogChecked;
            catalogLost += result.catalogLost;
            promotionsChecked += result.promotionsChecked;
            endingSoon += result.endingSoon;
            justEnded += result.justEnded;
            lightningCandidates += result.lightningCandidates;
            promoJoins += result.promoJoins || 0;

            await supabaseAdmin.from('ml_check_status').upsert({
                user_id: profile.id,
                last_checked_at: new Date().toISOString(),
                last_items_checked: result.itemsChecked,
                total_active_items: result.totalActiveItems,
                last_error: null,
            });
        } catch (err) {
            errors.push({ userId: profile.id, error: err.message });
            try {
                await supabaseAdmin.from('ml_check_status').upsert({
                    user_id: profile.id,
                    last_checked_at: new Date().toISOString(),
                    last_error: err.message,
                });
            } catch (e2) { /* não deixa um erro ao registrar o status derrubar o lote inteiro */ }
        }
    });

    if (pulados > 0) {
        console.warn(`[cron] ${pulados} usuário(s) ficaram para a próxima rodada por falta de tempo. Se isso virar rotina, é sinal de que o número de clientes passou do que o cron aguenta em 60s.`);
    }

    return res.json({
        janela: offsetForcado != null ? offsetForcado : 'rodizio',
        porUsuario: totaisPorUsuario,
        usersChecked: (profiles || []).length - pulados,
        usersSkipped: pulados,
        durationMs: Date.now() - inicio,
        itemsChecked, newReviews,
        catalogChecked, catalogLost,
        promotionsChecked, endingSoon, justEnded, lightningCandidates, promoJoins,
        errors,
    });
}

// Anúncios sem Patrocinados ligado.
//
// Diferente das outras abas do monitoramento, esta não lê tabela do Supabase
// nem depende do cron: é uma pergunta sobre o estado de AGORA ("quais dos
// meus anúncios estão fora de campanha"), não um alerta de mudança. Então
// consulta a API de publicidade na hora.
//
// Os status que interessam:
//   idle   — o anúncio pode ser patrocinado, mas não está em campanha nenhuma
//   paused — está numa campanha, porém pausado
// Ambos significam "não está rodando". O status hold fica de fora: ali o
// anúncio está sem estoque ou pausado no marketplace, não é uma decisão de
// publicidade.
// idle   = pode ser patrocinado, mas não está em campanha nenhuma
// paused = está numa campanha, porém pausado
// Qualquer outro status (active, hold, delegated, revoked) não é "desligado
// por decisão do vendedor" e não entra na aba.
const ADS_OFF_STATUS_LIST = ['idle', 'paused'];
const ADS_OFF_STATUSES = ADS_OFF_STATUS_LIST.join(',');
const ADS_PAGE_SIZE = 50;
const ADS_MAX_PAGES = 10;

// Lista os anúncios que estão fora de publicidade agora, direto na API do ML.
//
// Devolve sempre o motivo em caso de falha, em vez de null: uma aba vazia
// pode significar "está tudo rodando" ou "a consulta falhou", e sem
// distinguir os dois o vendedor fica sem saber se pode confiar na tela.
async function fetchAdsOff(userId) {
    const advResp = await mlFetch(userId, '/advertising/advertisers?product_id=PADS', {
        headers: { 'Api-Version': '1' },
    });

    if (advResp.status === 404) {
        return {
            ok: false,
            reason: 'sem_publicidade',
            message: 'Esta conta do Mercado Livre não tem Publicidade habilitada (Meu perfil > Publicidade). O ML exige reputação amarela ou melhor, 15 dias de cadastro e um mínimo de vendas.',
        };
    }
    if (!advResp.ok) {
        return {
            ok: false,
            reason: 'erro_anunciante',
            message: `Não foi possível consultar a conta de anunciante (HTTP ${advResp.status}): ${(await advResp.text()).slice(0, 200)}`,
        };
    }

    const advData = await advResp.json();
    const advertiser = (advData.advertisers || []).find((a) => a.site_id === 'MLB') || (advData.advertisers || [])[0];
    if (!advertiser) {
        return { ok: false, reason: 'sem_anunciante', message: 'A API de publicidade não retornou nenhuma conta de anunciante para este usuário.' };
    }

    const items = [];
    let offset = 0;

    for (let page = 0; page < ADS_MAX_PAGES; page += 1) {
        // O ML espera filters[statuses]=idle,paused. URLSearchParams
        // percent-encoda os colchetes e a vírgula, o que nem toda API aceita,
        // então a query é montada à mão.
        const path = `/advertising/MLB/advertisers/${advertiser.advertiser_id}/product_ads/ads/search`
            + `?limit=${ADS_PAGE_SIZE}&offset=${offset}&filters[statuses]=${ADS_OFF_STATUSES}`;

        const resp = await mlFetch(userId, path, { headers: { 'api-version': '2' } });
        if (!resp.ok) {
            return {
                ok: false,
                reason: 'erro_ads',
                message: `Falha ao listar os anúncios de publicidade (HTTP ${resp.status}): ${(await resp.text()).slice(0, 200)}`,
            };
        }

        const data = await resp.json();
        (data.results || []).forEach((ad) => {
            // O filtro filters[statuses] da URL não é confiável: o ML devolveu
            // anúncios ativos mesmo pedindo só idle,paused, e eles entravam na
            // lista como se estivessem fora de campanha. A conferência do
            // status é feita aqui, sobre o que a resposta realmente trouxe.
            if (!ADS_OFF_STATUS_LIST.includes(ad.status)) return;

            // Anúncio de catálogo fica de fora: a aba trata dos anúncios
            // próprios da conta, onde ligar o Patrocinados é decisão só do
            // vendedor. No catálogo a página é compartilhada e a dinâmica é
            // outra.
            if (ad.catalog_listing) return;

            items.push({
                itemId: ad.item_id,
                title: ad.title || ad.item_id,
                thumbnail: toHttps(ad.thumbnail),
                status: ad.status || null,
                catalogListing: false,
                buyBoxWinner: !!ad.buy_box_winner,
                recommended: !!ad.recommended,
            });
        });

        const total = (data.paging && data.paging.total) || items.length;
        offset += ADS_PAGE_SIZE;
        if (offset >= total) break;
    }

    return { ok: true, items: await keepActiveWithStock(userId, items) };
}

// Mantém só os anúncios que estão ativos e com estoque.
//
// Não dá pra confiar só no status do lado da publicidade: o "hold" da API de
// ads cobre pausado/sem estoque, mas nem todo anúncio parado cai nele. E
// sugerir ligar Patrocinados num anúncio pausado ou zerado é gastar a atenção
// do vendedor com o que ele não pode fazer agora.
async function keepActiveWithStock(userId, ads) {
    if (ads.length === 0) return ads;

    const situacao = {};
    for (let i = 0; i < ads.length; i += 20) {
        const batch = ads.slice(i, i + 20).map((ad) => ad.itemId);
        const resp = await mlFetch(userId, `/items?ids=${batch.join(',')}&attributes=id,status,available_quantity`);
        if (!resp.ok) continue;

        const data = await resp.json();
        for (const entry of data) {
            if (entry.code === 200 && entry.body) {
                situacao[entry.body.id] = {
                    status: entry.body.status,
                    available: entry.body.available_quantity,
                };
            }
        }
    }

    // Item que o multiget não devolveu fica de fora: sem confirmação de que
    // está ativo e com estoque, não entra na lista.
    return ads.filter((ad) => {
        const info = situacao[ad.itemId];
        return info && info.status === 'active' && (info.available || 0) > 0;
    });
}

// Grava o estado de publicidade e detecta quem SAIU de campanha.
//
// A tabela guarda só os anúncios parados. Anúncio que volta a rodar tem a
// linha apagada, então aparecer aqui de novo mais tarde é uma mudança real e
// vira alerta. Na primeira rodada de um usuário nada alerta: os parados já
// estavam parados antes de existir monitoramento, não é uma transição.
async function checkAdsStatus(userId) {
    const resultado = await fetchAdsOff(userId);
    if (!resultado.ok) {
        console.error(`Patrocinados (${userId}): ${resultado.reason} — ${resultado.message}`);
        return { adsChecked: 0, adsJustOff: 0 };
    }
    const items = resultado.items;

    const { data: existingRows, error: existingError } = await supabaseAdmin
        .from('ml_ads_status')
        .select('ml_item_id, is_read')
        .eq('user_id', userId);
    if (existingError) throw new Error(existingError.message);

    const oldByItemId = {};
    (existingRows || []).forEach((row) => { oldByItemId[row.ml_item_id] = row; });
    const primeiraRodada = (existingRows || []).length === 0;

    // Carimbo único da rodada: tudo que for gravado agora recebe este valor, e
    // o que sobrar com carimbo anterior é o que saiu da lista.
    const carimboDaRodada = new Date().toISOString();

    let adsJustOff = 0;
    const rows = items.map((ad) => {
        const old = oldByItemId[ad.itemId];
        let isRead;
        if (old) {
            isRead = old.is_read; // já conhecíamos: preserva o que o vendedor já viu
        } else if (primeiraRodada) {
            isRead = true; // nunca monitoramos esta conta: não é uma transição
        } else {
            isRead = false; // saiu de campanha agora
            adsJustOff += 1;
        }

        return {
            user_id: userId,
            ml_item_id: ad.itemId,
            item_title: ad.title,
            item_thumbnail: toHttps(ad.thumbnail),
            status: ad.status,
            catalog_listing: ad.catalogListing,
            buy_box_winner: ad.buyBoxWinner,
            recommended: ad.recommended,
            is_read: isRead,
            updated_at: carimboDaRodada,
        };
    });

    if (rows.length > 0) {
        const { error } = await supabaseAdmin
            .from('ml_ads_status')
            .upsert(rows, { onConflict: 'user_id,ml_item_id' });
        if (error) throw new Error(error.message);
    }

    // Quem voltou a rodar sai da tabela — a aba lista só quem está parado.
    //
    // A limpeza é por carimbo de tempo, e não por uma lista NOT IN com todos
    // os ids: aquela forma dependia de o PostgREST interpretar a lista do
    // jeito certo e, se falhasse, o erro subia, era engolido pelo try/catch da
    // checagem e as linhas ficavam obsoletas para sempre — anúncio que voltou
    // para campanha continuava aparecendo como desligado. Tudo que foi visto
    // agora tem o carimbo desta rodada; o que ficou para trás não está mais na
    // lista, seja qual for o tamanho dela.
    const { error: deleteError } = await supabaseAdmin
        .from('ml_ads_status')
        .delete()
        .eq('user_id', userId)
        .lt('updated_at', carimboDaRodada);
    if (deleteError) throw new Error(deleteError.message);

    return { adsChecked: items.length, adsJustOff };
}

async function handleUserGet(req, res, userId) {
    // Painel de Patrocinados: anúncios ativos com métricas e economia real.
    // A conta de margem é feita na tela, com o custo que o vendedor digita.
    if (req.query.resource === 'ads-painel') {
        return res.json(await painelDeAds(userId));
    }

    if (req.query.resource === 'ads') {
        const [listRes, countRes] = await Promise.all([
            // catalog_listing = false também na leitura: linhas de catálogo
            // gravadas antes desta regra somem da tela na hora, sem esperar o
            // cron apagá-las na próxima rodada.
            supabaseAdmin
                .from('ml_ads_status')
                .select('id, ml_item_id, item_title, item_thumbnail, status, catalog_listing, buy_box_winner, recommended, is_read, updated_at')
                .eq('user_id', userId)
                .eq('catalog_listing', false)
                // Filtra o status também na leitura: linhas gravadas antes,
                // quando anúncios ativos entravam por engano, somem da tela na
                // hora em vez de esperar o cron apagá-las.
                .in('status', ADS_OFF_STATUS_LIST)
                // Recomendados pelo ML primeiro — a ordem em que ligar o
                // patrocinado tende a render mais.
                .order('recommended', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(200),
            supabaseAdmin
                .from('ml_ads_status')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('catalog_listing', false)
                .in('status', ADS_OFF_STATUS_LIST)
                .eq('is_read', false),
        ]);

        if (listRes.error) return res.status(500).json({ error: listRes.error.message });

        const gravados = listRes.data || [];
        if (gravados.length > 0) {
            return res.json({ items: gravados, unreadCount: countRes.count || 0, source: 'monitoramento' });
        }

        // Banco vazio pode ser "está tudo rodando", "o cron ainda não passou"
        // ou "a consulta à API de publicidade falhou". Consultamos ao vivo pra
        // não deixar a tela em branco sem explicação — e, quando dá erro, o
        // motivo aparece em vez de a aba fingir que não há nada.
        const aoVivo = await fetchAdsOff(userId);
        if (!aoVivo.ok) {
            return res.json({ items: [], unreadCount: 0, source: 'ao_vivo', problema: aoVivo.reason, message: aoVivo.message });
        }

        const items = aoVivo.items.map((ad) => ({
            id: ad.itemId,
            ml_item_id: ad.itemId,
            item_title: ad.title,
            item_thumbnail: toHttps(ad.thumbnail),
            status: ad.status,
            catalog_listing: ad.catalogListing,
            buy_box_winner: ad.buyBoxWinner,
            recommended: ad.recommended,
            is_read: true, // ainda não passou pelo monitoramento: não é alerta
        }));

        return res.json({ items, unreadCount: 0, source: 'ao_vivo' });
    }

    if (req.query.resource === 'status') {
        const { data, error } = await supabaseAdmin
            .from('ml_check_status')
            .select('last_checked_at, last_items_checked, total_active_items, last_error')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });
        return res.json(data || { last_checked_at: null, last_items_checked: null, total_active_items: null, last_error: null });
    }

    // Todos os anúncios ativos do vendedor, para a aba de Automação montar a
    // lista de onde ele escolhe o que automatizar. Consulta ao vivo na API do
    // ML: as tabelas locais só guardam itens que estão em algum estado
    // específico (com promoção, candidato a Relâmpago, disputando catálogo), e
    // aqui a lista precisa ser completa.
    // Todos os anúncios ativos do vendedor, para a aba de Automação. Consulta
    // ao vivo na API do ML: as tabelas locais só guardam itens em algum estado
    // específico (com promoção, candidato a Relâmpago, disputando catálogo), e
    // aqui a lista precisa ser completa.
    //
    // Pagina de verdade. A primeira versão trazia só uma página de 100 e o
    // vendedor não tinha como saber que a lista estava cortada — o total volta
    // na resposta justamente para a tela poder avisar quando não coube tudo.
    if (req.query.resource === 'listings') {
        const PAGINA = 100;                 // máximo aceito por chamada
        const MAX_ANUNCIOS = 500;           // teto para caber nos 60s da function
        try {
            const itemIds = [];
            let total = 0;

            for (let offset = 0; offset < MAX_ANUNCIOS; offset += PAGINA) {
                // Forma de função: o mlFetch injeta o ID real do vendedor. O
                // literal "me" NÃO funciona neste endpoint do ML.
                const resp = await mlFetch(userId, mlUserId =>
                    `/users/${mlUserId}/items/search?status=active&limit=${PAGINA}&offset=${offset}`);
                if (!resp.ok) {
                    if (offset === 0) {
                        return res.status(resp.status).json({ error: 'Não foi possível listar seus anúncios no Mercado Livre.' });
                    }
                    break; // já temos parte da lista; melhor entregar do que falhar inteiro
                }

                const data = await resp.json();
                const pagina = data.results || [];
                total = (data.paging && data.paging.total) || total;
                itemIds.push(...pagina);

                if (pagina.length < PAGINA || itemIds.length >= total) break;
            }

            if (itemIds.length === 0) return res.json({ items: [], total: 0, cap: MAX_ANUNCIOS });

            const meta = await fetchItemMeta(userId, itemIds);
            const items = itemIds
                .filter(id => meta[id])
                // Sem preço aqui de propósito: o do /items é o preço do
                // anúncio, não o praticado na campanha em vigor. A tela lê o
                // valor certo (e o líquido) de ml_promo_item_config, gravado
                // pela verificação.
                .map(id => ({ ml_item_id: id, title: meta[id].title, thumbnail: meta[id].thumbnail }));

            return res.json({
                items,
                total: total || items.length,
                cap: MAX_ANUNCIOS,
                // Só anúncios ativos entram: pausado ou finalizado não participa
                // de promoção, e listá-los só encheria a tela.
                somenteAtivos: true,
            });
        } catch (err) {
            console.error('Erro ao listar anúncios do vendedor:', err);
            return res.status(500).json({ error: 'Erro ao consultar seus anúncios.' });
        }
    }

    // Margem dos anúncios GANHANDO a disputa de catálogo: o preço em vigor já
    // está travado pela competição (mudar preço não é sempre uma escolha livre,
    // como num anúncio comum), então o vendedor precisa saber se aquele preço
    // ainda cobre comissão, frete, imposto, o custo do produto e o anúncio
    // patrocinado — antes de descobrir vendendo no prejuízo.
    //
    // Custo do produto e imposto NÃO vêm daqui: são os mesmos que o vendedor já
    // digita no painel de Patrocinados (ml_item_costs / ml_ads_settings) — a
    // tela reaproveita e a conta final é feita no navegador, como lá.
    if (req.query.resource === 'catalog-margem') {
        // Só os que estão na aba "Ganhando" — é sobre eles que a pergunta faz
        // sentido: perdendo, o preço nem é mais o seu.
        const LIMITE_ITENS = 60;
        const { data: ganhando, error } = await supabaseAdmin
            .from('ml_catalog_status')
            .select('ml_item_id, current_price')
            .eq('user_id', userId)
            .eq('status', 'winning')
            .not('current_price', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(LIMITE_ITENS);
        if (error) return res.status(500).json({ error: error.message });
        if (!ganhando || ganhando.length === 0) return res.json({ itens: [], cortado: false });

        const itemIds = ganhando.map((r) => r.ml_item_id);
        // O ID do vendedor no Mercado Livre (não o do Impoclick) monta a URL da
        // cotação de frete e a busca de pedidos — já guardado desde a conexão,
        // sem custar uma chamada extra ao ML só pra descobri-lo.
        const { data: perfil } = await supabaseAdmin.from('profiles').select('ml_user_id').eq('id', userId).maybeSingle();
        const mlUserId = perfil && perfil.ml_user_id;
        const { de, ate } = periodoAds(30);

        const [meta, adsPorItem, vendas] = await Promise.all([
            fetchItemMeta(userId, itemIds),
            metricasVariosItens(userId, itemIds, 30),
            // Comissão e frete REAIS de quem vendeu no período (a mesma conta
            // do painel de Patrocinados): o que o ML de fato descontou, com o
            // custo de envio de /shipments/{id}/costs — o que aparece em
            // "Detalhe da venda" no próprio Mercado Livre. Sem venda no
            // período (mlUserId ausente entra aqui também), cada item cai na
            // estimativa de tabela (custosDeTabela) por falta de coisa melhor.
            mlUserId ? vendasDoPeriodo(userId, mlUserId, de, ate, itemIds) : Promise.resolve({ porItem: new Map() }),
        ]);

        const itens = [];
        await mapWithConcurrency(ganhando, ITEM_CHECK_CONCURRENCY, async (row) => {
            const id = row.ml_item_id;
            const m = meta[id];
            const preco = Number(row.current_price);
            if (!m || !(preco > 0)) {
                itens.push({ mlItemId: id, preco: preco || null, comissaoUn: null, freteUn: null, adsUn: null, temAds: false, comissaoFonte: null, freteFonte: null });
                return;
            }

            const v = vendas.porItem.get(id);
            const vendeu = !!(v && v.unidades);

            // Estimativa de tabela só é calculada quando falta algo real —
            // evita gastar as duas chamadas (comissão e frete) à toa em quem
            // já tem os dois vindos de venda de verdade.
            let tabela = null;
            if (!vendeu || v.fretePorUnidade == null) {
                const anuncioParaCusto = {
                    item_id: id, price: preco,
                    listing_type_id: m.listingTypeId || 'gold_special',
                    logistic_type: m.logisticType || 'drop_off',
                };
                tabela = await custosDeTabela(userId, mlUserId, anuncioParaCusto, m.categoryId);
            }

            const ads = adsPorItem[id];
            const adsMetricas = ads && ads.habilitada ? ads.metricas : null;
            const unidadesAds = adsMetricas ? Number(adsMetricas.units_quantity) || 0 : 0;
            const adsUn = adsMetricas && unidadesAds > 0 ? (Number(adsMetricas.cost) || 0) / unidadesAds : null;

            itens.push({
                mlItemId: id,
                titulo: m.title || null,
                thumbnail: m.thumbnail || null,
                preco,
                comissaoUn: vendeu ? v.tarifa / v.unidades : (tabela ? tabela.comissaoUn : null),
                comissaoFonte: vendeu ? 'vendas' : 'tabela',
                // Frete real vale mesmo sem venda "no período de métricas": um
                // pedido de hoje, fora da janela de 30 dias das métricas de
                // ads, ainda é a melhor fonte que existe pra ele.
                freteUn: v && v.fretePorUnidade != null ? v.fretePorUnidade : (tabela ? tabela.freteUn : null),
                freteFonte: v && v.fretePorUnidade != null ? 'vendas' : 'tabela',
                adsUn,
                temAds: !!(ads && ads.habilitada && ads.motivo !== 'fora_de_campanha'),
            });
        });

        return res.json({ itens, cortado: ganhando.length >= LIMITE_ITENS });
    }

    if (req.query.resource === 'catalog') {
        const COLUNAS_CATALOGO_BASE = 'id, ml_item_id, user_product_id, item_title, item_thumbnail, status, previous_status, current_price, price_to_win, winner_item_id, winner_price, reason, is_read, updated_at';
        let { data: items, error } = await supabaseAdmin
            .from('ml_catalog_status')
            .select(`${COLUNAS_CATALOGO_BASE}, permalink, seller_sku`)
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(100);

        // permalink/seller_sku são colunas novas (ml_catalog_link_sku.sql).
        // Sem elas ainda, a consulta acima falha inteira — refaz sem as duas em
        // vez de derrubar a aba de Catálogo até o SQL rodar.
        if (error && /permalink|seller_sku/.test(error.message || '')) {
            ({ data: items, error } = await supabaseAdmin
                .from('ml_catalog_status')
                .select(COLUNAS_CATALOGO_BASE)
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(100));
        }
        if (error) return res.status(500).json({ error: error.message });

        const { count, error: countError } = await supabaseAdmin
            .from('ml_catalog_status')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (countError) return res.status(500).json({ error: countError.message });

        return res.json({ items: items || [], unreadCount: count || 0 });
    }

    if (req.query.resource === 'promotions') {
        const COLUNAS_PROMO = 'id, ml_item_id, item_title, item_thumbnail, promotion_id, promotion_type, promotion_name, finish_date, status, is_read, updated_at';

        // Ativas e encerradas em consultas separadas de propósito. Numa só, o
        // limite cortava justamente as ativas: a ordem era finish_date
        // crescente e as encerradas têm data no passado, então ocupavam as
        // primeiras posições e empurravam as ativas (data futura) para fora.
        // A aba "Sem promoção" precisa conhecer TODAS as ativas — é com elas
        // que ela descarta quem só trocou de campanha.
        const [ativasRes, encerradasRes, candidatesRes, countRes] = await Promise.all([
            supabaseAdmin
                .from('ml_promotions')
                .select(COLUNAS_PROMO)
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('finish_date', { ascending: true })
                .limit(1000),
            supabaseAdmin
                .from('ml_promotions')
                .select(COLUNAS_PROMO)
                .eq('user_id', userId)
                .eq('status', 'ended')
                .order('updated_at', { ascending: false })
                .limit(300),
            supabaseAdmin
                .from('ml_lightning_candidates')
                // select('*') e não a lista de colunas: nomear uma coluna que
                // ainda não existe faz o PostgREST derrubar a query inteira, e
                // as colunas de preço só passam a existir depois de rodar
                // supabase/ml_lightning_precos_e_vinculo.sql. Assim a aba de
                // promoções continua funcionando antes e depois da migração.
                .select('*')
                .eq('user_id', userId)
                .limit(300),
            supabaseAdmin
                .from('ml_promotions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false),
        ]);

        if (ativasRes.error) return res.status(500).json({ error: ativasRes.error.message });
        if (encerradasRes.error) return res.status(500).json({ error: encerradasRes.error.message });
        if (candidatesRes.error) return res.status(500).json({ error: candidatesRes.error.message });
        if (countRes.error) return res.status(500).json({ error: countRes.error.message });

        const promotions = [...(ativasRes.data || []), ...(encerradasRes.data || [])]
            .map(p => ({ ...p, kind: 'promotion' }));
        const candidates = (candidatesRes.data || []).map(c => ({ ...c, kind: 'lightning_candidate' }));

        return res.json({ items: [...promotions, ...candidates], unreadCount: countRes.count || 0 });
    }

    const [reviewsRes, countRes] = await Promise.all([
        supabaseAdmin
            .from('ml_reviews')
            .select('id, ml_item_id, ml_review_id, item_title, item_thumbnail, item_rating_average, item_rating_count, rating, comment, reviewed_at, is_read')
            .eq('user_id', userId)
            .order('reviewed_at', { ascending: false })
            .limit(60),
        // O número que aparece no ícone da extensão. Conta avaliações
        // distintas: contar linhas somava a mesma avaliação uma vez por anúncio
        // em que ela aparece.
        supabaseAdmin
            .from('ml_reviews')
            .select('ml_review_id')
            .eq('user_id', userId)
            .eq('is_read', false)
            .limit(1000),
    ]);

    if (reviewsRes.error) return res.status(500).json({ error: reviewsRes.error.message });
    if (countRes.error) return res.status(500).json({ error: countRes.error.message });
    countRes.count = new Set((countRes.data || []).map((r) => r.ml_review_id)).size;

    // Painel mostra só o último produto avaliado, um card por produto (não por
    // review), pra não pesar com muita foto/lista — o unreadCount acima continua
    // contando TODAS as avaliações não lidas, não só as 10 mostradas.
    const latestPerItem = [];
    const seenItemIds = new Set();
    for (const r of reviewsRes.data || []) {
        if (seenItemIds.has(r.ml_item_id)) continue;
        seenItemIds.add(r.ml_item_id);
        latestPerItem.push(r);
        if (latestPerItem.length >= 10) break;
    }

    res.json({ reviews: latestPerItem, unreadCount: countRes.count || 0 });
}

async function handleUserMarkRead(req, res, userId) {
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    // ml_lightning_candidates não tem is_read (é só lista informativa, sem alerta)
    const tableByResource = { catalog: 'ml_catalog_status', promotions: 'ml_promotions', ads: 'ml_ads_status' };
    const table = tableByResource[req.query.resource] || 'ml_reviews';
    let query = supabaseAdmin.from(table).update({ is_read: true }).eq('user_id', userId);
    if (!body.all) {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return res.status(400).json({ error: 'Informe "ids" ou "all: true".' });
        query = query.in('id', ids);
    }

    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Uma avaliação pode estar gravada sob vários anúncios (variações do mesmo
    // produto). Lida em um, tem de ficar lida em todos — senão as cópias seguem
    // acusando novidade depois de o usuário já ter visto.
    if (table === 'ml_reviews' && !body.all) {
        const { data: marcadas } = await supabaseAdmin
            .from('ml_reviews')
            .select('ml_review_id')
            .eq('user_id', userId)
            .in('id', body.ids);
        const reviewIds = [...new Set((marcadas || []).map((r) => r.ml_review_id))];
        for (let i = 0; i < reviewIds.length; i += 50) {
            const { error: erroCopias } = await supabaseAdmin
                .from('ml_reviews')
                .update({ is_read: true })
                .eq('user_id', userId)
                .in('ml_review_id', reviewIds.slice(i, i + 50));
            if (erroCopias) return res.status(500).json({ error: erroCopias.message });
        }
    }

    res.json({ ok: true });
}

// ── Avaliações da Shopee (?provider=shopee) ─────────────────────────────
//
// Versão enxuta do checker do Mercado Livre acima: só a parte de avaliações
// (sem catálogo nem automação de promoções, que não existem na Shopee). Roda
// num cron PRÓPRIO (.github/workflows/shopee-reviews-check.yml), separado do
// do ML, para não dividir o orçamento de 60s da function com os dois.
function numShopeeReviews(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

const SHOPEE_ITEMS_PER_USER_CAP = 50; // 1 página de get_item_list
const SHOPEE_ITEM_CHECK_CONCURRENCY = 5;
const SHOPEE_USER_CHECK_CONCURRENCY = 3;
const SHOPEE_RUN_BUDGET_MS = 45000;

async function checkUserShopee(userId) {
    const qsLista = new URLSearchParams({ offset: '0', page_size: String(SHOPEE_ITEMS_PER_USER_CAP), item_status: 'NORMAL' });
    const respLista = await shopeeFetch(userId, `/api/v2/product/get_item_list?${qsLista.toString()}`);
    if (!respLista.ok) throw new Error(`get_item_list falhou (${respLista.status})`);
    const dataLista = await respLista.json();
    if (dataLista.error) throw new Error(`Shopee recusou get_item_list: ${dataLista.error} — ${dataLista.message || ''}`);

    const itemIds = ((dataLista.response && dataLista.response.item) || []).map((i) => i.item_id).filter(Boolean);
    if (itemIds.length === 0) return { itemsChecked: 0, newReviews: 0 };

    const meta = {};
    const respInfo = await shopeeFetch(userId, `/api/v2/product/get_item_base_info?item_id_list=${itemIds.join(',')}`);
    if (respInfo.ok) {
        const dataInfo = await respInfo.json();
        if (!dataInfo.error) {
            for (const it of (dataInfo.response && dataInfo.response.item_list) || []) {
                meta[it.item_id] = {
                    nome: it.item_name || null,
                    imagem: (it.image && Array.isArray(it.image.image_url_list) && it.image.image_url_list[0]) || null,
                };
            }
        }
    }

    const rows = [];
    await mapWithConcurrency(itemIds, SHOPEE_ITEM_CHECK_CONCURRENCY, async (itemId) => {
        const resp = await shopeeFetch(userId, `/api/v2/product/get_comment?item_id=${itemId}&page_size=20`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.error) return;

        const lista = (data.response && data.response.item_comment_list) || [];
        if (!lista.length) return;
        const notas = lista.map((c) => numShopeeReviews(c.rating_star)).filter((n) => n != null);
        const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

        for (const c of lista) {
            if (!c.comment_id) continue;
            rows.push({
                user_id: userId,
                shopee_item_id: String(itemId),
                shopee_comment_id: String(c.comment_id),
                item_name: (meta[itemId] && meta[itemId].nome) || null,
                item_thumbnail: (meta[itemId] && meta[itemId].imagem) || null,
                item_rating_average: media,
                item_rating_count: lista.length,
                rating: c.rating_star,
                comment: c.comment || null,
                reviewed_at: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
            });
        }
    });

    // Mesmo critério de "avaliação nova" do checker do ML (ver comentário
    // acima, "O que conta como avaliação NOVA").
    let newReviews = 0;
    if (rows.length > 0) {
        const { data: jaGravadas, error: erroLeitura } = await supabaseAdmin
            .from('shopee_reviews')
            .select('shopee_item_id, shopee_comment_id')
            .eq('user_id', userId);
        if (erroLeitura) throw new Error(erroLeitura.message);

        const chaves = new Set((jaGravadas || []).map((r) => r.shopee_item_id + '|' + r.shopee_comment_id));
        const comentariosConhecidos = new Set((jaGravadas || []).map((r) => r.shopee_comment_id));
        const vistosNestaRodada = new Set();
        const agora = Date.now();

        const novas = [];
        const existentes = [];
        for (const row of rows) {
            if (chaves.has(row.shopee_item_id + '|' + row.shopee_comment_id)) {
                existentes.push(row);
                continue;
            }
            const escritaEm = row.reviewed_at ? Date.parse(row.reviewed_at) : NaN;
            const recente = Number.isFinite(escritaEm) && agora - escritaEm <= JANELA_AVALIACAO_NOVA_MS;
            const primeiraCopia = !comentariosConhecidos.has(row.shopee_comment_id) && !vistosNestaRodada.has(row.shopee_comment_id);
            vistosNestaRodada.add(row.shopee_comment_id);
            novas.push({ ...row, is_read: !(recente && primeiraCopia) });
        }

        if (novas.length > 0) {
            const { error } = await supabaseAdmin
                .from('shopee_reviews')
                .upsert(novas, { onConflict: 'user_id,shopee_item_id,shopee_comment_id', ignoreDuplicates: true });
            if (error) throw new Error(error.message);
            newReviews = novas.filter((r) => !r.is_read).length;
        }
        if (existentes.length > 0) {
            const { error } = await supabaseAdmin
                .from('shopee_reviews')
                .upsert(existentes, { onConflict: 'user_id,shopee_item_id,shopee_comment_id' });
            if (error) throw new Error(error.message);
        }
    }

    return { itemsChecked: itemIds.length, newReviews };
}

async function runCheckShopee(res) {
    const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('shopee_access_token', 'is', null);
    if (error) return res.status(500).json({ error: error.message });

    let itemsChecked = 0;
    let newReviews = 0;
    const errors = [];
    const inicio = Date.now();
    let pulados = 0;

    await mapWithConcurrency(profiles || [], SHOPEE_USER_CHECK_CONCURRENCY, async (profile) => {
        if (Date.now() - inicio > SHOPEE_RUN_BUDGET_MS) { pulados++; return; }
        try {
            const r = await checkUserShopee(profile.id);
            itemsChecked += r.itemsChecked;
            newReviews += r.newReviews;
        } catch (err) {
            errors.push({ userId: profile.id, error: err.message });
        }
    });

    return res.json({
        usersChecked: (profiles || []).length - pulados,
        usersSkipped: pulados,
        durationMs: Date.now() - inicio,
        itemsChecked, newReviews, errors,
    });
}

async function handleShopeeUserGet(req, res, userId) {
    const [reviewsRes, countRes] = await Promise.all([
        supabaseAdmin
            .from('shopee_reviews')
            .select('id, shopee_item_id, shopee_comment_id, item_name, item_thumbnail, item_rating_average, item_rating_count, rating, comment, reviewed_at, is_read')
            .eq('user_id', userId)
            .order('reviewed_at', { ascending: false })
            .limit(60),
        supabaseAdmin
            .from('shopee_reviews')
            .select('shopee_comment_id')
            .eq('user_id', userId)
            .eq('is_read', false)
            .limit(1000),
    ]);
    if (reviewsRes.error) return res.status(500).json({ error: reviewsRes.error.message });
    if (countRes.error) return res.status(500).json({ error: countRes.error.message });

    const unreadCount = new Set((countRes.data || []).map((r) => r.shopee_comment_id)).size;

    const latestPerItem = [];
    const seenItemIds = new Set();
    for (const r of reviewsRes.data || []) {
        if (seenItemIds.has(r.shopee_item_id)) continue;
        seenItemIds.add(r.shopee_item_id);
        latestPerItem.push(r);
        if (latestPerItem.length >= 10) break;
    }

    res.json({ reviews: latestPerItem, unreadCount });
}

async function handleShopeeMarkRead(req, res, userId) {
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    let query = supabaseAdmin.from('shopee_reviews').update({ is_read: true }).eq('user_id', userId);
    if (!body.all) {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return res.status(400).json({ error: 'Informe "ids" ou "all: true".' });
        query = query.in('id', ids);
    }

    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
}

// Um único arquivo cobre dois usos (limite de 12 functions do plano Hobby da Vercel,
// mesmo motivo documentado em ml-status.js):
// - chamado pelo GitHub Actions (header x-cron-secret) para varrer todos os usuários
// - chamado pelo site/extensão (header user-token) para ler/marcar como lida
module.exports = async (req, res) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== undefined) {
        if (!process.env.CRON_SECRET || !safeEqual(cronSecret, process.env.CRON_SECRET)) {
            return res.status(403).json({ error: 'Invalid cron secret.' });
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
        try {
            if (req.query.provider === 'shopee') return await runCheckShopee(res);
            // ?offset=N varre a janela N em vez da janela da vez.
            const offsetPedido = req.query && req.query.offset != null ? Number(req.query.offset) : null;
            const offsetValido = Number.isFinite(offsetPedido) && offsetPedido >= 0 ? offsetPedido : null;
            return await runCheck(res, offsetValido);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    const userId = await requireAccess(req, res);
    if (!userId) return;

    // Sem isso a Vercel gera ETag e responde 304 em GETs repetidos com os mesmos
    // headers, e como 304 não é "ok" pro fetch do navegador, o painel via o
    // request como falho e mostrava a lista sempre vazia.
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.query.provider === 'shopee') {
            if (req.method === 'GET') return await handleShopeeUserGet(req, res, userId);
            if (req.method === 'PATCH') return await handleShopeeMarkRead(req, res, userId);
            return res.status(405).json({ error: 'Method not allowed.' });
        }
        if (req.method === 'GET') return await handleUserGet(req, res, userId);
        if (req.method === 'PATCH') return await handleUserMarkRead(req, res, userId);
        return res.status(405).json({ error: 'Method not allowed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports.config = { maxDuration: 60 };
