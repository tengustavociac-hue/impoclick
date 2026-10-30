// Script de conteúdo do Impoclick.
//
// O painel de viabilidade saiu daqui: agora ele vive no side panel do Chrome
// (sidepanel.html/js), encaixado na lateral da janela em vez de flutuar por
// cima do anúncio. O que sobrou é o que só pode ser feito de dentro da
// página: ler os dados do anúncio e marcar os produtos de catálogo nos
// resultados de busca.
(function () {
    // Caminhos da área logada do vendedor/comprador. A tela de EDIÇÃO de anúncio
    // tem <h1> com o título e um campo de preço, então passava por todas as
    // heurísticas abaixo e o painel aparecia no meio do formulário de edição.
    // Bloquear por URL é determinístico e não depende do HTML deles.
    const CAMINHOS_AREA_DO_VENDEDOR = [
        '/anuncios', '/publicacoes', '/publicaciones', '/publicar', '/listado',
        '/vendas', '/ventas', '/compras', '/perguntas', '/preguntas',
        '/mensagens', '/mensajes', '/reputacao', '/reputacion',
        '/minha-conta', '/mi-cuenta', '/preferencias', '/faturamento',
        '/central-de-vendedores', '/vendedores', '/hub',
        '/mercadoenvios', '/mercado-envios', '/envios',
        '/gerenciador', '/administrador', '/metricas', '/estatisticas',
    ];

    function ehAreaDoVendedor() {
        const host = location.hostname.toLowerCase();
        // Subdomínios que são só painel: nunca têm página de produto.
        if (/^(myaccount|vendedores|seller|sellercentral|envios)\./.test(host)) return true;

        const caminho = location.pathname.toLowerCase();
        return CAMINHOS_AREA_DO_VENDEDOR.some(
            (prefixo) => caminho === prefixo || caminho.startsWith(prefixo + '/')
        );
    }

    // Página "Outras opções de compra" do catálogo: lista as ofertas de TODOS os
    // vendedores do produto. Ela tem <h1> e preços, então passava como página de
    // produto e o cartão era injetado dentro da primeira linha da tabela, com os
    // dados vazios e quebrando o layout.
    //
    // A prova não usa classe do Mercado Livre nem a URL: uma página de produto
    // tem UM par de botões de compra; a lista de ofertas tem um par por
    // vendedor. Contar é o sinal mais estável que existe aqui.
    // Contar botões de compra NÃO serve: a página de produto tem o bloco
    // "Outras opções de compra" com botões extras, e o limiar de 3 classificava
    // o próprio anúncio como lista de ofertas — o cartão sumia do produto e o
    // painel de busca aparecia em cima dele.
    //
    // O que só existe na lista é o CABEÇALHO da tabela, com quatro rótulos
    // fixos. Exigir três dos quatro é específico o bastante.
    const ROTULOS_TABELA_OFERTAS = ['preço', 'preco', 'condição', 'condicao', 'forma de entrega', 'vendedor'];

    function ehListaDeOfertas() {
        const achados = new Set();
        for (const el of document.querySelectorAll('th, td, span, div, p, h2, h3')) {
            if (el.children.length) continue;
            const t = (el.textContent || '').trim().toLowerCase();
            if (!t || t.length > 20) continue;
            if (ROTULOS_TABELA_OFERTAS.indexOf(t) !== -1) {
                // Normaliza acento para não contar "preço" e "preco" como dois.
                achados.add(t.replace('ç', 'c').replace('ã', 'a'));
                if (achados.size >= 3) return true;
            }
        }
        return false;
    }

    // Endereço de anúncio, nas três formas que o Mercado Livre usa:
    //   produto.mercadolivre.com.br/MLB-123456789-nome   (anúncio tradicional)
    //   www.mercadolivre.com.br/nome/p/MLB123            (catálogo)
    //   www.mercadolivre.com.br/nome/up/MLBU123          (produto do vendedor)
    // Página inicial, categoria, loja e ofertas nunca têm esse formato.
    function urlDeAnuncio() {
        const caminho = location.pathname;
        return /\/p\/ML[A-Z]\d{5,}/i.test(caminho)
            || /\/up\/ML[A-Z]U\d{5,}/i.test(caminho)
            // 8+ dígitos: anúncio tem 9 ou 10; código de categoria, até uns 6
            // (/mais-vendidos/MLB271599 não é anúncio).
            || /(^|\/)ML[A-Z]-?\d{8,}/i.test(caminho);
    }

    function looksLikeProductPage() {
        // Primeira porta, e a única que não depende do HTML do Mercado Livre.
        if (ehAreaDoVendedor()) return false;
        if (ehListaDeOfertas()) return false;

        // Prova POSITIVA de anúncio: o endereço, ou a estrutura própria da página
        // de anúncio. Antes bastava qualquer <h1> e qualquer preço, e a página
        // inicial tem os dois (título de seção e os carrosséis de oferta): o
        // cartão aparecia lá, vazio e com o preço de um item qualquer. Os dois
        // sinais juntos mantêm a detecção de pé se o ML mudar um deles.
        const estruturaDeAnuncio = !!document.querySelector('h1.ui-pdp-title, .ui-pdp-price, .ui-pdp-container');
        if (!urlDeAnuncio() && !estruturaDeAnuncio) return false;

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
    // O bloco de envio DESTE anúncio. A busca é por "shipping" no class ou no
    // id, e não por uma classe específica: o Mercado Livre renomeia as classes
    // de tempos em tempos, mas a palavra sobrevive às reformas.
    const ELEMENTOS_DE_ENVIO = '[class*="shipping"], [id*="shipping"]';

    // Tudo que fala de OUTRO anúncio. A leitura antiga varria
    // document.body.innerText inteiro, e numa página de produto quase sempre há
    // um "frete grátis" fora do anúncio — carrossel de relacionados, vitrine do
    // mesmo vendedor, banner de "frete grátis acima de R$ 79". Bastava um deles
    // para o anúncio ser tratado como frete grátis, e aí o cartão descontava do
    // vendedor um envio que quem paga é o comprador. Era a origem da estimativa
    // alta e idêntica em anúncios diferentes.
    const FORA_DESTE_ANUNCIO = [
        '[class*="recommendation"]',
        '[class*="carousel"]',
        '[class*="other-sellers"]',
        '[class*="ui-pdp-seller__item"]',
        'footer',
    ].join(', ');

    function textoDoEnvio() {
        for (const el of document.querySelectorAll(ELEMENTOS_DE_ENVIO)) {
            if (el.closest(FORA_DESTE_ANUNCIO)) continue;
            const texto = (el.innerText || '').trim();
            if (texto) return texto;
        }
        return null;
    }

    function extractShippingInfo() {
        const texto = textoDoEnvio();
        // Sem o bloco de envio não há o que afirmar. Devolver null faz o cartão
        // tratar o frete como desconhecido, que é mais honesto do que chutar.
        if (!texto) return null;

        // "grátis" sozinho não serve: "Devolução grátis" aparece no mesmo bloco
        // e não diz nada sobre quem paga o envio.
        if (/(?:frete|envio|entrega|chegará|chegara)\s*(?:\S+\s+){0,2}gr[aá]tis/i.test(texto)) {
            return { cost: 0, isFree: true };
        }

        const match = texto.match(/R\$\s*([\d.]+),(\d{2})/);
        if (match) {
            return { cost: parseFloat(match[1].replace(/\./g, '') + '.' + match[2]), isFree: false };
        }

        // O bloco existe e não fala em frete grátis: o envio é cobrado do
        // comprador, mesmo que o valor só apareça depois do CEP.
        return { cost: null, isFree: false };
    }


    const catalogBadges = new Map(); // link -> elemento do crachá

    // Canto superior DIREITO do link (não esquerdo) — usa a borda direita
    // como referência e desloca o próprio crachá pra trás com transform,
    // assim não precisa saber a largura do crachá de antemão.
    // Recebe o elemento sobre o qual o crachá deve ficar — normalmente a foto
    // do card, não um link.
    function positionBadge(alvo, badge) {
        const rect = alvo.getBoundingClientRect();
        badge.style.top = `${rect.top + window.scrollY + 6}px`;
        badge.style.left = `${rect.right + window.scrollX - 6}px`;
        badge.style.transform = 'translateX(-100%)';
    }

    // Cards do ML costumam ter mais de um link pro mesmo produto (imagem,
    // título, carrossel de miniaturas...) — sem agrupar por produto, isso
    // cria um crachá por link. Agrupamos por ID do produto e ficamos com o
    // link de MAIOR ÁREA visível — na prática, é sempre o que envolve a
    // foto principal do card, não importa a estrutura exata do HTML.
    // De que tipo é o anúncio, pela própria URL do card:
    //   /p/MLB123      -> produto de CATÁLOGO (vários vendedores na mesma página)
    //   /MLB-123-titulo -> anúncio TRADICIONAL, do vendedor
    // Não custa chamada nenhuma, e é a informação que dá para ter de todos os
    // cards, inclusive os de outros vendedores.
    // ── Idade estimada do anúncio ───────────────────────────────────────
    //
    // O Mercado Livre só devolve date_created dos anúncios da própria conta
    // (403 em anúncio de terceiro, com token e sem token — testado). Para os
    // demais, a data sai da NUMERAÇÃO do id, que cresce com o tempo.
    //
    // Um detalhe que só apareceu ao levantar 144 pares reais de (id, data):
    // não existe uma sequência, existem DUAS, intercaladas e separadas pela
    // paridade do número. MLB5076769690 é de setembro/2024 e MLB5001482813 é
    // de agosto/2026 — números quase iguais, dois anos de diferença. Uma
    // curva só produziria erro de anos; cada paridade, separada, é monotônica.
    //
    // As âncoras abaixo vêm dos anúncios da própria conta, de set/2024 a
    // ago/2026. Validação tirando cada âncora e estimando com as vizinhas:
    // erro mediano de 0,5 dia na série ímpar (p90 1,8) e 0,6 na par (p90 4,2).
    // Fora desse intervalo é extrapolação, e aí a tela avisa.
    //
    // Datas em dias desde 1970, só para a tabela não ficar gigante.
    const ANCORAS_IMPAR = [
        [3858374191, 19990],
        [3861202859, 19993],
        [3864878071, 19997],
        [3876461951, 20010],
        [3876655387, 20011],
        [3881637485, 20015],
        [3883144665, 20017],
        [3883592217, 20018],
        [3885469253, 20019],
        [3886304139, 20020],
        [3887978153, 20021],
        [3967093393, 20124],
        [3967525403, 20125],
        [3988011595, 20146],
        [4258654379, 20379],
        [4274350511, 20388],
        [4467501999, 20493],
        [4658635055, 20581],
        [4662169305, 20582],
        [4692888835, 20593],
        [4706626221, 20598],
        [4713133213, 20600],
        [4783211545, 20621],
        [4899229683, 20651],
        [4906959497, 20652],
        [4911398755, 20653],
        [4919526403, 20656],
        [4925792365, 20657],
        [4949407143, 20661],
        [4953687235, 20662],
        [4960892507, 20664],
        [5001482813, 20672],
        [5100397669, 20686],
        [5102382435, 20687],
    ];

    const ANCORAS_PAR = [
        [5076769690, 19990],
        [5082295786, 19992],
        [5084638982, 19993],
        [5091403526, 19996],
        [5116436452, 20010],
        [5122977104, 20014],
        [5125096362, 20015],
        [5135352406, 20020],
        [5138099958, 20021],
        [5274796382, 20122],
        [5277004658, 20125],
        [5287439376, 20134],
        [5851738520, 20388],
        [6236918140, 20493],
        [6679891724, 20572],
        [6725220634, 20581],
        [6734260634, 20582],
        [6801515532, 20593],
        [6826054718, 20596],
        [6831156720, 20597],
        [7177480106, 20651],
        [7192310974, 20652],
        [7228464754, 20657],
        [7258263682, 20661],
        [7283255538, 20664],
        [7339985614, 20672],
        [7468619118, 20686],
    ];

    const DIA_MS = 86400000;

    // Depois da última âncora, a data segue o ritmo de criação de anúncios dos
    // últimos 30+ dias. Usar só os dois últimos pontos (às vezes a um dia um do
    // outro) dava um ritmo instável: na série ímpar, 3× mais lento que o real,
    // e um anúncio criado hoje saía datado para novembro. Auditoria com as
    // próprias âncoras (cortar a curva e estimar o que veio depois): pior erro
    // de 37 para 17 dias, mediana igual.
    const JANELA_RITMO_DIAS = 30;

    // Entre duas âncoras a mais de 45 dias uma da outra, a data exata é chute:
    // escondendo trechos de 60 dias da curva, o erro mediano foi de 6 a 10 dias
    // e o pior passou de 40. Nesses casos a tela mostra o mês, e a dica diz o
    // intervalo que é CERTO — a numeração só cresce, então o anúncio nasceu
    // entre as datas das duas âncoras vizinhas.
    const LACUNA_GRANDE_DIAS = 45;

    function estimarCriacao(id) {
        const n = Number(id.slice(3));
        if (!Number.isFinite(n)) return null;

        const tabela = n % 2 === 1 ? ANCORAS_IMPAR : ANCORAS_PAR;
        const primeiro = tabela[0];
        const ultimo = tabela[tabela.length - 1];

        // Antes da primeira âncora não dá para interpolar, e extrapolar para
        // trás numa curva calibrada só a partir de 2024 chuta demais. A tela
        // mostra "antes de" em vez de uma data inventada.
        if (n < primeiro[0]) return { dias: primeiro[1], anterior: true, aproximada: true };

        const entre = (a, b) => a[1] + ((n - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);

        if (n > ultimo[0]) {
            let j = tabela.length - 2;
            while (j > 0 && ultimo[1] - tabela[j][1] < JANELA_RITMO_DIAS) j--;
            // Entre a última data real e hoje: nunca antes (a numeração cresce)
            // nem no futuro.
            const hoje = Date.now() / DIA_MS;
            const dias = Math.min(hoje, Math.max(ultimo[1], entre(tabela[j], ultimo)));
            return { dias, aproximada: true, depoisDe: ultimo[1] };
        }

        let i = 0;
        while (tabela[i + 1][0] < n) i++;
        const a = tabela[i];
        const b = tabela[i + 1];
        // O próprio id de uma âncora: a data é a real, sem lacuna nenhuma —
        // mesmo quando o trecho antes dela é um buraco grande.
        if (n === a[0] || n === b[0]) return { dias: n === a[0] ? a[1] : b[1], aproximada: true, lacuna: 0 };
        return { dias: entre(a, b), aproximada: true, entre: [a[1], b[1]], lacuna: b[1] - a[1] };
    }

    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    /** "jun/2025": a precisão honesta quando a data exata seria chute. */
    function mesAno(ms) {
        const d = new Date(ms);
        return MESES[d.getUTCMonth()] + '/' + d.getUTCFullYear();
    }

    /**
     * Dica que acompanha a data estimada: o quanto ela é confiável, e o
     * intervalo garantido quando existe um.
     */
    function dicaDaEstimativa(est) {
        if (!est) return 'Data estimada pela numeração do anúncio.';
        if (est.depoisDe != null) {
            return 'Criado depois de ' + dataCurta(est.depoisDe * DIA_MS, true) + ', a data real mais recente que a estimativa conhece. '
                + 'Daí em diante ela segue o ritmo de criação de anúncios dos últimos 30 dias e pode errar em alguns dias.';
        }
        const intervalo = est.entre ? ' Criado com certeza entre ' + dataCurta(est.entre[0] * DIA_MS, true) + ' e ' + dataCurta(est.entre[1] * DIA_MS, true) + '.' : '';
        if (est.lacuna > LACUNA_GRANDE_DIAS) {
            return 'Estimativa pela numeração do anúncio. Neste período faltam datas reais para comparar, então só o mês é confiável.' + intervalo;
        }
        if (est.lacuna > 7) return 'Estimativa pela numeração do anúncio, com margem de cerca de uma semana.' + intervalo;
        return 'Estimativa pela numeração do anúncio: costuma errar por menos de dois dias.';
    }

    // Crachá por id do anúncio. A data chega da rede depois que o crachá já
    // está na tela, e é por aqui que ela acha o seu. Declarado antes de quem
    // usa: ficava embaixo, e só não quebrava porque a marcação roda mais
    // tarde — dependência frágil demais para deixar assim.
    // Guarda o crachá E o link que ele acompanha. Só o crachá não bastava: ele
    // fica pendurado no <body>, então continua "na tela" mesmo depois de o
    // Mercado Livre trocar o card. A marcação via crachá vivo, não criava
    // outro, e em seguida a reposição apagava o órfão — resultado: busca sem
    // crachá nenhum depois do primeiro re-render.
    const crachasPorId = new Map();

    // Um anúncio aparece em VÁRIOS cards da mesma página: o Mercado Livre
    // repete o mesmo produto entre as seções da busca. Por isso cada id guarda
    // uma LISTA de crachás. Antes guardava um só, e o card repetido ficava sem
    // etiqueta nenhuma — a marcação via que aquele id já tinha crachá,
    // reposicionava o do primeiro card e desistia do segundo.
    function lembrarPorId(id, cracha, link) {
        const lista = crachasPorId.get(id) || [];
        lista.push({ cracha, link });
        crachasPorId.set(id, lista);
    }

    function esquecerCracha(cracha) {
        crachasPorId.forEach((lista, id) => {
            const resto = lista.filter((r) => r.cracha !== cracha);
            if (resto.length) crachasPorId.set(id, resto);
            else crachasPorId.delete(id);
        });
    }

    // Duas perguntas diferentes, que eu tinha misturado numa só:
    //
    //   TIPO — sai do CAMINHO da URL. /p/ e /up/ são páginas de catálogo,
    //          compartilhadas por vários vendedores; o resto é anúncio próprio.
    //   ID   — o do anúncio (MLB…), quando a URL informa qual é. Ele vem no
    //          parâmetro wid ou item_id, e é o que permite estimar a idade.
    //
    // Ao resolver as duas com a mesma regra, um link de catálogo que trazia
    // item_id era classificado como tradicional, e a busca inteira aparecia
    // sem nenhum card marcado como CATÁLOGO.
    function tipoDoLink(href) {
        // Só /p/MLB… é catálogo: página compartilhada, vários vendedores
        // disputando a mesma vitrine.
        //
        // /up/MLBU… NÃO é. O MLBU é o user_product_id — o agrupamento das
        // variações DO PRÓPRIO vendedor (aparece assim na API de publicidade,
        // ao lado do item). Tratá-lo como catálogo marcou meia busca de
        // CATÁLOGO indevidamente; é anúncio tradicional com página unificada.
        const doCatalogo = href.match(/\/p\/(MLB\d+)/i);
        const doUnificado = href.match(/\/up\/(MLBU\d+)/i);
        const ehCatalogo = !!doCatalogo;

        // Aceita "=" e ":" como separador: o ML usa wid=MLB… e também
        // pdp_filters=item_id:MLB…, com dois-pontos.
        const doParametro = href.match(/(?:\bwid|\bitem_id)[=:](MLB\d+)/i);
        const doPermalink = href.match(/\/MLB-(\d{6,})/i);
        // Último recurso, para formatos que o ML ainda vai inventar. Exige 8
        // dígitos para não confundir com número de categoria, que é curto.
        const solto = href.match(/\b(MLB\d{8,})\b/i);

        let itemId = null;
        if (doParametro) itemId = doParametro[1].toUpperCase();
        else if (doPermalink) itemId = 'MLB' + doPermalink[1];
        else if (!ehCatalogo && solto) itemId = solto[1].toUpperCase();

        // Página unificada sem itemId ainda é anúncio válido — só não dá para
        // estimar a idade, porque o MLBU tem numeração própria.
        const idDaPagina = doCatalogo ? doCatalogo[1].toUpperCase()
            : (doUnificado ? doUnificado[1].toUpperCase() : null);

        if (!itemId && !idDaPagina) return null;

        return {
            tipo: ehCatalogo ? 'catalogo' : 'tradicional',
            // Chave de deduplicação: prefere o anúncio, que é mais específico.
            id: itemId || idDaPagina,
            // Só com ele dá para estimar a idade — o id de produto (MLB de
            // catálogo, MLBU) vive noutra numeração e não serve para a curva.
            itemId,
        };
    }

    // `doCalendario`: a data vem da curva, em dias contados desde 1970 (meia-
    // noite UTC). Lida no fuso local ela voltava para as 21h do dia anterior,
    // e toda data estimada saía um dia antes. Data real do ML (com fuso no
    // texto) continua no fuso local.
    function dataCurta(ms, doCalendario = false) {
        const d = new Date(ms);
        const p = (n) => String(n).padStart(2, '0');
        return doCalendario
            ? `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
            : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    function diasAte(ms) {
        return Math.max(0, Math.floor((Date.now() - ms) / DIA_MS));
    }

    // Escreve a linha da data no crachá. `exata` só vale para anúncio da
    // própria conta, único caso em que o Mercado Livre devolve date_created;
    // o resto vem da curva e leva "~" na frente, para ninguém ler estimativa
    // como dado confirmado.
    // Faixa etária do anúncio, que dá a cor do crachá. Os cortes são 50 e 100
    // dias: até 50 é anúncio recente (vermelho), até 100 está amadurecendo
    // (amarelo), e daí em diante é anúncio estabelecido (azul).
    function faixaDeIdade(dias) {
        if (dias <= 50) return 'novo';
        if (dias <= 100) return 'medio';
        return 'antigo';
    }

    // Escreve a linha da data no crachá. `exata` só vale para anúncio da
    // própria conta, único caso em que o Mercado Livre devolve date_created;
    // o resto vem da curva e leva "~" na frente, para ninguém ler estimativa
    // como dado confirmado.
    //
    // A distinção exata/estimada fica só no "~" e na dica: a cor passou a
    // significar IDADE, e usá-la para duas coisas ao mesmo tempo tornaria
    // ambas ilegíveis.
    function escreverData(cracha, ms, exata, anterior, est) {
        let linha = cracha.querySelector('.impoclick-card-data');
        if (!linha) {
            linha = document.createElement('span');
            linha.className = 'impoclick-card-data';
            cracha.appendChild(linha);
        }

        // Data exata que chegou da rede nunca volta a ser estimativa.
        if (linha.dataset.exata === '1' && !exata) return;

        const dias = diasAte(ms);

        if (anterior) {
            // Dia e mês exatos dariam ares de precisão a um limite, não a uma
            // medida: tudo que se sabe é que o anúncio é anterior a isto.
            linha.textContent = `anterior a 09/2024 · +${dias} dias`;
            linha.title = 'A curva de estimativa começa em setembro de 2024. Este anúncio é mais antigo, então só dá para dizer o mínimo de idade.';
        } else if (!exata && est && est.lacuna > LACUNA_GRANDE_DIAS) {
            // Dia e mês exatos aqui seriam precisão inventada.
            linha.textContent = `~${mesAno(ms)} · ~${dias} dias`;
            linha.title = dicaDaEstimativa(est);
        } else {
            linha.textContent = `${exata ? '' : '~'}${dataCurta(ms, !exata)} · ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
            linha.title = exata ? 'Data de criação informada pelo Mercado Livre.' : dicaDaEstimativa(est);
        }

        linha.classList.remove('impoclick-idade-novo', 'impoclick-idade-medio', 'impoclick-idade-antigo');
        linha.classList.add('impoclick-idade-' + faixaDeIdade(dias));
        linha.dataset.exata = exata ? '1' : '0';
    }

    function montarCracha(info) {
        const cracha = document.createElement('span');
        cracha.className = 'impoclick-card-badge';

        const tipo = document.createElement('span');
        tipo.className = 'impoclick-card-tipo impoclick-tipo-' + info.tipo;
        tipo.textContent = info.tipo === 'catalogo' ? 'CATÁLOGO' : 'TRADICIONAL';
        cracha.appendChild(tipo);

        // Só para anúncio tradicional. Em card de catálogo o MLB da URL é o id
        // do PRODUTO, de uma numeração completamente diferente (na casa dos
        // milhões, não dos bilhões) — passá-lo pela curva devolveria "antes de
        // 2024" em todo card de catálogo, que é resposta inventada.
        // Depende de haver id de ANÚNCIO, não do tipo do card: um produto de
        // catálogo cuja URL diz qual anúncio está sendo mostrado também tem
        // idade estimável. O que não serve é o id de produto (MLB de catálogo
        // ou MLBU), de numeração completamente diferente.
        if (info.itemId) {
            // A estimativa aparece de imediato: sai do próprio id, sem rede. Se
            // o anúncio for seu, a data exata chega depois e substitui esta.
            const estimativa = estimarCriacao(info.itemId);
            if (estimativa) escreverData(cracha, estimativa.dias * DIA_MS, false, estimativa.anterior, estimativa);
        }

        document.body.appendChild(cracha);
        return cracha;
    }

    // Contêineres de card usados pelo Mercado Livre. São vários porque o
    // layout muda entre busca, lista, vitrine e carrossel — e muda com o
    // tempo. Se nenhum casar, a marcação cai no modo antigo, por link.
    const SELETORES_CARD = [
        'li.ui-search-layout__item',
        'div.ui-search-result',
        'div.poly-card',
        'li.poly-card',
        'div.andes-card.poly-card',
    ].join(', ');

    // O id pode estar em qualquer link do card, e nem sempre em texto limpo:
    // anúncio patrocinado vem por URL de rastreio com o destino codificado
    // (…?url=https%3A%2F%2F…%2FMLB-123…). Sem decodificar, esses cards ficavam
    // sem crachá — era metade do "não aparece em todos".
    // Os links do anúncio em si — foto e título. O card tem outros: vendedor,
    // "ver mais características", oferta do dia, e o link de rastreio dos
    // patrocinados. Como a classificação saía do PRIMEIRO link que casasse,
    // bastava um desses vir antes no DOM para um card de catálogo ser marcado
    // como TRADICIONAL. Agora o link principal é consultado primeiro, e a
    // varredura geral continua como reserva para quando o ML trocar as classes.
    const LINK_PRINCIPAL = [
        'a.poly-component__title',
        'a.poly-component__picture',
        'a.ui-search-link__title-card',
        'a.ui-search-item__group__element a',
        'a.ui-search-link',
    ].join(', ');

    function infoDoCard(card) {
        const principais = Array.from(card.querySelectorAll(LINK_PRINCIPAL));
        const todos = Array.from(card.querySelectorAll('a[href]'));
        for (const a of principais.concat(todos)) {
            let href = a.href || '';
            if (href.indexOf('%2F') !== -1 || href.indexOf('%3A') !== -1) {
                try { href = decodeURIComponent(href); } catch (e) { /* href malformado */ }
            }
            const info = tipoDoLink(href);
            if (info) return info;
        }
        return null;
    }

    // O crachá vai sobre a FOTO, não sobre o link que por acaso for maior.
    // Ancorar no link fazia o crachá cair em cima do título quando a foto
    // ainda não tinha carregado.
    // A foto do produto é a MAIOR imagem do card, não a primeira: o Mercado
    // Livre põe ícones antes dela na marcação (selo Full, etiqueta de oferta,
    // logo da loja). Ancorar no primeiro <img> tinha duas consequências ruins:
    // o crachá ia para o canto de um ícone de 16px e, pior, quando esse ícone
    // ainda não tinha carregado — tamanho zero — o card inteiro era descartado
    // pela verificação de área e ficava sem etiqueta nenhuma.
    function alvoDoCracha(card) {
        let melhor = null;
        let maiorArea = 0;
        for (const img of card.querySelectorAll('img')) {
            const r = img.getBoundingClientRect();
            const area = r.width * r.height;
            if (area > maiorArea) {
                maiorArea = area;
                melhor = img;
            }
        }
        // Sem nenhuma imagem com tamanho (típico de card ainda carregando), o
        // próprio card serve de âncora — ele já ocupa espaço na grade.
        return melhor || card;
    }

    // Áreas administrativas do vendedor. Elas ficam no mesmo domínio e têm
    // links com MLB (o item de uma venda, a lista de anúncios), mas não são
    // vitrine — marcar ali é ruído em cima do trabalho do vendedor.
    const AREAS_DO_VENDEDOR = [
        'vendas', 'ventas', 'anuncios', 'publicaciones', 'perfil', 'myml',
        'adminml', 'pedidos', 'faturamento', 'billing', 'metricas', 'central',
    ];

    // Só marcamos onde existe uma LISTA de resultados de verdade. Antes bastava
    // "não ser página de produto", e aí a marcação escapava para o detalhe de
    // venda, o gerenciador de anúncios e qualquer outra tela do vendedor.
    function ehPaginaDeResultados() {
        const caminho = window.location.pathname.toLowerCase();
        const noPainel = AREAS_DO_VENDEDOR.some((area) => caminho.indexOf('/' + area) === 0
            || caminho.indexOf('/' + area + '/') !== -1);
        if (noPainel) return false;
        // Endereços que só existem em vitrine. Servem para os casos em que o
        // Mercado Livre troca as classes do container e a prova de DOM falha.
        const host = window.location.hostname.toLowerCase();
        if (host.indexOf('lista.') === 0) return true;
        const vitrines = ['/c/', '/ofertas', '/mais-vendidos', '/tendencias', '/menu/'];
        if (vitrines.some((v) => caminho.indexOf(v) === 0)) return true;

        // A página inicial não é vitrine de busca. Os carrosséis dela
        // ("Inspirado no último visto", ofertas do dia) passam no teste de 6
        // cards lá embaixo, e as etiquetas enchiam a home.
        if (caminho === '/' || caminho === '') return false;

        // Prova positiva: o contêiner da GRADE de resultados. Exigir isso em vez
        // de apenas "não parece página de produto" é o que mantém a marcação
        // fora do painel do vendedor — lá existem links com MLB (o item de uma
        // venda), mas nunca uma grade de busca.
        if (document.querySelector('ol.ui-search-layout, .ui-search-results, .ui-search-main')) return true;

        // Último sinal: MUITOS cards do mesmo tipo na tela. Uma tela
        // administrativa mostra uma ou duas linhas de pedido; uma busca mostra
        // dezenas. O piso alto é de propósito.
        return document.querySelectorAll(SELETORES_CARD).length >= 6;
    }

    function marcarPorCard() {
        const cards = document.querySelectorAll(SELETORES_CARD);
        if (cards.length === 0) return false;

        const idsTradicionais = [];

        cards.forEach((card) => {
            const info = infoDoCard(card);
            if (!info) return;

            const alvo = alvoDoCracha(card);
            const rect = alvo.getBoundingClientRect();
            // Ainda sem layout: deixa para a próxima passada, sem marcar nada.
            if (rect.width * rect.height <= 0) return;

            // "Este CARD já tem crachá?" — e não "este ANÚNCIO já tem", que era
            // a pergunta errada: com o produto repetido na busca, o segundo card
            // ficava sem etiqueta.
            const existente = catalogBadges.get(alvo);
            if (existente && existente.isConnected) {
                positionBadge(alvo, existente);
                return;
            }
            if (existente) {
                existente.remove();
                catalogBadges.delete(alvo);
                esquecerCracha(existente);
            }

            const cracha = montarCracha(info);
            positionBadge(alvo, cracha);
            catalogBadges.set(alvo, cracha);
            lembrarPorId(info.id, cracha, alvo);
            if (info.itemId && info.itemId !== info.id) lembrarPorId(info.itemId, cracha, alvo);
            if (info.itemId) idsTradicionais.push(info.itemId);
        });

        if (idsTradicionais.length > 0) buscarDatas(idsTradicionais);
        return true;
    }

    // Modo de reserva: se o Mercado Livre trocar as classes dos cards, ainda dá
    // para achar os anúncios pelos links soltos. Menos preciso — o crachá vai
    // no maior elemento disponível —, mas melhor que tela sem nada.
    function marcarPorLink() {
        const links = Array.from(document.querySelectorAll('a[href*="MLB"]'));
        if (links.length === 0) return;

        const porId = new Map();
        links.forEach((link) => {
            const info = tipoDoLink(link.href);
            if (!info) return;
            const rect = link.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (area <= 0) return;
            const temImagem = !!link.querySelector('img');
            const atual = porId.get(info.id);
            const melhor = !atual
                || (temImagem && !atual.temImagem)
                || (temImagem === atual.temImagem && area > atual.area);
            if (melhor) porId.set(info.id, { link, area, info, temImagem });
        });

        const idsTradicionais = [];
        porId.forEach(({ link, info }) => {
            const existente = catalogBadges.get(link);
            if (existente && existente.isConnected) return;
            if (existente) {
                existente.remove();
                catalogBadges.delete(link);
                esquecerCracha(existente);
            }

            const cracha = montarCracha(info);
            positionBadge(link, cracha);
            catalogBadges.set(link, cracha);
            lembrarPorId(info.id, cracha, link);
            if (info.itemId && info.itemId !== info.id) lembrarPorId(info.itemId, cracha, link);
            if (info.itemId) idsTradicionais.push(info.itemId);
        });

        if (idsTradicionais.length > 0) buscarDatas(idsTradicionais);
    }

    // Data exata dos anúncios que são da própria conta. Os de terceiros voltam
    // de fora da resposta (o Mercado Livre recusa com 403) e ficam com a
    // estimativa que o crachá já mostra.
    async function buscarDatas(ids) {
        try {
            const r = await chrome.runtime.sendMessage({ type: 'GET_ITEM_DATES', ids });
            const datas = (r && r.datas) || {};
            Object.keys(datas).forEach((id) => {
                // Todos os crachás daquele anúncio, não só o primeiro: a data
                // exata vale para cada card em que ele aparece.
                (crachasPorId.get(id) || []).forEach((registro) => {
                    escreverData(registro.cracha, Date.parse(datas[id].criadoEm), true, false);
                });
            });
        } catch (e) {
            // Sem sessão ou sem rede: fica a estimativa.
        }
    }

    function markCatalogLinks() {
        if (!ehPaginaDeResultados()) {
            removeCatalogBadges();
            return;
        }
        if (!marcarPorCard()) marcarPorLink();
    }

    // Limpa qualquer crachá remanescente de uma marcação anterior (ex: uma
    // corrida em que markCatalogLinks rodou antes do h1/preço existirem no
    // DOM e looksLikeProductPage() ainda não detectava a página de produto).
    function removeCatalogBadges() {
        catalogBadges.forEach((badge) => badge.remove());
        catalogBadges.clear();
        // Sem limpar aqui, uma busca nova encontraria o crachá da anterior e a
        // data cairia no card errado.
        crachasPorId.clear();
        document.querySelectorAll('a[data-impoclick-marked]').forEach((link) => {
            delete link.dataset.impoclickMarked;
        });
    }

    function repositionCatalogBadges() {
        catalogBadges.forEach((badge, link) => {
            if (!link.isConnected) {
                badge.remove();
                catalogBadges.delete(link);
                // Tirar também do índice por id. Sem isto o anúncio ficava
                // registrado como "já tem crachá" para sempre, e a marcação se
                // recusava a criar outro quando o Mercado Livre trocasse o card
                // — que é o que ele faz o tempo todo numa busca.
                esquecerCracha(badge);
                return;
            }
            positionBadge(link, badge);
        });
    }

    window.addEventListener('resize', repositionCatalogBadges);


    // ══ Cartão de análise na página do anúncio ══════════════════════════
    //
    // Tudo aqui sai da própria página ou de contas sobre ela. Visitas reais e
    // score de qualidade ficaram de fora de propósito: a API do Mercado Livre
    // devolve 403 para anúncio de outro vendedor (testado com token e sem
    // token), então essas duas caixas ficariam vazias justamente quando o
    // cartão é mais útil — olhando o concorrente.

    function textoDe(seletores) {
        for (const s of seletores) {
            const el = document.querySelector(s);
            if (el && el.textContent.trim()) return el.textContent.trim();
        }
        return null;
    }

    // Estados brasileiros, para achar a origem do vendedor no texto da página.
    const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';

    // Rótulos de navegação que aparecem no mesmo lugar do nome da loja. Sem
    // descartá-los, o cartão anunciava o vendedor como "Ver loja".
    const ROTULOS_GENERICOS = /^(ver loja|ir para a loja|ver mais|ver mais produtos|visitar loja|vendido por)$/i;

    // listing_type_id cru, do JSON que o Mercado Livre embute na página.
    // Clássico e Premium têm comissões bem diferentes na mesma categoria, e o
    // rótulo em português não serve para a API — ela quer o id.
    //
    // Fica aqui, no escopo do módulo, e não dentro de extrairVendedor(): quem
    // calcula a comissão é outra função, e ler dali causava ReferenceError
    // silencioso — o payout inteiro aparecia como "—" sem dizer por quê.
    //
    // Duas armadilhas corrigidas:
    //
    // 1. O cache era por CARREGAMENTO e nunca era zerado. O Mercado Livre troca
    //    de anúncio sem recarregar a página, e o tipo do primeiro anúncio visto
    //    valia para todos os seguintes. Agora a chave é o endereço + o id.
    // 2. Valia a PRIMEIRA ocorrência da página inteira — que traz também o tipo
    //    de relacionados e de outros vendedores do catálogo. Quando as
    //    ocorrências discordam, vale a mais próxima do id deste anúncio no JSON;
    //    sem nenhuma perto, o tipo fica desconhecido e o usuário escolhe, em vez
    //    de a tela afirmar o tipo de outro anúncio.
    const LISTING_TYPE_PERTO_DO_ID = 8000; // caracteres; heurística de "mesmo objeto JSON"
    let listingTypeCache = { chave: null, valor: null };

    function lerListingTypeId() {
        const itemId = extractItemId();
        const chave = location.href + '|' + (itemId || '');
        if (listingTypeCache.chave === chave) return listingTypeCache.valor;

        // innerHTML da página inteira é caro; uma vez por anúncio basta.
        const html = document.documentElement.innerHTML;
        const achados = Array.from(html.matchAll(/"listing_type_id"\s*:\s*"(gold_pro|gold_special)"/g))
            .map((m) => ({ tipo: m[1], pos: m.index }));

        let valor = null;
        const tipos = new Set(achados.map((a) => a.tipo));
        if (tipos.size === 1) {
            valor = achados[0].tipo;
        } else if (tipos.size > 1 && itemId) {
            const posicoesDoId = Array.from(html.matchAll(new RegExp('"' + itemId + '"', 'g'))).map((m) => m.index);
            let melhor = null;
            for (const a of achados) {
                for (const p of posicoesDoId) {
                    const distancia = Math.abs(a.pos - p);
                    if (distancia <= LISTING_TYPE_PERTO_DO_ID && (!melhor || distancia < melhor.distancia)) {
                        melhor = { tipo: a.tipo, distancia };
                    }
                }
            }
            valor = melhor ? melhor.tipo : null;
        }

        listingTypeCache = { chave, valor };
        return valor;
    }

    // Id do vendedor, lido da página. Ao contrário da cidade, ELE está no HTML
    // servido — confirmei baixando a página de um anúncio: "seller_id",
    // "sellerId" e o sufixo "_CustId_" do link do perfil trazem o mesmo número.
    function idDoVendedor() {
        const html = document.documentElement.innerHTML;
        const tentativas = [
            /"seller_id"\s*:\s*"?(\d{6,})/,
            /"sellerId"\s*:\s*"?(\d{6,})/,
            /_CustId_(\d{6,})/,
        ];
        for (const re of tentativas) {
            const m = html.match(re);
            if (m) return m[1];
        }
        return null;
    }

    // A cidade do vendedor NÃO vem no HTML: a página é servida sem ela e a
    // preenche depois por JavaScript. Baixei 693 KB de uma página de anúncio e
    // "Guarulhos" não aparecia em lugar nenhum.
    //
    // Tentar deduzir do DOM produziu o pior erro possível: as chaves "city" e
    // "state" que existem no HTML são a LISTA DE ESTADOS do formulário de
    // entrega, e a extensão acabava exibindo a cidade de entrega do próprio
    // usuário como se fosse a do vendedor. Um dado errado com cara de certo é
    // pior que campo vazio.
    //
    // /users/{id} devolve { address: { city, state } }, mas só autenticado —
    // anônimo responde 403. Por isso a consulta passa pelo service worker.
    async function buscarLocalDoVendedor() {
        const id = idDoVendedor();
        if (!id) return;

        let r;
        try {
            r = await chrome.runtime.sendMessage({ type: 'GET_SELLER', sellerId: id });
        } catch (e) {
            return; // sem sessão ou script órfão
        }
        if (!r || !r.seller || !r.seller.local) return;

        const tags = document.querySelector('.impoclick-pdp-tags');
        if (!tags || tags.querySelector('[data-local]')) return;

        const span = document.createElement('span');
        span.dataset.local = '1';
        span.textContent = r.seller.local;
        // Antes da etiqueta do tipo de anúncio, que já está na tela.
        tags.insertBefore(span, tags.firstChild);
    }

    function extrairVendedor() {
        // Os títulos vêm primeiro: o link costuma trazer o nome, mas às vezes
        // traz só o texto do botão.
        const candidatos = [
            '.ui-pdp-seller__header__title',
            '.ui-seller-data-header__title',
            '.ui-pdp-seller__link-trigger-button .ui-pdp-color--BLUE',
            '.ui-pdp-seller__link-trigger-button',
            '.ui-pdp-seller__header__info-container__subtitle-one-line',
        ];

        let nomeBruto = null;
        for (const seletor of candidatos) {
            const t = textoDe([seletor]);
            if (t && !ROTULOS_GENERICOS.test(t.trim())) { nomeBruto = t; break; }
        }



        const bruto = lerListingTypeId();
        const tipo = bruto === 'gold_pro' ? 'Premium' : (bruto === 'gold_special' ? 'Clássico' : null);

        const link = document.querySelector(
            '.ui-pdp-seller__link-trigger-button, a[href*="_CustId_"], a[href*="/perfil/"]'
        );

        const nome = nomeBruto ? nomeBruto.replace(/^(Vendido por|Loja)\s*/i, '').trim() : null;

        // O link da página existe em anúncio de loja oficial, mas some em boa
        // parte dos anúncios comuns — e era aí que o botão do vendedor não
        // aparecia. Duas saídas, nesta ordem: o id do vendedor, que está no HTML
        // e abre a LISTA de anúncios dele (_CustId_), e o apelido, que abre o
        // perfil. A lista é o que interessa para estudar a concorrência.
        const id = idDoVendedor();
        let url = link && link.href ? link.href : null;
        if (!url && id) url = 'https://lista.mercadolivre.com.br/_CustId_' + id;
        if (!url && nome && /^[\w.-]+$/.test(nome)) url = 'https://www.mercadolivre.com.br/perfil/' + encodeURIComponent(nome);

        return {
            nome,
            // A cidade não sai da página: chega depois, por
            // buscarLocalDoVendedor(), que consulta a API e insere a etiqueta.
            tipo,
            url,
            // Lista de anúncios do vendedor. Quando o link da página é o perfil,
            // o _CustId_ continua sendo o caminho direto para os anúncios.
            urlAnuncios: id ? 'https://lista.mercadolivre.com.br/_CustId_' + id : url,
        };
    }

    function extrairProvaSocial() {
        const subtitulo = (textoDe(['.ui-pdp-subtitle', '.ui-pdp-header__subtitle']) || '');

        // "+500 vendidos", "+10mil vendidos", "1.234 vendidos".
        let vendidos = null;
        const m = subtitulo.match(/\+?\s*([\d.]+)\s*(mil)?\s*vendidos?/i);
        if (m) {
            vendidos = parseInt(m[1].replace(/\./g, ''), 10);
            if (m[2]) vendidos *= 1000;
            if (!isFinite(vendidos)) vendidos = null;
        }

        const notaTexto = textoDe(['.ui-pdp-review__rating']);
        const nota = notaTexto ? parseFloat(notaTexto.replace(',', '.')) : null;

        const qtd = textoDe(['.ui-pdp-review__amount']);
        const avaliacoes = qtd ? parseInt(qtd.replace(/\D/g, ''), 10) : null;

        return {
            vendidos,
            nota: isFinite(nota) ? nota : null,
            avaliacoes: isFinite(avaliacoes) ? avaliacoes : null,
        };
    }

    function decimal(v, casas) {
        if (v === null || v === undefined || !isFinite(v)) return null;
        return v.toFixed(casas === undefined ? 1 : casas).replace('.', ',');
    }

    function moedaBR(v) {
        return 'R$ ' + v.toFixed(2).replace('.', ',');
    }

    function pesoBR(gramas) {
        return gramas >= 1000
            ? (gramas / 1000).toFixed(gramas % 1000 === 0 ? 0 : 1).replace('.', ',') + ' kg'
            : Math.round(gramas) + ' g';
    }

    const NOME_LOGISTICA = {
        drop_off: 'Correios', xd_drop_off: 'Agência', cross_docking: 'Coleta',
        fulfillment: 'Full', self_service: 'Flex', turbo: 'Turbo',
    };

    function dicaDoHistorico(hist, cot) {
        const partes = [
            'Pelo seu histórico: mediana do que você pagou em ' + hist.amostras + ' envios com peso faturável entre '
                + pesoBR(hist.pesoMinG) + ' e ' + pesoBR(hist.pesoMaxG) + ' (este produto: ' + pesoBR(hist.faturavelG) + ').',
        ];
        if (hist.logistica && NOME_LOGISTICA[hist.logistica]) partes.push('Logística: ' + NOME_LOGISTICA[hist.logistica] + '.');
        if (typeof cot.cost === 'number') partes.push('A cotação do Mercado Livre para ele era ' + moedaBR(cot.cost) + '.');
        return partes.join(' ');
    }

    // A cotação do Mercado Livre devolve mais do que o custo, e o cartão jogava
    // o resto fora: o número aparecia sozinho e parecia alto sem explicação. O
    // peso taxável costuma ser a resposta — o ML cobra pelo maior entre o peso
    // real e o cubado, e uma caixa grande e leve sai cara.
    function dicaDoFrete(cot, temMedidas) {
        const partes = [];

        partes.push(cot.freteGratisObrigatorio
            ? 'Acima do limite de preço do Mercado Livre o frete grátis é obrigatório: este custo sai do vendedor mesmo sem oferecer.'
            : 'Frete grátis deste anúncio, pago pelo vendedor.');

        partes.push(temMedidas
            ? 'Calculado com o peso e as dimensões da ficha técnica.'
            : 'Calculado pelo Mercado Livre com as medidas cadastradas neste anúncio.');

        if (typeof cot.billableWeightG === 'number' && cot.billableWeightG > 0) {
            partes.push('Peso taxável: ' + pesoBR(cot.billableWeightG) + '.');
        }

        const taxa = cot.discount && typeof cot.discount.rate === 'number' ? cot.discount.rate : null;
        if (taxa > 0) {
            partes.push('Já com ' + Math.round(taxa * 100) + '% de desconto do Mercado Livre.');
        }

        return partes.join(' ');
    }

    // Faturamento vira k/M porque o número cheio não cabe na caixa e ninguém
    // lê "R$ 250.437,90" de relance.
    function faturamentoCurto(v) {
        if (!isFinite(v)) return null;
        if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
        if (v >= 1000) return 'R$ ' + Math.round(v / 1000) + 'k';
        return 'R$ ' + Math.round(v);
    }

    // escaparTexto serve para conteúdo, não para atributo: ele não escapa
    // aspas, e toda dica entra dentro de data-dica="…".
    function escaparAtributo(t) {
        return escaparTexto(t).replace(/"/g, '&quot;');
    }

    // ── Dica: balão de ajuda ──────────────────────────────────────────
    //
    // O title nativo não serve para textos deste tamanho: o Windows desenha
    // uma faixa de UMA linha só, que atravessa a janela inteira e fica
    // ilegível justamente quando há mais a explicar.
    //
    // O balão vive preso ao <body> com position:fixed de propósito. O cartão
    // mora dentro do DOM do Mercado Livre, e basta um ancestral com
    // overflow:hidden para recortar um balão posicionado dentro dele.
    let noDica = null;

    function elementoDica() {
        // isConnected porque o Mercado Livre é uma SPA e troca pedaços do
        // documento: o balão de uma navegação anterior pode ter ido junto.
        if (noDica && noDica.isConnected) return noDica;
        noDica = document.createElement('div');
        noDica.id = 'impoclick-dica';
        noDica.setAttribute('role', 'tooltip');
        document.body.appendChild(noDica);
        return noDica;
    }

    function mostrarDica(alvo) {
        const texto = alvo.getAttribute('data-dica');
        if (!texto) return;

        const el = elementoDica();
        el.textContent = texto;

        // O balão assenta sobre o cartão (ou o painel) que contém o "?", e
        // não sobre o ícone: é o que o mantém dentro da coluna em vez de
        // pendurado no vazio ao lado dela.
        const caixaMae = alvo.closest('#impoclick-pdp-card, #impoclick-filtros');
        const maeR = caixaMae ? caixaMae.getBoundingClientRect() : null;
        // Aplicado antes de medir: a altura depende da largura, e medir com
        // uma largura que não será a final daria uma altura errada.
        el.style.maxWidth = maeR ? Math.min(264, maeR.width) + 'px' : '';

        // Posicionar antes de tornar visível, senão o balão pisca no lugar
        // errado por um quadro.
        const alvoR = alvo.getBoundingClientRect();
        const dicaR = el.getBoundingClientRect();
        const margem = 8;

        let topo = alvoR.bottom + margem;
        // Sem espaço embaixo, vira para cima em vez de vazar da janela.
        if (topo + dicaR.height > window.innerHeight - margem) {
            topo = Math.max(margem, alvoR.top - dicaR.height - margem);
        }

        // Alinhado pelo cartão/painel que contém o alvo, não pelo "?" — e
        // nunca mais largo que ele. Ancorar no ícone jogava o balão para fora
        // do cartão, que na busca fica colado na borda direita da janela.
        const ancora = maeR ? maeR.left : alvoR.left;
        let esq = Math.min(ancora, window.innerWidth - dicaR.width - margem);
        if (esq < margem) esq = margem;

        el.style.top = topo + 'px';
        el.style.left = esq + 'px';
        el.classList.add('visivel');
    }

    function esconderDica() {
        if (noDica) noDica.classList.remove('visivel');
    }

    // Delegado no documento: o cartão e o painel são remontados a cada troca
    // de anúncio, e religar ouvinte a cada remontagem vazaria ouvintes.
    document.addEventListener('mouseover', (e) => {
        const alvo = e.target && e.target.closest && e.target.closest('[data-dica]');
        if (alvo) mostrarDica(alvo);
    });
    document.addEventListener('mouseout', (e) => {
        const alvo = e.target && e.target.closest && e.target.closest('[data-dica]');
        if (alvo) esconderDica();
    });
    document.addEventListener('focusin', (e) => {
        const alvo = e.target && e.target.closest && e.target.closest('[data-dica]');
        if (alvo) mostrarDica(alvo);
    });
    document.addEventListener('focusout', esconderDica);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') esconderDica(); });
    // position:fixed não acompanha a rolagem: sem isto o balão ficaria solto
    // no meio da tela depois que a página andasse. true para pegar a rolagem
    // de qualquer contêiner, não só a da janela.
    window.addEventListener('scroll', esconderDica, true);

    function caixa(id, rotulo, dica) {
        return '<div class="impoclick-pdp-caixa" data-dica="' + escaparAtributo(dica) + '">'
            + '<span class="impoclick-pdp-valor" id="' + id + '">—</span>'
            + '<span class="impoclick-pdp-rotulo">' + rotulo + '</span>'
            + '</div>';
    }

    function porId(id) {
        return document.getElementById(id);
    }

    function escrever(id, valor) {
        const el = porId(id);
        if (el && valor !== null && valor !== undefined) el.textContent = valor;
    }

    // ── Abas de catálogo: Concorrentes e Líder ────────────────────────
    //
    // O id do catálogo é o MLB do caminho /p/MLB… — e só existe nessa forma de
    // página. Anúncio tradicional (/MLB-123-titulo) não tem concorrência de
    // catálogo, e as abas nem são desenhadas.
    function idCatalogoDaPagina() {
        const m = window.location.pathname.match(/\/p\/(MLB\d+)/i);
        return m ? m[1].toUpperCase() : null;
    }

    // Cache por produto: trocar de aba não deve refazer a consulta, que custa
    // uma chamada ao ML por vendedor.
    const catalogoCache = new Map();
    let abaAberta = null;

    async function buscarCatalogo(produtoId) {
        if (catalogoCache.has(produtoId)) return catalogoCache.get(produtoId);
        const resposta = await new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ type: 'GET_CATALOGO', productId: produtoId }, (r) => {
                    if (chrome.runtime.lastError) resolve({ error: 'sem_conexao' });
                    else resolve(r || { error: 'sem_resposta' });
                });
            } catch (e) {
                resolve({ error: 'sem_conexao' });
            }
        });
        catalogoCache.set(produtoId, resposta);
        return resposta;
    }

    const REPUTACAO_ROTULO = {
        '5_green': 'Verde',
        '4_light_green': 'Verde-claro',
        '3_yellow': 'Amarelo',
        '2_orange': 'Laranja',
        '1_red': 'Vermelho',
    };

    // A cor do ponto É o dado: no Mercado Livre a reputação do vendedor é
    // literalmente uma cor. Repetir isso em forma visual poupa a leitura.
    const REPUTACAO_COR = {
        '5_green': '#00a650',
        '4_light_green': '#8cc63f',
        '3_yellow': '#f5c518',
        '2_orange': '#f5a623',
        '1_red': '#d93025',
    };

    // Traços dos ícones, sem biblioteca: uma extensão que injeta em página de
    // terceiro não deve carregar fonte de ícone nem SVG externo.
    const ICONES = {
        loja: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
        caminhao: '<path d="M1 3h13v13H1z"/><path d="M14 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>',
        etiqueta: '<path d="M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
        escudo: '<path d="M12 2l7 3v6c0 5-3 8.5-7 11-4-2.5-7-6-7-11V5z"/><path d="M9 12l2 2 4-4"/>',
        caixa: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
        cifrao: '<path d="M12 1v22"/><path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
        raio: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
        check: '<path d="M5 13l4 4L19 7"/>',
        xis: '<path d="M6 6l12 12M18 6L6 18"/>',
        estoque: '<path d="M3 3h18v6H3z"/><path d="M5 9v12h14V9"/><path d="M9 13h6"/>',
    };

    function ico(nome, classe) {
        return '<svg class="impo-ico ' + (classe || '') + '" viewBox="0 0 24 24" aria-hidden="true">'
            + (ICONES[nome] || '') + '</svg>';
    }

    function selo(texto, classe) {
        return '<span class="impo-cat-selo ' + (classe || '') + '">' + texto + '</span>';
    }

    // Pílula de estado. Verde e vermelho marcam ESTADO; o dourado da marca fica
    // reservado ao que é nosso — misturar os dois faria a marca perder
    // significado e o estado perder legibilidade.
    function pilula(texto, tipo, iconeNome) {
        return '<span class="impo-pill impo-pill-' + tipo + '">'
            + (iconeNome ? ico(iconeNome) : '') + texto + '</span>';
    }

    const pilulaSimNao = (valor) => valor
        ? pilula('Sim', 'sim', 'check')
        : pilula('Não', 'nao', 'xis');

    const pilulaEnvio = (envio) => envio === 'fulfillment'
        ? pilula('FULL', 'full', 'raio')
        : (envio === 'cross_docking' ? pilula('Flex', 'neutro') : pilula(envio || '—', 'neutro'));

    // Reputação e nível de MercadoLíder são campos DIFERENTES: level_id é a cor,
    // power_seller_status é o Gold/Platinum. Sozinha nenhuma das duas conta a
    // história, e mostrar só uma foi o que fez o painel divergir de outras
    // ferramentas sem estar errado.
    function textoReputacao(level, nivel) {
        const partes = [];
        if (level) partes.push(REPUTACAO_ROTULO[level] || level);
        if (nivel) partes.push(nivel.charAt(0).toUpperCase() + nivel.slice(1));
        return partes.length ? partes.join(' · ') : '—';
    }

    function pontoReputacao(level) {
        const cor = REPUTACAO_COR[level];
        return cor ? '<span class="impo-dot" style="background:' + cor + '"></span>' : '';
    }

    function linhaConcorrente(c) {
        // Mesma linguagem da aba Líder: ponto colorido para reputação e pílula
        // para envio. Duas abas do mesmo cartão com códigos visuais diferentes
        // obrigariam a reaprender a leitura ao trocar de aba.
        const envio = pilulaEnvio(c.envio);
        return '<tr' + (c.ganhador ? ' class="impo-cat-ganhador"' : '') + '>'
            + '<td>'
            +   '<strong>' + escaparTexto(c.vendedor) + '</strong>'
            +   (c.ganhador ? selo('GANHADOR', 'impo-cat-vencedor') : '')
            +   '<div class="impo-cat-sub">'
            +     pontoReputacao(c.reputacao)
            +     textoReputacao(c.reputacao, c.nivel)
            +     (c.uf ? ' · ' + escaparTexto(c.uf) : '')
            +     (c.lojaOficial ? ' · Loja oficial' : '')
            +   '</div>'
            + '</td>'
            + '<td class="impo-cat-num">'
            +   'R$ ' + moedaBR(c.preco).replace('R$', '').trim()
            +   (c.precoDe && c.precoDe > c.preco
                ? '<div class="impo-cat-sub impo-cat-risco">R$ ' + moedaBR(c.precoDe).replace('R$', '').trim() + '</div>'
                : '')
            + '</td>'
            + '<td class="impo-cat-num">' + envio + (c.freteGratis ? '<div class="impo-cat-sub">frete grátis</div>' : '') + '</td>'
            + '<td class="impo-cat-num">' + (c.tipoAnuncio || '—') + '</td>'
            + '</tr>';
    }

    function escaparTexto(t) {
        const d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    }

    // ── Modal de concorrentes ─────────────────────────────────────────
    //
    // O cartão tem 288px: espremer sete colunas ali obrigava a quebrar preço em
    // duas linhas e a esconder metade dos campos. A comparação entre vendedores
    // é justamente onde a largura importa, então ela sai do cartão e vira uma
    // camada por cima da página.
    function fecharModalConcorrentes() {
        const m = document.getElementById('impoclick-modal');
        if (m) m.remove();
        document.removeEventListener('keydown', aoTeclarNoModal);
    }

    function aoTeclarNoModal(e) {
        if (e.key === 'Escape') fecharModalConcorrentes();
    }

    function celulaVendedor(c) {
        const inicial = (c.vendedor || '?').trim().charAt(0).toUpperCase();
        return '<div class="impo-m-vend">'
            + '<span class="impo-m-avatar' + (c.ganhador ? ' impo-m-avatar-ganhador' : '') + '">'
            +   escaparTexto(inicial) + '</span>'
            + '<span class="impo-m-vend-txt">'
            +   '<span class="impo-m-nome">' + escaparTexto(c.vendedor) + '</span>'
            +   (c.lojaOficial
                    ? '<span class="impo-m-oficial-txt">' + ico('escudo', 'impo-m-oficial') + 'Loja oficial</span>'
                    : '')
            + '</span>'
            + (c.ganhador ? '<span class="impo-m-chip-ganhador">GANHADOR</span>' : '')
            + '</div>';
    }

    // Preço com a diferença para o mais barato. É o número que o vendedor está
    // realmente procurando — "quanto eu teria que baixar" —, e tê-lo pronto
    // evita a subtração de cabeça linha a linha.
    function celulaPreco(c, menor, maior) {
        const delta = c.preco - menor;
        const faixa = maior > menor ? (c.preco - menor) / (maior - menor) : 0;

        return '<div class="impo-m-preco">'
            + '<strong>' + moedaBR(c.preco) + '</strong>'
            + (c.precoDe && c.precoDe > c.preco
                ? '<span class="impo-m-de">' + moedaBR(c.precoDe) + '</span>' : '')
            + (delta <= 0.001
                ? '<span class="impo-m-menor">menor preço</span>'
                : '<span class="impo-m-delta">+' + moedaBR(delta) + '</span>')
            // Barra de posição na faixa de preços do catálogo: mostra de relance
            // se o anúncio está colado no mais barato ou lá em cima.
            + '<span class="impo-m-barra"><i style="width:' + Math.round(faixa * 100) + '%"></i></span>'
            + '</div>';
    }

    // Visitas REAIS dos ultimos 30 dias, da API do ML. Nao e estimativa, e a
    // unica coluna aqui que nao depende do que a pagina declara.
    function celulaVisitas(c) {
        if (!isFinite(c.visitasDia) || c.visitasDia === null) {
            return '<span class="impo-m-vazio">—</span>';
        }
        return '<div class="impo-m-visitas">'
            + '<strong>' + decimal(c.visitasDia, 1) + '</strong>'
            + '<span class="impo-m-visitas-tot">' + Math.round(c.visitasTotal) + ' em 30d</span>'
            + '</div>';
    }

    // Fatia das visitas do catalogo. O denominador e a soma real de todos os
    // concorrentes, entao a coluna so aparece quando o dado veio de todos.
    function celulaFatia(c) {
        if (!isFinite(c.fatiaVisitas) || c.fatiaVisitas === null) {
            return '<span class="impo-m-vazio">—</span>';
        }
        const pct = Math.round(c.fatiaVisitas * 100);
        return '<div class="impo-m-fatia">'
            + '<strong>' + pct + '%</strong>'
            + '<span class="impo-m-fatia-barra"><i style="width:' + pct + '%"></i></span>'
            + '</div>';
    }

    function abrirModalConcorrentes(dados) {
        fecharModalConcorrentes();

        const lista = dados.concorrentes || [];
        const precos = lista.map((c) => c.preco).filter((p) => typeof p === 'number');
        const menor = precos.length ? Math.min.apply(null, precos) : 0;
        const maior = precos.length ? Math.max.apply(null, precos) : 0;
        const comFull = lista.filter((c) => c.full).length;

        const linhas = lista.map((c) =>
            '<tr' + (c.ganhador ? ' class="impo-m-ganhador"' : '') + '>'
            + '<td>' + celulaVendedor(c) + '</td>'
            + '<td>' + (c.uf ? '<span class="impo-pill impo-pill-neutro">' + escaparTexto(c.uf) + '</span>' : '—') + '</td>'
            + '<td>' + pilulaEnvio(c.envio) + '</td>'
            + '<td class="impo-m-num">' + celulaPreco(c, menor, maior) + '</td>'
            + '<td class="impo-m-num">' + celulaVisitas(c) + '</td>'
            + '<td class="impo-m-num">' + celulaFatia(c) + '</td>'
            + '<td>' + escaparTexto(c.tipoAnuncio || '—') + '</td>'
            + '<td><span class="impo-m-rep">' + pontoReputacao(c.reputacao)
            +   textoReputacao(c.reputacao, c.nivel) + '</span></td>'
            + '<td>' + (c.freteGratis ? pilula('Grátis', 'sim', 'check') : '<span class="impo-m-vazio">—</span>') + '</td>'
            + '</tr>'
        ).join('');

        // Resumo antes da tabela: responde de relance o que a leitura linha a
        // linha só entregaria depois de somar.
        const stat = (rotulo, valor, classe) =>
            '<div class="impo-m-stat ' + (classe || '') + '">'
            +   '<span class="impo-m-stat-val">' + valor + '</span>'
            +   '<span class="impo-m-stat-rot">' + rotulo + '</span>'
            + '</div>';

        const resumo = precos.length
            ? '<div class="impo-m-resumo">'
            +   stat('Menor preço', moedaBR(menor), 'impo-m-stat-destaque')
            +   stat('Maior preço', moedaBR(maior))
            +   stat('Faixa', maior > menor ? moedaBR(maior - menor) : '—')
            +   stat('Com Full', comFull + ' de ' + lista.length)
            + '</div>'
            : '';

        const modal = document.createElement('div');
        modal.id = 'impoclick-modal';
        modal.innerHTML = ''
            + '<div class="impo-m-fundo"></div>'
            + '<div class="impo-m-caixa" role="dialog" aria-label="Concorrentes do catálogo">'
            +   '<header class="impo-m-topo">'
            +     '<div class="impo-m-titulo">'
            +       '<strong>Impoclick</strong><span>Concorrentes</span>'
            +       '<span class="impo-m-conta">' + (dados.total || 0) + '</span>'
            +     '</div>'
            +     '<button type="button" class="impo-m-fechar" aria-label="Fechar">&times;</button>'
            +   '</header>'
            +   (dados.nome ? '<p class="impo-m-produto">' + escaparTexto(dados.nome) + '</p>' : '')
            +   resumo
            +   '<div class="impo-m-rolagem">'
            +     '<table class="impo-m-tabela">'
            +       '<thead><tr>'
            +         '<th>Vendedor</th><th>UF</th><th>Envio</th>'
            +         '<th class="impo-m-num">Preço</th>'
            +         '<th class="impo-m-num">Visitas/dia</th>'
            +         '<th class="impo-m-num">Fatia</th>'
            +         '<th>Anúncio</th><th>Reputação</th><th>Frete</th>'
            +       '</tr></thead>'
            +       '<tbody>' + (linhas || '<tr><td colspan="9">Nenhum concorrente encontrado.</td></tr>') + '</tbody>'
            +     '</table>'
            +   '</div>'
            +   '<footer class="impo-m-rodape">'
            +     'Dados da API oficial do Mercado Livre · Impoclick'
            +   '</footer>'
            + '</div>';

        document.body.appendChild(modal);
        modal.querySelector('.impo-m-fundo').addEventListener('click', fecharModalConcorrentes);
        modal.querySelector('.impo-m-fechar').addEventListener('click', fecharModalConcorrentes);
        document.addEventListener('keydown', aoTeclarNoModal);
    }

    function renderLider(dados) {
        const g = dados.temGanhador ? dados.ganhador : null;

        // Sem ganhador declarado (página `pdp_types: traditional`), cai no
        // anúncio que o Mercado Livre está EXIBINDO agora — é o `wid` da URL, o
        // mesmo que a página mostra em "Vendido por". Não é o mesmo que ganhar
        // a caixa de compra, e o rótulo diz isso: continua sendo fato observado,
        // não dedução a partir do preço.
        const exibido = !g
            ? (dados.concorrentes || []).find((c) => c.itemId === extractItemId())
            : null;

        if (!g && !exibido) {
            return '<p class="impo-cat-vazio">Este catálogo não tem ganhador declarado pelo Mercado Livre, '
                + 'e não consegui identificar qual anúncio a página está exibindo. '
                + 'Veja a aba Concorrentes para todas as ofertas.</p>';
        }

        const dono = g
            ? ((dados.concorrentes || []).find((c) => c.itemId === g.itemId) || {})
            : exibido;

        const envio = g ? g.envio : dono.envio;
        const preco = g ? g.preco : dono.preco;
        const tipo = (g ? g.tipoAnuncio : dono.tipoAnuncio) || '—';
        const oficial = g ? g.lojaOficial : dono.lojaOficial;
        const freteGratis = g ? g.freteGratis : dono.freteGratis;
        // O level_id do buy_box_winner não traz o power_seller_status; o do
        // /items traz. Preferimos o registro do concorrente quando existe.
        const level = dono.reputacao || (g && g.reputacao) || null;
        const estoque = g && g.estoque !== null && g.estoque !== undefined ? g.estoque : null;

        const tile = (icone, rotulo, valor, classe) =>
            '<div class="impo-b-tile ' + (classe || '') + '">'
            +   '<span class="impo-b-rot">' + ico(icone, 'impo-ico-mini') + rotulo + '</span>'
            +   '<span class="impo-b-val">' + valor + '</span>'
            + '</div>';

        const aviso = g
            ? ''
            : '<p class="impo-cat-nota">O Mercado Livre não declara ganhador nesta página. '
              + 'Estes são os dados do anúncio que ele está exibindo agora.</p>';

        return '<div class="impo-b-topo">'
            +   ico('loja')
            +   '<div>'
            +     '<div class="impo-b-nome">' + escaparTexto(dono.vendedor || 'Vendedor não identificado') + '</div>'
            +     '<div class="impo-b-sub">'
            +       pontoReputacao(level)
            +       textoReputacao(level, dono.nivel)
            +       (dono.uf ? ' · ' + escaparTexto(dono.uf) : '')
            +     '</div>'
            +   '</div>'
            + '</div>'
            + '<div class="impo-b-grade">'
            +   tile('caminhao', 'Envio', pilulaEnvio(envio))
            +   tile('etiqueta', 'Anúncio', escaparTexto(tipo))
            +   tile('escudo', 'Loja oficial', pilulaSimNao(oficial))
            +   tile('caixa', 'Frete grátis', pilulaSimNao(freteGratis))
            +   (estoque !== null ? tile('estoque', 'Estoque', estoque + ' un.') : '')
            +   tile('cifrao', 'Vendendo por', moedaBR(preco), 'impo-b-preco')
            + '</div>'
            + aviso;
    }

    async function abrirAbaCatalogo(nome) {
        const corpo = porId('impo-cat-corpo');
        const bloco = porId('impo-cat');
        if (!corpo || !bloco) return;

        // Clicar na aba já aberta fecha, para o cartão não crescer sem volta.
        if (abaAberta === nome) {
            abaAberta = null;
            corpo.classList.add('impoclick-pdp-oculto');
            bloco.querySelectorAll('.impo-cat-aba').forEach((b) => b.classList.remove('ativa'));
            return;
        }

        abaAberta = nome;
        bloco.querySelectorAll('.impo-cat-aba').forEach((b) => {
            b.classList.toggle('ativa', b.dataset.aba === nome);
        });
        corpo.classList.remove('impoclick-pdp-oculto');
        corpo.innerHTML = '<p class="impo-cat-vazio">Consultando o Mercado Livre...</p>';

        const produtoId = idCatalogoDaPagina();
        if (!produtoId) return;

        const r = await buscarCatalogo(produtoId);
        if (r.error === 'not_logged_in') {
            corpo.innerHTML = '<p class="impo-cat-vazio">Entre na sua conta Impoclick pela extensão para ver os concorrentes.</p>';
            return;
        }
        if (r.error || !r.catalogo) {
            corpo.innerHTML = '<p class="impo-cat-vazio">' + escaparTexto(r.message || 'Não foi possível consultar este catálogo.') + '</p>';
            return;
        }
        // A aba pode ter mudado enquanto a consulta corria.
        if (abaAberta !== nome) return;

        if (nome === 'lider') {
            corpo.innerHTML = renderLider(r.catalogo);
            return;
        }

        // Concorrentes abre em camada própria: a comparação entre vendedores
        // precisa de largura, e no cartão de 288px ela virava preço quebrado em
        // duas linhas com metade das colunas de fora.
        abaAberta = null;
        corpo.classList.add('impoclick-pdp-oculto');
        bloco.querySelectorAll('.impo-cat-aba').forEach((b) => b.classList.remove('ativa'));
        abrirModalConcorrentes(r.catalogo);
    }

    function removerCartaoAnuncio() {
        const antigo = document.getElementById('impoclick-pdp-card');
        if (antigo) antigo.remove();
        // O Mercado Livre navega sem recarregar. Sem isto, o modal aberto num
        // anúncio continuava por cima da busca seguinte, mostrando concorrentes
        // de um produto que já não está na tela.
        fecharModalConcorrentes();
    }

    // Recarregar a extensão com a aba aberta deixa este script órfão: o
    // chrome.runtime continua existindo, mas tocar nos métodos dele lança
    // "Extension context invalidated". Uma chamada direta a getURL no meio da
    // marcação derrubava a montagem inteira — o cartão sumia da página, e o
    // sintoma era idêntico ao de um defeito de layout.
    //
    // Sem o logo o cartão ainda serve; sem o cartão não sobra nada.
    function enderecoDoLogo(tamanho) {
        const px = tamanho || 18;
        try {
            const url = chrome.runtime.getURL('icons/icon48.png');
            return '<img src="' + url + '" alt="" width="' + px + '" height="' + px + '">';
        } catch (e) {
            return '';
        }
    }

    function montarCartaoAnuncio() {
        removerCartaoAnuncio();
        if (!looksLikeProductPage()) return;

        const dados = extractPageData();
        if (!dados.price) return;

        const itemId = extractItemId();
        const vendedor = extrairVendedor();
        const social = extrairProvaSocial();

        // Idade estimada pela numeração do id, a mesma curva dos crachás de
        // busca. É ela que transforma "500 vendidos" (um total sem período) em
        // vendas por dia, que é o número comparável entre anúncios.
        let idadeDias = null;
        let idadeDica = '';
        if (itemId) {
            const est = estimarCriacao(itemId);
            if (est && !est.anterior) {
                idadeDias = diasAte(est.dias * DIA_MS);
                // Só texto nosso (datas e frases fixas): seguro dentro do HTML.
                idadeDica = dicaDaEstimativa(est) + ' Vendas/dia e faturamento usam esta idade.';
            }
        }

        const card = document.createElement('div');
        card.id = 'impoclick-pdp-card';
        card.innerHTML = ''
            + '<div class="impoclick-pdp-topo">'
            +   '<span class="impoclick-pdp-marca">'
            +     enderecoDoLogo()
            +     '<span>Impoclick</span>'
            +   '</span>'
            +   (idadeDias !== null ? '<span class="impoclick-pdp-idade" title="' + idadeDica + '">~' + idadeDias + ' dias no ar</span>' : '')
            + '</div>'

            + '<div class="impoclick-pdp-grade">'
            +   caixa('impoclick-pdp-vendas', 'Vendas/dia', 'Total de vendidos dividido pela idade estimada do anúncio.')
            +   caixa('impoclick-pdp-faturamento', 'Faturamento', 'Total de vendidos multiplicado pelo preço de hoje. O preço já mudou ao longo da vida do anúncio, então é uma ordem de grandeza.')
            +   caixa('impoclick-pdp-visitas', 'Visitas/dia', 'Visitas reais dos últimos 30 dias, da API do Mercado Livre — não é estimativa. A média divide pela janela inteira, porque a série tem dias sem registro.')
            +   caixa('impoclick-pdp-conversao', 'Conversão', 'Vendas estimadas divididas pelas visitas reais. Diz se o anúncio converte o tráfego que recebe ou só é visto.')
            +   caixa('impoclick-pdp-reviews', 'Reviews/semana', 'Total de avaliações dividido pelas semanas de anúncio.')
            +   caixa('impoclick-pdp-nota', 'Nota', 'Avaliação média dos compradores.')
            + '</div>'

            + '<div class="impoclick-pdp-payout">'
            +   '<div class="impoclick-pdp-payout-topo">'
            +     '<span>Payout do Meli</span>'
            +     '<span class="impoclick-pdp-ajuda" tabindex="0" role="button"'
            +       ' aria-label="Quanto o Mercado Livre repassa por venda: preço menos comissão e frete. Não inclui o custo do produto nem imposto — para isso, use a calculadora."'
            +       ' data-dica="Quanto o Mercado Livre repassa por venda: preço menos comissão e frete. Não inclui o custo do produto nem imposto — para isso, use a calculadora.">?</span>'
            +   '</div>'
            // Escolha do tipo de anúncio. A comissão do Mercado Livre depende da
            // categoria E do tipo, então os dois repasses aparecem juntos: a
            // pergunta do vendedor é "quanto muda se eu trocar?", e alternar
            // para comparar obrigava a decorar o número anterior. O tipo do
            // anúncio vem marcado; o outro é simulação.
            +   '<div class="impoclick-pdp-tipos" role="radiogroup" aria-label="Tipo de anúncio">'
            +     '<button type="button" role="radio" data-tipo="gold_special">'
            +       '<span class="impoclick-pdp-tipo-nome">Clássico</span>'
            +       '<span class="impoclick-pdp-tipo-valor" data-valor="gold_special">—</span>'
            +     '</button>'
            +     '<button type="button" role="radio" data-tipo="gold_pro">'
            +       '<span class="impoclick-pdp-tipo-nome">Premium</span>'
            +       '<span class="impoclick-pdp-tipo-valor" data-valor="gold_pro">—</span>'
            +     '</button>'
            +   '</div>'
            +   '<div class="impoclick-pdp-payout-corpo">'
            +     '<strong id="impoclick-pdp-liquido">calculando...</strong>'
            +     '<p class="impoclick-pdp-compara impoclick-pdp-oculto" id="impoclick-pdp-compara"></p>'
            +     '<div class="impoclick-pdp-linhas">'
            +       '<div><span>Preço</span><strong>' + moedaBR(dados.price) + '</strong></div>'
            +       '<div><span>Comissão</span><strong id="impoclick-pdp-comissao">—</strong></div>'
            +       '<div><span>Frete est.</span><strong id="impoclick-pdp-frete">—</strong></div>'
            +     '</div>'
            +   '</div>'
            + '</div>'

            + '<div class="impoclick-pdp-acoes">'
            +   '<button type="button" class="impoclick-pdp-btn" id="impoclick-pdp-calc">Abrir calculadora</button>'
            // "Anúncios do vendedor" em vez de "Ver vendedor": o que o vendedor
            // quer daqui é a vitrine do concorrente, não a página de reputação.
            +   (vendedor.urlAnuncios
                    ? '<a class="impoclick-pdp-btn impoclick-pdp-btn-sec" href="' + vendedor.urlAnuncios
                      + '" target="_blank" rel="noopener"'
                      + ' title="Abre a lista de anúncios' + (vendedor.nome ? ' de ' + escaparAtributo(vendedor.nome) : ' deste vendedor') + ' numa aba nova">'
                      + 'Anúncios do vendedor</a>'
                    : '')
            + '</div>'
            + '<p class="impoclick-pdp-aviso impoclick-pdp-oculto" id="impoclick-pdp-aviso"></p>'

            + '<div class="impoclick-pdp-vendedor">'
            +   '<span class="impoclick-pdp-vendedor-nome">' + (vendedor.nome || 'Vendedor não identificado') + '</span>'
            // A etiqueta da cidade não é montada aqui: ela chega da API depois
            // que o cartão já está na tela, e buscarLocalDoVendedor() a insere
            // no começo desta lista.
            +   '<div class="impoclick-pdp-tags">'
            +     (vendedor.tipo ? '<span>Anúncio: ' + vendedor.tipo + '</span>' : '')
            +   '</div>'
            + '</div>'

            // Só em página de catálogo (/p/MLB…): é lá que existe disputa entre
            // vendedores. Em anúncio tradicional não há concorrente a listar.
            + (idCatalogoDaPagina()
                ? '<div class="impo-cat" id="impo-cat">'
                +   '<div class="impo-cat-abas">'
                +     '<button type="button" class="impo-cat-aba" data-aba="concorrentes">Concorrentes</button>'
                +     '<button type="button" class="impo-cat-aba" data-aba="lider">Líder do catálogo</button>'
                +   '</div>'
                +   '<div class="impo-cat-corpo impoclick-pdp-oculto" id="impo-cat-corpo"></div>'
                + '</div>'
                : '');

        // Onde encaixar. O Mercado Livre renomeia essas classes com frequência,
        // então são várias tentativas — e a última é decisiva: pendurar no fim
        // do <body> deixava o cartão no rodapé de uma página longuíssima, o que
        // na prática é o mesmo que não aparecer. Sem âncora, ele vira um cartão
        // flutuante no canto, onde não tem como passar despercebido.
        const ANCORAS = [
            '.ui-pdp-payment',
            '.ui-pdp-container__col-right .ui-box-component',
            '.ui-pdp-container__col-right',
            '.ui-vpp-seller-info',
            '.ui-pdp-container__row--seller-info',
            '.ui-pdp-actions',
            '.ui-pdp-buybox',
            '.ui-pdp-container__row',
        ];

        let ancora = null;
        for (const seletor of ANCORAS) {
            const alvo = document.querySelector(seletor);
            if (alvo && alvo.parentNode) { ancora = alvo; break; }
        }

        if (ancora) {
            ancora.parentNode.insertBefore(card, ancora);
        } else {
            card.classList.add('impoclick-pdp-flutuante');
            document.body.appendChild(card);
        }

        // ── As quatro caixas, todas de conta simples sobre o que a página diz
        if (idadeDias > 0 && social.vendidos !== null) {
            escrever('impoclick-pdp-vendas', decimal(social.vendidos / idadeDias, 1));
        }
        if (social.vendidos !== null) {
            escrever('impoclick-pdp-faturamento', faturamentoCurto(social.vendidos * dados.price));
        }
        if (idadeDias > 0 && social.avaliacoes !== null) {
            escrever('impoclick-pdp-reviews', decimal(social.avaliacoes / (idadeDias / 7), 1));
        }
        if (social.nota !== null) {
            escrever('impoclick-pdp-nota', decimal(social.nota, 1));
        }

        // Visitas são o único número REAL deste bloco — as outras caixas são
        // contas sobre o que a página declara. Por isso vêm depois e sem
        // travar o resto: se a consulta falhar, o cartão já está montado.
        (async () => {
            const alvo = extractItemId();
            if (!alvo) return;
            let r = null;
            try {
                r = await chrome.runtime.sendMessage({ type: 'GET_VISITAS', itemId: alvo });
            } catch (e) {
                return; // service worker dormindo ou aba trocada
            }
            if (!r || !r.visitas || !isFinite(r.visitas.porDia)) return;

            escrever('impoclick-pdp-visitas', decimal(r.visitas.porDia, 1));

            // Conversão só faz sentido com os dois lados: vendas estimadas em
            // cima de visitas reais. Sem idade do anúncio não há vendas/dia, e
            // sem elas a taxa seria um número sem base.
            if (idadeDias > 0 && social.vendidos !== null && r.visitas.porDia > 0) {
                const taxa = (social.vendidos / idadeDias) / r.visitas.porDia;
                escrever('impoclick-pdp-conversao', decimal(taxa * 100, 1) + '%');
            }
        })();

        buscarLocalDoVendedor();
        porId('impoclick-pdp-calc').addEventListener('click', abrirCalculadora);

        // Abas de catálogo. A consulta só sai quando a aba é aberta: são várias
        // chamadas ao Mercado Livre (uma por vendedor), e disparar isso em toda
        // página de catálogo que o usuário abrisse seria custo sem pedido.
        abaAberta = null;
        const blocoCat = porId('impo-cat');
        if (blocoCat) {
            blocoCat.querySelectorAll('.impo-cat-aba').forEach((botao) => {
                botao.addEventListener('click', () => abrirAbaCatalogo(botao.dataset.aba));
            });
        }
        preencherPayout(dados, itemId);
    }

    // O painel lateral só abre a partir de um gesto dentro de um contexto da
    // extensão; o clique numa página comum não conta para o Chrome. Pedimos ao
    // service worker e, se ele não conseguir, dizemos o caminho em vez de o
    // botão morrer calado.
    function abrirCalculadora() {
        chrome.runtime.sendMessage({ type: 'ABRIR_PAINEL' }, (r) => {
            void chrome.runtime.lastError;
            if (r && r.ok) return;
            const aviso = porId('impoclick-pdp-aviso');
            if (aviso) {
                aviso.textContent = 'Clique no ícone do Impoclick na barra do navegador para abrir o painel.';
                aviso.classList.remove('impoclick-pdp-oculto');
            }
        });
    }

    async function preencherPayout(dados, itemId) {
        const elLiquido = porId('impoclick-pdp-liquido');
        if (!elLiquido) return;

        const preco = dados.price;
        let frete = 0;
        let freteDesconhecido = false;
        let categoriaId = null;

        // A comissão do Mercado Livre depende da CATEGORIA e do TIPO de anúncio.
        // O tipo real vem da página; sem ele o backend cairia no padrão Clássico
        // e erraria a conta em todo anúncio Premium. O simulador troca só o tipo,
        // mantendo preço, categoria e frete — é a comparação que o vendedor faz
        // na hora de decidir se muda a exposição do anúncio.
        // Tipo LIDO da página, que pode faltar: aí o cálculo parte do
        // Clássico (padrão do ML), mas nenhum botão leva "este anúncio" —
        // afirmar o tipo sem tê-lo lido seria inventar.
        const tipoLido = lerListingTypeId();
        const tipoReal = tipoLido || 'gold_special';
        const rotuloTipo = (t) => (t === 'gold_pro' ? 'Premium' : 'Clássico');
        let tipoAtual = tipoReal;
        // tipo -> { pct, fixo }. O fixo é a tarifa por unidade que o ML cobra
        // nos itens baratos; ficava de fora porque só o percentual era lido.
        const taxaPorTipo = new Map();

        // Uma consulta só: a resposta de GET_FEE já traz as duas modalidades
        // em `options`, cada uma com percentual e valor total por venda.
        async function carregarComissoes() {
            if (!categoriaId) return;
            const taxa = await chrome.runtime.sendMessage({ type: 'GET_FEE', price: preco, categoryId: categoriaId });
            const opcoes = (taxa && taxa.fee && taxa.fee.options) || [];
            for (const tipo of ['gold_special', 'gold_pro']) {
                const o = opcoes.find((x) => x.id === tipo);
                const pct = o ? Number(o.percentageFee) : NaN;
                if (!isFinite(pct)) continue;
                const total = Number(o.saleFeeAmount);
                const fixoBruto = isFinite(total) ? total - preco * (pct / 100) : 0;
                // Menos de 5 centavos é arredondamento do ML, não tarifa.
                taxaPorTipo.set(tipo, { pct, fixo: fixoBruto >= 0.05 ? Math.round(fixoBruto * 100) / 100 : 0 });
            }
        }

        // Por que a consulta falhou, quando falhou: sessão vencida pede uma
        // ação do usuário (entrar de novo), e o cartão tem de dizer isso em
        // vez de mostrar "—" em todo lugar.
        let motivoFalha = null;
        const ehSessao = (m) => m === 'not_logged_in' || /sess[aã]o|login/i.test(String(m || ''));
        const ehRede = (m) => /conex|rede|internet/i.test(String(m || ''));
        const avisoDoMotivo = () => (ehSessao(motivoFalha) ? 'entre na extensão' : ehRede(motivoFalha) ? 'sem conexão' : null);
        const dicaDoMotivo = () => (ehSessao(motivoFalha)
            ? 'A sessão da extensão acabou. Clique no ícone do Impoclick na barra do Chrome e entre de novo.'
            : ehRede(motivoFalha) ? 'Sem conexão com a internet agora. Recarregue a página quando voltar.' : null);

        const valorComissao = (c) => preco * (c.pct / 100) + c.fixo;
        const percentualBR = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';

        try {
            const cat = await chrome.runtime.sendMessage({ type: 'RESOLVE_CATEGORY', query: dados.title });
            if (cat && cat.category) categoriaId = cat.category.categoryId;
            else if (cat && cat.error) motivoFalha = cat.error;

            // Medidas da ficha técnica quando existem; senão o itemId, e o
            // próprio Mercado Livre usa as que o anúncio tem cadastradas. A
            // documentação é explícita: "os obrigatórios são ITEM_ID ou
            // DIMENSIONS". Exigir a ficha visível deixava sem frete a maioria
            // dos anúncios, que simplesmente não publica peso e dimensões.
            if (dados.dims || itemId) {
                // Se VOCÊ oferece frete grátis — a resposta salva no painel
                // lateral, Sim por padrão. É a operação de quem usa a extensão
                // que decide o custo, e não o "grátis" que a página mostra.
                const pref = await chrome.storage.local.get('ofereceFreteGratis').catch(() => ({}));
                const ofereceGratis = pref.ofereceFreteGratis !== false;

                const f = await chrome.runtime.sendMessage({
                    type: 'GET_FREIGHT',
                    price: preco,
                    itemId: itemId,
                    // O desconto de frete do Mercado Livre depende do tipo do
                    // anúncio. A cotação ia sempre como Clássico, então todo
                    // anúncio Premium recebia um custo que não era o dele.
                    listingType: tipoReal,
                    weight: dados.dims ? dados.dims.weight : null,
                    length: dados.dims ? dados.dims.length : null,
                    width: dados.dims ? dados.dims.width : null,
                    height: dados.dims ? dados.dims.height : null,
                    freeShipping: ofereceGratis,
                });

                const cot = (f && f.freight) || null;
                if (!cot && f && f.error && !motivoFalha) motivoFalha = f.error;
                const temCusto = !!cot && typeof cot.cost === 'number';

                // QUEM paga: a partir de R$ 79 o frete grátis é obrigatório e é
                // sempre do vendedor; abaixo, só se ele oferecer. O "grátis" da
                // página não serve de prova — abaixo do limite o próprio Mercado
                // Livre mostra frete grátis em boa parte dos produtos, e o
                // benefício Meli+ de quem navega também aparece como "grátis".
                const vendedorPaga = !!(cot && (cot.freteGratisObrigatorio || ofereceGratis));

                const el = porId('impoclick-pdp-frete');

                if (temCusto && vendedorPaga) {
                    // O que você pagou em envios de peso parecido vale mais do
                    // que a cotação, que é aproximada e para o país todo. Sem
                    // histórico suficiente, fica a cotação.
                    const hist = f.historico;
                    frete = hist ? hist.custo : cot.cost;
                    if (el) {
                        el.textContent = moedaBR(frete);
                        el.title = hist ? dicaDoHistorico(hist, cot) : dicaDoFrete(cot, !!dados.dims);
                    }
                } else if (cot) {
                    // Abaixo do limite, e o usuário disse que não oferece frete
                    // grátis: o envio não sai do bolso dele. O custo de oferecer
                    // fica como referência na dica, fora do repasse.
                    frete = 0;
                    if (el) {
                        el.textContent = 'sem custo';
                        el.title = 'Você marcou no painel lateral que não oferece frete grátis. Abaixo de R$ 79, assim, o envio não sai do seu bolso.'
                            + (typeof cot.custoOferecendoFreteGratis === 'number' && cot.custoOferecendoFreteGratis > 0
                                ? ' Se oferecesse, custaria ' + moedaBR(cot.custoOferecendoFreteGratis) + ' por venda.'
                                : '');
                    }
                } else {
                    // Sem cotação não dá para saber se o preço passa do limite.
                    // Somar zero mostraria repasse maior que o real, então o
                    // número vira teto.
                    freteDesconhecido = true;
                    if (el) {
                        el.textContent = avisoDoMotivo() || 'não estimado';
                        el.title = dicaDoMotivo() || 'O Mercado Livre não devolveu o custo de envio deste anúncio agora.';
                    }
                }
            } else if (dados.shipping && !dados.shipping.isFree) {
                // Sem frete grátis quem paga o envio é o COMPRADOR: não sai do
                // repasse do vendedor, e o payout está completo mesmo sem
                // medidas. Dizer "sem medidas" aqui sugeria conta furada quando
                // não havia nada a descontar.
                frete = 0;
                const el = porId('impoclick-pdp-frete');
                if (el) {
                    el.textContent = 'pago pelo comprador';
                    el.title = 'Este anúncio não tem frete grátis, então o envio é cobrado do comprador e não reduz o seu repasse.';
                }
            } else {
                // Frete grátis SEM medidas na ficha: aqui o vendedor paga o
                // envio e nós não sabemos quanto. O payout abaixo somava zero e
                // exibia um repasse maior do que o real, sem avisar. Marcamos
                // como incompleto em vez de mostrar número otimista.
                freteDesconhecido = true;
                const el = porId('impoclick-pdp-frete');
                if (el) {
                    el.textContent = 'sem medidas';
                    el.title = 'O anúncio tem frete grátis (pago pelo vendedor), mas não declara peso e dimensões na ficha técnica — sem isso não dá para estimar o custo do envio.';
                }
            }
        } catch (e) {
            // Sem sessão ou sem rede é normal e não vale barulho. Mas engolir
            // TUDO escondeu um ReferenceError por uma versão inteira: o payout
            // aparecia como "—" e nada dizia por quê. Erro de código sai no log.
            const rede = e && (e.message || '').match(/fetch|network|Extension context/i);
            if (!rede) console.error('[Impoclick] falha ao montar o payout:', e);
        }

        const repasseDoTipo = (c) => (c ? preco - valorComissao(c) - frete : null);

        // Os dois repasses ficam visíveis ao mesmo tempo, dentro do próprio
        // seletor: a pergunta é "quanto muda se eu trocar de tipo?", e alternar
        // para comparar obrigava a decorar o número anterior.
        function desenharOpcoes() {
            for (const tipo of ['gold_special', 'gold_pro']) {
                const el = document.querySelector('.impoclick-pdp-tipo-valor[data-valor="' + tipo + '"]');
                if (!el) continue;
                const valor = repasseDoTipo(taxaPorTipo.get(tipo));
                el.textContent = valor === null ? '—' : moedaBR(valor);
            }

            const elCompara = porId('impoclick-pdp-compara');
            if (!elCompara) return;
            const outro = tipoAtual === 'gold_pro' ? 'gold_special' : 'gold_pro';
            const aqui = repasseDoTipo(taxaPorTipo.get(tipoAtual));
            const la = repasseDoTipo(taxaPorTipo.get(outro));
            if (aqui === null || la === null) {
                elCompara.classList.add('impoclick-pdp-oculto');
                return;
            }
            const diferenca = aqui - la;
            elCompara.classList.remove('impoclick-pdp-oculto');
            const comparacao = Math.abs(diferenca) < 0.005
                ? 'mesmo repasse nos dois tipos.'
                : moedaBR(Math.abs(diferenca)) + (diferenca > 0 ? ' a mais' : ' a menos')
                  + ' por venda que em ' + rotuloTipo(outro) + '.';
            // Qual é o tipo do anúncio fica dito aqui, em texto, e não numa
            // etiqueta dentro do botão: dentro dele, "este anúncio" deixava as
            // duas opções com alturas diferentes e disputava espaço com o valor.
            if (!tipoLido) {
                elCompara.textContent = comparacao.charAt(0).toUpperCase() + comparacao.slice(1);
            } else if (tipoAtual === tipoLido) {
                elCompara.textContent = 'Este anúncio é ' + rotuloTipo(tipoLido) + ': ' + comparacao;
            } else {
                // Na simulação o "outro" é justamente o tipo do anúncio, então
                // uma frase só diz as duas coisas.
                elCompara.textContent = 'Simulação: ' + comparacao.replace(/\.$/, '')
                    + ', o tipo deste anúncio.';
            }
        }

        function desenharRepasse(c) {
            const elComissao = porId('impoclick-pdp-comissao');

            // Sem a comissão não existe payout. Mostrar o preço cheio como
            // repasse seria pior do que não mostrar nada.
            if (!c) {
                const aviso = avisoDoMotivo();
                if (elComissao) {
                    elComissao.textContent = aviso || '—';
                    elComissao.title = dicaDoMotivo() || 'O Mercado Livre não devolveu a comissão desta categoria agora.';
                }
                elLiquido.textContent = '—';
                elLiquido.title = dicaDoMotivo() || 'Sem a comissão da categoria não dá para calcular o repasse.';
                return;
            }

            const comissao = valorComissao(c);
            if (elComissao) {
                elComissao.textContent = percentualBR(c.pct) + (c.fixo > 0 ? ' + ' + moedaBR(c.fixo) : '') + ' · ' + moedaBR(comissao);
                elComissao.title = c.fixo > 0
                    ? 'Percentual da categoria mais a tarifa fixa por unidade que o Mercado Livre cobra nos itens de menor valor.'
                    : 'Percentual da categoria para ' + rotuloTipo(tipoAtual) + '.';
            }
            elLiquido.classList.remove('impoclick-pdp-incerto');
            elLiquido.textContent = moedaBR(preco - comissao - frete);
            if (!tipoLido) {
                elLiquido.title = 'Repasse calculado como ' + rotuloTipo(tipoAtual)
                    + '. O tipo deste anúncio não apareceu na página, então não dá para dizer qual é o de hoje.';
            } else {
                elLiquido.title = tipoAtual === tipoLido
                    ? 'Repasse deste anúncio, que é ' + rotuloTipo(tipoLido) + '.'
                    : 'Simulação em ' + rotuloTipo(tipoAtual) + '. Este anúncio é ' + rotuloTipo(tipoLido)
                      + ', então hoje o repasse é o do outro botão.';
            }

            // Frete grátis com medida faltando: o número acima ignora um custo
            // que existe e é do vendedor. Marcar como teto é mais honesto do que
            // exibir um repasse limpo que ninguém vai receber.
            if (freteDesconhecido) {
                elLiquido.textContent = 'até ' + elLiquido.textContent;
                elLiquido.classList.add('impoclick-pdp-incerto');
                elLiquido.title = 'Teto do repasse: o frete grátis deste anúncio sai do bolso do vendedor, '
                    + 'mas o anúncio não declara peso e dimensões, então esse custo não está descontado aqui.';
            }
        }

        // Busca dentro do cartão, não na página inteira: um cartão órfão de
        // montagem anterior ainda preso ao DOM faria esta função escrever nos
        // dois ao mesmo tempo.
        const cartao = porId('impoclick-pdp-card');
        const botoesTipo = Array.from((cartao || document).querySelectorAll('.impoclick-pdp-tipos button'));
        function aplicarTipo(tipo) {
            tipoAtual = tipo;
            for (const b of botoesTipo) {
                const selecionado = b.dataset.tipo === tipo;
                b.classList.toggle('ativo', selecionado);
                b.setAttribute('aria-checked', String(selecionado));
            }
            desenharRepasse(taxaPorTipo.get(tipo));
            desenharOpcoes();
        }
        for (const botao of botoesTipo) {
            const ehReal = !!tipoLido && botao.dataset.tipo === tipoLido;
            botao.classList.toggle('real', ehReal);
            if (!tipoLido) {
                botao.title = 'Comissão ' + rotuloTipo(botao.dataset.tipo) + '. O tipo deste anúncio não apareceu na página.';
            } else {
                botao.title = ehReal
                    ? 'Este anúncio é ' + rotuloTipo(tipoLido) + '. É o repasse que o vendedor recebe hoje.'
                    : 'Simulação: quanto sobraria se este anúncio fosse ' + rotuloTipo(botao.dataset.tipo) + '.';
            }
            // O tipo real é marcado só pela classe .real (um ponto antes do
            // nome, no CSS); a explicação vai na frase de comparação. Uma
            // etiqueta de versão anterior, se ainda estiver no botão, sai.
            const marcaAntiga = botao.querySelector('.impoclick-pdp-tipo-real');
            if (marcaAntiga) marcaAntiga.remove();

            // Um ouvinte por botão. Somar outro a cada passada deixaria o
            // clique chamando a versão ANTIGA de aplicarTipo, com as taxas da
            // montagem anterior.
            if (botao.aoTrocarTipo) botao.removeEventListener('click', botao.aoTrocarTipo);
            botao.aoTrocarTipo = () => aplicarTipo(botao.dataset.tipo);
            botao.addEventListener('click', botao.aoTrocarTipo);
        }

        // As duas taxas são buscadas juntas: sem isso, o valor do tipo não
        // selecionado ficaria em "—" até alguém clicar, que é justamente a
        // comparação que o seletor existe para dar.
        await carregarComissoes();
        aplicarTipo(tipoReal);
    }

    // ── Ponte com o side panel ──────────────────────────────────────────
    // Única mensagem que o painel faz para cá. Responde de forma síncrona,
    // por isso não devolve true no listener: devolver true sem responder
    // depois deixaria o canal aberto à toa.
    chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
        if (!msg || msg.type !== 'GET_PAGE_DATA') return;
        if (!looksLikeProductPage()) {
            responder({ isProductPage: false });
            return;
        }
        responder({
            isProductPage: true,
            // O tipo vai junto porque o painel precisa dele para cobrar a
            // comissão certa e dizer em qual modalidade o anúncio está hoje.
            pageData: Object.assign(extractPageData(), { listingType: lerListingTypeId() }),
            itemId: extractItemId(),
            url: window.location.href,
        });
    });


    // ══════════════════════════════════════════════════════════════════
    // PAINEL DE FILTROS NA BUSCA
    //
    // Lê os cards da página de resultados, conta e filtra sem nenhuma chamada
    // de rede: tudo que o painel usa já está no HTML que o Mercado Livre
    // renderizou. Filtrar esconde o card (display:none) em vez de removê-lo —
    // o ML reaproveita os nós ao paginar, e remover quebraria a página dele.
    // ══════════════════════════════════════════════════════════════════

    const filtroEstado = {
        apenasCatalogo: false,
        semCatalogo: false,
        apenasFull: false,
        apenasGanhadorNormal: false,
        vendasMinDia: 0,
        ordem: null,
    };

    let ordemOriginal = null;

    // ── Extração de um card ───────────────────────────────────────────
    function lerVendidos(texto) {
        if (!texto) return null;
        const m = String(texto).toLowerCase().match(/\+?\s*([\d.,]+)\s*(mil|k)?\s*vendid/i);
        if (!m) return null;
        let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
        if (!isFinite(n)) return null;
        if (m[2]) n *= 1000;
        return Math.round(n);
    }

    // O selo Full não pode ser procurado no texto inteiro do card: título com
    // "full" (bem comum em "full HD", "full face") daria falso positivo e
    // contaminaria a contagem. Só vale elemento cujo texto É o selo.
    function temFull(card) {
        if (card.querySelector('[class*="fulfillment"], [class*="full_icon"], svg[aria-label*="Full" i]')) return true;
        const candidatos = card.querySelectorAll('span, i, p, div');
        for (const el of candidatos) {
            if (el.children.length) continue;
            const t = (el.textContent || '').trim().toLowerCase();
            if (t === 'full' || t === 'full+' || t === 'enviado por full') return true;
        }
        return false;
    }

    function lerPreco(card) {
        // O ML monta o preço em pedaços e pode ter um valor riscado antes do
        // atual. O atual é sempre o ÚLTIMO bloco de fração da árvore.
        const fracoes = card.querySelectorAll('.andes-money-amount__fraction');
        if (!fracoes.length) return null;
        const fracao = fracoes[fracoes.length - 1];
        const inteiro = (fracao.textContent || '').replace(/\D/g, '');
        if (!inteiro) return null;

        const bloco = fracao.closest('.andes-money-amount') || fracao.parentElement;
        const centEl = bloco && bloco.querySelector('.andes-money-amount__cents');
        const cent = centEl ? (centEl.textContent || '').replace(/\D/g, '').slice(0, 2) : '';
        const n = parseFloat(inteiro + '.' + (cent || '00'));
        return isFinite(n) ? n : null;
    }

    function lerCard(card) {
        const info = infoDoCard(card);
        if (!info) return null;

        const texto = card.innerText || '';
        const vendidos = lerVendidos(texto);

        // A idade sai da numeração do id, pelo mesmo estimador que o cartão da
        // página de produto usa. Sem idade não há vendas/dia — e é melhor não
        // ter o número do que inventar um.
        let idadeDias = null;
        const alvoId = info.itemId || info.id;
        if (alvoId) {
            const est = estimarCriacao(alvoId);
            if (est && !est.anterior) idadeDias = diasAte(est.dias * DIA_MS);
        }

        const vendasDia = (isFinite(vendidos) && vendidos > 0 && isFinite(idadeDias) && idadeDias > 0)
            ? vendidos / idadeDias
            : null;

        return {
            card,
            // Outros cards da MESMA página que mostram este mesmo anúncio. O
            // anúncio conta uma vez só no painel, mas todos eles precisam sumir
            // juntos quando o filtro o exclui.
            irmaos: [],
            id: info.id,
            itemId: info.itemId,
            catalogo: info.tipo === 'catalogo',
            full: temFull(card),
            preco: lerPreco(card),
            vendidos,
            idadeDias,
            vendasDia,
        };
    }

    // Guardado para o diagnóstico: quando a contagem não bate com a do Mercado
    // Livre, o que importa é saber QUAIS cards saíram e por quê. Banner de marca
    // e faixa de patrocinado não são produtos e devem sair mesmo; anúncio
    // patrocinado com URL de rastreio é produto e não pode sumir.
    let ultimosDescartados = [];

    // Cards que o painel não conseguiu classificar. Guardados à parte dos
    // repetidos porque o destino deles com filtro ligado é outro.
    let ultimosSemLeitura = [];

    // Porta do painel de filtros, mais estreita que a dos crachás.
    //
    // ehPaginaDeResultados() aceita "6 ou mais cards" como último sinal, e isso
    // serve para os crachás. Para o painel não serve: a página de produto tem
    // carrossel de "Produtos relacionados" com poly-cards de sobra, e o painel
    // aparecia flutuando por cima do anúncio. Aqui exigimos a GRADE de busca.
    function ehBuscaDeVerdade() {
        if (ehAreaDoVendedor() || ehListaDeOfertas() || looksLikeProductPage()) return false;
        if (document.querySelector('ol.ui-search-layout, .ui-search-results')) return true;
        return location.hostname.toLowerCase().indexOf('lista.') === 0;
    }

    function coletarCards() {
        const brutos = Array.from(document.querySelectorAll(SELETORES_CARD));

        // Os seletores se sobrepõem de propósito (o layout do ML muda entre
        // busca, vitrine e carrossel), mas eles se ANINHAM: o <li> do resultado
        // contém o <div.poly-card>. Os dois casam, e sem descartar o interno
        // cada produto entrava duas vezes — a busca de 60 itens contava 120.
        const externos = brutos.filter(
            (el) => !brutos.some((outro) => outro !== el && outro.contains(el))
        );

        // Segunda rede: o mesmo produto pode aparecer em nós diferentes (o card
        // da grade e o do carrossel de patrocinados, por exemplo). Conta uma vez.
        const vistos = new Map();
        const itens = [];
        const descartados = [];
        const semLeitura = [];
        for (const el of externos) {
            const item = lerCard(el);
            if (!item) {
                descartados.push({ motivo: 'sem id de anuncio no card', el });
                semLeitura.push(el);
                continue;
            }
            const chave = item.id || item.itemId;
            if (chave) {
                const gemeo = vistos.get(chave);
                if (gemeo) {
                    // Some junto com o gêmeo em vez de ser esquecido: descartado
                    // da lista, ele continuava visível na tela por mais que o
                    // filtro excluísse o anúncio — e aí "Apenas catálogo" exibia
                    // anúncio tradicional.
                    gemeo.irmaos.push(el);
                    descartados.push({ motivo: 'id repetido: ' + chave, el });
                    continue;
                }
                vistos.set(chave, item);
            }
            itens.push(item);
        }
        ultimosDescartados = descartados;
        ultimosSemLeitura = semLeitura;
        return itens;
    }


    function relatarDescartados() {
        if (!ultimosDescartados.length) {
            console.log('[Impoclick] nenhum card descartado.');
            return;
        }
        console.log('[Impoclick] ' + ultimosDescartados.length + ' card(s) descartado(s):');
        ultimosDescartados.slice(0, 8).forEach((d, n) => {
            const link = d.el.querySelector('a[href]');
            console.log('  ' + (n + 1) + ') ' + d.motivo
                + '\n     classe: ' + (d.el.className || '(sem classe)').slice(0, 90)
                + '\n     href  : ' + (link ? link.href.slice(0, 150) : '(nenhum link)')
                + '\n     texto : ' + (d.el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90));
        });
    }

    // ── Filtro e ordenação ────────────────────────────────────────────
    function passaNosFiltros(i) {
        if (filtroEstado.apenasCatalogo && !i.catalogo) return false;
        if (filtroEstado.semCatalogo && i.catalogo) return false;
        if (filtroEstado.apenasFull && !i.full) return false;
        // "Ganhador normal": tradicional e sem Full — onde dá para competir sem
        // entrar no fulfillment nem disputar a caixa de compra do catálogo.
        if (filtroEstado.apenasGanhadorNormal && (i.full || i.catalogo)) return false;
        if (filtroEstado.vendasMinDia > 0
            && !(isFinite(i.vendasDia) && i.vendasDia >= filtroEstado.vendasMinDia)) return false;
        return true;
    }

    function pontuarOportunidade(i) {
        if (!isFinite(i.vendasDia) || i.vendasDia <= 0) return 0;
        let score = i.vendasDia;
        if (i.catalogo) score *= 0.6;                                   // mais briga
        if (isFinite(i.idadeDias) && i.idadeDias > 0 && i.idadeDias < 90) score *= 1.3; // tração rápida
        return score;
    }

    // Se algum filtro está escondendo card. A ordenação fica de fora: ela
    // reorganiza a grade, não tira ninguém dela.
    function filtroEscondeAlgo() {
        return !!(filtroEstado.apenasCatalogo || filtroEstado.semCatalogo
            || filtroEstado.apenasFull || filtroEstado.apenasGanhadorNormal
            || filtroEstado.vendasMinDia > 0);
    }

    function mostrarCard(el, visivel) {
        const alvo = el.closest('li') || el;
        alvo.style.display = visivel ? '' : 'none';
    }

    function aplicarNaPagina(itens) {
        let visiveis = 0;
        itens.forEach((i) => {
            const ok = passaNosFiltros(i);
            if (ok) visiveis++;
            mostrarCard(i.card, ok);
            i.irmaos.forEach((el) => mostrarCard(el, ok));
        });

        // O card que o painel não conseguiu ler também sai de cena enquanto
        // houver filtro: um resultado a menos é menos grave do que "Apenas
        // catálogo" deixando na tela um anúncio que ninguém sabe classificar.
        // Só dentro da grade — fora dela há faixa de marca e vitrine do
        // vendedor, que não são resultado de busca e não cabe esconder.
        const grade = itens.length
            ? (itens[0].card.closest('li') || itens[0].card).parentElement
            : null;
        const escondendo = filtroEscondeAlgo();
        ultimosSemLeitura.forEach((el) => {
            const alvo = el.closest('li') || el;
            if (!grade || alvo.parentElement !== grade) return;
            mostrarCard(el, !escondendo);
        });

        if (filtroEstado.ordem) {
            const container = itens.length ? (itens[0].card.closest('li') || itens[0].card).parentElement : null;
            if (container) {
                // Guarda a ordem que o Mercado Livre entregou, para o "Limpar
                // tudo" devolver a relevância original em vez de deixar a
                // página embaralhada para sempre.
                if (!ordemOriginal) ordemOriginal = Array.from(container.children);

                const semDado = (v) => !isFinite(v) || v === null;
                const ordenados = itens.slice();
                if (filtroEstado.ordem === 'oportunidade') {
                    ordenados.sort((a, b) => pontuarOportunidade(b) - pontuarOportunidade(a));
                } else if (filtroEstado.ordem === 'vendidos') {
                    ordenados.sort((a, b) => (b.vendidos || 0) - (a.vendidos || 0));
                } else if (filtroEstado.ordem === 'menor') {
                    ordenados.sort((a, b) => (semDado(a.preco) ? Infinity : a.preco) - (semDado(b.preco) ? Infinity : b.preco));
                } else if (filtroEstado.ordem === 'maior') {
                    ordenados.sort((a, b) => (semDado(b.preco) ? -Infinity : b.preco) - (semDado(a.preco) ? -Infinity : a.preco));
                }
                ordenados.forEach((i) => container.appendChild(i.card.closest('li') || i.card));
            }
        } else if (ordemOriginal) {
            const pai = ordemOriginal[0] && ordemOriginal[0].parentElement;
            if (pai) ordemOriginal.forEach((el) => pai.appendChild(el));
            ordemOriginal = null;
        }

        return visiveis;
    }

    // ── Painel ────────────────────────────────────────────────────────
    // Painel em estado de fábrica não tem o que limpar nem o que avisar. É o
    // que decide se "Limpar tudo" e a nota do mínimo aparecem.
    function filtrosAtivos() {
        return !!(filtroEstado.apenasCatalogo || filtroEstado.semCatalogo
            || filtroEstado.apenasFull || filtroEstado.apenasGanhadorNormal
            || filtroEstado.vendasMinDia > 0 || filtroEstado.ordem);
    }

    function montarPainelFiltros(itens) {
        const antigo = document.getElementById('impoclick-filtros');
        if (antigo) antigo.remove();

        const c = {
            total: itens.length,
            catalogo: itens.filter((i) => i.catalogo).length,
            semCatalogo: itens.filter((i) => !i.catalogo).length,
            full: itens.filter((i) => i.full).length,
            fullCat: itens.filter((i) => i.full && i.catalogo).length,
            ganhador: itens.filter((i) => !i.full && !i.catalogo).length,
        };

        const painel = document.createElement('div');
        painel.id = 'impoclick-filtros';

        const toggle = (chave, rotulo, contagem) =>
            '<label class="impo-f-toggle">'
            +   '<span class="impo-f-rotulo">' + rotulo + '</span>'
            +   '<span class="impo-f-conta">' + contagem + '</span>'
            +   '<input type="checkbox" data-filtro="' + chave + '"' + (filtroEstado[chave] ? ' checked' : '') + '>'
            +   '<span class="impo-f-switch"></span>'
            + '</label>';

        const botaoOrdem = (valor, rotulo) =>
            '<button type="button" class="impo-f-ordem' + (filtroEstado.ordem === valor ? ' ativo' : '')
            + '" data-ordem="' + valor + '">' + rotulo + '</button>';

        painel.innerHTML = ''
            + '<div class="impo-f-topo">'
            +   '<span class="impo-f-marca">' + enderecoDoLogo(30) + '<span>Impoclick</span></span>'
            +   '<span class="impo-f-itens" id="impo-f-itens">' + c.total + ' itens</span>'
            + '</div>'
            + '<div class="impo-f-tiles">'
            +   '<div class="impo-f-tile"><strong>' + c.catalogo + '</strong><span>Catálogos</span></div>'
            +   '<div class="impo-f-tile"><strong>' + c.full + '</strong><span>Full</span></div>'
            +   '<div class="impo-f-tile"><strong>' + c.fullCat + '</strong><span>Full+Cat</span></div>'
            + '</div>'
            + '<div class="impo-f-secao">Filtros</div>'
            + toggle('apenasCatalogo', 'Apenas catálogo', c.catalogo)
            + toggle('semCatalogo', 'Sem catálogo', c.semCatalogo)
            + toggle('apenasFull', 'Apenas Full', c.full)
            + toggle('apenasGanhadorNormal', 'Apenas ganhador normal (Sem Full)', c.ganhador)
            + '<div class="impo-f-secao">'
            +   'Vendas mín./dia'
            +   '<span class="impo-f-ajuda" tabindex="0" role="button"'
            +     ' aria-label="Estimado por total vendido dividido pela idade do anúncio."'
            +     ' data-dica="Estimado por total vendido ÷ idade do anúncio.">?</span>'
            + '</div>'
            + '<input type="number" id="impo-f-vendas" class="impo-f-num" min="0" step="0.5" value="'
            +   (filtroEstado.vendasMinDia || 0) + '">'
            + '<p class="impo-f-nota" id="impo-f-nota"' + (filtroEstado.vendasMinDia > 0 ? '' : ' hidden') + '>'
            +   'Cards sem esse dado ficam escondidos enquanto o mínimo for maior que zero.'
            + '</p>'
            + '<div class="impo-f-secao">Ordenar</div>'
            + '<div class="impo-f-ordens">'
            +   botaoOrdem('oportunidade', 'Oportunidade')
            +   botaoOrdem('vendidos', '+ Vendidos')
            +   botaoOrdem('menor', 'Menor R$')
            +   botaoOrdem('maior', 'Maior R$')
            + '</div>'
            + '<button type="button" class="impo-f-limpar" id="impo-f-limpar"'
            +   (filtrosAtivos() ? '' : ' hidden') + '>Limpar tudo</button>';

        // Encaixa na coluna de filtros do próprio ML quando ela existe; se o
        // layout mudar, cai para posição fixa e o painel continua utilizável.
        const barra = document.querySelector('aside.ui-search-sidebar, .ui-search-sidebar');
        if (barra) barra.insertBefore(painel, barra.firstChild);
        else { painel.classList.add('impo-f-flutuante'); document.body.appendChild(painel); }

        painel.querySelectorAll('input[data-filtro]').forEach((el) => {
            el.addEventListener('change', () => {
                filtroEstado[el.dataset.filtro] = el.checked;
                atualizarPainel(true);
            });
        });
        painel.querySelectorAll('button[data-ordem]').forEach((el) => {
            el.addEventListener('click', () => {
                // Clicar de novo na ordem ativa desliga: sem isso não haveria
                // como voltar à relevância do ML sem limpar todos os filtros.
                filtroEstado.ordem = (filtroEstado.ordem === el.dataset.ordem) ? null : el.dataset.ordem;
                atualizarPainel(true);
            });
        });
        const campoVendas = painel.querySelector('#impo-f-vendas');
        if (campoVendas) {
            campoVendas.addEventListener('input', () => {
                filtroEstado.vendasMinDia = parseFloat(campoVendas.value) || 0;
                atualizarPainel(true);
            });
        }
        const limpar = painel.querySelector('#impo-f-limpar');
        if (limpar) {
            limpar.addEventListener('click', () => {
                filtroEstado.apenasCatalogo = false;
                filtroEstado.semCatalogo = false;
                filtroEstado.apenasFull = false;
                filtroEstado.apenasGanhadorNormal = false;
                filtroEstado.vendasMinDia = 0;
                filtroEstado.ordem = null;
                atualizarPainel(true);
            });
        }
    }

    let itensAtuais = [];

    // Atualiza só os números e o botão ativo, sem tocar no innerHTML. É o que
    // permite o painel ser revisitado pelo intervalo e pelo MutationObserver
    // sem roubar o foco de quem está digitando no campo de vendas/dia — que era
    // o efeito de reconstruir o painel a cada passada.
    function atualizarContagens(itens, painel) {
        const c = {
            catalogo: itens.filter((i) => i.catalogo).length,
            semCatalogo: itens.filter((i) => !i.catalogo).length,
            full: itens.filter((i) => i.full).length,
            fullCat: itens.filter((i) => i.full && i.catalogo).length,
            ganhador: itens.filter((i) => !i.full && !i.catalogo).length,
        };
        const tiles = painel.querySelectorAll('.impo-f-tile strong');
        if (tiles[0]) tiles[0].textContent = c.catalogo;
        if (tiles[1]) tiles[1].textContent = c.full;
        if (tiles[2]) tiles[2].textContent = c.fullCat;

        const porChave = {
            apenasCatalogo: c.catalogo,
            semCatalogo: c.semCatalogo,
            apenasFull: c.full,
            apenasGanhadorNormal: c.ganhador,
        };
        painel.querySelectorAll('input[data-filtro]').forEach((el) => {
            const linha = el.closest('.impo-f-toggle');
            const conta = linha && linha.querySelector('.impo-f-conta');
            if (conta) conta.textContent = porChave[el.dataset.filtro];
            // Quem desenha o switch é o checkbox, não o filtroEstado. Sem esta
            // linha, "Limpar tudo" zerava os filtros e deixava todos os
            // switches ligados na tela — o painel mentia sobre o que aplicou.
            el.checked = !!filtroEstado[el.dataset.filtro];
        });
        painel.querySelectorAll('button[data-ordem]').forEach((el) => {
            el.classList.toggle('ativo', filtroEstado.ordem === el.dataset.ordem);
        });

        // Só escreve quando diverge de verdade: reescrever o mesmo valor a
        // cada passada jogaria o cursor de quem está digitando para o fim.
        const campo = painel.querySelector('#impo-f-vendas');
        if (campo && (parseFloat(campo.value) || 0) !== filtroEstado.vendasMinDia) {
            campo.value = filtroEstado.vendasMinDia || 0;
        }

        const limpar = painel.querySelector('#impo-f-limpar');
        if (limpar) limpar.hidden = !filtrosAtivos();

        // O aviso só vale quando o mínimo está ligado — é quando cards passam
        // a sumir por falta do dado, e é aí que a frase evita o susto.
        const nota = painel.querySelector('#impo-f-nota');
        if (nota) nota.hidden = !(filtroEstado.vendasMinDia > 0);
    }

    // Montar o painel e reordenar cards são mutações no DOM, e o observador que
    // dispara esta função escuta mutações. Sem esta trava, ordenar provocaria a
    // própria reordenação de novo, em laço infinito.
    let mexendoNaPagina = false;

    // forcado = veio de um clique do usuário. A trava existe para o observador
    // não reagir às nossas próprias mutações; ignorar um clique por causa dela
    // faria o toggle parecer quebrado.
    function atualizarPainel(forcado) {
        if (mexendoNaPagina && !forcado) return;
        itensAtuais = coletarCards();

        const existente = document.getElementById('impoclick-filtros');
        if (!itensAtuais.length) {
            if (existente) existente.remove();
            return;
        }

        mexendoNaPagina = true;
        try {
            if (!existente) montarPainelFiltros(itensAtuais);
            else atualizarContagens(itensAtuais, existente);

            const visiveis = aplicarNaPagina(itensAtuais);
            const contador = document.getElementById('impo-f-itens');
            if (contador) {
                contador.textContent = (visiveis === itensAtuais.length)
                    ? itensAtuais.length + ' itens'
                    : visiveis + ' de ' + itensAtuais.length;
            }
        } finally {
            // Solta a trava só depois que as mutações desta rodada já passaram
            // pela fila do observador, senão ele acordaria com o que nós mesmos
            // acabamos de fazer.
            setTimeout(() => { mexendoNaPagina = false; }, 50);
        }
    }

    function removerPainelFiltros() {
        const antigo = document.getElementById('impoclick-filtros');
        if (antigo) antigo.remove();
        // Deixar card escondido para trás seria pior que não ter filtro nenhum:
        // o usuário sairia da busca achando que o ML tem menos resultados.
        document.querySelectorAll(SELETORES_CARD).forEach((card) => {
            const alvo = card.closest('li') || card;
            if (alvo.style.display === 'none') alvo.style.display = '';
        });
        ordemOriginal = null;
    }
    function atualizarCrachas() {
        // Marcar links de catálogo só faz sentido em páginas de RESULTADOS
        // (busca, listas, carrosséis) — numa página de produto individual a
        // própria página tem vários links "/p/MLB..." para título, cor e
        // tamanho, que não são cards de busca e confundiam a marcação.
        //
        // As duas telas são excludentes: página de produto ganha o cartão de
        // análise, página de busca ganha os crachás nos cards.
        //
        // A área do vendedor não ganha nenhum dos dois. Sem esta saída, a tela
        // de edição de anúncio deixaria de mostrar o cartão (correto) e passaria
        // a mostrar os crachás nos links de catálogo da própria página — trocando
        // uma intrusão por outra no meio do formulário.
        if (ehAreaDoVendedor()) {
            removerCartaoAnuncio();
            removeCatalogBadges();
            removerPainelFiltros();
            return;
        }

        if (looksLikeProductPage()) {
            removeCatalogBadges();
            removerPainelFiltros();
            montarCartaoAnuncio();
        } else {
            removerCartaoAnuncio();
            markCatalogLinks();
            // O painel de filtros só faz sentido onde existe uma lista de
            // resultados de verdade — a mesma porta que os crachás usam.
            if (ehBuscaDeVerdade()) atualizarPainel();
            else removerPainelFiltros();
        }
    }

    // ── Aviso de troca de anúncio ───────────────────────────────────────
    // Vigiar a URL não servia, por dois motivos:
    //
    // 1. Clicar num produto costuma ser navegação de verdade, não troca de
    //    SPA. O content script recomeça do zero com a URL nova já no lugar,
    //    a comparação nunca acusa mudança, e o painel nunca é avisado — era
    //    isso que deixava o item anterior na tela.
    // 2. Quando é SPA mesmo, o Mercado Livre troca a URL ANTES do conteúdo.
    //    Avisar na hora fazia o painel ler a página antiga.
    //
    // A identidade do anúncio resolve os dois: ela só muda quando o conteúdo
    // realmente trocou, seja por navegação ou por SPA.
    function identidadeDoAnuncio() {
        if (!looksLikeProductPage()) return '';
        const d = extractPageData();
        return [extractItemId() || '', d.title || '', d.price || ''].join('|');
    }

    function avisarPainel() {
        try {
            chrome.runtime.sendMessage({ type: 'PAGE_CHANGED' }, () => void chrome.runtime.lastError);
        } catch (e) {
            // Painel fechado: não há ninguém do outro lado. Situação normal.
        }
    }

    atualizarCrachas();

    // Rede de segurança para o painel de filtros: o observador só acorda com
    // mutação, e se a busca terminar de montar antes dele começar a observar,
    // ninguém mais tentaria. Algumas tentativas espaçadas, e desiste — não vale
    // um temporizador eterno rodando em toda página do Mercado Livre.
    // Diagnóstico do painel. Content script roda em mundo isolado, então expor
    // uma função global não adianta — o console da página não a enxerga. Logar
    // é o único canal que sempre chega até quem está com o F12 aberto.
    function diagnosticoPainel(momento) {
        try {
            const cards = document.querySelectorAll(SELETORES_CARD).length;
            console.log('[Impoclick]', momento, {
                url: location.pathname,
                areaVendedor: ehAreaDoVendedor(),
                pareceProduto: looksLikeProductPage(),
                paginaResultados: ehPaginaDeResultados(),
                cardsNoDom: cards,
                cardsLidos: cards ? coletarCards().length : 0,
                achouSidebar: !!document.querySelector('aside.ui-search-sidebar, .ui-search-sidebar'),
                painelMontado: !!document.getElementById('impoclick-filtros'),
            });
        } catch (e) {
            console.log('[Impoclick] diagnóstico falhou:', e && e.message);
        }
    }

    let tentativasPainel = 0;
    const tentarPainel = setInterval(() => {
        if (document.getElementById('impoclick-filtros')) {
            diagnosticoPainel('painel montado');
            relatarDescartados();
            clearInterval(tentarPainel);
            return;
        }
        if (++tentativasPainel > 12) {
            diagnosticoPainel('desisti apos 12 tentativas');
            clearInterval(tentarPainel);
            return;
        }
        if (ehAreaDoVendedor() || looksLikeProductPage()) return;
        if (ehBuscaDeVerdade()) {
            try {
                atualizarPainel();
            } catch (e) {
                // Sem este try, um erro aqui mataria o intervalo em silêncio e o
                // sintoma seria exatamente "não aparece nada".
                console.log('[Impoclick] erro ao montar o painel:', e && e.stack ? e.stack : e);
                clearInterval(tentarPainel);
            }
        }
        if (tentativasPainel === 3) diagnosticoPainel('tentativa 3');
    }, 800);

    // Vazia no começo de propósito: em document_idle o Mercado Livre ainda
    // pode estar montando a página. Assim a primeira leitura boa conta como
    // mudança e o painel é avisado, inclusive numa navegação comum.
    let ultimaIdentidade = '';

    // O cartão é inserido DENTRO do DOM do Mercado Livre (antes de uma âncora
    // .ui-pdp-*). Quando o ML re-renderiza aquela coluna — o que acontece sozinho
    // depois da hidratação —, ele leva o nosso cartão junto. Só a identidade não
    // acusa isso: o anúncio continua o mesmo, e o cartão nunca voltava até um F5.
    // Se a página tem preço na tela, o cartão tem que estar lá.
    function cartaoPrecisaVoltar() {
        if (!looksLikeProductPage()) return false;
        if (document.getElementById('impoclick-pdp-card')) return false;
        return Boolean(extractPageData().price);
    }

    setInterval(() => {
        const agora = identidadeDoAnuncio();
        const trocouDeAnuncio = agora !== ultimaIdentidade;
        if (!trocouDeAnuncio && !cartaoPrecisaVoltar()) return;
        ultimaIdentidade = agora;
        atualizarCrachas();
        // O painel lateral só precisa saber de troca de anúncio; remontar o
        // cartão sumido não é notícia para ele.
        if (trocouDeAnuncio) avisarPainel();
    }, 700);

    // Resultados de busca carregam aos poucos (scroll infinito, paginação via
    // SPA) — observamos novos links aparecendo para marcar os produtos de
    // catálogo que ainda não tinham sido renderizados.
    let esperaMarcacao = null;
    const observador = new MutationObserver(() => {
        clearTimeout(esperaMarcacao);
        esperaMarcacao = setTimeout(() => {
            // O painel do vendedor é uma SPA e dispara mutação o tempo todo;
            // sem esta saída o observador voltaria a marcar links a cada
            // mudança de tela, mesmo com o atualizarCrachas() já limpando.
            if (ehAreaDoVendedor()) return;
            if (!looksLikeProductPage()) {
                markCatalogLinks();
                // O painel precisa entrar por aqui, e não só no arranque. Em
                // document_idle a busca do Mercado Livre ainda não renderizou os
                // cards; a primeira tentativa encontrava zero e o painel nunca
                // mais era montado, porque o intervalo só reage a TROCA de
                // anúncio — que numa busca não acontece.
                if (ehBuscaDeVerdade()) atualizarPainel();
            }
            repositionCatalogBadges();
        }, 300);
    });
    // 'src' entra na lista porque as fotos do Mercado Livre carregam por
    // preguiça: a troca do src não cria nem remove nó nenhum, então o
    // observador de childList não via nada. O card examinado antes da foto
    // existir ficava sem crachá para sempre — e os que já tinham ficavam com o
    // crachá na posição antiga, porque a foto muda a altura da grade.
    observador.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
    });
})();
