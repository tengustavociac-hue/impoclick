const zlib = require('zlib');
const { supabaseAdmin, getVerifiedUserId, requireAccess } = require('./_ml-helper');

// Amazon Advertising API (Sponsored Products) — app e credenciais SEPARADOS
// da SP-API (ver _amazon-helper.js): outro Security Profile, outro
// client_id/secret (AMAZON_ADS_CLIENT_ID/SECRET), embora o endpoint de token
// LWA seja o mesmo. Diferente da SP-API privada, esse fluxo usa OAuth com
// redirect de verdade (igual ML/Shopee) — ver o branch ?provider=amazon-ads
// em ml-auth.js/ml-callback.js.
//
// Particularidade grande desta API: o relatório de gasto (quanto foi gasto
// por produto anunciado) é ASSÍNCRONO e pode levar até 3h para ficar pronto
// — não dá pra pedir e já mostrar na tela. Por isso o fluxo de dados é um
// cron (ver conferirRelatorioGasto, chamado pelo GitHub Actions) que pede o
// relatório, confere a cada rodada se ficou pronto, e quando fica, baixa e
// grava em amazon_ads_relatorio. O painel só LÊ essa tabela — nunca pede o
// relatório na hora do clique.

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const LWA_AUTH_URL = 'https://www.amazon.com/ap/oa';
const ADS_API_HOST = process.env.AMAZON_ADS_API_HOST || 'https://advertising-api.amazon.com';
const ADS_SCOPE = 'advertising::campaign_management';

// Relatório pronto demora até 3h; se passar disso sem COMPLETED, considera
// perdido e deixa a próxima rodada pedir de novo (em vez de travar para
// sempre num reportId morto).
const RELATORIO_TIMEOUT_MS = 4 * 60 * 60 * 1000;
// Não pede relatório novo com menos de 20h desde o último sucesso — é 1x/dia.
const RELATORIO_INTERVALO_MS = 20 * 60 * 60 * 1000;

function exigirCredenciais() {
    if (!process.env.AMAZON_ADS_CLIENT_ID || !process.env.AMAZON_ADS_CLIENT_SECRET) {
        throw new Error('AMAZON_ADS_CLIENT_ID / AMAZON_ADS_CLIENT_SECRET não configurados na Vercel.');
    }
}

function urlDeAutorizacao(redirectUri, state) {
    exigirCredenciais();
    const params = new URLSearchParams({
        client_id: process.env.AMAZON_ADS_CLIENT_ID,
        scope: ADS_SCOPE,
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
    });
    return `${LWA_AUTH_URL}?${params.toString()}`;
}

async function trocarCodigoPorToken(code, redirectUri) {
    exigirCredenciais();
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.AMAZON_ADS_CLIENT_ID,
        client_secret: process.env.AMAZON_ADS_CLIENT_SECRET,
    });
    const resp = await fetch(LWA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!resp.ok) throw new Error(`Falha ao trocar código por token da Amazon Ads (${resp.status}): ${await resp.text()}`);
    return await resp.json(); // { access_token, refresh_token, expires_in, token_type }
}

async function trocarRefreshTokenPorAccessToken(refreshToken) {
    exigirCredenciais();
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.AMAZON_ADS_CLIENT_ID,
        client_secret: process.env.AMAZON_ADS_CLIENT_SECRET,
    });
    const resp = await fetch(LWA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!resp.ok) throw new Error(`Falha ao renovar token da Amazon Ads (${resp.status}): ${await resp.text()}`);
    return await resp.json();
}

async function refreshAmazonAdsToken(userId, refreshToken) {
    if (!supabaseAdmin) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    const dados = await trocarRefreshTokenPorAccessToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + dados.expires_in - 300);

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({
            amazon_ads_access_token: dados.access_token,
            amazon_ads_refresh_token: dados.refresh_token || refreshToken,
            amazon_ads_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', userId);
    if (error) throw new Error('Erro ao salvar token da Amazon Ads no banco: ' + error.message);
    return dados.access_token;
}

async function getAmazonAdsToken(userId) {
    if (!supabaseAdmin) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados na Vercel.');
    const { data: perfil, error } = await supabaseAdmin
        .from('profiles')
        .select('amazon_ads_access_token, amazon_ads_refresh_token, amazon_ads_token_expires_at')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw new Error('Erro ao buscar token da Amazon Ads no banco: ' + error.message);
    if (!perfil || !perfil.amazon_ads_refresh_token) throw new Error('Conta de anúncios da Amazon não conectada para este usuário.');

    const expirado = !perfil.amazon_ads_token_expires_at || new Date(perfil.amazon_ads_token_expires_at) <= new Date();
    if (expirado) return await refreshAmazonAdsToken(userId, perfil.amazon_ads_refresh_token);
    return perfil.amazon_ads_access_token;
}

// Chama a Advertising API já autenticada (token + ClientId + Scope do perfil
// de anúncios). Tenta renovar uma vez se vier 401, igual os outros helpers.
async function adsFetch(userId, path, opts = {}, { comScope = true } = {}) {
    exigirCredenciais();
    let token = await getAmazonAdsToken(userId);
    let profileId = null;
    if (comScope) profileId = await getOrFetchProfileId(userId, token);

    const montarHeaders = (tok, prof) => ({
        ...(opts.headers || {}),
        Authorization: `Bearer ${tok}`,
        'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID,
        ...(prof ? { 'Amazon-Advertising-API-Scope': String(prof) } : {}),
    });

    let resp = await fetch(`${ADS_API_HOST}${path}`, { ...opts, headers: montarHeaders(token, profileId) });

    if (resp.status === 401) {
        const { data: perfil } = await supabaseAdmin
            .from('profiles')
            .select('amazon_ads_refresh_token')
            .eq('id', userId)
            .maybeSingle();
        if (perfil && perfil.amazon_ads_refresh_token) {
            token = await refreshAmazonAdsToken(userId, perfil.amazon_ads_refresh_token);
            resp = await fetch(`${ADS_API_HOST}${path}`, { ...opts, headers: montarHeaders(token, profileId) });
        }
    }
    return resp;
}

// O profileId (identifica a conta de anúncios dentro de um marketplace) é
// buscado uma vez e guardado em profiles.amazon_ads_profile_id — não muda.
async function getOrFetchProfileId(userId, accessToken) {
    const { data: perfil } = await supabaseAdmin
        .from('profiles')
        .select('amazon_ads_profile_id')
        .eq('id', userId)
        .maybeSingle();
    if (perfil && perfil.amazon_ads_profile_id) return perfil.amazon_ads_profile_id;

    const resp = await fetch(`${ADS_API_HOST}/v2/profiles`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID,
        },
    });
    if (!resp.ok) throw new Error(`Falha ao listar perfis de anúncios da Amazon (${resp.status}): ${await resp.text()}`);
    const perfis = await resp.json();
    const doBrasil = Array.isArray(perfis) ? perfis.find((p) => p.countryCode === 'BR') : null;
    if (!doBrasil) throw new Error('Nenhum perfil de anúncios da Amazon encontrado para o Brasil nesta conta.');

    await supabaseAdmin.from('profiles').update({ amazon_ads_profile_id: String(doBrasil.profileId) }).eq('id', userId);
    return String(doBrasil.profileId);
}

function dataISO(d) {
    return d.toISOString().slice(0, 10);
}

// Pede um relatório novo de gasto por produto anunciado (Sponsored Products),
// resumido (timeUnit SUMMARY, não por dia) dos últimos 30 dias. Guarda o
// reportId pendente em profiles — a conferência roda em rodadas seguintes.
async function solicitarRelatorioGasto(userId) {
    const fim = new Date();
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - 30);

    const corpo = {
        name: `impoclick-margem-${userId}-${Date.now()}`,
        startDate: dataISO(inicio),
        endDate: dataISO(fim),
        configuration: {
            adProduct: 'SPONSORED_PRODUCTS',
            groupBy: ['advertiser'],
            columns: ['campaignId', 'campaignName', 'advertisedAsin', 'advertisedSku', 'impressions', 'clicks', 'cost', 'sales14d', 'purchases14d'],
            reportTypeId: 'spAdvertisedProduct',
            timeUnit: 'SUMMARY',
            format: 'GZIP_JSON',
        },
    };

    const resp = await adsFetch(userId, '/reporting/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' },
        body: JSON.stringify(corpo),
    });
    if (!resp.ok) throw new Error(`Falha ao pedir relatório de anúncios da Amazon (${resp.status}): ${await resp.text()}`);
    const dados = await resp.json();

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({
            amazon_ads_relatorio_pendente_id: dados.reportId,
            amazon_ads_relatorio_pedido_em: new Date().toISOString(),
        })
        .eq('id', userId);
    if (error) throw new Error('Erro ao salvar relatório pendente da Amazon Ads no banco: ' + error.message);

    return dados.reportId;
}

async function baixarEDecodificarRelatorio(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Falha ao baixar relatório de anúncios da Amazon (${resp.status})`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const json = zlib.gunzipSync(buf).toString('utf8');
    return JSON.parse(json); // array de linhas
}

// Lógica de uma rodada do cron para UM usuário: confere relatório pendente
// (baixa e grava se pronto) ou pede um novo se já passou o intervalo diário.
// Retorna uma string curta descrevendo o que fez, só para log.
async function conferirRelatorioGasto(userId) {
    const { data: perfil, error } = await supabaseAdmin
        .from('profiles')
        .select('amazon_ads_relatorio_pendente_id, amazon_ads_relatorio_pedido_em, amazon_ads_relatorio_atualizado_em')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!perfil) return 'sem perfil';

    if (perfil.amazon_ads_relatorio_pendente_id) {
        const pedidoEm = perfil.amazon_ads_relatorio_pedido_em ? new Date(perfil.amazon_ads_relatorio_pedido_em) : null;
        if (pedidoEm && Date.now() - pedidoEm.getTime() > RELATORIO_TIMEOUT_MS) {
            await supabaseAdmin.from('profiles').update({ amazon_ads_relatorio_pendente_id: null, amazon_ads_relatorio_pedido_em: null }).eq('id', userId);
            return 'relatório pendente expirou, limpo para pedir de novo na próxima rodada';
        }

        const resp = await adsFetch(userId, `/reporting/reports/${perfil.amazon_ads_relatorio_pendente_id}`);
        if (!resp.ok) throw new Error(`Falha ao checar status do relatório (${resp.status}): ${await resp.text()}`);
        const status = await resp.json();

        if (status.status === 'COMPLETED' && status.url) {
            const linhas = await baixarEDecodificarRelatorio(status.url);
            const fim = new Date();
            const inicio = new Date(fim);
            inicio.setDate(inicio.getDate() - 30);

            const porChave = new Map();
            for (const l of linhas) {
                if (!l.advertisedAsin || !l.campaignId) continue;
                const chave = `${l.advertisedAsin}|${l.campaignId}`;
                const atual = porChave.get(chave) || {
                    user_id: userId, asin: l.advertisedAsin, sku: l.advertisedSku || null,
                    campaign_id: String(l.campaignId), campaign_name: l.campaignName || null,
                    impressoes: 0, cliques: 0, gasto: 0, vendas_atribuidas: 0, pedidos_atribuidos: 0,
                    periodo_inicio: dataISO(inicio), periodo_fim: dataISO(fim),
                    atualizado_em: new Date().toISOString(),
                };
                atual.impressoes += Number(l.impressions) || 0;
                atual.cliques += Number(l.clicks) || 0;
                atual.gasto += Number(l.cost) || 0;
                atual.vendas_atribuidas += Number(l.sales14d) || 0;
                atual.pedidos_atribuidos += Number(l.purchases14d) || 0;
                porChave.set(chave, atual);
            }
            const linhasParaSalvar = [...porChave.values()];

            await supabaseAdmin.from('amazon_ads_relatorio').delete().eq('user_id', userId);
            if (linhasParaSalvar.length) {
                const { error: erroInsert } = await supabaseAdmin.from('amazon_ads_relatorio').insert(linhasParaSalvar);
                if (erroInsert) throw new Error('Erro ao salvar relatório de anúncios da Amazon: ' + erroInsert.message);
            }

            await supabaseAdmin
                .from('profiles')
                .update({
                    amazon_ads_relatorio_pendente_id: null,
                    amazon_ads_relatorio_pedido_em: null,
                    amazon_ads_relatorio_atualizado_em: new Date().toISOString(),
                })
                .eq('id', userId);
            return `relatório pronto, ${linhasParaSalvar.length} linhas salvas`;
        }

        if (status.status === 'FAILED' || status.status === 'CANCELLED') {
            await supabaseAdmin.from('profiles').update({ amazon_ads_relatorio_pendente_id: null, amazon_ads_relatorio_pedido_em: null }).eq('id', userId);
            return `relatório falhou (status ${status.status}), será pedido de novo na próxima rodada`;
        }

        return `relatório ainda em processamento (status ${status.status})`;
    }

    const ultimaAtualizacao = perfil.amazon_ads_relatorio_atualizado_em ? new Date(perfil.amazon_ads_relatorio_atualizado_em) : null;
    if (ultimaAtualizacao && Date.now() - ultimaAtualizacao.getTime() < RELATORIO_INTERVALO_MS) {
        return 'relatório ainda recente, não precisa pedir outro';
    }

    const reportId = await solicitarRelatorioGasto(userId);
    return `relatório novo pedido (${reportId})`;
}

module.exports = {
    ADS_API_HOST, ADS_SCOPE,
    urlDeAutorizacao, trocarCodigoPorToken, trocarRefreshTokenPorAccessToken, refreshAmazonAdsToken,
    getAmazonAdsToken, adsFetch, getOrFetchProfileId, solicitarRelatorioGasto, conferirRelatorioGasto,
    getVerifiedUserId, requireAccess, supabaseAdmin,
};
