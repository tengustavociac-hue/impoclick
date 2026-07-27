// Proxy para a API do IBPT: o navegador não consegue chamá-la direto porque
// ela não envia cabeçalhos CORS. Devolve a carga tributária federal
// aproximada para produtos importados (campo "importadosfederal") usada
// como estimativa quando o NCM não está na base curada (ncm_db.js).
module.exports = async (req, res) => {
    const clean = (req.query.ncm || '').toString().replace(/[^0-9]/g, '');
    if (clean.length !== 8) {
        return res.status(400).json({ error: 'NCM deve ter 8 dígitos.' });
    }

    try {
        const resp = await fetch(`https://api-ibpt.seunegocionanuvem.com.br/api_ibpt.php?codigo=${clean}&uf=SP`);
        if (!resp.ok) {
            return res.status(502).json({ error: 'Falha ao consultar a API do IBPT.' });
        }
        const data = await resp.json();
        const pct = data && data.importadosfederal ? parseFloat(data.importadosfederal) : NaN;

        res.json({
            ncm: clean,
            descricao: data && data.descricao ? data.descricao : null,
            importadosFederalPct: !isNaN(pct) ? pct : null,
        });
    } catch (err) {
        console.error('Erro ao consultar IBPT:', err);
        res.status(502).json({ error: 'Erro ao consultar a API do IBPT.' });
    }
};
