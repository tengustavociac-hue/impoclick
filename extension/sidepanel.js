// Painel do Impoclick — agora no side panel do Chrome, e não mais injetado
// dentro da página do Mercado Livre.
//
// A divisão com content.js é simples: lá ficou só o que precisa do DOM da
// página (raspagem e crachás de catálogo); aqui ficou toda a interface e o
// cálculo. Os dois conversam por uma única mensagem, GET_PAGE_DATA, que
// devolve { isProductPage, pageData, itemId }.
(function () {
    const ATTR_INDEXED_CHARS = 30;
    const TITLE_MAX_CHARS = 60;

    // Palavras curtas/genéricas que não valem como termo de busca próprio.
    const STOPWORDS = new Set([
        'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no',
        'na', 'nos', 'nas', 'para', 'pra', 'por', 'com', 'sem', 'um', 'uma',
        'the', 'of', 'to',
    ]);

    function normalizeWord(text) {
        return String(text)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '') // tira acentos
            .replace(/[^a-z0-9]/g, '');
    }

    function toWordSet(text) {
        if (!text) return [];
        return String(text)
            .split(/[\s/,\-–—_+.]+/)
            .map(normalizeWord)
            .filter((w) => w.length > 1 && !STOPWORDS.has(w));
    }

    // O ML remove ou penaliza título com apelo publicitário: o campo é pra
    // descrever o produto (o que é + marca + modelo + especificação), não pra
    // vender. Termos daqui costumam voltar como moderação ou simplesmente
    // ocupam espaço que renderia mais se fosse termo de busca.
    const PROMO_TERMS = [
        'promocao', 'promocional', 'oferta', 'ofertao', 'desconto', 'liquidacao',
        'imperdivel', 'barato', 'baratissimo', 'gratis', 'brinde', 'aproveite',
        'compreja', 'novidade', 'exclusivo', 'semjuros', 'parcelado',
    ];
    // Expressões de duas palavras, checadas no título normalizado inteiro.
    const PROMO_PHRASES = [
        ['frete', 'gratis'], ['melhor', 'preco'], ['mais', 'barato'],
        ['ultimas', 'unidades'], ['envio', 'imediato'], ['pronta', 'entrega'],
        ['sem', 'juros'], ['menor', 'preco'],
    ];

    // Título curto demais desperdiça espaço de busca: o ML indexa os 60
    // caracteres e cada palavra a mais é uma busca a mais em que o anúncio
    // pode aparecer. Abaixo disso a recomendação do próprio ML é completar.
    const TITLE_MIN_RECOMMENDED = 50;

    function detectPromoTerms(title) {
        const words = String(title)
            .split(/[\s/,\-–—_+.]+/)
            .map(normalizeWord)
            .filter(Boolean);
        const wordSet = new Set(words);

        const found = PROMO_TERMS.filter((t) => wordSet.has(t));

        // "frete grátis" casa com a expressão e também com o termo solto
        // "gratis". Guardamos as palavras já cobertas por uma expressão pra
        // não apontar o mesmo problema duas vezes na tela.
        const cobertasPorFrase = new Set();
        PROMO_PHRASES.forEach(([a, b]) => {
            for (let i = 0; i < words.length - 1; i += 1) {
                if (words[i] === a && words[i + 1] === b) {
                    found.push(`${a} ${b}`);
                    cobertasPorFrase.add(a);
                    cobertasPorFrase.add(b);
                    break;
                }
            }
        });

        return [...new Set(found)].filter((t) => t.includes(' ') || !cobertasPorFrase.has(t));
    }

    // Palavra inteira em maiúscula não melhora a busca (o ML normaliza) e o
    // excesso deixa o título com cara de spam. Uma ou outra sigla é normal,
    // por isso só apontamos a partir de três.
    function detectShoutingWords(title) {
        return String(title)
            .split(/\s+/)
            .filter((w) => w.length > 3 && w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w));
    }

    // Conta caracteres como o vendedor vê, não como o JavaScript guarda.
    // `.length` devolve unidades UTF-16: um "ô" que venha decomposto (a letra
    // + o acento como caracteres separados) conta 2, e emoji conta 2. Sem
    // isso, um título de 60 caracteres com 6 acentos aparecia como 66/60 e o
    // painel acusava estouro que não existia.
    function normalizeText(text) {
        return String(text || '').normalize('NFC').trim();
    }

    function charCount(text) {
        return [...text].length;
    }

    // Corta pelos N primeiros caracteres visíveis, e não por code units — em
    // texto acentuado o slice normal partiria a letra do acento.
    function sliceChars(text, count) {
        return [...text].slice(0, count).join('');
    }

    // Compara ignorando maiúsculas e acentos, sem mudar o tamanho da string
    // (o corte é feito por posição no texto original).
    function foldCase(text) {
        return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // Em anúncio com variação, a API cola os valores no fim do título:
    // "...Ciclismo Moto Branco Liso Único". Cor, tamanho e desenho do tecido
    // não são texto que o vendedor escreveu e não ocupam o limite de 60
    // caracteres — contá-los fazia um título de 55 aparecer como 73.
    //
    // Só cortamos do FIM e só quando o valor bate inteiro, pra nunca comer
    // uma palavra que o vendedor pôs de propósito.
    const MAX_VARIATION_STRIPS = 5;
    const MIN_TITLE_AFTER_STRIP = 15;

    function stripVariationSuffix(title, variationValues) {
        let text = normalizeText(title);
        const removed = [];
        if (!variationValues || !variationValues.length) return { text, removed };

        // Cada valor da variação é colado UMA vez no fim do título, então
        // cada um só pode ser cortado uma vez. Em "...Corta Roupas Aph
        // Pequena Pequena", a última "Pequena" é o tamanho e a outra é
        // palavra que o vendedor escreveu — cortar as duas roubava 8
        // caracteres do título dele.
        const disponiveis = variationValues.map((v) => normalizeText(v)).filter(Boolean);

        let cortou = true;
        while (cortou && removed.length < MAX_VARIATION_STRIPS) {
            cortou = false;
            for (let i = 0; i < disponiveis.length; i += 1) {
                const valor = disponiveis[i];
                if (text.length <= valor.length) continue;

                const restante = text.length - (valor.length + 1);
                // Trava de segurança: a lista de candidatos inclui atributos
                // que não sabemos com certeza serem da variação, então nunca
                // deixamos o título virar um toco.
                if (restante < MIN_TITLE_AFTER_STRIP) continue;

                const sufixo = text.slice(-(valor.length + 1));
                if (foldCase(sufixo) === foldCase(` ${valor}`)) {
                    text = text.slice(0, -(valor.length + 1)).trim();
                    removed.unshift(valor);
                    disponiveis.splice(i, 1);
                    cortou = true;
                    break;
                }
            }
        }

        return { text, removed };
    }

    function analyzeTitle(title) {
        const text = normalizeText(title);
        const length = charCount(text);
        const titleWords = toWordSet(text);

        // Palavras repetidas dentro do próprio título desperdiçam espaço dos
        // 60 caracteres.
        const seen = new Set();
        const duplicates = [];
        titleWords.forEach((w) => {
            if (seen.has(w) && !duplicates.includes(w)) duplicates.push(w);
            seen.add(w);
        });

        const promoTerms = detectPromoTerms(text);
        const shouting = detectShoutingWords(text);

        return {
            text,
            words: titleWords,
            length,
            max: TITLE_MAX_CHARS,
            min: TITLE_MIN_RECOMMENDED,
            tooLong: length > TITLE_MAX_CHARS,
            tooShort: length > 0 && length < TITLE_MIN_RECOMMENDED,
            duplicates,
            promoTerms,
            shouting: shouting.length >= 3 ? shouting : [],
            clean: length <= TITLE_MAX_CHARS
                && length >= TITLE_MIN_RECOMMENDED
                && duplicates.length === 0
                && promoTerms.length === 0,
        };
    }

    // O ML usa vários formatos de URL para a mesma coisa, e o ID do item nem
    // sempre está na URL (páginas /p/ e /up/ carregam o item escolhido via
    // parâmetro ou só no HTML). Tentamos, em ordem: parâmetro item_id da URL,
    // permalink clássico MLB-123, e por fim uma varredura no HTML da página.

    function renderTitleFindings(t) {
        const problema = t.tooLong || t.tooShort || t.duplicates.length || t.promoTerms.length || t.shouting.length;
        const cls = problema ? 'impoclick-an-warn' : 'impoclick-an-ok';

        const barPct = Math.min(100, Math.round((t.length / t.max) * 100));
        const barClass = t.tooLong ? 'impoclick-bar-bad' : (t.tooShort ? 'impoclick-bar-warn' : 'impoclick-bar-good');

        const avisos = [];
        if (t.tooLong) {
            avisos.push(`<p>Passou de ${t.max} caracteres — o excedente pode ser cortado na exibição.</p>`);
        } else if (t.tooShort) {
            avisos.push(`<p>Abaixo dos ${t.min} caracteres recomendados. Sobram ${t.max - t.length} caracteres indexáveis sem uso — cada palavra a mais é uma busca a mais em que o anúncio pode aparecer.</p>`);
        }
        if (t.duplicates.length) {
            avisos.push(`<p>Palavras repetidas dentro do próprio título: <strong>${t.duplicates.map(escapeHtml).join(', ')}</strong>.</p>`);
        }
        if (t.promoTerms.length) {
            avisos.push(`<p>Termos promocionais no título: <strong>${t.promoTerms.map(escapeHtml).join(', ')}</strong>. O ML modera esse tipo de apelo e o espaço rende mais com termo de busca.</p>`);
        }
        if (t.shouting.length) {
            avisos.push(`<p>${t.shouting.length} palavras em CAIXA ALTA. A busca do ML ignora maiúsculas — não ajuda no ranqueamento e deixa o título com cara de spam.</p>`);
        }
        if (!avisos.length) avisos.push('<p>Tamanho, palavras e linguagem dentro do recomendado.</p>');

        // Mostrar o texto medido, e não só o número: numa página /up/ o ML
        // exibe o NOME DO PRODUTO no topo, enquanto o título do anúncio é
        // outro — sem ver a string contada, um "73/60" parece erro de conta
        // quando na verdade é outro texto.
        const variacaoHtml = (t.variationRemoved && t.variationRemoved.length)
            ? `<p class="impoclick-note">Sem contar a variação (${t.variationRemoved.map(escapeHtml).join(' · ')}), que a API cola no fim do título mas não é texto que você escreveu.</p>`
            : '';

        return `
            <div class="impoclick-an-item ${cls}">
                <strong>Título: ${t.length}/${t.max} caracteres</strong>
                <p class="impoclick-attr-value">${escapeHtml(t.text)}</p>
                <div class="impoclick-bar"><span class="${barClass}" style="width:${barPct}%"></span></div>
                ${variacaoHtml}
                ${avisos.join('')}
            </div>
        `;
    }

    // =====================================================================
    // ANÁLISE COMPLETA (dados vindos da API do ML, via action=analise)
    //
    // A análise acima lê a página e serve pra qualquer anúncio. Esta aqui
    // usa os dados reais do anúncio na API — o que permite auditar coisas
    // que a página não mostra: quais campos a categoria espera e estão
    // vazios, tags de moderação, visitas por dia, vendas do período.
    // Em troca, só funciona nos anúncios da conta conectada.
    // =====================================================================

    // Tradução das tags que o ML devolve no item. As desconhecidas caem no
    // fallback como neutras — a lista do ML muda com o tempo e é melhor
    // mostrar a tag crua do que esconder informação.
    const TAG_INFO = {
        good_quality_picture: { label: 'As fotos do anúncio são de boa qualidade', kind: 'good' },
        good_quality_thumbnail: { label: 'A foto principal (miniatura) do anúncio é de boa qualidade', kind: 'good' },
        poor_quality_picture: { label: 'Fotos em baixa qualidade — trocar por imagens maiores', kind: 'bad' },
        poor_quality_thumbnail: { label: 'Foto principal (miniatura) em baixa qualidade', kind: 'bad' },
        incomplete_technical_specs: { label: 'Ficha técnica incompleta — o anúncio está perdendo exposição nas listagens', kind: 'bad' },
        catalog_listing_eligible: { label: 'Elegível para competir no catálogo', kind: 'good' },
        best_seller_candidate: { label: 'Candidato a mais vendido da categoria', kind: 'good' },
        brand_verified: { label: 'Marca verificada', kind: 'good' },
        deal_of_the_day: { label: 'Participando da oferta do dia', kind: 'good' },
        lightning_deal: { label: 'Participando de oferta relâmpago', kind: 'good' },
        immediate_payment: { label: 'Pagamento deve ser feito imediatamente', kind: 'neutral' },
        cart_eligible: { label: 'O produto pode ser adicionado ao carrinho de compras', kind: 'neutral' },
        standard_price_by_quantity: { label: 'Preço padrão por quantidade', kind: 'neutral' },
        user_product_listing: { label: 'Anúncio vinculado a um produto do vendedor', kind: 'neutral' },
        dragged_bids_and_visits: { label: 'Herdou visitas e vendas de um anúncio republicado', kind: 'neutral' },
        free_relist: { label: 'Republicação gratuita', kind: 'neutral' },
        extended_warranty_eligible: { label: 'Elegível para garantia estendida', kind: 'neutral' },
        shipping_guaranteed: { label: 'Envio garantido pelo Mercado Livre', kind: 'neutral' },
    };

    function classifyTags(tags) {
        const groups = { good: [], bad: [], neutral: [] };
        (tags || []).forEach((tag) => {
            const info = TAG_INFO[tag] || { label: tag.replace(/_/g, ' '), kind: 'neutral' };
            groups[info.kind].push(info.label);
        });
        return groups;
    }

    // A regra de não repetir palavra vale só entre Título, Marca e Modelo —
    // são os três campos que o ML indexa como identidade do produto, e
    // repetir entre eles gasta duas vezes o mesmo espaço de busca. Os demais
    // atributos (compatibilidades, medidas, cor...) podem repetir à vontade:
    // ali a palavra repetida é parte da descrição do produto, não desperdício.
    const IDENTITY_ATTRS = ['BRAND', 'MODEL'];

    function analyzeAttributeSet(attributes, titleWords) {
        const titleSet = new Set(titleWords);

        const enriched = (attributes || [])
            .filter((a) => IDENTITY_ATTRS.includes(a.id))
            .map((a) => {
                const value = normalizeText(a.value);
                return {
                    id: a.id,
                    name: a.name,
                    value,
                    length: charCount(value),
                    words: toWordSet(sliceChars(value, ATTR_INDEXED_CHARS)),
                };
            });

        return enriched.map((a) => {
            const repeated = [...new Set(a.words.filter((w) => titleSet.has(w)))];

            // Marca contra Modelo (e vice-versa) — o único cruzamento que
            // importa, já que a lista acima tem só esses dois.
            const duplicates = [];
            enriched.forEach((other) => {
                if (other.id === a.id) return;
                const otherSet = new Set(other.words);
                const shared = [...new Set(a.words.filter((w) => otherSet.has(w)))];
                if (shared.length) duplicates.push({ name: other.name, words: shared });
            });

            const truncated = a.length > ATTR_INDEXED_CHARS;

            return {
                id: a.id,
                name: a.name,
                value: a.value,
                length: a.length,
                truncated,
                repeated,
                wastedChars: repeated.reduce((sum, w) => sum + w.length, 0),
                duplicates,
                clean: !truncated && repeated.length === 0 && duplicates.length === 0,
            };
        });
    }

    // Junta todas as palavras repetidas do trio Título/Marca/Modelo — são as
    // que valem a pena trocar por um termo que traga busca nova.
    function collectRepeatedWords(titleAnalysis, attrAnalysis) {
        const palavras = new Set(titleAnalysis.duplicates);
        attrAnalysis.forEach((a) => {
            a.repeated.forEach((w) => palavras.add(w));
            a.duplicates.forEach((d) => d.words.forEach((w) => palavras.add(w)));
        });
        return [...palavras];
    }

    // Sugere palavras a partir dos anúncios CONCORRENTES do mesmo produto que
    // aparecem na primeira página da busca e que vendem. A lógica: se uma
    // palavra se repete no título de quem está ranqueando e vendendo, e o seu
    // anúncio não usa, é uma busca em que você não aparece e eles aparecem.
    //
    // A versão anterior usava as tendências da categoria e sugeria bobagem
    // (numa balaclava, "capa jbl flip 7"): o termo mais buscado de uma
    // categoria ampla não tem relação com o seu produto.
    const KEYWORD_MIN_COMPETITORS = 2;

    function suggestKeywordsFromCompetitors(competitors, titleAnalysis, attrAnalysis) {
        if (!competitors || !competitors.items || !competitors.items.length) return null;

        // Tudo que o anúncio já diz, somando título, marca e modelo.
        const jaUsadas = new Set(titleAnalysis.words);
        attrAnalysis.forEach((a) => toWordSet(a.value).forEach((w) => jaUsadas.add(w)));

        // Só os que comprovadamente vendem. Quando o ML não expõe a
        // quantidade vendida, o critério vira estar na primeira página —
        // que já é ordenada por relevância, não por acaso.
        const comVenda = competitors.items.filter((c) => c.soldQuantity > 0);
        const base = comVenda.length >= KEYWORD_MIN_COMPETITORS ? comVenda : competitors.items;
        const criterioVendas = base === comVenda;

        // Conta em quantos ANÚNCIOS cada palavra aparece, não quantas vezes no
        // total — repetir a palavra cinco vezes num título só não a torna
        // mais relevante.
        const contagem = new Map();
        base.forEach((c) => {
            new Set(toWordSet(c.title)).forEach((palavra) => {
                if (jaUsadas.has(palavra)) return;
                contagem.set(palavra, (contagem.get(palavra) || 0) + 1);
            });
        });

        const sugestoes = [...contagem.entries()]
            .map(([palavra, anuncios]) => ({ palavra, anuncios }))
            // Palavra que aparece num anúncio só é escolha daquele vendedor,
            // não um padrão do mercado.
            .filter((s) => s.anuncios >= KEYWORD_MIN_COMPETITORS)
            .sort((a, b) => b.anuncios - a.anuncios || a.palavra.localeCompare(b.palavra))
            .slice(0, 8);

        if (!sugestoes.length) return null;

        return { sugestoes, analisados: base.length, criterioVendas };
    }

    function pctChange(current, previous) {
        if (!previous) return null;
        return ((current - previous) / previous) * 100;
    }

    function formatPct(value, digits = 1) {
        if (value == null) return '—';
        const sign = value > 0 ? '+' : '';
        return `${sign}${value.toFixed(digits)}%`;
    }

    // Monta a lista de verificações e a nota. Os pesos somam 100 quando
    // todas as verificações se aplicam; quando alguma não se aplica (anúncio
    // sem avaliação ainda, categoria sem ficha técnica), ela sai da conta e
    // a nota é normalizada pelo peso do que sobrou — assim um anúncio novo
    // não é punido por não ter avaliação nenhuma.
    function buildAudit(data, titleAnalysis, attrAnalysis) {
        const item = data.item;
        const checks = [];

        checks.push({
            ok: titleAnalysis.clean,
            weight: 15,
            label: titleAnalysis.clean ? 'Título otimizado' : 'Título pode melhorar',
        });

        checks.push({
            ok: data.description.present,
            weight: 10,
            label: data.description.present ? 'Descrição presente' : 'Sem descrição',
        });

        const fotosOk = item.pictureCount >= 6;
        checks.push({
            ok: fotosOk,
            weight: 10,
            label: `${item.pictureCount} foto${item.pictureCount === 1 ? '' : 's'}`,
            detail: fotosOk ? null : 'O ML aceita até 10 fotos e usa a quantidade como sinal de qualidade. Abaixo de 6 você perde exposição.',
        });

        // Em anúncio de catálogo o vídeo pertence ao PRODUTO (página comum a
        // todos os vendedores), não ao anúncio individual — a API do item vem
        // sem o campo mesmo quando a página exibe vídeo. Cobrar isso do
        // vendedor seria apontar um problema que ele não pode resolver.
        if (item.catalogListing && !item.hasVideo) {
            checks.push({
                ok: true,
                weight: 0,
                label: 'Vídeo é do produto do catálogo',
                detail: 'Neste tipo de anúncio o vídeo fica na página do produto, compartilhada entre os vendedores — não é algo que você controle no seu anúncio.',
            });
        } else {
            checks.push({
                ok: item.hasVideo,
                weight: 5,
                label: item.hasVideo ? 'Tem vídeo' : 'Sem vídeo',
                detail: item.hasVideo ? null : 'Anúncio com vídeo converte mais e o ML trata como objetivo de qualidade.',
            });
        }

        checks.push({
            ok: !!item.warranty,
            weight: 5,
            label: item.warranty ? 'Garantia informada' : 'Garantia não informada',
        });

        if (data.categoryFields) {
            const cf = data.categoryFields;
            const complete = cf.missing.length === 0;
            checks.push({
                ok: complete,
                partial: cf.total ? cf.filled / cf.total : 1,
                weight: 20,
                label: complete
                    ? `${cf.total} campos da categoria preenchidos`
                    : `${cf.missing.length} campo${cf.missing.length === 1 ? '' : 's'} da categoria faltando`,
            });
        }

        const sujos = attrAnalysis.filter((a) => !a.clean);
        const semIdentidade = attrAnalysis.length === 0;
        checks.push({
            ok: !semIdentidade && sujos.length === 0,
            weight: 15,
            label: semIdentidade
                ? 'Marca e Modelo não preenchidos'
                : (sujos.length === 0
                    ? 'Marca e Modelo sem repetição'
                    : `${sujos.length} campo${sujos.length === 1 ? '' : 's'} repetindo palavras já usadas`),
        });

        const tags = classifyTags(item.tags);
        checks.push({
            ok: tags.bad.length === 0,
            weight: 5,
            label: tags.bad.length === 0 ? 'Sem tags negativas' : `${tags.bad.length} tag${tags.bad.length === 1 ? '' : 's'} de atenção`,
        });

        if (data.reviews && data.reviews.total > 0) {
            checks.push({
                ok: data.reviews.average >= 4,
                weight: 5,
                label: `Avaliações: ${data.reviews.average.toFixed(1)} estrelas`,
            });
        }

        // Só entra na conta quando houve investimento no período: anúncio
        // fora de campanha não é um defeito do anúncio.
        if (data.ads && data.ads.enabled && data.ads.status !== 'idle') {
            const d = adsDerived(data.ads.metrics || {});
            if (d.custo > 0) {
                const paga = d.roas >= 1;
                checks.push({
                    ok: paga,
                    weight: 10,
                    label: paga
                        ? `Ads com retorno (ROAS ${d.roas.toFixed(1)}x)`
                        : `Ads no prejuízo (ROAS ${d.roas.toFixed(1)}x)`,
                    detail: paga ? null : `Investiu ${formatBRL(d.custo)} e a receita atribuída à publicidade foi ${formatBRL(d.receita)}.`,
                });
            }
        }

        if (data.visits && (data.visits.prev15 > 0 || data.visits.last15 > 0)) {
            const change = pctChange(data.visits.last15, data.visits.prev15);
            const subindo = data.visits.last15 >= data.visits.prev15;
            checks.push({
                ok: subindo,
                weight: 10,
                label: change == null
                    ? `Visitas: ${data.visits.last15} em 15 dias`
                    : `Visitas ${subindo ? 'subindo' : 'caindo'} (${formatPct(change, 0)})`,
            });
        }

        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earned = checks.reduce((sum, c) => {
            const ratio = c.partial != null ? c.partial : (c.ok ? 1 : 0);
            return sum + c.weight * ratio;
        }, 0);
        const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0;

        let classe;
        if (score >= 85) classe = { letra: 'A', texto: 'EXCELENTE' };
        else if (score >= 65) classe = { letra: 'B', texto: 'TEM POTENCIAL' };
        else if (score >= 45) classe = { letra: 'C', texto: 'PRECISA MELHORAR' };
        else classe = { letra: 'D', texto: 'CRÍTICO' };

        // Problemas primeiro — é a ordem em que o vendedor deve atacar.
        checks.sort((a, b) => (a.ok === b.ok ? b.weight - a.weight : (a.ok ? 1 : -1)));

        return { checks, score, classe, tags };
    }

    function renderScoreBlock(audit) {
        const cls = audit.score >= 85 ? 'impoclick-good' : (audit.score >= 65 ? 'impoclick-warn' : 'impoclick-bad');
        return `
            <div class="impoclick-score">
                <div class="impoclick-score-value ${cls}">${audit.score}<span>/100</span></div>
                <div class="impoclick-score-class">Classe ${audit.classe.letra}: ${audit.classe.texto}</div>
            </div>
        `;
    }

    function renderChecklist(audit) {
        const linhas = audit.checks.map((c) => `
            <div class="impoclick-check ${c.ok ? 'impoclick-check-ok' : 'impoclick-check-bad'}">
                <span class="impoclick-check-icon">${c.ok ? '✓' : '✗'}</span>
                <span class="impoclick-check-label">${escapeHtml(c.label)}</span>
            </div>
            ${!c.ok && c.detail ? `<p class="impoclick-note impoclick-check-detail">${escapeHtml(c.detail)}</p>` : ''}
        `).join('');

        return `
            <div class="impoclick-an-block-title">O que melhorar</div>
            ${linhas}
        `;
    }

    function renderAttributeAudit(attrAnalysis) {
        if (!attrAnalysis.length) {
            return `
                <div class="impoclick-an-block-title">Marca e Modelo</div>
                <div class="impoclick-an-item impoclick-an-warn">
                    <strong>Marca e Modelo não preenchidos</strong>
                    <p>Cada um vale até ${ATTR_INDEXED_CHARS} caracteres indexados na busca, somados ao título. Deixar vazio joga fora esse espaço.</p>
                </div>
            `;
        }

        const problemas = attrAnalysis.filter((a) => !a.clean);
        const okCount = attrAnalysis.length - problemas.length;

        const blocos = problemas.map((a) => {
            const linhas = [];
            if (a.truncated) {
                linhas.push(`<p>Tem ${a.length} caracteres, mas o ML indexa só os primeiros ${ATTR_INDEXED_CHARS} — o resto não entra na busca.</p>`);
            }
            if (a.repeated.length) {
                linhas.push(`<p>Repete o título em: <strong>${a.repeated.map(escapeHtml).join(', ')}</strong> — cerca de ${a.wastedChars} caracteres desperdiçados.</p>`);
            }
            a.duplicates.forEach((d) => {
                linhas.push(`<p>Duplica com <strong>${escapeHtml(d.name)}</strong>: ${d.words.map(escapeHtml).join(', ')}</p>`);
            });

            return `
                <div class="impoclick-an-item impoclick-an-warn">
                    <strong>${escapeHtml(a.name)}</strong>
                    <p class="impoclick-attr-value">${escapeHtml(a.value)}</p>
                    ${linhas.join('')}
                </div>
            `;
        }).join('');

        return `
            <div class="impoclick-an-block-title">Marca e Modelo</div>
            ${problemas.length
                ? `<p class="impoclick-note">${problemas.length} com atenção · ${okCount} sem problema</p>${blocos}`
                : '<div class="impoclick-an-item impoclick-an-ok"><strong>Marca e Modelo bem aproveitados</strong><p>Não repetem o título nem um ao outro — cada campo está somando buscas novas.</p></div>'}
        `;
    }

    function renderCategoryFields(cf) {
        if (!cf) return '';

        if (!cf.missing.length) {
            return `
                <div class="impoclick-an-block-title">Campos da categoria · ${cf.total}</div>
                <div class="impoclick-an-item impoclick-an-ok">
                    <strong>Todos os campos preenchidos</strong>
                    <p>A categoria não espera nenhum dado que esteja faltando.</p>
                </div>
            `;
        }

        // Os obrigatórios primeiro: são os que efetivamente derrubam a
        // posição do anúncio nas listagens.
        const ordenados = [...cf.missing].sort((a, b) => (a.required === b.required ? 0 : (a.required ? -1 : 1)));
        const chips = ordenados.map((f) => `
            <span class="impoclick-field-chip ${f.required ? 'impoclick-field-required' : ''}">${escapeHtml(f.name)}</span>
        `).join('');
        const obrigatorios = ordenados.filter((f) => f.required).length;

        return `
            <div class="impoclick-an-block-title">Campos da categoria · ${cf.filled}/${cf.total}</div>
            <div class="impoclick-an-item impoclick-an-warn">
                <strong>${cf.missing.length} campos não preenchidos</strong>
                <p>${obrigatorios > 0
                    ? `${obrigatorios} ${obrigatorios === 1 ? 'é obrigatório' : 'são obrigatórios'} nesta categoria (marcados em vermelho). Campo vazio é filtro de busca em que o anúncio não aparece.`
                    : 'Cada campo vazio é um filtro de busca em que o anúncio não aparece.'}</p>
                <div class="impoclick-field-chips">${chips}</div>
            </div>
        `;
    }

    function renderTagsBlock(tags) {
        const total = tags.good.length + tags.bad.length + tags.neutral.length;
        if (!total) return '';

        const linha = (lista, cls) => lista.map((t) => `<span class="impoclick-tag ${cls}">${escapeHtml(t)}</span>`).join('');

        return `
            <div class="impoclick-an-block-title">Tags ativas · ${total}</div>
            <div class="impoclick-tag-list">
                ${linha(tags.bad, 'impoclick-tag-bad')}
                ${linha(tags.good, 'impoclick-tag-good')}
                ${linha(tags.neutral, 'impoclick-tag-neutral')}
            </div>
        `;
    }

    function renderVisitsBlock(visits) {
        if (!visits) return '';

        const max = Math.max(...visits.daily.map((d) => d.total), 1);
        const barras = visits.daily.map((d) => {
            const dia = d.date ? d.date.slice(8, 10) + '/' + d.date.slice(5, 7) : '';
            return `<span class="impoclick-spark-bar" style="height:${Math.max(3, Math.round((d.total / max) * 100))}%" title="${dia}: ${d.total} visitas"></span>`;
        }).join('');

        const linha = (rotulo, atual, anterior) => {
            const change = pctChange(atual, anterior);
            const cls = change == null ? '' : (change >= 0 ? 'impoclick-up' : 'impoclick-down');
            return `
                <div class="impoclick-breakdown-row">
                    <span>${rotulo}</span>
                    <strong>${atual} <span class="${cls}">${formatPct(change)}</span></strong>
                </div>
            `;
        };

        return `
            <div class="impoclick-an-block-title">Visitas · últimos 30 dias</div>
            <div class="impoclick-spark">${barras}</div>
            <div class="impoclick-breakdown">
                ${linha('Últimos 7 dias', visits.last7, visits.prev7)}
                ${linha('Últimos 15 dias', visits.last15, visits.prev15)}
                <div class="impoclick-breakdown-row impoclick-breakdown-subtotal">
                    <span>Total em 30 dias</span>
                    <strong>${visits.total30}</strong>
                </div>
            </div>
        `;
    }

    // Estoque, ritmo de venda e o quanto vale mexer na conversão. São os
    // números que respondem "o que fazer com esse anúncio agora".
    function renderNumbersBlock(data) {
        const { item, sales, visits } = data;
        if (!sales && !visits) return '';

        const linhas = [];

        if (sales) {
            const porDia = sales.sold / sales.days;
            linhas.push(`
                <div class="impoclick-breakdown-row">
                    <span>Vendas em ${sales.days} dias</span>
                    <strong>${sales.sold} un.</strong>
                </div>
            `);

            if (item.availableQuantity != null) {
                if (porDia > 0) {
                    const dias = Math.floor(item.availableQuantity / porDia);
                    const critico = dias <= 15;
                    linhas.push(`
                        <div class="impoclick-breakdown-row ${critico ? 'impoclick-breakdown-minus' : ''}">
                            <span>Estoque acaba em</span>
                            <strong>~${dias} dias (${item.availableQuantity} un.)</strong>
                        </div>
                    `);
                } else {
                    linhas.push(`
                        <div class="impoclick-breakdown-row">
                            <span>Estoque</span>
                            <strong>${item.availableQuantity} un. · sem venda no período</strong>
                        </div>
                    `);
                }
            }
        } else if (item.availableQuantity != null) {
            // Sem o número exato de vendas não dá pra projetar estoque nem
            // calcular conversão — mostramos só o que é fato.
            linhas.push(`
                <div class="impoclick-breakdown-row">
                    <span>Estoque</span>
                    <strong>${item.availableQuantity} un.</strong>
                </div>
            `);
        }

        if (visits && visits.total30 > 0 && sales) {
            const conversao = (sales.sold / visits.total30) * 100;
            // Quanto entra por mês a cada 0,1 ponto percentual a mais de
            // conversão, mantendo as visitas de hoje. Serve pra comparar o
            // esforço de melhorar o anúncio com o de buscar mais tráfego.
            const ganho = visits.total30 * 0.001 * (item.price || 0);
            linhas.push(`
                <div class="impoclick-breakdown-row">
                    <span>Conversão (30 dias)</span>
                    <strong>${conversao.toFixed(2)}%</strong>
                </div>
                <div class="impoclick-breakdown-row impoclick-breakdown-subtotal">
                    <span>Cada +0,1% de conversão</span>
                    <strong>${formatBRL(ganho)}/mês</strong>
                </div>
            `);
        }

        if (!linhas.length) return '';

        return `
            <div class="impoclick-an-block-title">Números do anúncio</div>
            <div class="impoclick-breakdown">${linhas.join('')}</div>
            ${!sales ? '<p class="impoclick-note">Não foi possível confirmar as vendas do período, então projeção de estoque e conversão ficam de fora — um número aproximado aqui não serviria para decidir nada.</p>' : ''}
        `;
    }

    function renderReviewsBlock(reviews) {
        if (!reviews || !reviews.total) return '';

        const estrelas = '★'.repeat(Math.round(reviews.average)) + '☆'.repeat(5 - Math.round(reviews.average));
        const ultimas = reviews.latest.map((r) => `
            <div class="impoclick-review">
                <span class="impoclick-review-stars">${'★'.repeat(r.rate)}</span>
                ${r.content ? `<p>${escapeHtml(r.content.slice(0, 140))}${r.content.length > 140 ? '…' : ''}</p>` : ''}
            </div>
        `).join('');

        return `
            <div class="impoclick-an-block-title">Avaliações</div>
            <div class="impoclick-an-item">
                <strong>${reviews.average.toFixed(1)} ${estrelas} · ${reviews.total} ${reviews.total === 1 ? 'opinião' : 'opiniões'}</strong>
                ${ultimas}
            </div>
        `;
    }

    function renderKeywordsBlock(repetidas, sugestoes) {
        if (!repetidas.length && !sugestoes) return '';

        const repetidasHtml = repetidas.length
            ? `
                <div class="impoclick-an-item impoclick-an-warn">
                    <strong>Palavras gastas mais de uma vez</strong>
                    <p>${repetidas.map((w) => `<span class="impoclick-kw-old">${escapeHtml(w)}</span>`).join(' ')}</p>
                    <p>Aparecem em mais de um dos três campos que o ML indexa como identidade do produto — Título, Marca e Modelo. Trocar por um termo que o anúncio ainda não tem amplia por quantas buscas ele aparece.</p>
                </div>
            `
            : '';

        const sugestoesHtml = sugestoes
            ? `
                <div class="impoclick-an-item impoclick-an-opp">
                    <strong>Palavras que a concorrência usa e você não</strong>
                    ${sugestoes.sugestoes.map((s) => `
                        <div class="impoclick-kw-row">
                            <span class="impoclick-kw-term">${escapeHtml(s.palavra)}</span>
                            <span class="impoclick-kw-new">${s.anuncios} de ${sugestoes.analisados}</span>
                        </div>
                    `).join('')}
                    <p class="impoclick-note">${sugestoes.criterioVendas
                        ? `Contado nos ${sugestoes.analisados} anúncios do mesmo produto que estão na primeira página da busca e têm venda registrada.`
                        : `Contado nos ${sugestoes.analisados} anúncios do mesmo produto na primeira página da busca. O Mercado Livre não expôs a quantidade vendida deles, então o critério aqui é o ranqueamento, que já é por relevância.`}</p>
                </div>
            `
            : '';

        return `
            <div class="impoclick-an-block-title">Palavras-chave</div>
            ${repetidasHtml}
            ${sugestoesHtml}
        `;
    }

    // Investimento em publicidade contra o retorno. CTR e conversão são
    // calculados aqui a partir de cliques/impressões/unidades — a API
    // devolve esses percentuais em escalas que variam, e a divisão direta
    // não deixa dúvida sobre o que o número significa.
    function adsDerived(m) {
        const custo = m.cost || 0;
        const receita = m.total_amount || 0;
        const cliques = m.clicks || 0;
        const impressoes = m.prints || 0;
        const vendasAds = (m.direct_units_quantity || 0) + (m.indirect_units_quantity || 0);

        return {
            custo,
            receita,
            cliques,
            impressoes,
            vendasAds,
            vendasOrganicas: m.organic_units_quantity || 0,
            cpc: cliques > 0 ? custo / cliques : 0,
            ctr: impressoes > 0 ? (cliques / impressoes) * 100 : 0,
            conversao: cliques > 0 ? (vendasAds / cliques) * 100 : 0,
            roas: typeof m.roas === 'number' && m.roas > 0 ? m.roas : (custo > 0 ? receita / custo : 0),
            acos: typeof m.acos === 'number' && m.acos > 0 ? m.acos : (receita > 0 ? (custo / receita) * 100 : 0),
        };
    }

    function renderAdsBlock(ads) {
        if (!ads) return '';

        const titulo = '<div class="impoclick-an-block-title">Publicidade (Product Ads)</div>';

        if (!ads.enabled) {
            return `
                ${titulo}
                <div class="impoclick-an-item">
                    <strong>Conta sem Publicidade habilitada</strong>
                    <p>O Mercado Livre exige reputação amarela ou melhor, 15 dias de cadastro e um mínimo de vendas (1 para empresa, 10 para pessoa física). Ative em Mercado Livre &gt; Meu perfil &gt; Publicidade.</p>
                </div>
            `;
        }

        const d = adsDerived(ads.metrics || {});

        if (ads.status === 'idle' || (!d.custo && !d.impressoes)) {
            return `
                ${titulo}
                <div class="impoclick-an-item">
                    <strong>Anúncio fora de campanha</strong>
                    <p>Ele está liberado para publicidade, mas não teve investimento nem impressão nos últimos ${ads.days} dias.</p>
                    ${ads.recommended ? '<p>O Mercado Livre marca este anúncio como <strong>recomendado</strong> para publicidade — pelo modelo deles, responderia bem ao investimento.</p>' : ''}
                </div>
            `;
        }

        const totalVendas = d.vendasAds + d.vendasOrganicas;
        const pctAds = totalVendas ? (d.vendasAds / totalVendas) * 100 : 0;

        // ROAS abaixo de 1 é dinheiro saindo: cada real investido volta
        // menos de um real em receita atribuída.
        const pagaSe = d.roas >= 1;
        const vereditoClass = pagaSe ? 'impoclick-good' : 'impoclick-bad';
        const veredito = d.custo > 0
            ? `Cada ${formatBRL(1)} investido devolveu ${formatBRL(d.roas)}`
            : 'Sem investimento no período';

        return `
            ${titulo}
            <div class="impoclick-verdict ${vereditoClass}">${veredito}</div>
            <div class="impoclick-breakdown">
                <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                    <span>Investido em ${ads.days} dias</span><strong>${formatBRL(d.custo)}</strong>
                </div>
                <div class="impoclick-breakdown-row">
                    <span>Receita atribuída a Ads</span><strong>${formatBRL(d.receita)}</strong>
                </div>
                <div class="impoclick-breakdown-row impoclick-breakdown-subtotal">
                    <span>ROAS</span><strong class="${pagaSe ? 'impoclick-up' : 'impoclick-down'}">${d.roas.toFixed(1)}x</strong>
                </div>
                <div class="impoclick-breakdown-row">
                    <span>ACOS</span><strong>${d.acos.toFixed(1)}%</strong>
                </div>
                <div class="impoclick-breakdown-row">
                    <span>Impressões · cliques</span><strong>${d.impressoes} · ${d.cliques}</strong>
                </div>
                <div class="impoclick-breakdown-row">
                    <span>CTR · CPC médio</span><strong>${d.ctr.toFixed(2)}% · ${formatBRL(d.cpc)}</strong>
                </div>
                <div class="impoclick-breakdown-row">
                    <span>Conversão dos cliques</span><strong>${d.conversao.toFixed(2)}%</strong>
                </div>
                <div class="impoclick-breakdown-row impoclick-breakdown-total">
                    <span>Vendas: Ads / orgânicas</span>
                    <strong>${d.vendasAds} / ${d.vendasOrganicas} (${pctAds.toFixed(0)}% por Ads)</strong>
                </div>
            </div>
        `;
    }

    // Cabeçalho dizendo QUAL anúncio foi analisado. Numa página /up/ vários
    // vendedores dividem a mesma tela e ainda há carrossel de recomendados,
    // então é fácil o id extraído não ser o do anúncio que está na frente do
    // usuário. Mostrar título e código deixa isso na cara em vez de entregar
    // números de outro anúncio como se fossem deste.
    function renderAnalyzedItem(item, tituloDaPagina) {
        const palavrasItem = toWordSet(item.title);
        const palavrasPagina = new Set(toWordSet(tituloDaPagina || ''));
        const comuns = palavrasItem.filter((w) => palavrasPagina.has(w)).length;
        const divergente = !!tituloDaPagina
            && palavrasItem.length > 0
            && (comuns / palavrasItem.length) < 0.5;

        // Numa página /up/ o ML exibe o nome do PRODUTO no topo, que é
        // compartilhado por todos os vendedores. O título do anúncio — o que
        // esta análise mede — é outro texto, escrito pelo vendedor.
        const ehPaginaDeProduto = /\/up\/|\/p\/ML/i.test(window.location.href);

        return `
            <div class="impoclick-analyzed ${divergente ? 'impoclick-analyzed-warn' : ''}">
                <span class="impoclick-analyzed-label">Analisando</span>
                <p class="impoclick-item-title">${escapeHtml(item.title)}</p>
                <p class="impoclick-note">${escapeHtml(item.id)}${item.permalink ? ` · <a href="${escapeHtml(item.permalink)}" target="_blank" rel="noopener">abrir anúncio</a>` : ''}</p>
                ${divergente
                    ? '<p class="impoclick-note impoclick-error">Este não parece ser o anúncio da página que você está vendo. Abra o anúncio pelo link acima para conferir, ou entre por ele direto.</p>'
                    : (ehPaginaDeProduto
                        ? '<p class="impoclick-note">Esta é uma página de produto: o nome grande no topo é do produto, comum a todos os vendedores. O título acima é o do seu anúncio, que é o que conta na busca — por isso os dois podem ser diferentes.</p>'
                        : '')}
            </div>
        `;
    }

    function renderFullAnalysis(data, tituloDaPagina) {
        const semVariacao = stripVariationSuffix(data.item.title, data.item.variationValues);
        const titleAnalysis = analyzeTitle(semVariacao.text);
        titleAnalysis.variationRemoved = semVariacao.removed;
        const attrAnalysis = analyzeAttributeSet(data.attributes, titleAnalysis.words);
        const audit = buildAudit(data, titleAnalysis, attrAnalysis);

        const repetidas = collectRepeatedWords(titleAnalysis, attrAnalysis);
        const sugestoes = suggestKeywordsFromCompetitors(data.competitors, titleAnalysis, attrAnalysis);

        return `
            ${renderAnalyzedItem(data.item, tituloDaPagina)}
            ${renderScoreBlock(audit)}
            ${renderChecklist(audit)}
            ${renderNumbersBlock(data)}
            ${renderAdsBlock(data.ads)}
            ${renderVisitsBlock(data.visits)}
            <div class="impoclick-an-block-title">Título</div>
            ${renderTitleFindings(titleAnalysis)}
            ${renderAttributeAudit(attrAnalysis)}
            ${renderKeywordsBlock(repetidas, sugestoes)}
            ${renderCategoryFields(data.categoryFields)}
            ${renderTagsBlock(audit.tags)}
            ${renderReviewsBlock(data.reviews)}
        `;
    }

    // Renderiza a análise oficial do Mercado Livre (API /performance).
    function renderPerformance(perf) {
        const nivel = perf.level ? ` · ${escapeHtml(perf.level)}` : '';
        const scoreClass = perf.score >= 75 ? 'impoclick-good' : (perf.score >= 50 ? 'impoclick-warn' : 'impoclick-bad');

        const lista = (items, tipo) => items.map((a) => `
            <div class="impoclick-an-item ${tipo === 'warning' ? 'impoclick-an-warn' : 'impoclick-an-opp'}">
                <strong>${escapeHtml(a.topic || a.key)}</strong>
                ${a.text ? `<p>${escapeHtml(a.text)}</p>` : ''}
                ${a.link ? `<a href="${escapeHtml(a.link)}" target="_blank" rel="noopener">${escapeHtml(a.label || 'Corrigir no Mercado Livre')} →</a>` : ''}
            </div>
        `).join('');

        const nada = perf.warnings.length === 0 && perf.opportunities.length === 0
            ? '<p class="impoclick-text">Nenhuma ação pendente — o anúncio já cumpre todos os objetivos de qualidade do Mercado Livre.</p>'
            : '';

        return `
            <div class="impoclick-an-block">
                <div class="impoclick-an-block-title">Qualidade oficial do Mercado Livre</div>
                <div class="impoclick-verdict ${scoreClass}">${perf.score != null ? perf.score : '—'}/100${nivel}</div>
                <p class="impoclick-note">${perf.totals.completed} de ${perf.totals.actions} objetivos cumpridos · ${perf.totals.warnings} problema(s) · ${perf.totals.opportunities} oportunidade(s)</p>
                ${nada}
                ${perf.warnings.length ? `<div class="impoclick-an-block-title">Problemas que derrubam a pontuação</div>${lista(perf.warnings, 'warning')}` : ''}
                ${perf.opportunities.length ? `<div class="impoclick-an-block-title">Oportunidades de melhoria</div>${lista(perf.opportunities, 'opp')}` : ''}
            </div>
        `;
    }

    function mensagemDeErroAnalise(resp) {
        if (resp.error === 'not_logged_in') {
            return 'Faça login na extensão para a análise completa.';
        }
        if (resp.error === 'not_own_item') {
            return 'Este anúncio não é da conta do Mercado Livre conectada. A análise audita os seus próprios anúncios — a API do ML não libera ficha técnica, visitas e vendas de anúncios de terceiros.';
        }
        return resp.message || 'Não foi possível fazer a análise completa agora.';
    }

    // Monta a aba "Análise" (separada da Viabilidade). É chamada assim que o
    // painel existe, ANTES de qualquer consulta de rede — antes disso a aba
    // ficava em branco enquanto a Viabilidade carregava a taxa, e ficava em
    // branco pra sempre em quem não estava logado.
    //
    // A análise é uma auditoria dos anúncios da PRÓPRIA conta: todos os
    // dados vêm da API do ML, que só responde sobre os itens do vendedor
    // autenticado. Em anúncio de terceiro a resposta é uma explicação, não
    // uma análise pela metade.
    function setupAnalyzeTab(pageData, loggedIn, itemIdDaPagina) {
        const pane = document.getElementById('impoclick-panel-analise');
        if (!pane) return;

        if (!loggedIn) {
            pane.innerHTML = `
                <p class="impoclick-text">A análise audita os anúncios da sua conta: título, ficha técnica, campos da categoria, fotos, tags, visitas, vendas e avaliações.</p>
                <p class="impoclick-text">Clique no ícone da extensão <strong>Impoclick</strong> na barra do navegador para entrar.</p>
            `;
            return;
        }

        pane.innerHTML = `
            ${pageData.title ? `<p class="impoclick-item-title">${escapeHtml(pageData.title)}</p>` : ''}
            <p class="impoclick-text">Audita este anúncio: título, ficha técnica, campos da categoria, fotos, tags, visitas, vendas e avaliações.</p>
            <button id="impoclick-analyze-btn" class="impoclick-btn">Analisar anúncio</button>
            <div id="impoclick-analyze-result"></div>
        `;

        document.getElementById('impoclick-analyze-btn').addEventListener('click', async () => {
            const el = document.getElementById('impoclick-analyze-result');

            const itemId = itemIdDaPagina;
            if (!itemId) {
                el.innerHTML = '<p class="impoclick-text impoclick-error">Não consegui identificar o código do anúncio nesta página.</p>';
                return;
            }

            el.innerHTML = '<p class="impoclick-text">Consultando os dados do anúncio no Mercado Livre...</p>';

            const [analiseResp, perfResp] = await Promise.all([
                sendMessage({ type: 'GET_ANALISE', itemId }),
                sendMessage({ type: 'GET_PERFORMANCE', itemId }),
            ]);

            if (!analiseResp.analise) {
                el.innerHTML = `<p class="impoclick-text impoclick-error">${escapeHtml(mensagemDeErroAnalise(analiseResp))}</p>`;
                return;
            }

            let html = renderFullAnalysis(analiseResp.analise, pageData.title);
            if (perfResp.performance) html += renderPerformance(perfResp.performance);
            el.innerHTML = html;
        });
    }

    function sendMessage(message) {
        return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
    }

    function formatBRL(v) {
        return `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // "11,5%", e não "11.5%": vírgula decimal, como o resto da tela.
    function percentBR(v) {
        const n = Number(v);
        if (!isFinite(n)) return '—';
        return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
    }

    const ROTULO_TIPO = { gold_special: 'Clássico', gold_pro: 'Premium' };

    function pesoBR(gramas) {
        return gramas >= 1000
            ? (gramas / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg'
            : Math.round(gramas) + ' g';
    }

    // O frete que o anúncio mostra. Custo nulo quer dizer que o comprador
    // paga e o valor só sai depois do CEP — formatado, virava "R$ 0,00" e
    // dizia que o envio era de graça.
    function freteMostrado(shipping) {
        if (!shipping) return 'não identificado';
        if (shipping.isFree) return 'Grátis';
        return typeof shipping.cost === 'number' ? formatBRL(shipping.cost) : 'pago pelo comprador';
    }

    // Comissão de cada modalidade, a partir de UMA resposta de GET_FEE: a API
    // já devolve todas em `options`, cada uma com o percentual e o valor total
    // por venda. O total inclui a tarifa fixa por unidade que o Mercado Livre
    // cobra nos itens baratos — e ela ficava de fora, porque o cálculo usava só
    // o percentual. O fixo sai da diferença entre o total e o percentual.
    function comissoesPorTipo(fee, precoConsultado) {
        const porTipo = {};
        ((fee && fee.options) || []).forEach((o) => {
            if (!ROTULO_TIPO[o.id]) return;
            const pct = Number(o.percentageFee);
            if (!isFinite(pct)) return;
            const total = Number(o.saleFeeAmount);
            const fixoBruto = isFinite(total) ? total - precoConsultado * (pct / 100) : 0;
            // Menos de 5 centavos é arredondamento do ML, não tarifa.
            const fixo = fixoBruto >= 0.05 ? Math.round(fixoBruto * 100) / 100 : 0;
            porTipo[o.id] = { pct, fixo };
        });
        return porTipo;
    }

    function valorDaComissao(comissao, preco) {
        return preco * (comissao.pct / 100) + comissao.fixo;
    }

    // "11,5%" ou "11,5% + R$ 6,25 fixo", para quem confere a conta.
    function descreverComissao(comissao) {
        return percentBR(comissao.pct) + (comissao.fixo > 0 ? ' + ' + formatBRL(comissao.fixo) + ' fixo' : '');
    }

    // Os dados de marca vêm da base pública do INPI (texto livre digitado
    // por terceiros nos processos de registro) — escapamos antes de jogar
    // em innerHTML pra não abrir brecha de XSS com nome/titular malformado.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function renderTrademarkResults(container, trademark) {
        if (!trademark || !trademark.results || trademark.results.length === 0) {
            container.innerHTML = '<p class="impoclick-text">Nenhum registro encontrado para esse termo no INPI.</p>';
            return;
        }

        const items = trademark.results.slice(0, 5).map((r) => {
            const isActive = /em vigor/i.test(r.status || '');
            const statusClass = isActive ? 'impoclick-tm-active' : 'impoclick-tm-inactive';
            const classesHtml = (r.niceClasses && r.niceClasses.length)
                ? r.niceClasses.map((c) => {
                    const desc = c.description ? c.description.slice(0, 70) + (c.description.length > 70 ? '…' : '') : '';
                    return `Classe ${escapeHtml(c.code)}${desc ? ` — ${escapeHtml(desc)}` : ''}`;
                }).join('<br>')
                : 'Classe não identificada';
            const holders = (r.holders && r.holders.length) ? escapeHtml(r.holders.join(', ')) : '—';

            const confirmedNote = r.statusConfirmed
                ? '<span class="impoclick-tm-confirmed" title="Situação conferida agora na base oficial do INPI">✓ confirmado</span>'
                : '<span class="impoclick-tm-unconfirmed" title="Não foi possível conferir na base oficial agora — pode estar desatualizado">situação não conferida</span>';

            return `
                <div class="impoclick-trademark-item">
                    <div class="impoclick-trademark-item-header">
                        <strong>${escapeHtml(r.markName || '(sem nome)')}</strong>
                        <span class="impoclick-tm-status ${statusClass}">${escapeHtml(r.status || '—')}</span>
                    </div>
                    <p class="impoclick-note">Titular: ${holders}</p>
                    <p class="impoclick-note">${classesHtml}</p>
                    <p class="impoclick-note">${confirmedNote}</p>
                </div>
            `;
        }).join('');

        const moreNote = trademark.totalResults > 5
            ? `<p class="impoclick-note">Mostrando 5 de ${trademark.totalResults} resultados.</p>`
            : '';

        container.innerHTML = `
            ${items}
            ${moreNote}
            <p class="impoclick-note">Consulta informativa via base pública do INPI — confirme oficialmente no site do INPI antes de qualquer decisão.</p>
        `;
    }

    function renderNotLoggedIn(container) {
        container.innerHTML = `
            <p class="impoclick-text">Clique no ícone da extensão <strong>Impoclick</strong> na barra do navegador para fazer login com sua conta.</p>
        `;
    }

    // `comissao` = { tipo, pct, fixo }, ou null quando não deu para consultar.
    function computeAndRenderVerdict(resultEl, price, comissao, cost, freightCost, freightNote, taxPct) {
        // Sem consulta, 13% é a média do Clássico: estimativa, e a tela avisa.
        const efetiva = comissao || { tipo: null, pct: 13, fixo: 0 };
        const feeAmount = valorDaComissao(efetiva, price);
        const freight = freightCost || 0;
        const effectiveTaxPct = taxPct || 0;
        const taxAmount = price * (effectiveTaxPct / 100);

        // Publicidade é custo por unidade como qualquer outro: sai da receita
        // antes de comparar com o custo do produto. Nulo quando o cartão está
        // desligado — aí a linha nem aparece no detalhamento.
        const ads = custoPublicidade(price);
        const adsAmount = ads ? ads.custo : 0;

        const netRevenue = price - feeAmount - freight - taxAmount - adsAmount;
        const diff = netRevenue - cost;
        const marginPct = price > 0 ? (diff / price) * 100 : 0;

        let verdict, verdictClass;
        if (diff <= 0) {
            verdict = 'NÃO COMPENSA';
            verdictClass = 'impoclick-bad';
        } else if (marginPct < 15) {
            verdict = 'MARGEM APERTADA';
            verdictClass = 'impoclick-warn';
        } else {
            verdict = 'COMPENSA';
            verdictClass = 'impoclick-good';
        }
        const resultClass = diff <= 0 ? 'impoclick-breakdown-negative' : 'impoclick-breakdown-positive';

        // Detalhamento linha a linha (estilo "cascata"): parte do preço do
        // anúncio, desconta comissão e frete pra chegar na receita líquida,
        // e dessa subtrai o custo — deixando claro de onde vem cada centavo
        // do resultado, em vez de só a frase-resumo.
        resultEl.innerHTML = `
            <div class="impoclick-res ${resultClass}">
                <div class="impoclick-res-topo">
                    <span class="impoclick-res-rotulo">Resultado</span>
                    <span class="impoclick-res-tag ${verdictClass}">${verdict}</span>
                </div>

                <div class="impoclick-res-numero">${formatBRL(diff)}</div>
                <p class="impoclick-res-sub">resultado líquido por unidade vendida</p>

                <div class="impoclick-res-metricas">
                    <div><span>Margem</span><strong>${percentBR(Math.round(marginPct * 10) / 10)}</strong></div>
                    <div><span>Receita líquida</span><strong>${formatBRL(netRevenue)}</strong></div>
                    <div><span>Comissão</span><strong>${percentBR(efetiva.pct)}</strong></div>
                </div>

                <details class="impoclick-det">
                    <summary>
                        <span>Detalhamento de custos</span>
                        <span class="impoclick-det-total">${formatBRL(feeAmount + freight + taxAmount + adsAmount + cost)}</span>
                    </summary>
                    <div class="impoclick-breakdown">
                        <div class="impoclick-breakdown-row">
                            <span>Valor do produto</span>
                            <strong>${formatBRL(price)}</strong>
                        </div>
                        <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                            <span>(–) Comissão do Mercado Livre (${efetiva.tipo ? ROTULO_TIPO[efetiva.tipo] + ' · ' : 'estimada · '}${descreverComissao(efetiva)})</span>
                            <strong>${formatBRL(feeAmount)}</strong>
                        </div>
                        <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                            <span>(–) Frete da plataforma</span>
                            <strong>${formatBRL(freight)}</strong>
                        </div>
                        ${effectiveTaxPct > 0 ? `
                        <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                            <span>(–) Imposto sobre a venda (${percentBR(effectiveTaxPct)})</span>
                            <strong>${formatBRL(taxAmount)}</strong>
                        </div>
                        ` : ''}
                        ${ads ? `
                        <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                            <span>(–) Publicidade (TACOS ${ads.tacos.toFixed(1).replace('.', ',')}%)</span>
                            <strong>${formatBRL(adsAmount)}</strong>
                        </div>
                        ` : ''}
                        <div class="impoclick-breakdown-row impoclick-breakdown-subtotal">
                            <span>(=) Receita líquida da venda</span>
                            <strong>${formatBRL(netRevenue)}</strong>
                        </div>
                        <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                            <span>(–) Seu custo de importação</span>
                            <strong>${formatBRL(cost)}</strong>
                        </div>
                        <div class="impoclick-breakdown-row impoclick-breakdown-total ${resultClass}">
                            <span>(=) Resultado líquido por unidade</span>
                            <strong>${formatBRL(diff)} (${percentBR(Math.round(marginPct * 10) / 10)})</strong>
                        </div>
                    </div>
                </details>

                <p class="impoclick-note">${freightNote || 'Estimativa rápida. Para o cálculo completo, abra o Impoclick.'}</p>
            </div>
        `;
    }

    // Publicidade (Product Ads) no cálculo de viabilidade.
    //
    // Três siglas que se confundem, e só a terceira serve aqui:
    //
    //   ROAS  = receita gerada pelos anúncios ÷ o que você investiu neles.
    //           Vem como múltiplo: 5× significa R$ 5 de receita por R$ 1 gasto.
    //   ACOS  = o inverso do ROAS, em porcentagem (1 ÷ ROAS). É o que o painel
    //           do Mercado Livre mostra.
    //   TACOS = investimento ÷ receita TOTAL, somando o que vendeu sem anúncio.
    //
    // O custo por unidade precisa do TACOS, não do ACOS: nem toda venda vem de
    // anúncio, e cobrar o ACOS de todas as unidades inflaria o custo. Como
    // TACOS = ACOS × (receita de ads ÷ receita total), e essa razão é a
    // participação das vendas vindas de ads:
    //
    //   TACOS = participação ÷ ROAS
    //
    // Conferindo com um caso real: 20% de participação com ROAS 5× dá TACOS de
    // 4%, e 4% de R$ 32,00 são R$ 1,28 por unidade.
    function calcularTacos(participacaoPct, roas) {
        if (!(roas > 0) || !(participacaoPct > 0)) return null;
        return participacaoPct / roas;
    }

    // Lê os controles do cartão de publicidade e devolve o custo por unidade.
    // Devolve null quando o cartão está desligado ou incompleto — quem chama
    // trata isso como "sem custo de publicidade", não como zero calculado.
    function custoPublicidade(preco) {
        const cartao = document.getElementById('impoclick-ads-card');
        if (!cartao || cartao.dataset.ligado !== 'true') return null;

        const roas = Number(valorSegOuOutro('impoclick-roas-seg', 'impoclick-roas-outro'));
        const participacao = Number(valorSegOuOutro('impoclick-share-seg', 'impoclick-share-outro'));
        const tacos = calcularTacos(participacao, roas);
        if (tacos === null) return null;

        return { tacos, custo: preco * (tacos / 100), roas, participacao };
    }

    // ROAS de referência para o aviso. Não é meta nem recomendação: é um valor
    // de mercado bastante comum, usado só para mostrar o tamanho do estrago se
    // a estimativa estiver otimista.
    const ROAS_PESSIMISTA = 5;

    function mostrarTacos() {
        const alvo = document.getElementById('impoclick-tacos-valor');
        const aviso = document.getElementById('impoclick-tacos-aviso');
        if (!alvo) return;

        const roas = Number(valorSegOuOutro('impoclick-roas-seg', 'impoclick-roas-outro'));
        const participacao = Number(valorSegOuOutro('impoclick-share-seg', 'impoclick-share-outro'));
        const tacos = calcularTacos(participacao, roas);
        alvo.textContent = tacos === null ? '—' : tacos.toFixed(1).replace('.', ',') + '%';

        if (!aviso) return;

        // O aviso só faz sentido quando o número é CHUTE. Vindo do painel do
        // Mercado Livre, o ROAS é o real do anúncio e não há o que supor.
        const fonte = document.getElementById('impoclick-ads-fonte');
        const dadoReal = fonte && fonte.classList.contains('impoclick-ads-fonte-real');

        // Como o ROAS divide a conta, superestimá-lo faz a publicidade parecer
        // barata e infla a margem na tela. Um cálculo que erra sempre para o
        // lado otimista leva o vendedor a aceitar preço que não fecha, então
        // aqui ele vê quanto custaria se o ROAS real fosse pior.
        const otimista = tacos !== null && !dadoReal && roas > ROAS_PESSIMISTA;
        aviso.classList.toggle('impoclick-hidden', !otimista);

        if (otimista) {
            const pior = calcularTacos(participacao, ROAS_PESSIMISTA);
            const vezes = (pior / tacos).toFixed(1).replace('.', ',');
            aviso.textContent = 'Se o ROAS real for ' + ROAS_PESSIMISTA + '×, o TACOS vira '
                + pior.toFixed(1).replace('.', ',') + '% — ' + vezes + '× este custo. '
                + 'Na dúvida, use o menor ROAS ou confira o número no seu painel do Mercado Livre.';
        }
    }

    // Se o anúncio for do próprio vendedor, o Mercado Livre já sabe o ROAS e
    // quantas vendas vieram de anúncio — chutar esses dois números quando eles
    // existem de verdade seria jogar fora a única fonte confiável.
    //
    // Cada motivo de não ter dado vira um texto diferente na etiqueta. A
    // primeira versão caía calada em "Estimativa sua" nos quatro casos, e não
    // dava para distinguir "não é seu anúncio" de "não achei o código na
    // página" — que é problema nosso, não da conta do vendedor.
    const MOTIVO_ADS = {
        sem_item: 'Sem código do anúncio',
        // A API devolve 404 tanto para anúncio de outro vendedor quanto para
        // conta sem Publicidade. Escrever "Conta sem Publicidade" afirmaria a
        // segunda hipótese sem saber; o texto cobre as duas e a dica explica.
        sem_publicidade: 'Sem dados de publicidade',
        fora_de_campanha: 'Fora de campanha',
        sem_dados: 'Sem dados em 30 dias',
        erro_consulta: 'Não consultado',
        nao_e_seu: 'Anúncio de terceiro',
    };

    function marcarFonteAds(motivo) {
        const fonte = document.getElementById('impoclick-ads-fonte');
        if (!fonte) return;
        fonte.textContent = MOTIVO_ADS[motivo] || 'Estimativa sua';
        fonte.classList.remove('impoclick-ads-fonte-real');
        const explicacao = {
            sem_item: 'Não consegui ler o código do anúncio nesta página, então não deu para consultar suas métricas.',
            sem_publicidade: 'O Mercado Livre não devolveu métricas para este anúncio — ou ele não é seu, ou a conta não tem Publicidade habilitada.',
            fora_de_campanha: 'Este anúncio existe para publicidade, mas não está em nenhuma campanha ativa.',
            sem_dados: 'Sem cliques ou vendas por anúncio nos últimos 30 dias.',
            erro_consulta: 'Não foi possível consultar o Mercado Livre agora.',
        };
        fonte.title = explicacao[motivo] || 'Os valores abaixo são estimativa sua, não do Mercado Livre.';
    }

    async function preencherComMetricasReais(itemId) {
        const fonte = document.getElementById('impoclick-ads-fonte');
        if (!fonte) return;

        if (!itemId) {
            marcarFonteAds('sem_item');
            return;
        }

        fonte.textContent = 'consultando...';
        const r = await sendMessage({ type: 'GET_ADS_METRICS', itemId });

        // Anúncio de outro vendedor devolve 404 na API de publicidade, que aqui
        // chega como "sem_publicidade" — distinguir os dois exigiria saber de
        // quem é o anúncio, coisa que a página não diz de forma confiável.
        if (!r || !r.ads) {
            marcarFonteAds((r && r.motivo) || 'erro_consulta');
            return;
        }

        definirSegOuOutro('impoclick-roas-seg', 'impoclick-roas-outro', r.ads.roas);
        definirSegOuOutro('impoclick-share-seg', 'impoclick-share-outro', r.ads.participacao);

        fonte.textContent = 'Do seu painel do ML';
        fonte.classList.add('impoclick-ads-fonte-real');
        fonte.title = `${r.ads.vendasAds} venda(s) por anúncio e ${r.ads.organicas} orgânica(s) nos últimos ${r.ads.dias} dias.`;
        mostrarTacos();
    }

    // Encaixa um valor vindo de fora nos botões: usa a opção pronta quando ela
    // bate, senão cai no campo livre.
    function definirSegOuOutro(idGrupo, idCampo, valor) {
        const grupo = document.getElementById(idGrupo);
        const campo = document.getElementById(idCampo);
        if (!grupo || !campo) return;

        const igual = [...grupo.querySelectorAll('.impoclick-seg-opt')]
            .find((b) => b.dataset.valor === String(Number(valor)));

        grupo.querySelectorAll('.impoclick-seg-opt').forEach((b) => b.classList.remove('impoclick-seg-ativo'));

        if (igual) {
            igual.classList.add('impoclick-seg-ativo');
            grupo.dataset.valor = igual.dataset.valor;
            campo.classList.add('impoclick-hidden');
            return;
        }

        const outro = grupo.querySelector('[data-valor="outro"]');
        if (outro) outro.classList.add('impoclick-seg-ativo');
        grupo.dataset.valor = 'outro';
        campo.value = valor;
        campo.classList.remove('impoclick-hidden');
    }

    function ligarPublicidade(itemId) {
        const cartao = document.getElementById('impoclick-ads-card');
        const chave = document.getElementById('impoclick-ads-switch');
        const campos = document.getElementById('impoclick-ads-campos');
        const fonte = document.getElementById('impoclick-ads-fonte');
        if (!cartao || !chave) return;

        let jaBuscou = false;

        chave.addEventListener('click', async () => {
            const ligado = cartao.dataset.ligado !== 'true';
            cartao.dataset.ligado = String(ligado);
            chave.setAttribute('aria-checked', String(ligado));
            chave.classList.toggle('impoclick-switch-ligado', ligado);
            campos.classList.toggle('impoclick-hidden', !ligado);
            fonte.textContent = ligado ? 'Estimativa sua' : 'Desligada';

            if (ligado) {
                mostrarTacos();
                // Só na primeira vez: reabrir o cartão não deve desfazer um
                // ajuste que o vendedor tenha feito à mão depois.
                if (!jaBuscou) {
                    jaBuscou = true;
                    await preencherComMetricasReais(itemId);
                }
            }
        });

        // "Outro" mostra o campo livre; as demais opções o escondem.
        [['impoclick-roas-seg', 'impoclick-roas-outro'], ['impoclick-share-seg', 'impoclick-share-outro']]
            .forEach(([idGrupo, idCampo]) => {
                const grupo = document.getElementById(idGrupo);
                const campo = document.getElementById(idCampo);
                if (!grupo || !campo) return;
                grupo.addEventListener('click', () => {
                    campo.classList.toggle('impoclick-hidden', grupo.dataset.valor !== 'outro');
                    if (grupo.dataset.valor === 'outro') campo.focus();
                    mostrarTacos();
                });
                campo.addEventListener('input', mostrarTacos);
            });
    }

    // Grupo de botões de opção: um ativo por vez, e a escolha fica no
    // data-valor do contêiner. Genérico de propósito — qualquer escolha do
    // painel vira um grupo desses sem código novo, que é o ponto de trocar os
    // controles nativos por botões.
    function ligarSegmentados(raiz) {
        raiz.querySelectorAll('.impoclick-seg').forEach((grupo) => {
            grupo.addEventListener('click', (e) => {
                const opcao = e.target.closest('.impoclick-seg-opt');
                if (!opcao || !grupo.contains(opcao)) return;
                grupo.querySelectorAll('.impoclick-seg-opt').forEach((b) => b.classList.remove('impoclick-seg-ativo'));
                opcao.classList.add('impoclick-seg-ativo');
                grupo.dataset.valor = opcao.dataset.valor;
            });
        });
    }

    function valorSeg(id) {
        const grupo = document.getElementById(id);
        return grupo ? grupo.dataset.valor : null;
    }

    function valorSegOuOutro(idGrupo, idCampo) {
        const escolhido = valorSeg(idGrupo);
        if (escolhido !== 'outro') return escolhido;
        const campo = document.getElementById(idCampo);
        return campo ? campo.value : '';
    }

    async function renderCalculator(container, pageData, itemId) {
        const needsManualPrice = !pageData.price;
        const needsManualTitle = !pageData.title;

        // A resposta de "Você oferece frete grátis?" é da operação do vendedor,
        // não de cada anúncio: fica salva e vale também para o cartão na página
        // do anúncio. Começa em Sim porque é o lado seguro — sem frete na conta
        // o lucro sairia maior do que o real para quem paga o envio.
        const guardado = await chrome.storage.local.get('ofereceFreteGratis').catch(() => ({}));
        const ofereceInicial = guardado.ofereceFreteGratis !== false;

        // O segmentado de comissão começa no tipo que o anúncio tem hoje; sem
        // leitura, no Clássico, que é o padrão do Mercado Livre.
        const tipoInicial = pageData.listingType || 'gold_special';

        container.innerHTML = `
            <div class="impoclick-cartao">
            ${pageData.title ? `<p class="impoclick-item-title">${escapeHtml(pageData.title)}</p>` : ''}
            ${needsManualTitle ? `
                <label class="impoclick-label" for="impoclick-title-input">Não consegui ler o nome do produto — digite (usado só pra achar a categoria)</label>
                <input type="text" id="impoclick-title-input" class="impoclick-input" placeholder="ex: fone de ouvido bluetooth">
            ` : ''}
            ${pageData.price ? `
                <div class="impoclick-row"><span>Preço do anúncio</span><strong>${formatBRL(pageData.price)}</strong></div>
            ` : `
                <label class="impoclick-label" for="impoclick-price-input">Não consegui ler o preço — digite o preço do anúncio (R$)</label>
                <input type="number" id="impoclick-price-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 149.90">
            `}
            <div class="impoclick-row"><span>Tipo do anúncio hoje</span><strong id="impoclick-tipo-hoje">${pageData.listingType ? ROTULO_TIPO[pageData.listingType] : 'não identificado'}</strong></div>
            <div class="impoclick-row" id="impoclick-shipping-row"><span>Frete mostrado no anúncio</span><strong id="impoclick-shipping-value">${freteMostrado(pageData.shipping)}</strong></div>
            ${pageData.shipping && pageData.shipping.isFree ? `<p class="impoclick-note">"Grátis" é o que aparece pro comprador — normalmente o vendedor ainda paga o frete real pra Mercado Envios. Preencha peso/dimensões abaixo pra ver esse custo real.</p>` : ''}

            <label class="impoclick-label">Comissão usada no cálculo</label>
            <div class="impoclick-seg" id="impoclick-tipo-seg" data-valor="${tipoInicial}">
                <button type="button" class="impoclick-seg-opt${tipoInicial === 'gold_special' ? ' impoclick-seg-ativo' : ''}" data-valor="gold_special">Clássico <span class="impoclick-seg-taxa" data-taxa="gold_special"></span></button>
                <button type="button" class="impoclick-seg-opt${tipoInicial === 'gold_pro' ? ' impoclick-seg-ativo' : ''}" data-valor="gold_pro">Premium <span class="impoclick-seg-taxa" data-taxa="gold_pro"></span></button>
            </div>
            <div class="impoclick-row" id="impoclick-fee-row"><span>Comissão por venda</span><strong id="impoclick-fee-value">calculando...</strong></div>
            <p class="impoclick-note impoclick-hidden" id="impoclick-fixo-nota"></p>
            <p class="impoclick-note impoclick-hidden" id="impoclick-tipo-nota"></p>
            </div>

            <div class="impoclick-cartao">
            <div class="impoclick-dupla">
                <div>
                    <label class="impoclick-label" for="impoclick-cost-input">Custo de importação (R$/un.)</label>
                    <input type="number" id="impoclick-cost-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 45.00">
                </div>
                <div>
                    <label class="impoclick-label" for="impoclick-tax-input">Imposto na venda (%)</label>
                    <input type="number" id="impoclick-tax-input" class="impoclick-input" step="0.01" min="0" max="100" placeholder="ex: 6">
                </div>
            </div>

            <label class="impoclick-label">Peso e dimensões do produto (pra calcular o frete real da sua conta)</label>
            ${pageData.dims ? '<p class="impoclick-note">Lido automaticamente da ficha técnica do anúncio — confira antes de calcular.</p>' : ''}
            <div class="impoclick-dim-grid">
                <input type="number" id="impoclick-weight-input" class="impoclick-input impoclick-input-sm" step="1" min="0" placeholder="Peso (g)" value="${pageData.dims ? Math.round(pageData.dims.weight) : ''}">
                <input type="number" id="impoclick-length-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Compr. (cm)" value="${pageData.dims ? pageData.dims.length : ''}">
                <input type="number" id="impoclick-width-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Larg. (cm)" value="${pageData.dims ? pageData.dims.width : ''}">
                <input type="number" id="impoclick-height-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Alt. (cm)" value="${pageData.dims ? pageData.dims.height : ''}">
            </div>
            <label class="impoclick-label">Você oferece frete grátis?</label>
            <div class="impoclick-seg" id="impoclick-frete-seg" data-valor="${ofereceInicial}">
                <button type="button" class="impoclick-seg-opt${ofereceInicial ? '' : ' impoclick-seg-ativo'}" data-valor="false">Não</button>
                <button type="button" class="impoclick-seg-opt${ofereceInicial ? ' impoclick-seg-ativo' : ''}" data-valor="true">Sim</button>
            </div>
            <p class="impoclick-note">Fica salvo e vale também para o cartão na página do anúncio.</p>

            </div>

            <div class="impoclick-cartao" id="impoclick-ads-card" data-ligado="false">
                <div class="impoclick-ads-topo">
                    <span class="impoclick-ads-titulo">Publicidade</span>
                    <span class="impoclick-ads-fonte" id="impoclick-ads-fonte">Desligada</span>
                    <button type="button" class="impoclick-switch" id="impoclick-ads-switch" role="switch" aria-checked="false" aria-label="Incluir publicidade no cálculo"><span></span></button>
                </div>

                <div id="impoclick-ads-campos" class="impoclick-hidden">
                    <label class="impoclick-label">ROAS alvo</label>
                    <div class="impoclick-seg" id="impoclick-roas-seg" data-valor="10">
                        <button type="button" class="impoclick-seg-opt impoclick-seg-ativo" data-valor="10">10×</button>
                        <button type="button" class="impoclick-seg-opt" data-valor="15">15×</button>
                        <button type="button" class="impoclick-seg-opt" data-valor="20">20×</button>
                        <button type="button" class="impoclick-seg-opt" data-valor="outro">Outro</button>
                    </div>
                    <input type="number" id="impoclick-roas-outro" class="impoclick-input impoclick-input-sm impoclick-hidden" step="0.1" min="0.1" placeholder="ROAS (ex: 7.5)">
                    <p class="impoclick-note">Quanto você fatura por real investido. Quanto MENOR o ROAS, mais caro sai cada unidade — na dúvida, use o menor dos três.</p>

                    <label class="impoclick-label">Vendas vindas de ads</label>
                    <div class="impoclick-seg" id="impoclick-share-seg" data-valor="20">
                        <button type="button" class="impoclick-seg-opt" data-valor="10">10%</button>
                        <button type="button" class="impoclick-seg-opt impoclick-seg-ativo" data-valor="20">20%</button>
                        <button type="button" class="impoclick-seg-opt" data-valor="30">30%</button>
                        <button type="button" class="impoclick-seg-opt" data-valor="outro">Outro</button>
                    </div>
                    <input type="number" id="impoclick-share-outro" class="impoclick-input impoclick-input-sm impoclick-hidden" step="1" min="0" max="100" placeholder="% das vendas (ex: 45)">

                    <div class="impoclick-row impoclick-ads-tacos">
                        <span>TACOS resultante</span>
                        <strong id="impoclick-tacos-valor">—</strong>
                    </div>
                    <p class="impoclick-note impoclick-aviso-otimista impoclick-hidden" id="impoclick-tacos-aviso"></p>
                </div>
            </div>

            <div class="impoclick-cartao">
            <button id="impoclick-calc-btn" class="impoclick-btn">Calcular viabilidade</button>
            </div>

            <div id="impoclick-result"></div>

            <div class="impoclick-cartao">
            <label class="impoclick-label" for="impoclick-trademark-input">Verificar marca no INPI (opcional)</label>
            <div class="impoclick-trademark-search">
                <input type="text" id="impoclick-trademark-input" class="impoclick-input impoclick-input-sm" placeholder="ex: JBL">
                <button id="impoclick-trademark-btn" class="impoclick-btn impoclick-btn-sm">Consultar</button>
            </div>
            <div id="impoclick-trademark-result"></div>
            </div>
        `;

        ligarSegmentados(container);
        ligarPublicidade(itemId);

        const feeValueEl = document.getElementById('impoclick-fee-value');
        const feeRow = document.getElementById('impoclick-fee-row');
        const tipoNota = document.getElementById('impoclick-tipo-nota');

        // Comissões das duas modalidades, de uma consulta só. Guardam o preço
        // consultado porque a tarifa fixa depende da faixa de preço: com preço
        // digitado à mão, a consulta é refeita na hora de calcular.
        let comissoes = null;
        let precoDasComissoes = null;
        let categoriaId = null;

        const tipoEscolhido = () => valorSeg('impoclick-tipo-seg') || 'gold_special';

        function desenharComissao() {
            container.querySelectorAll('.impoclick-seg-taxa').forEach((el) => {
                const c = comissoes && comissoes[el.dataset.taxa];
                el.textContent = c ? percentBR(c.pct) : '';
            });

            const tipo = tipoEscolhido();
            const c = comissoes && comissoes[tipo];
            if (c) {
                feeValueEl.textContent = pageData.price ? formatBRL(valorDaComissao(c, pageData.price)) : descreverComissao(c);
            }
            // A tarifa fixa vai numa nota, e não na linha: junto do valor, a
            // linha ficava comprida demais para a largura do painel, e a nota
            // ainda explica de onde vem um custo que o percentual não mostra.
            const fixoNota = document.getElementById('impoclick-fixo-nota');
            const temFixo = !!(c && c.fixo > 0 && pageData.price);
            fixoNota.textContent = temFixo
                ? `Inclui ${formatBRL(c.fixo)} de tarifa fixa por unidade, que o Mercado Livre cobra nos itens de menor valor.`
                : '';
            fixoNota.classList.toggle('impoclick-hidden', !temFixo);

            // Escolher o tipo que o anúncio não tem é simulação, e a tela diz
            // isso — senão o número passa por comissão real do anúncio.
            let nota = '';
            if (!pageData.listingType) {
                nota = 'Não consegui ler o tipo deste anúncio na página. Escolha acima qual comissão usar.';
            } else if (tipo !== pageData.listingType) {
                nota = `Simulação: este anúncio hoje é ${ROTULO_TIPO[pageData.listingType]}.`;
            }
            tipoNota.textContent = nota;
            tipoNota.classList.toggle('impoclick-hidden', !nota);
        }

        async function consultarComissoes(preco) {
            if (!categoriaId) return null;
            // Sem listingType: a resposta já traz todas as modalidades em
            // `options`, e uma chamada serve às duas.
            const feeResp = await sendMessage({ type: 'GET_FEE', price: preco, categoryId: categoriaId });
            if (feeResp && feeResp.fee) {
                comissoes = comissoesPorTipo(feeResp.fee, preco);
                precoDasComissoes = preco;
            }
            return feeResp;
        }

        function avisarAbaixoDaTaxa(texto) {
            const note = document.createElement('div');
            note.className = 'impoclick-note';
            note.textContent = texto;
            feeRow.after(note);
        }

        if (pageData.title) {
            const catResp = await sendMessage({ type: 'RESOLVE_CATEGORY', query: pageData.title });
            if (catResp && catResp.category) {
                categoriaId = catResp.category.categoryId;
                const feeResp = await consultarComissoes(pageData.price || 100);
                if (!comissoes || !Object.keys(comissoes).length) {
                    feeValueEl.textContent = '—';
                    const isNotConnected = feeResp && feeResp.error && /não conectada/i.test(feeResp.error);
                    avisarAbaixoDaTaxa(isNotConnected
                        ? 'Conecte sua conta do Mercado Livre em Configurações no site Impoclick para ver a taxa real.'
                        : ((feeResp && feeResp.error) || 'Não foi possível calcular a taxa real — usando estimativa de 13%.'));
                }
            } else {
                feeValueEl.textContent = '—';
                avisarAbaixoDaTaxa('Não foi possível identificar a categoria — usando estimativa de 13% na taxa.');
            }
        } else {
            feeValueEl.textContent = '—';
        }
        desenharComissao();

        document.getElementById('impoclick-frete-seg').addEventListener('click', (e) => {
            if (!e.target.closest('.impoclick-seg-opt')) return;
            chrome.storage.local.set({ ofereceFreteGratis: valorSeg('impoclick-frete-seg') === 'true' }).catch(() => {});
        });

        document.getElementById('impoclick-tipo-seg').addEventListener('click', (e) => {
            if (!e.target.closest('.impoclick-seg-opt')) return;
            // ligarSegmentados já trocou o valor (o ouvinte dele foi registrado
            // antes). Aqui a tela acompanha e, se já havia resultado, a conta é
            // refeita com a comissão nova — senão o veredito ficaria de outra
            // modalidade que não a marcada.
            desenharComissao();
            const resultEl = document.getElementById('impoclick-result');
            if (resultEl && resultEl.dataset.calculado === '1') document.getElementById('impoclick-calc-btn').click();
        });

        document.getElementById('impoclick-calc-btn').addEventListener('click', async () => {
            const resultEl = document.getElementById('impoclick-result');
            const priceInput = document.getElementById('impoclick-price-input');
            const price = pageData.price || parseFloat(priceInput ? priceInput.value : NaN);
            const cost = parseFloat(document.getElementById('impoclick-cost-input').value);
            const taxPct = parseFloat(document.getElementById('impoclick-tax-input').value) || 0;

            if (!price || price <= 0) {
                resultEl.innerHTML = '<p class="impoclick-text impoclick-error">Informe o preço do anúncio.</p>';
                return;
            }
            if (!cost || cost <= 0) {
                resultEl.innerHTML = '<p class="impoclick-text impoclick-error">Informe seu custo final de importação.</p>';
                return;
            }

            const weight = parseFloat(document.getElementById('impoclick-weight-input').value);
            const length = parseFloat(document.getElementById('impoclick-length-input').value);
            const width = parseFloat(document.getElementById('impoclick-width-input').value);
            const height = parseFloat(document.getElementById('impoclick-height-input').value);
            const hasAllDims = weight > 0 && length > 0 && width > 0 && height > 0;
            const freeShippingChecked = { value: valorSeg('impoclick-frete-seg') };
            const freeShipping = freeShippingChecked ? freeShippingChecked.value === 'true' : false;

            // Comissão da modalidade marcada. Com preço digitado à mão, a
            // consulta é refeita nesse preço: a tarifa fixa depende da faixa.
            const tipo = tipoEscolhido();
            if (categoriaId && precoDasComissoes !== price) {
                await consultarComissoes(price);
                desenharComissao();
            }
            const c = comissoes && comissoes[tipo];
            const comissao = c ? { tipo, pct: c.pct, fixo: c.fixo } : null;

            let freightCost = 0;
            let freightNote = null;
            let freteResolvido = false;

            // Com medidas, o frete é o da sua conta com elas. Sem medidas, pelo
            // id do anúncio: o Mercado Livre usa as que estão cadastradas nele
            // (é o mesmo produto). O tipo vai junto porque o desconto de frete
            // do ML muda entre Clássico e Premium.
            if (hasAllDims || itemId) {
                resultEl.innerHTML = '<p class="impoclick-text">Calculando frete real...</p>';
                const freightResp = await sendMessage({
                    type: 'GET_FREIGHT',
                    price,
                    freeShipping,
                    listingType: tipo,
                    itemId,
                    weight: hasAllDims ? weight : null,
                    length: hasAllDims ? length : null,
                    width: hasAllDims ? width : null,
                    height: hasAllDims ? height : null,
                });
                const f = freightResp && freightResp.freight;
                const hist = freightResp && freightResp.historico;
                if (f && typeof f.cost === 'number' && f.cost > 0 && hist) {
                    // O que você pagou em envios de peso parecido vale mais do
                    // que a cotação, que é aproximada e para o país todo.
                    freteResolvido = true;
                    freightCost = hist.custo;
                    freightNote = `Pelo seu histórico: mediana do que você pagou em ${hist.amostras} envios com peso faturável entre ${pesoBR(hist.pesoMinG)} e ${pesoBR(hist.pesoMaxG)}. A cotação do Mercado Livre era ${formatBRL(f.cost)}.`
                        + (f.freteGratisObrigatorio ? ' Neste preço o frete grátis é obrigatório.' : '');
                } else if (f && typeof f.cost === 'number') {
                    freteResolvido = true;
                    freightCost = f.cost;

                    // Um zero solto parece defeito. Acima do limite de preço do
                    // ML o frete grátis é obrigatório e o vendedor paga mesmo
                    // marcando "não ofereço" — quando isso acontece, o backend
                    // devolve freteGratisObrigatorio e o custo da modalidade que
                    // realmente vale.
                    if (f.freteGratisObrigatorio) {
                        freightNote = 'Neste preço o Mercado Livre exige frete grátis, então o custo é seu mesmo marcando "não ofereço".';
                    } else if (freightCost === 0 && typeof f.custoOferecendoFreteGratis === 'number' && f.custoOferecendoFreteGratis > 0) {
                        freightNote = `Abaixo de R$ 79 o frete não sai do seu bolso: fica com o comprador ou com o Mercado Livre. Se você oferecesse frete grátis por conta própria, custaria ${formatBRL(f.custoOferecendoFreteGratis)} por venda.`;
                    } else if (!hasAllDims) {
                        freightNote = 'Frete calculado com as medidas cadastradas neste anúncio. Preencha as do seu produto acima para mais precisão.';
                    }
                } else if (freightResp && (freightResp.error === 'not_logged_in' || freightResp.error === 'sem_rede')) {
                    // Sessão expirada e internet caída não são falha de frete, e
                    // cada uma tem conserto diferente.
                    freteResolvido = true;
                    freightNote = freightResp.error === 'sem_rede'
                        ? 'Sem conexão para calcular o frete agora — resultado abaixo sem frete.'
                        : 'Sua sessão do Impoclick expirou. Abra a extensão e entre novamente para calcular o frete.';
                } else if (hasAllDims) {
                    freteResolvido = true;
                    freightNote = 'Não foi possível calcular o frete real agora — resultado abaixo sem frete.';
                }
            }

            // Sem cotação, a resposta depende do que VOCÊ oferece, não do que o
            // anúncio de outro vendedor mostra. A versão anterior descontava o
            // frete que o comprador paga no anúncio alheio como se fosse custo
            // seu, e a margem saía menor do que a real.
            if (!freteResolvido) {
                freightNote = freeShipping
                    ? 'Com frete grátis o envio sai do seu bolso. Preencha peso e dimensões acima para incluir esse custo.'
                    : 'Abaixo de R$ 79, sem frete grátis, o envio não sai do seu bolso. A partir de R$ 79 o frete grátis é obrigatório — preencha peso e dimensões para calcular esse custo.';
            }

            computeAndRenderVerdict(resultEl, price, comissao, cost, freightCost, freightNote, taxPct);
            resultEl.dataset.calculado = '1';
        });

        document.getElementById('impoclick-trademark-btn').addEventListener('click', async () => {
            const input = document.getElementById('impoclick-trademark-input');
            const trademarkResultEl = document.getElementById('impoclick-trademark-result');
            const query = input.value.trim();
            if (query.length < 2) {
                trademarkResultEl.innerHTML = '<p class="impoclick-text impoclick-error">Digite pelo menos 2 caracteres.</p>';
                return;
            }
            trademarkResultEl.innerHTML = '<p class="impoclick-text">Consultando INPI...</p>';
            const resp = await sendMessage({ type: 'CHECK_TRADEMARK', query });
            if (resp.error) {
                const isNotConnected = resp.error === 'not_logged_in' || /não conectada/i.test(resp.error);
                trademarkResultEl.innerHTML = `<p class="impoclick-text impoclick-error">${
                    isNotConnected ? 'Faça login na extensão para consultar.' : escapeHtml(resp.error)
                }</p>`;
                return;
            }
            renderTrademarkResults(trademarkResultEl, resp.trademark);
        });
    }

    function removePanel() {
        const existing = document.getElementById('impoclick-panel');
        if (existing) existing.remove();
    }

    // ── Ligação com a página ────────────────────────────────────────────
    // O side panel não enxerga o DOM do Mercado Livre, então pede os dados
    // raspados à aba ativa. Se a aba não for do ML, o content script nem
    // existe lá e a mensagem falha — esse é o caso normal de "o painel está
    // aberto numa aba qualquer", não um erro.
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

    async function pedirDadosDaPagina() {
        const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!aba || !aba.id) return null;

        const url = aba.url || '';
        const ehML = url.includes('mercadolivre.com.br') || url.includes('mercadolibre.com');

        // Numa navegação recém-iniciada o content script ainda não subiu e a
        // mensagem falha. Numa aba do Mercado Livre isso é "espere um pouco",
        // não "não é anúncio" — sem a segunda tentativa o painel piscava
        // "abra um anúncio" no meio de cada troca de produto.
        for (let tentativa = 0; tentativa < (ehML ? 3 : 1); tentativa++) {
            if (tentativa > 0) await esperar(400);
            try {
                return await chrome.tabs.sendMessage(aba.id, { type: 'GET_PAGE_DATA' });
            } catch (e) {
                // Sem ouvinte do outro lado: tenta de novo se ainda vale.
            }
        }
        return null;
    }

    function avisar(html) {
        document.getElementById('impoclick-aviso').innerHTML = html;
        document.getElementById('impoclick-panel-tabs').classList.add('impoclick-hidden');
        document.getElementById('impoclick-panel-content').classList.add('impoclick-hidden');
        document.getElementById('impoclick-panel-analise').classList.add('impoclick-hidden');
    }

    // Uma troca de aba pode chegar enquanto a anterior ainda está renderizando.
    // O carimbo descarta o resultado que chegou tarde, senão o painel mostraria
    // o anúncio da aba que o usuário acabou de deixar.
    let rodadaAtual = 0;

    async function atualizar() {
        const rodada = ++rodadaAtual;

        const { session } = await sendMessage({ type: 'GET_SESSION' });
        if (rodada !== rodadaAtual) return;

        if (!session) {
            avisar('<p class="impoclick-text">Clique no ícone da extensão <strong>Impoclick</strong> na barra do navegador para entrar com sua conta.</p>');
            return;
        }

        const dados = await pedirDadosDaPagina();
        if (rodada !== rodadaAtual) return;

        if (!dados || !dados.isProductPage) {
            avisar('<p class="impoclick-text">Abra um anúncio no Mercado Livre para ver a viabilidade e a análise aqui.</p>');
            return;
        }

        document.getElementById('impoclick-aviso').innerHTML = '';
        document.getElementById('impoclick-panel-tabs').classList.remove('impoclick-hidden');

        const abaAnalise = document.querySelector('.impoclick-tab-active').dataset.tab === 'analise';
        document.getElementById('impoclick-panel-content').classList.toggle('impoclick-hidden', abaAnalise);
        document.getElementById('impoclick-panel-analise').classList.toggle('impoclick-hidden', !abaAnalise);

        setupAnalyzeTab(dados.pageData, true, dados.itemId);
        await renderCalculator(document.getElementById('impoclick-panel-content'), dados.pageData, dados.itemId);
    }

    document.querySelectorAll('.impoclick-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.impoclick-tab').forEach((b) => b.classList.remove('impoclick-tab-active'));
            btn.classList.add('impoclick-tab-active');
            const ehAnalise = btn.dataset.tab === 'analise';
            document.getElementById('impoclick-panel-content').classList.toggle('impoclick-hidden', ehAnalise);
            document.getElementById('impoclick-panel-analise').classList.toggle('impoclick-hidden', !ehAnalise);
        });
    });

    // Uma troca de produto dispara mais de um gatilho quase junto (a navegação
    // e o aviso do content script). Sem agrupar, renderCalculator sairia
    // consultando categoria e tarifa duas ou três vezes para o mesmo anúncio.
    let esperaAtualizacao = null;
    function agendarAtualizacao() {
        clearTimeout(esperaAtualizacao);
        esperaAtualizacao = setTimeout(atualizar, 250);
    }

    // Os dois primeiros gatilhos são redundantes de propósito: o aviso do
    // content script não chega se ele ainda não subiu na página nova, e sem o
    // segundo caminho o painel ficava preso no anúncio anterior.
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'PAGE_CHANGED') agendarAtualizacao();
    });

    chrome.tabs.onUpdated.addListener(async (tabId, info) => {
        if (!info.url && info.status !== 'complete') return;
        const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (ativa && ativa.id === tabId) agendarAtualizacao();
    });

    chrome.tabs.onActivated.addListener(() => agendarAtualizacao());

    chrome.storage.onChanged.addListener((mudancas, area) => {
        if (area === 'local' && mudancas.session) agendarAtualizacao();
    });

    atualizar();
})();
