// Proxy para a API do IBPT: o navegador não consegue chamá-la direto porque
// ela não envia cabeçalhos CORS. Devolve a carga tributária federal aproximada
// para produtos importados, usada como estimativa quando o NCM não está na base
// curada com alíquotas reais (ncm_db.js, ~42 códigos).
//
// HISTÓRICO: o provedor antigo (api-ibpt.seunegocionanuvem.com.br) saiu do ar —
// passou a responder 404 em toda consulta, confirmado em 15/08/2026. Migrado
// para a API oficial "De Olho no Imposto" do IBPT.
//
// ┌─ CONFIGURAÇÃO NECESSÁRIA ────────────────────────────────────────────────┐
// │ Enquanto IBPT_TOKEN e IBPT_CNPJ não existirem nas env vars da Vercel,    │
// │ este endpoint responde 503 com available:false — de propósito, pra não   │
// │ fingir que tem dado. O front (fetchIbptTaxEstimate no app.js) já trata   │
// │ esse caso, e a tabela de impostos passou a marcar os itens sem alíquota  │
// │ com aviso em vez de exibir 0,0%.                                          │
// │                                                                          │
// │ Para ativar:                                                             │
// │  1. Cadastre-se em https://deolhonoimposto.ibpt.org.br                   │
// │  2. Gere o token (fica vinculado ao CNPJ cadastrado)                     │
// │  3. Na Vercel > Settings > Environment Variables, em Production:         │
// │       IBPT_TOKEN = <o token>                                             │
// │       IBPT_CNPJ  = <o CNPJ, só números>                                  │
// │  4. vercel --prod                                                        │
// └──────────────────────────────────────────────────────────────────────────┘

const UPSTREAM = 'https://apidoni.ibpt.org.br/api/v1/produtos';
const UPSTREAM_TIMEOUT_MS = 5000;

// Rate limit em memória. Este endpoint é o único sem autenticação, então é o
// mais fácil de martelar de fora — e agora consome cota de um token pago, o que
// torna a trava mais importante do que era. Em serverless o Map vive por
// instância quente e some quando ela recicla: não é uma trava rígida, mas corta
// o abuso de origem única sem depender de Redis/Upstash.
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function rateLimited(req) {
    const fwd = req.headers['x-forwarded-for'] || '';
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim() || 'desconhecido';
    const now = Date.now();

    const hits = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    hits.push(now);
    HITS.set(ip, hits);

    if (HITS.size > 5000) {
        for (const [k, v] of HITS) {
            if (!v.length || now - v[v.length - 1] > WINDOW_MS) HITS.delete(k);
        }
    }

    return hits.length > MAX_PER_WINDOW;
}

// A API devolve as chaves capitalizadas (Importado, Descricao...), mas leitura
// defensiva porque isso já mudou entre versões e um rename silencioso aqui
// voltaria a produzir alíquota zero sem ninguém perceber.
function pick(obj, ...nomes) {
    for (const n of nomes) {
        if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
    }
    return undefined;
}

module.exports = async (req, res) => {
    if (rateLimited(req)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Muitas consultas. Tente de novo em um minuto.' });
    }

    const clean = (req.query.ncm || '').toString().replace(/[^0-9]/g, '');
    if (clean.length !== 8) {
        return res.status(400).json({ error: 'NCM deve ter 8 dígitos.' });
    }

    const token = process.env.IBPT_TOKEN;
    const cnpj = (process.env.IBPT_CNPJ || '').replace(/[^0-9]/g, '');
    if (!token || !cnpj) {
        console.warn('IBPT_TOKEN/IBPT_CNPJ não configurados — estimativa tributária desativada. Ver instruções no topo de api/ncm-tax-estimate.js');
        return res.status(503).json({
            error: 'A estimativa tributária não está configurada neste ambiente.',
            available: false,
            motivo: 'nao_configurado',
        });
    }

    // UF entra por querystring pra permitir estimativa por estado no futuro;
    // SP é só o padrão. A carga federal (campo Importado) não varia por UF, mas
    // a API exige o parâmetro.
    const uf = (req.query.uf || 'SP').toString().toUpperCase().slice(0, 2);

    try {
        const qs = new URLSearchParams({
            token,
            cnpj,
            codigo: clean,
            uf,
            ex: '0',
            codigoInterno: '',
            descricao: '',
            unidadeMedida: '',
            valor: '0',
            gtin: '',
        });

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
        let resp;
        try {
            resp = await fetch(`${UPSTREAM}?${qs.toString()}`, {
                signal: ctrl.signal,
                headers: { Accept: 'application/json' },
            });
        } finally {
            clearTimeout(timer);
        }

        if (resp.status === 401 || resp.status === 403) {
            console.error(`IBPT recusou as credenciais (${resp.status}). Token expirado ou CNPJ divergente — conferir em deolhonoimposto.ibpt.org.br`);
            return res.status(503).json({
                error: 'A estimativa tributária está temporariamente indisponível.',
                available: false,
                motivo: 'credenciais',
            });
        }

        if (resp.status === 404) {
            // NCM inexistente na tabela do IBPT: resposta legítima, não é falha.
            return res.status(200).json({ ncm: clean, descricao: null, importadosFederalPct: null, available: true });
        }

        if (!resp.ok) {
            console.error(`IBPT respondeu ${resp.status}.`);
            return res.status(502).json({ error: 'Falha ao consultar a API do IBPT.', available: false });
        }

        const data = await resp.json();
        const bruto = pick(data, 'Importado', 'importado', 'importadosfederal');
        const pct = bruto !== undefined ? parseFloat(String(bruto).replace(',', '.')) : NaN;

        res.json({
            ncm: clean,
            descricao: pick(data, 'Descricao', 'descricao') || null,
            importadosFederalPct: !isNaN(pct) ? pct : null,
            available: true,
        });
    } catch (err) {
        const motivo = err.name === 'AbortError' ? 'timeout' : err.message;
        console.error('Erro ao consultar IBPT:', motivo);
        res.status(502).json({ error: 'Erro ao consultar a API do IBPT.', available: false });
    }
};
