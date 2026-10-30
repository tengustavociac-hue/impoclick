// Gera o ncm_rates.js a partir das fontes OFICIAIS do governo.
//
//   node tools/gerar-ncm-rates.js
//
// Por que este arquivo existe: a estimativa de alíquota dependia de uma API de
// terceiro (IBPT via seunegocionanuvem) que simplesmente saiu do ar, e o app
// passou a calcular imposto ZERO para todo NCM fora dos 42 curados no
// ncm_db.js — silenciosamente, porque a descrição do produto continuava
// aparecendo certa (vem de outra fonte). Trocar por outra API viva só mudaria
// de quem dependemos. Uma tabela local gerada de fonte oficial não quebra
// sozinha, não pede token e não tem licença restritiva: TEC e TIPI são atos
// normativos, texto legal, domínio público.
//
// FONTES
//   II  -> TEC, Anexo I da Resolução Gecex nº 272/2021 (MDIC/Camex)
//   IPI -> TIPI, Decreto nº 11.158/2022 e atualizações (Receita Federal)
//
// PIS e COFINS-Importação não entram aqui: são alíquotas gerais fixadas na
// Lei 10.865/2004 (2,1% e 9,65%), não variam por NCM na regra geral. Ficam como
// constantes no arquivo gerado.
//
// QUANDO REGERAR: a TEC muda por Resolução Gecex e a TIPI por Decreto/ADE —
// algumas vezes por ano. Rode este script de novo e publique. As URLs abaixo
// apontam para o arquivo "vigente" de cada órgão; se alguma mudar de lugar, o
// script falha alto dizendo qual, em vez de gerar tabela pela metade.

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEC_URL = 'https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/arquivos-listas/02-12-2025-anexos-i-a-x-resolucao-gecex-272-21.xlsx';
const TIPI_URL = 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx';
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const NCM8 = /^\d{4}\.\d{2}\.\d{2}$/;

const PIS_IMPORTACAO = 2.1;
const COFINS_IMPORTACAO = 9.65;

async function baixar(url, destino, rotulo) {
    process.stdout.write(`baixando ${rotulo}... `);
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!resp.ok) {
        throw new Error(`${rotulo} respondeu ${resp.status}. A URL pode ter mudado de lugar:\n  ${url}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(destino, buf);
    console.log(`${Math.round(buf.length / 1024)} KB`);
    return buf;
}

// Célula pode ser o NÚMERO 0, que é falsy — por isso nada de `celula || ''`
// aqui. Esse detalhe custou uma rodada inteira: 6175 NCMs com IPI 0% foram
// classificados como "valor irreconhecível" na primeira tentativa.
function textoDaCelula(celula) {
    if (celula === '' || celula === null || celula === undefined) return null;
    return String(celula).trim();
}

function extrairTec(XLSX, buf) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const aba = wb.SheetNames.find((n) => /anexo\s*i\b.*tec/i.test(n));
    if (!aba) throw new Error(`Aba "Anexo I - TEC" não encontrada. Abas: ${wb.SheetNames.join(' | ')}`);

    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: '' });
    const tec = {};
    for (const l of linhas) {
        const cod = textoDaCelula(l[0]);
        if (!cod || !NCM8.test(cod)) continue;
        const txt = textoDaCelula(l[2]);
        if (txt === null) continue;
        const n = parseFloat(txt.replace(',', '.'));
        if (isNaN(n)) continue;
        tec[cod.replace(/\D/g, '')] = Math.round(n * 100) / 100;
    }
    return tec;
}

function extrairTipi(XLSX, buf) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const aba = wb.SheetNames.find((n) => /completa/i.test(n)) || wb.SheetNames[0];
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: '' });
    const tipi = {};
    for (const l of linhas) {
        const cod = textoDaCelula(l[0]);
        if (!cod || !NCM8.test(cod)) continue;
        // Coluna EX preenchida = alíquota de exceção para um destaque
        // específico, não a regra geral do NCM. Fora.
        if (textoDaCelula(l[1])) continue;
        const txt = textoDaCelula(l[3]);
        if (txt === null) continue;
        // "NT" = não tributado. É 0% de verdade, não dado faltando.
        if (txt.toUpperCase() === 'NT') { tipi[cod.replace(/\D/g, '')] = 0; continue; }
        const n = parseFloat(txt.replace(',', '.'));
        if (isNaN(n)) continue;
        tipi[cod.replace(/\D/g, '')] = Math.round(n * 100) / 100;
    }
    return tipi;
}

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ncm-rates-'));
    try {
        const [tecBuf, tipiBuf, sheetBuf] = [
            await baixar(TEC_URL, path.join(tmp, 'tec.xlsx'), 'TEC (MDIC)'),
            await baixar(TIPI_URL, path.join(tmp, 'tipi.xlsx'), 'TIPI (Receita Federal)'),
            await baixar(SHEETJS_URL, path.join(tmp, 'xlsx.js'), 'SheetJS'),
        ];

        const XLSX = require(path.join(tmp, 'xlsx.js'));

        const tec = extrairTec(XLSX, tecBuf);
        const tipi = extrairTipi(XLSX, tipiBuf);
        console.log(`\nTEC:  ${Object.keys(tec).length} NCMs com alíquota de II`);
        console.log(`TIPI: ${Object.keys(tipi).length} NCMs com alíquota de IPI`);

        if (Object.keys(tec).length < 8000) {
            throw new Error(`Só ${Object.keys(tec).length} NCMs na TEC — esperado ~10.500. Formato da planilha provavelmente mudou; revise extrairTec() antes de publicar.`);
        }

        // II é obrigatório: sem ele não há cálculo de importação. IPI ausente
        // com II presente é raro (poucas dezenas) e assume 0.
        const tabela = {};
        let semIpi = 0;
        for (const ncm of Object.keys(tec).sort()) {
            const ipi = tipi[ncm];
            if (ipi === undefined) semIpi++;
            tabela[ncm] = [tec[ncm], ipi === undefined ? 0 : ipi];
        }

        console.log(`\ntabela final: ${Object.keys(tabela).length} NCMs (${semIpi} sem IPI na TIPI, assumido 0)`);

        const destino = path.join(__dirname, '..', 'ncm_rates.js');
        const conteudo = `// GERADO AUTOMATICAMENTE por tools/gerar-ncm-rates.js — não edite à mão.
//
// Alíquotas oficiais de importação por NCM:
//   II  -> TEC, Anexo I da Resolução Gecex nº 272/2021 (MDIC/Camex)
//   IPI -> TIPI, Decreto nº 11.158/2022 e atualizações (Receita Federal)
//
// Formato compacto "ncm": [II, IPI] em vez de objeto por NCM: são ${Object.keys(tabela).length}
// entradas, e a forma verbosa passaria de 1 MB. A descrição do produto NÃO fica
// aqui de propósito — o app já baixa a nomenclatura oficial do Portal Único
// Siscomex e guarda em state.ncmCache.
//
// PIS e COFINS-Importação são alíquotas gerais da Lei 10.865/2004, não variam
// por NCM na regra geral.
//
// Gerado em ${new Date().toISOString().slice(0, 10)}.

const PIS_IMPORTACAO = ${PIS_IMPORTACAO};
const COFINS_IMPORTACAO = ${COFINS_IMPORTACAO};

const NCM_RATES = ${JSON.stringify(tabela)};

// Devolve { ii, ipi, pis, cofins } ou null se o NCM não estiver na tabela.
function lookupNcmRates(ncmCode) {
    if (!ncmCode) return null;
    const limpo = ncmCode.toString().replace(/[^0-9]/g, '');
    const par = NCM_RATES[limpo];
    if (!par) return null;
    return { ii: par[0], ipi: par[1], pis: PIS_IMPORTACAO, cofins: COFINS_IMPORTACAO };
}
`;
        fs.writeFileSync(destino, conteudo, 'utf8');
        console.log(`\nescrito: ${destino} (${Math.round(conteudo.length / 1024)} KB)`);

        // Incrementa o ?v= do ncm_rates.js no index.html.
        //
        // Feito aqui de propósito, e não deixado como passo manual: o arquivo é
        // servido com Cache-Control de 24h, então regerar a tabela sem trocar a
        // URL faria as alíquotas novas demorarem até um dia pra chegar em quem
        // já tinha o arquivo em cache. Esquecer esse passo produziria cálculo
        // de imposto desatualizado sem nenhum sinal de que algo está errado —
        // exatamente a classe de falha silenciosa que esta tabela veio corrigir.
        const indexPath = path.join(__dirname, '..', 'index.html');
        let html = fs.readFileSync(indexPath, 'utf8');
        const re = /(ncm_rates\.js\?v=)(\d+)/;
        const achou = html.match(re);
        if (!achou) {
            console.warn('\nATENÇÃO: não achei ncm_rates.js?v=N no index.html. Confira a tag <script> e incremente o ?v= à mão antes de publicar.');
        } else {
            const novo = Number(achou[2]) + 1;
            html = html.replace(re, `$1${novo}`);
            fs.writeFileSync(indexPath, html, 'utf8');
            console.log(`index.html: ncm_rates.js?v=${achou[2]} -> ?v=${novo}`);
        }

        console.log('\nPróximo passo: vercel --prod');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch((err) => {
    console.error('\nFALHOU:', err.message);
    process.exit(1);
});
