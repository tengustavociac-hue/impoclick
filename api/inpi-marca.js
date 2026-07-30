// Consulta de marcas na base pública do INPI (Instituto Nacional da
// Propriedade Industrial), via a API que alimenta a nova plataforma de
// busca do INPI (servicos.busca.inpi.gov.br). Essa API roda num ambiente
// rotulado pelo próprio INPI como "homologação — versão de avaliação", ou
// seja, é uma versão beta sem contrato/documentação pública oficial — pode
// mudar ou sair do ar sem aviso. Por isso o resultado deve ser tratado como
// referência rápida, não como certidão oficial (a busca definitiva continua
// sendo feita pelo usuário direto no site do INPI antes de qualquer decisão).
const { getVerifiedUserId } = require('./_ml-helper');

const INPI_SEARCH_URL = 'https://pi-api-dev.ibict.br/api/trademarks/search';

// A base beta acima às vezes mostra a SITUAÇÃO do processo desatualizada
// (ex: um pedido já registrado ainda aparecendo como "aguardando prazo de
// oposição"). O sistema clássico do INPI (pePI, busca.inpi.gov.br) é quem
// tem a situação real e atualizada — confirmado comparando um processo real
// entre as duas fontes. Por isso, depois da busca por nome na base beta,
// buscamos de novo — agora por número de processo — nessa base clássica só
// pra pegar a situação (status) certa de cada resultado mostrado.
const INPI_LEGACY_LOGIN_URL = 'https://busca.inpi.gov.br/pePI/servlet/LoginController?action=login';
const INPI_LEGACY_SEARCH_URL = 'https://busca.inpi.gov.br/pePI/servlet/MarcasServletController';

function stripHtml(fragment) {
    return fragment
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

// A base clássica exige uma sessão "anônima" (cookie) antes de aceitar
// busca — sem login/senha, só visitar essa URL já libera. As DUAS cookies
// (JSESSIONID e BUSCAID) são necessárias; faltando uma, a busca seguinte
// cai de volta na tela de login em vez de mostrar o resultado.
async function getLegacySessionCookie() {
    const resp = await fetch(INPI_LEGACY_LOGIN_URL);
    const cookies = typeof resp.headers.getSetCookie === 'function'
        ? resp.headers.getSetCookie()
        : [resp.headers.get('set-cookie')].filter(Boolean);
    if (cookies.length === 0) return null;
    return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function fetchLegacyStatusOnce(processNumber, cookieHeader) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
        const url = `${INPI_LEGACY_SEARCH_URL}?Action=searchMarca&tipoPesquisa=BY_NUM_PROC&NumPedido=${encodeURIComponent(processNumber)}`;
        const resp = await fetch(url, { headers: { Cookie: cookieHeader }, signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return null;

        const buffer = await resp.arrayBuffer();
        const html = new TextDecoder('iso-8859-1').decode(buffer);

        const rowMatch = html.match(/<tr bgColor="#E0E0E0"[^>]*>([\s\S]*?)<\/tr>/i);
        if (!rowMatch) return null;

        const cells = Array.from(rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) => stripHtml(m[1]));
        // Ordem das colunas na tabela do pePI: Número, Prioridade, (ícone
        // tipo), Marca, (ícone situação), Situação, Titular, Classe.
        if (cells.length < 6 || !cells[5]) return null;

        return { status: cells[5] };
    } catch (err) {
        clearTimeout(timeout);
        return null;
    }
}

// A base clássica também falha/expira sessão de vez em quando (a mesma
// instabilidade vista na base beta) — sem retry, um "null" isolado faz a
// gente silenciosamente manter o status desatualizado da base beta, que era
// exatamente o problema relatado. Uma segunda tentativa (com cookie novo)
// reduz bastante esse caso.
async function fetchLegacyStatus(processNumber, cookieHeader, getFreshCookie) {
    let result = await fetchLegacyStatusOnce(processNumber, cookieHeader);
    if (result) return result;

    const freshCookie = await getFreshCookie().catch(() => null);
    if (!freshCookie) return null;
    return fetchLegacyStatusOnce(processNumber, freshCookie);
}

function buildSearchPayload(term, page) {
    return {
        state: {
            current: page || 1,
            filters: [],
            resultsPerPage: 10,
            searchTerm: term,
            sortDirection: '',
            sortField: '',
            sortList: [],
        },
        queryConfig: {
            search_fields: { mark_name: { weight: 3 }, 'procurator.name': {}, 'holders.name': {}, process_number: {} },
            result_fields: {
                mark_name: { snippet: { size: 100, fallback: true } },
                classification_code: { raw: {} },
                country_code: { raw: {} },
                filing_date: { raw: {} },
                grant_date: { raw: {} },
                holders: { raw: {} },
                nature_text: { raw: {} },
                presentation_text: { raw: {} },
                process_number: { raw: {} },
                publication_date: { raw: {} },
                specifications: { raw: {} },
                status: { raw: {} },
                validity_date: { raw: {} },
            },
            disjunctiveFacets: ['status'],
            facets: {},
        },
    };
}

// A API beta do INPI falha de forma intermitente (~1 em cada 4-5 chamadas
// nos testes reais, com 502/timeout esporádicos) — típico de ambiente de
// homologação, não um problema no nosso lado. Uma segunda tentativa quase
// sempre resolve, então tentamos de novo antes de desistir. O orçamento de
// tempo fica bem abaixo do limite de execução da função serverless (10s no
// plano Hobby) pra não sermos nós mesmos a travar a resposta.
async function fetchInpiWithRetry(payload, attempts = 2) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
            const resp = await fetch(INPI_SEARCH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (resp.ok) return resp;
            lastError = new Error(`INPI respondeu ${resp.status}`);
        } catch (err) {
            clearTimeout(timeout);
            lastError = err;
        }
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 400));
    }
    throw lastError;
}

module.exports = async (req, res) => {
    const userId = await getVerifiedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

    const { q, page } = req.query;
    if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: 'Informe pelo menos 2 caracteres para buscar a marca.' });
    }

    try {
        let resp;
        try {
            resp = await fetchInpiWithRetry(buildSearchPayload(q.trim(), Number(page) || 1));
        } catch (err) {
            return res.status(502).json({ error: 'A base do INPI não respondeu depois de 2 tentativas — tente novamente em instantes.' });
        }

        const data = await resp.json();

        const results = (data.results || []).map((r) => {
            const classificationCode = r.classification_code && r.classification_code.raw;
            const specifications = (r.specifications && r.specifications.raw) || [];

            // A classe de Nice (NCL) vem de duas fontes possíveis: a lista
            // de especificações do processo (mais completa, com descrição
            // legível) ou, quando ela vier vazia, os 2 primeiros dígitos do
            // código de classificação do próprio INPI (ex: "25102030" ->
            // classe 25, vestuário) — sem descrição nesse caso de reserva.
            const niceClassesMap = new Map();
            specifications.forEach((spec) => {
                if (spec.nice_class_code && !niceClassesMap.has(spec.nice_class_code)) {
                    niceClassesMap.set(spec.nice_class_code, spec.nice_class_description || null);
                }
            });
            if (niceClassesMap.size === 0 && classificationCode) {
                niceClassesMap.set(classificationCode.slice(0, 2), null);
            }
            const niceClasses = Array.from(niceClassesMap, ([code, description]) => ({ code, description }));

            return {
                processNumber: r.process_number && r.process_number.raw,
                markName: r.mark_name && r.mark_name.raw,
                holders: ((r.holders && r.holders.raw) || []).map((h) => h.name),
                classificationCode: classificationCode || null,
                niceClasses,
                natureText: r.nature_text && r.nature_text.raw,
                presentationText: r.presentation_text && r.presentation_text.raw,
                status: r.status && r.status.raw,
                filingDate: r.filing_date && r.filing_date.raw,
                grantDate: r.grant_date && r.grant_date.raw,
                validityDate: r.validity_date && r.validity_date.raw,
            };
        });

        // Confirma a situação real de cada resultado exibido direto na base
        // clássica (autoritativa) do INPI, em paralelo. Se a checagem falhar
        // pra algum item específico, mantém a situação da base beta (que já
        // vem com aviso de que pode estar desatualizada).
        const topResults = results.slice(0, 5);
        try {
            const cookieHeader = await getLegacySessionCookie();
            if (cookieHeader) {
                await Promise.all(topResults.map(async (r) => {
                    if (!r.processNumber) return;
                    const legacy = await fetchLegacyStatus(r.processNumber, cookieHeader, getLegacySessionCookie);
                    if (legacy && legacy.status) {
                        r.status = legacy.status;
                        r.statusConfirmed = true;
                    }
                }));
            }
        } catch (err) {
            // Sem sessão/base clássica indisponível — segue com o status da
            // base beta mesmo, sem travar a resposta principal por causa disso.
        }

        res.json({
            query: q.trim(),
            totalResults: data.totalResults || 0,
            totalPages: data.totalPages || 0,
            page: Number(page) || 1,
            results,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
