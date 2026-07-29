// Consulta de marcas na base pública do INPI (Instituto Nacional da
// Propriedade Industrial), via a API que alimenta a nova plataforma de
// busca do INPI (servicos.busca.inpi.gov.br). Essa API roda num ambiente
// rotulado pelo próprio INPI como "homologação — versão de avaliação", ou
// seja, é uma versão beta sem contrato/documentação pública oficial — pode
// mudar ou sair do ar sem aviso. Por isso o resultado deve ser tratado como
// referência rápida, não como certidão oficial (a busca definitiva continua
// sendo feita pelo usuário direto no site do INPI antes de qualquer decisão).
const INPI_SEARCH_URL = 'https://pi-api-dev.ibict.br/api/trademarks/search';

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

module.exports = async (req, res) => {
    const userId = req.headers['user-token'];
    if (!userId) return res.status(401).json({ error: 'User token is required.' });

    const { q, page } = req.query;
    if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: 'Informe pelo menos 2 caracteres para buscar a marca.' });
    }

    try {
        const resp = await fetch(INPI_SEARCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildSearchPayload(q.trim(), Number(page) || 1)),
        });

        if (!resp.ok) {
            return res.status(502).json({ error: 'A base do INPI não respondeu — tente novamente em instantes.' });
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
