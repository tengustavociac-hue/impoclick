(function () {
    // O Mercado Livre usa vários formatos de URL pra página de produto (o
    // permalink clássico "MLB-123456789", páginas de catálogo "/p/MLB...",
    // e páginas "unificadas" mais novas "/up/MLBU..." — e isso muda com o
    // tempo). Em vez de tentar prever todo formato de URL, detectamos pelo
    // próprio conteúdo da página: se tem título e preço de produto visíveis,
    // é uma página de compra, não importa a URL.
    function looksLikeProductPage() {
        // Páginas de RESULTADOS (busca, lista) também têm um <h1> genérico
        // (breadcrumb, ex: "Mop x10") e várias ".andes-money-amount__fraction"
        // (uma por card), então esses dois sozinhos davam falso positivo e
        // confundiam página de busca com página de produto. O contêiner da
        // grade de resultados só existe em página de busca — se ele existir,
        // definitivamente NÃO é uma página de produto único, não importa
        // o que mais tenha na página.
        if (document.querySelector('.ui-search-results, ol.ui-search-layout, [class*="ui-search-layout"]')) {
            return false;
        }
        const hasTitle = !!(document.querySelector('h1.ui-pdp-title') || document.querySelector('h1'));
        const hasPrice = !!document.querySelector('.andes-money-amount__fraction');
        return hasTitle && hasPrice;
    }

    // A API do Mercado Livre não permite consultar anúncios de outros
    // vendedores (nem anônima, nem autenticada — só os próprios itens do
    // token OAuth usado). Por isso título e preço são lidos direto da
    // página já renderizada no navegador, do mesmo jeito que o usuário está
    // vendo na tela. Os seletores são os do design system atual do ML
    // (Andes) — se o layout deles mudar, isso pode parar de encontrar o
    // preço automaticamente (por isso o campo manual como respaldo abaixo).
    function extractPageData() {
        let title = null;
        const titleEl = document.querySelector('h1.ui-pdp-title') || document.querySelector('h1');
        if (titleEl) title = titleEl.textContent.trim();
        if (!title) title = document.title.replace(/\s*[-|]\s*(MercadoLivre|Mercado Livre).*$/i, '').trim();

        let price = null;
        const priceContainer =
            document.querySelector('.ui-pdp-price__second-line .andes-money-amount') ||
            document.querySelector('.ui-pdp-price .andes-money-amount') ||
            document.querySelector('.andes-money-amount');
        if (priceContainer) {
            const fraction = priceContainer.querySelector('.andes-money-amount__fraction');
            const cents = priceContainer.querySelector('.andes-money-amount__cents');
            if (fraction) {
                const intPart = fraction.textContent.replace(/\D/g, '');
                const centPart = cents ? cents.textContent.replace(/\D/g, '').padEnd(2, '0').slice(0, 2) : '00';
                if (intPart) price = parseFloat(`${intPart}.${centPart}`);
            }
        }
        if (!price) {
            const match = document.body.innerText.match(/R\$\s*([\d.]+),(\d{2})/);
            if (match) price = parseFloat(match[1].replace(/\./g, '') + '.' + match[2]);
        }

        return { title, price, shipping: extractShippingInfo(), dims: extractSpecDimensions() };
    }

    function parseWeightToGrams(text) {
        const m = text.match(/([\d.,]+)\s*(kg|g|gramas?|quilos?)/i);
        if (!m) return null;
        let value = parseFloat(m[1].replace(',', '.'));
        if (isNaN(value)) return null;
        if (/kg|quilo/i.test(m[2])) value *= 1000;
        return value;
    }

    function parseLengthToCm(text) {
        const m = text.match(/([\d.,]+)\s*(cm|mm|metros?|m)\b/i);
        if (!m) return null;
        let value = parseFloat(m[1].replace(',', '.'));
        if (isNaN(value)) return null;
        if (/mm/i.test(m[2])) value /= 10;
        else if (/^(m|metros?)$/i.test(m[2])) value *= 100;
        return value;
    }

    // ---------------------------------------------------------------------
    // ANÁLISE DE TÍTULO E ATRIBUTOS
    //
    // O Mercado Livre indexa só os ~30 primeiros caracteres de cada campo da
    // ficha técnica. Como esses campos entram na busca junto com o título,
    // repetir neles uma palavra que já está no título desperdiça esse espaço
    // — o ideal é usar termos complementares (sinônimos, uso,
    // compatibilidade) que ampliem por quantas buscas diferentes o anúncio
    // pode ser achado.
    //
    // Os dados analisados vêm da API (action=analise), não da página: a
    // análise é uma auditoria dos anúncios da própria conta, e a API entrega
    // todos os atributos com o valor exato — a página mostra só parte deles,
    // já formatada pra leitura.
    // ---------------------------------------------------------------------
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
    function stripVariationSuffix(title, variationValues) {
        let text = normalizeText(title);
        const removed = [];
        if (!variationValues || !variationValues.length) return { text, removed };

        let cortou = true;
        while (cortou) {
            cortou = false;
            for (const raw of variationValues) {
                const valor = normalizeText(raw);
                if (!valor || text.length <= valor.length) continue;

                const sufixo = text.slice(-(valor.length + 1));
                if (foldCase(sufixo) === foldCase(` ${valor}`)) {
                    text = text.slice(0, -(valor.length + 1)).trim();
                    removed.unshift(valor);
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
    function extractItemId() {
        const url = window.location.href;

        // Nas páginas /up/ (produto unificado) o MLBU... do caminho é o id do
        // PRODUTO, não do anúncio — vários vendedores dividem a mesma página.
        // O anúncio que está sendo exibido vem no parâmetro wid. Sem ler isso
        // primeiro, a busca caía na varredura do HTML lá embaixo e pegava o
        // primeiro MLB que aparecesse, que numa página com carrossel de
        // recomendados costuma ser um anúncio completamente diferente.
        const fromWid = url.match(/[?&#]wid=(MLB\d+)/i);
        if (fromWid) return fromWid[1].toUpperCase();

        const fromParam = url.match(/item_id[=:](MLB\d+)/i);
        if (fromParam) return fromParam[1].toUpperCase();

        const fromPermalink = url.match(/\/(MLB)-?(\d{6,})/i);
        if (fromPermalink) return (fromPermalink[1] + fromPermalink[2]).toUpperCase();

        const html = document.documentElement.innerHTML;
        const fromHtml = html.match(/"item_id"\s*:\s*"(MLB\d+)"/i)
            || html.match(/\bitemId["'\s:=]+(MLB\d+)/i)
            || html.match(/\/(MLB\d{8,})\b/);
        if (fromHtml) return fromHtml[1].toUpperCase();

        return null;
    }

    // Não dá pra saber quanto o VENDEDOR daquele anúncio paga de frete (é
    // dado privado da conta dele, e nem seria o número certo — depende da
    // reputação/nível de cada vendedor). O que dá pra fazer é ler o peso e
    // as dimensões que o próprio anúncio declara na ficha técnica, e usar
    // isso com a taxa de frete da SUA conta — que é o número que importa
    // pra sua decisão.
    function extractSpecDimensions() {
        const specs = {};
        document.querySelectorAll('table tr, .andes-table__row').forEach((row) => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length >= 2) {
                const key = cells[0].textContent.trim().toLowerCase();
                const value = cells[1].textContent.trim();
                if (key && value) specs[key] = value;
            }
        });

        const findValue = (patterns) => {
            for (const [key, value] of Object.entries(specs)) {
                if (patterns.some((p) => key.includes(p))) return value;
            }
            return null;
        };

        let weightText = findValue(['peso']);
        let lengthText = findValue(['comprimento']);
        let widthText = findValue(['largura']);
        let heightText = findValue(['altura']);

        const bodyText = document.body.innerText;
        if (!weightText) {
            const m = bodyText.match(/peso[^\d\n]{0,15}([\d.,]+\s*(?:kg|g|gramas?))/i);
            if (m) weightText = m[1];
        }
        if (!lengthText) {
            const m = bodyText.match(/comprimento[^\d\n]{0,15}([\d.,]+\s*(?:cm|mm|metros?|m)\b)/i);
            if (m) lengthText = m[1];
        }
        if (!widthText) {
            const m = bodyText.match(/largura[^\d\n]{0,15}([\d.,]+\s*(?:cm|mm|metros?|m)\b)/i);
            if (m) widthText = m[1];
        }
        if (!heightText) {
            const m = bodyText.match(/altura[^\d\n]{0,15}([\d.,]+\s*(?:cm|mm|metros?|m)\b)/i);
            if (m) heightText = m[1];
        }

        const weight = weightText ? parseWeightToGrams(weightText) : null;
        const length = lengthText ? parseLengthToCm(lengthText) : null;
        const width = widthText ? parseLengthToCm(widthText) : null;
        const height = heightText ? parseLengthToCm(heightText) : null;

        if (weight && length && width && height) {
            return { weight, length, width, height };
        }
        return null;
    }

    // Lê o frete mostrado no próprio anúncio (o que o COMPRADOR vê), como
    // atalho pra não precisar digitar peso/dimensões. Isso não é
    // necessariamente igual ao custo real de frete pra você como vendedor —
    // "frete grátis" no anúncio normalmente significa que o vendedor está
    // banca a Mercado Envios, não que ela custe zero. Por isso mostramos
    // isso separado do cálculo com peso/dimensões reais.
    function extractShippingInfo() {
        const bodyText = document.body.innerText;
        if (/frete\s*gr[aá]tis|chegar[aá]\s*gr[aá]tis|envio\s*gr[aá]tis/i.test(bodyText)) {
            return { cost: 0, isFree: true };
        }
        const match = bodyText.match(/(?:frete|envio|chegar[aá][^.\n]{0,25}?)\D{0,10}R\$\s*([\d.]+),(\d{2})/i);
        if (match) {
            return { cost: parseFloat(match[1].replace(/\./g, '') + '.' + match[2]), isFree: false };
        }
        return null;
    }

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

    // Sugere termos de busca reais da categoria (recurso /trends do ML, que
    // devolve o que os compradores digitaram na última semana) que o anúncio
    // ainda não cobre. Prioriza os que já têm relação com o produto — um
    // termo da categoria que não conversa com o título não serve de troca.
    function suggestKeywords(trends, titleAnalysis, attrAnalysis) {
        if (!trends || !trends.length) return null;

        // Tudo que o anúncio já diz, somando título, marca e modelo.
        const jaUsadas = new Set(titleAnalysis.words);
        attrAnalysis.forEach((a) => a.words && a.words.forEach((w) => jaUsadas.add(w)));
        attrAnalysis.forEach((a) => toWordSet(a.value).forEach((w) => jaUsadas.add(w)));

        const candidatos = trends
            .map((t) => {
                const palavras = toWordSet(t.keyword);
                const novas = palavras.filter((w) => !jaUsadas.has(w));
                const emComum = palavras.filter((w) => jaUsadas.has(w)).length;
                return { keyword: t.keyword, url: t.url || null, novas, emComum };
            })
            // Só interessa termo que acrescenta alguma palavra nova.
            .filter((c) => c.novas.length > 0);

        // Relacionados primeiro (compartilham ao menos uma palavra com o
        // anúncio); se a categoria for muito ampla e nada se relacionar,
        // ainda mostramos os mais buscados dela.
        const relacionados = candidatos.filter((c) => c.emComum > 0);
        const lista = relacionados.length >= 3 ? relacionados : candidatos;

        return lista
            .sort((a, b) => b.emComum - a.emComum || a.novas.length - b.novas.length)
            .slice(0, 6);
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

        checks.push({
            ok: item.hasVideo,
            weight: 5,
            label: item.hasVideo ? 'Tem vídeo' : 'Sem vídeo',
            detail: item.hasVideo ? null : 'Anúncio com vídeo converte mais e o ML trata como objetivo de qualidade.',
        });

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
                    <strong>${sales.sold} un.${sales.partial ? ' *' : ''}</strong>
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
            ${sales && sales.partial ? '<p class="impoclick-note">* A conta parou nos primeiros pedidos do período para não estourar o tempo da consulta — o total real pode ser maior.</p>' : ''}
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
        if (!repetidas.length && (!sugestoes || !sugestoes.length)) return '';

        const repetidasHtml = repetidas.length
            ? `
                <div class="impoclick-an-item impoclick-an-warn">
                    <strong>Palavras gastas mais de uma vez</strong>
                    <p>${repetidas.map((w) => `<span class="impoclick-kw-old">${escapeHtml(w)}</span>`).join(' ')}</p>
                    <p>Aparecem em mais de um dos três campos que o ML indexa como identidade do produto — Título, Marca e Modelo. Trocar por um termo que o anúncio ainda não tem amplia por quantas buscas ele aparece.</p>
                </div>
            `
            : '';

        const sugestoesHtml = (sugestoes && sugestoes.length)
            ? `
                <div class="impoclick-an-item impoclick-an-opp">
                    <strong>Termos buscados na categoria que faltam no anúncio</strong>
                    ${sugestoes.map((s) => `
                        <div class="impoclick-kw-row">
                            <span class="impoclick-kw-term">${escapeHtml(s.keyword)}</span>
                            <span class="impoclick-kw-new">${s.novas.map(escapeHtml).join(' · ')}</span>
                        </div>
                    `).join('')}
                    <p class="impoclick-note">Buscas reais dos compradores na última semana, do recurso /trends do Mercado Livre. À direita, as palavras de cada termo que o seu anúncio ainda não usa.</p>
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
        const sugestoes = suggestKeywords(data.trends, titleAnalysis, attrAnalysis);

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
    function setupAnalyzeTab(pageData, loggedIn) {
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

            const itemId = extractItemId();
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

    // O painel tem duas ferramentas independentes, cada uma na sua aba:
    // Viabilidade (o cálculo de custo x preço) e Análise (erros e melhorias
    // do anúncio). Ficavam juntas na mesma tela e uma atrapalhava a leitura
    // da outra.
    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'impoclick-panel';
        panel.innerHTML = `
            <div id="impoclick-panel-header">
                <span id="impoclick-panel-title">Impoclick</span>
                <button id="impoclick-panel-toggle" aria-label="Minimizar">–</button>
            </div>
            <div id="impoclick-panel-tabs">
                <button class="impoclick-tab impoclick-tab-active" data-tab="viab">Viabilidade</button>
                <button class="impoclick-tab" data-tab="analise">Análise</button>
            </div>
            <div id="impoclick-panel-body">
                <div id="impoclick-panel-content">Carregando anúncio...</div>
                <div id="impoclick-panel-analise" class="impoclick-hidden"></div>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('impoclick-panel-toggle').addEventListener('click', () => {
            const body = document.getElementById('impoclick-panel-body');
            const tabs = document.getElementById('impoclick-panel-tabs');
            const collapsed = body.classList.toggle('impoclick-hidden');
            tabs.classList.toggle('impoclick-hidden', collapsed);
            document.getElementById('impoclick-panel-toggle').textContent = collapsed ? '+' : '–';
        });

        panel.querySelectorAll('.impoclick-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.impoclick-tab').forEach((b) => b.classList.remove('impoclick-tab-active'));
                btn.classList.add('impoclick-tab-active');
                const isAnalise = btn.dataset.tab === 'analise';
                document.getElementById('impoclick-panel-content').classList.toggle('impoclick-hidden', isAnalise);
                document.getElementById('impoclick-panel-analise').classList.toggle('impoclick-hidden', !isAnalise);
            });
        });

        return document.getElementById('impoclick-panel-content');
    }

    function renderNotLoggedIn(container) {
        container.innerHTML = `
            <p class="impoclick-text">Clique no ícone da extensão <strong>Impoclick</strong> na barra do navegador para fazer login com sua conta.</p>
        `;
    }

    function computeAndRenderVerdict(resultEl, price, feePct, cost, freightCost, freightNote, taxPct) {
        const effectiveFeePct = feePct !== null ? feePct : 13; // fallback: taxa clássica média
        const feeAmount = price * (effectiveFeePct / 100);
        const freight = freightCost || 0;
        const effectiveTaxPct = taxPct || 0;
        const taxAmount = price * (effectiveTaxPct / 100);
        const netRevenue = price - feeAmount - freight - taxAmount;
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
            <div class="impoclick-verdict ${verdictClass}">${verdict}</div>
            <div class="impoclick-breakdown">
                <div class="impoclick-breakdown-row">
                    <span>Valor do produto</span>
                    <strong>${formatBRL(price)}</strong>
                </div>
                <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                    <span>(–) Comissão do Mercado Livre (${effectiveFeePct}%)</span>
                    <strong>${formatBRL(feeAmount)}</strong>
                </div>
                <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                    <span>(–) Frete da plataforma</span>
                    <strong>${formatBRL(freight)}</strong>
                </div>
                ${effectiveTaxPct > 0 ? `
                <div class="impoclick-breakdown-row impoclick-breakdown-minus">
                    <span>(–) Imposto sobre a venda (${effectiveTaxPct}%)</span>
                    <strong>${formatBRL(taxAmount)}</strong>
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
                    <strong>${formatBRL(diff)} (${marginPct.toFixed(1)}%)</strong>
                </div>
            </div>
            <p class="impoclick-note">${freightNote || 'Estimativa rápida. Para o cálculo completo, abra o Impoclick.'}</p>
        `;
    }

    async function renderCalculator(container, pageData) {
        const needsManualPrice = !pageData.price;
        const needsManualTitle = !pageData.title;

        container.innerHTML = `
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
            <div class="impoclick-row" id="impoclick-fee-row"><span>Taxa de venda (sua conta)</span><strong id="impoclick-fee-value">calculando...</strong></div>
            <div class="impoclick-row" id="impoclick-shipping-row"><span>Frete mostrado no anúncio</span><strong id="impoclick-shipping-value">${
                pageData.shipping
                    ? (pageData.shipping.isFree ? 'Grátis' : formatBRL(pageData.shipping.cost))
                    : 'não identificado'
            }</strong></div>
            ${pageData.shipping && pageData.shipping.isFree ? `<p class="impoclick-note">"Grátis" é o que aparece pro comprador — normalmente o vendedor ainda paga o frete real pra Mercado Envios. Preencha peso/dimensões abaixo pra ver esse custo real.</p>` : ''}
            <label class="impoclick-label" for="impoclick-cost-input">Seu custo final de importação (R$/un.)</label>
            <input type="number" id="impoclick-cost-input" class="impoclick-input" step="0.01" min="0" placeholder="ex: 45.00">

            <label class="impoclick-label" for="impoclick-tax-input">% de imposto pago na venda (opcional)</label>
            <input type="number" id="impoclick-tax-input" class="impoclick-input" step="0.01" min="0" max="100" placeholder="ex: 6 (Simples Nacional)">

            <label class="impoclick-label">Peso e dimensões do produto (pra calcular o frete real da sua conta)</label>
            ${pageData.dims ? '<p class="impoclick-note">Lido automaticamente da ficha técnica do anúncio — confira antes de calcular.</p>' : ''}
            <div class="impoclick-dim-grid">
                <input type="number" id="impoclick-weight-input" class="impoclick-input impoclick-input-sm" step="1" min="0" placeholder="Peso (g)" value="${pageData.dims ? Math.round(pageData.dims.weight) : ''}">
                <input type="number" id="impoclick-length-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Compr. (cm)" value="${pageData.dims ? pageData.dims.length : ''}">
                <input type="number" id="impoclick-width-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Larg. (cm)" value="${pageData.dims ? pageData.dims.width : ''}">
                <input type="number" id="impoclick-height-input" class="impoclick-input impoclick-input-sm" step="0.1" min="0" placeholder="Alt. (cm)" value="${pageData.dims ? pageData.dims.height : ''}">
            </div>
            <div class="impoclick-toggle-group" id="impoclick-freeshipping-toggle">
                <span class="impoclick-toggle-label">Você oferece frete grátis?</span>
                <label><input type="radio" name="impoclick-free-shipping" value="false" checked> Não</label>
                <label><input type="radio" name="impoclick-free-shipping" value="true"> Sim</label>
            </div>

            <button id="impoclick-calc-btn" class="impoclick-btn">Calcular viabilidade</button>
            <div id="impoclick-result"></div>

            <label class="impoclick-label" for="impoclick-trademark-input">Verificar marca no INPI (opcional)</label>
            <div class="impoclick-trademark-search">
                <input type="text" id="impoclick-trademark-input" class="impoclick-input impoclick-input-sm" placeholder="ex: JBL">
                <button id="impoclick-trademark-btn" class="impoclick-btn impoclick-btn-sm">Consultar</button>
            </div>
            <div id="impoclick-trademark-result"></div>
        `;

        let feePct = null;
        const feeValueEl = document.getElementById('impoclick-fee-value');
        const feeRow = document.getElementById('impoclick-fee-row');

        if (pageData.title) {
            const catResp = await sendMessage({ type: 'RESOLVE_CATEGORY', query: pageData.title });
            if (catResp.category) {
                const feeResp = await sendMessage({
                    type: 'GET_FEE',
                    price: pageData.price || 100,
                    categoryId: catResp.category.categoryId,
                });
                if (feeResp.fee) {
                    feePct = feeResp.fee.percentageFee;
                    feeValueEl.textContent = `${feePct}%`;
                } else {
                    feeValueEl.textContent = '—';
                    const isNotConnected = feeResp.error && /não conectada/i.test(feeResp.error);
                    const note = document.createElement('div');
                    note.className = 'impoclick-note';
                    note.textContent = isNotConnected
                        ? 'Conecte sua conta do Mercado Livre em Configurações no site Impoclick para ver a taxa real.'
                        : (feeResp.error || 'Não foi possível calcular a taxa real — usando estimativa de 13%.');
                    feeRow.after(note);
                }
            } else {
                feeValueEl.textContent = '—';
                const note = document.createElement('div');
                note.className = 'impoclick-note';
                note.textContent = 'Não foi possível identificar a categoria — usando estimativa de 13% na taxa.';
                feeRow.after(note);
            }
        } else {
            feeValueEl.textContent = '—';
        }

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
            const freeShippingChecked = document.querySelector('input[name="impoclick-free-shipping"]:checked');
            const freeShipping = freeShippingChecked ? freeShippingChecked.value === 'true' : false;

            let freightCost = 0;
            let freightNote = null;

            if (hasAllDims) {
                // Peso/dimensões preenchidos: usa o cálculo real da sua conta
                // (mais preciso, respeita a modalidade escolhida acima).
                resultEl.innerHTML = '<p class="impoclick-text">Calculando frete real...</p>';
                const freightResp = await sendMessage({ type: 'GET_FREIGHT', price, weight, length, width, height, freeShipping });
                if (freightResp.freight && typeof freightResp.freight.cost === 'number') {
                    freightCost = freightResp.freight.cost;
                } else {
                    freightNote = 'Não foi possível calcular o frete real agora — resultado abaixo sem frete.';
                }
            } else if (pageData.shipping && !pageData.shipping.isFree) {
                // Sem peso/dimensões, mas o anúncio mostra um frete com valor
                // — usa esse valor lido da página como aproximação.
                freightCost = pageData.shipping.cost;
                freightNote = 'Usando o frete mostrado no anúncio como aproximação. Preencha peso/dimensões acima pra um valor mais preciso.';
            } else if (pageData.shipping && pageData.shipping.isFree) {
                freightNote = 'O anúncio mostra "frete grátis" pro comprador, mas isso não é o custo real pro vendedor — preencha peso/dimensões acima pra ver o valor real.';
            } else {
                freightNote = 'Preencha peso e dimensões acima pra incluir o frete no cálculo.';
            }

            computeAndRenderVerdict(resultEl, price, feePct, cost, freightCost, freightNote, taxPct);
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

    async function init() {
        if (!looksLikeProductPage()) return;

        const container = buildPanel();
        const pageData = extractPageData();

        const session = await sendMessage({ type: 'GET_SESSION' });
        const loggedIn = !!session.session;

        // A aba Análise é montada nos dois casos: a parte lida da página não
        // depende de login nem de rede, e a Viabilidade abaixo ainda vai
        // esperar as consultas de categoria e taxa.
        setupAnalyzeTab(pageData, loggedIn);

        if (!loggedIn) {
            renderNotLoggedIn(container);
            return;
        }

        await renderCalculator(container, pageData);
    }

    function removePanel() {
        const existing = document.getElementById('impoclick-panel');
        if (existing) existing.remove();
    }

    // Marca visualmente os produtos de CATÁLOGO (/p/MLB...) direto nos
    // resultados de busca, listas, carrosséis etc — pra identificar sem
    // precisar clicar em cada um. Catálogo = produto com vários vendedores
    // concorrendo na mesma página (geralmente os mais procurados).
    //
    // O crachá é posicionado com coordenadas absolutas da PÁGINA (não do
    // link) e anexado direto no <body> — colocar como filho do link corria
    // o risco de "grudar" num elemento interno do card do ML que também
    // tem position relative/absolute (ex: o container da imagem), fazendo
    // o crachá aparecer no meio do card em vez do canto.
    const catalogBadges = new Map(); // link -> elemento do crachá

    // Canto superior DIREITO do link (não esquerdo) — usa a borda direita
    // como referência e desloca o próprio crachá pra trás com transform,
    // assim não precisa saber a largura do crachá de antemão.
    function positionBadge(link, badge) {
        const rect = link.getBoundingClientRect();
        badge.style.top = `${rect.top + window.scrollY + 6}px`;
        badge.style.left = `${rect.right + window.scrollX - 6}px`;
        badge.style.transform = 'translateX(-100%)';
    }

    // Cards do ML costumam ter mais de um link pro mesmo produto (imagem,
    // título, carrossel de miniaturas...) — sem agrupar por produto, isso
    // cria um crachá por link. Agrupamos por ID do produto e ficamos com o
    // link de MAIOR ÁREA visível — na prática, é sempre o que envolve a
    // foto principal do card, não importa a estrutura exata do HTML.
    function markCatalogLinks() {
        const links = Array.from(document.querySelectorAll('a[href*="/p/MLB"]:not([data-impoclick-marked])'));
        const byProductId = new Map();
        links.forEach((link) => {
            const idMatch = link.href.match(/\/p\/(MLB\d+)/i);
            const productId = idMatch ? idMatch[1] : link.href;
            const rect = link.getBoundingClientRect();
            const area = rect.width * rect.height;
            const existing = byProductId.get(productId);
            if (!existing || area > existing.area) {
                byProductId.set(productId, { link, area });
            }
        });

        links.forEach((link) => { link.dataset.impoclickMarked = '1'; });

        byProductId.forEach(({ link }) => {
            const badge = document.createElement('span');
            badge.className = 'impoclick-catalog-badge';
            badge.textContent = 'CATÁLOGO';
            document.body.appendChild(badge);
            positionBadge(link, badge);
            catalogBadges.set(link, badge);
        });
    }

    // Limpa qualquer crachá remanescente de uma marcação anterior (ex: uma
    // corrida em que markCatalogLinks rodou antes do h1/preço existirem no
    // DOM e looksLikeProductPage() ainda não detectava a página de produto).
    function removeCatalogBadges() {
        catalogBadges.forEach((badge) => badge.remove());
        catalogBadges.clear();
        document.querySelectorAll('a[data-impoclick-marked]').forEach((link) => {
            delete link.dataset.impoclickMarked;
        });
    }

    function repositionCatalogBadges() {
        catalogBadges.forEach((badge, link) => {
            if (!link.isConnected) {
                badge.remove();
                catalogBadges.delete(link);
                return;
            }
            positionBadge(link, badge);
        });
    }

    window.addEventListener('resize', repositionCatalogBadges);

    function start() {
        removePanel();
        init();
        // Marcar links de catálogo só faz sentido em páginas de RESULTADOS
        // (busca, listas, carrosséis) — numa página de produto/catálogo
        // individual (a que o usuário já está vendo), a própria página tem
        // vários links "/p/MLB..." pra coisas como título, cor, tamanho, que
        // não são cards de busca e confundiam a marcação (ex: o link do
        // título é uma barra larga e baixa, com mais área que a miniatura
        // da foto, e "ganhava" o crachá por engano).
        if (looksLikeProductPage()) {
            removeCatalogBadges();
        } else {
            markCatalogLinks();
        }
    }

    start();

    // Login feito no popup atualiza o painel sem precisar recarregar a página.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.session) start();
    });

    // Mercado Livre é uma SPA — troca de anúncio nem sempre recarrega a
    // página, então observamos a URL e reconstruímos o painel quando muda.
    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            start();
        }
    }, 1000);

    // Resultados de busca carregam aos poucos (scroll infinito, paginação
    // via SPA) — observamos novos links aparecendo no DOM pra marcar os
    // produtos de catálogo que ainda não tinham sido renderizados.
    let markDebounce = null;
    const observer = new MutationObserver(() => {
        clearTimeout(markDebounce);
        markDebounce = setTimeout(() => {
            if (!looksLikeProductPage()) {
                markCatalogLinks();
            }
            repositionCatalogBadges();
        }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
