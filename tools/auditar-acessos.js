#!/usr/bin/env node
/**
 * Auditoria de acesso pago x pagamento comprovado.
 *
 * Vira a pergunta do avesso. Em vez de "quem teve reembolso?", pergunta:
 * PARA CADA CONTA COM ACESSO LIBERADO, existe pagamento que justifique?
 *
 * Isso pega os três buracos que apareceram em produção:
 *   1. assinatura autorizada com a cobrança recusada (cartão autorizado ≠ dinheiro)
 *   2. pagamento devolvido/estornado que nunca revogou o acesso
 *   3. assinatura cancelada que zerava só is_pro e deixava is_subscribed de pé
 *
 * Roda LOCAL, nunca na Vercel (tools/ está no .vercelignore).
 *
 * USO
 *   node tools/auditar-acessos.js                        # relatório, não escreve nada
 *   node tools/auditar-acessos.js --corrigir             # revoga quem não tem pagamento
 *   node tools/auditar-acessos.js --dias=180             # janela de busca (padrão 365)
 *   node tools/auditar-acessos.js --manter=a@b.com,c@d.com   # nunca mexer nessas contas
 *   node tools/auditar-acessos.js --env-file=.env.mp
 *
 * CREDENCIAIS (ambiente ou --env-file)
 *   MP_ACCESS_TOKEN  SUPABASE_URL  SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// 35 dias: cobre o avulso de 30 e a mensalidade da assinatura, que pode
// atrasar alguns dias sem que isso signifique falta de pagamento.
const JANELA_PAGAMENTO_MS = 35 * 24 * 60 * 60 * 1000;
const STATUS_DEVOLVIDO = ['refunded', 'charged_back', 'cancelled'];

const args = process.argv.slice(2);
const temFlag = (n) => args.includes(n);
const valorFlag = (n, padrao) => {
    const a = args.find((x) => x.startsWith(n + '='));
    return a ? a.slice(n.length + 1) : padrao;
};

const CORRIGIR = temFlag('--corrigir');
const DIAS = Math.max(1, Math.min(364, Number(valorFlag('--dias', '365')) || 365));
const MANTER = new Set(
    String(valorFlag('--manter', ''))
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
);

const envFile = valorFlag('--env-file', null);
if (envFile) {
    if (!fs.existsSync(envFile)) {
        console.error(`Arquivo não encontrado: ${envFile}`);
        process.exit(1);
    }
    for (const linha of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const { MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const faltando = [
    !MP_ACCESS_TOKEN && 'MP_ACCESS_TOKEN',
    !SUPABASE_URL && 'SUPABASE_URL',
    !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);
if (faltando.length) {
    console.error(`Faltam credenciais: ${faltando.join(', ')}`);
    console.error('Passe por ambiente ou use --env-file=caminho');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function mpGet(caminho) {
    const resp = await fetch('https://api.mercadopago.com' + caminho, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`MP ${resp.status} em ${caminho.split('?')[0]}: ${JSON.stringify(corpo).slice(0, 200)}`);
    return corpo;
}

// Sempre traz tudo e filtra em JavaScript. O /preapproval/search já devolveu
// assinatura que NÃO era do external_reference pedido — confiar no filtro da
// query do MP foi o que fez o endpoint tratar todo mundo como assinante antigo.
async function paginar(montarUrl, rotulo) {
    const tudo = [];
    let offset = 0;
    for (;;) {
        const pagina = await mpGet(montarUrl(offset, 50));
        const lote = Array.isArray(pagina.results) ? pagina.results : [];
        tudo.push(...lote);
        const total = pagina.paging && Number(pagina.paging.total);
        process.stdout.write(`\r  ${rotulo}: ${tudo.length}${Number.isFinite(total) ? '/' + total : ''}   `);
        if (!lote.length || (Number.isFinite(total) && tudo.length >= total)) break;
        offset += 50;
        if (offset > 10000) break;
    }
    process.stdout.write('\n');
    return tudo;
}

async function todosOsPerfis() {
    const perfis = [];
    const passo = 1000;
    for (let de = 0; ; de += passo) {
        const { data, error } = await supabase.from('profiles').select('*').range(de, de + passo - 1);
        if (error) throw new Error('Supabase: ' + error.message);
        perfis.push(...(data || []));
        if (!data || data.length < passo) break;
    }
    return perfis;
}

const dia = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
};

(async () => {
    console.log(`\nAuditoria de acesso x pagamento — janela de ${DIAS} dias`);
    console.log(CORRIGIR ? 'MODO: CORRIGIR (escreve no banco)\n' : 'MODO: relatório (não escreve nada)\n');

    const [pagamentos, assinaturas, perfis] = await Promise.all([
        paginar(
            (off, lim) =>
                `/v1/payments/search?sort=date_created&criteria=desc&range=date_created` +
                `&begin_date=NOW-${DIAS}DAYS&end_date=NOW&limit=${lim}&offset=${off}`,
            'pagamentos'
        ),
        paginar((off, lim) => `/preapproval/search?limit=${lim}&offset=${off}`, 'assinaturas'),
        todosOsPerfis().then((p) => { console.log(`  perfis: ${p.length}`); return p; }),
    ]);

    // ---- Evidência de pagamento, por usuário ----
    // Guardam { texto, quando } para que um pagamento novo possa desempatar
    // contra uma devolução antiga, e vice-versa.
    const evidencia = new Map();
    const devolucao = new Map();
    const semCobranca = new Map(); // explicação, não evento datado

    const registrar = (mapa, uid, texto, quando) => {
        const ts = new Date(quando).getTime();
        const atual = mapa.get(uid);
        if (!atual || (Number.isFinite(ts) && ts > atual.quando)) {
            mapa.set(uid, { texto, quando: Number.isFinite(ts) ? ts : 0 });
        }
    };

    // As cobranças de assinatura chegam SEM external_reference — a mesma
    // limitação que o webhook contorna pelo e-mail do pagador. Sem fazer isso
    // aqui, um assinante que acabou de pagar aparecia como "sem pagamento" e
    // seria revogado por engano.
    const emailParaId = new Map(
        perfis.filter((p) => p.email).map((p) => [String(p.email).trim().toLowerCase(), p.id])
    );

    for (const p of pagamentos) {
        const uid =
            p.external_reference
            || emailParaId.get(String((p.payer && p.payer.email) || '').trim().toLowerCase());
        if (!uid) continue;

        const quando = p.date_approved || p.date_last_updated || p.date_created;
        const valor = Number(p.transaction_amount) || 0;

        // Cobrança de R$ 0 é a validação de cartão que o MP aprova ao criar a
        // assinatura, não receita. Aceitá-la como prova marcava como adimplente
        // quem nunca pagou um centavo.
        if (p.status === 'approved' && valor > 0) {
            const ts = new Date(p.date_approved || p.date_created).getTime();
            // 35 dias cobre tanto o avulso de 30 quanto a mensalidade da
            // assinatura, que pode atrasar alguns dias.
            if (Number.isFinite(ts) && Date.now() - ts < JANELA_PAGAMENTO_MS) {
                const origem = p.external_reference ? 'avulso' : 'mensalidade';
                registrar(evidencia, uid, `${origem} ${p.id} de R$ ${valor} aprovado em ${dia(p.date_approved || p.date_created)}`, quando);
            }
        } else if (STATUS_DEVOLVIDO.includes(p.status)) {
            registrar(devolucao, uid, `pagamento ${p.id} ${p.status} em ${dia(p.date_last_updated)}`, quando);
        }
    }

    for (const a of assinaturas) {
        const uid = a.external_reference;
        if (!uid) continue;
        const pagas = Number((a.summarized && a.summarized.charged_quantity) || 0);
        const quando = a.last_modified || a.date_created;

        if (a.status === 'authorized' && pagas > 0) {
            registrar(evidencia, uid, `assinatura ${a.id} ativa com ${pagas} fatura(s) paga(s)`, quando);
        } else if (a.status === 'authorized' && pagas === 0) {
            // NÃO entra em `devolucao`. Isto não é um evento datado, é a
            // ausência de um — e como o last_modified da assinatura é tocado a
            // cada atualização, ele sempre ficava mais novo que o pagamento e
            // vencia o desempate, marcando como caloteiro quem tinha acabado de
            // pagar. Serve só de explicação quando não há nenhuma prova.
            semCobranca.set(uid, `assinatura ${a.id} autorizada e sem cobrança confirmada`);
        } else if (a.status === 'cancelled' || a.status === 'paused') {
            registrar(devolucao, uid, `assinatura ${a.id} ${a.status} em ${dia(a.last_modified)}`, quando);
        }
    }

    // ---- Cruzamento ----
    const semPagamento = [];
    const legitimos = [];

    for (const perfil of perfis) {
        const expira = perfil.subscription_expires_at ? new Date(perfil.subscription_expires_at) : null;
        const expiraOk = expira && !isNaN(expira.getTime());
        // Mesma regra do getAccessStatus(): is_pro OU is_subscribed, válidos
        // enquanto a data não passou (nula = recorrente).
        const temAcesso = (perfil.is_pro || perfil.is_subscribed) && (!expiraOk || expira.getTime() > Date.now());
        if (!temAcesso) continue;

        const prova = evidencia.get(perfil.id);
        const contra = devolucao.get(perfil.id);

        // A prova só vale se for MAIS NOVA que a devolução: quem pagou e depois
        // pediu estorno não pode continuar com acesso por causa do pagamento.
        if (prova && (!contra || prova.quando >= contra.quando)) {
            legitimos.push({ perfil, motivo: prova.texto });
        } else {
            semPagamento.push({
                perfil,
                problema: (contra && contra.texto)
                    || semCobranca.get(perfil.id)
                    || 'nenhum pagamento encontrado no Mercado Pago',
            });
        }
    }

    console.log(`\n${legitimos.length} conta(s) com acesso e pagamento confirmado.`);
    console.log(`${semPagamento.length} conta(s) com acesso e SEM pagamento que justifique.\n`);

    if (!semPagamento.length) {
        console.log('Nada a revogar.');
        return;
    }

    const protegidos = semPagamento.filter((c) => MANTER.has(String(c.perfil.email || '').toLowerCase()));
    const alvos = semPagamento.filter((c) => !MANTER.has(String(c.perfil.email || '').toLowerCase()));

    if (protegidos.length) {
        console.log(`🛡  ${protegidos.length} protegida(s) por --manter, não serão tocadas:`);
        for (const c of protegidos) console.log(`     ${c.perfil.email || c.perfil.id}`);
        console.log('');
    }

    console.log(`✗  ${alvos.length} conta(s) com acesso indevido:\n`);
    for (const c of alvos) {
        console.log(`     ${c.perfil.email || '(sem e-mail)'}`);
        console.log(`       id:       ${c.perfil.id}`);
        console.log(`       problema: ${c.problema}`);
        console.log(`       estado:   is_pro=${c.perfil.is_pro} is_subscribed=${c.perfil.is_subscribed} expira=${dia(c.perfil.subscription_expires_at)}`);
        console.log('');
    }

    if (!CORRIGIR) {
        console.log('ATENÇÃO: contas liberadas na mão (cortesia, sua própria conta) aparecem aqui,');
        console.log('porque não existe pagamento no MP para elas. Confira a lista e proteja');
        console.log('as que devem ficar com --manter=email1,email2 antes de rodar --corrigir.\n');
        console.log('Depois de conferir: node tools/auditar-acessos.js --corrigir');
        return;
    }

    let ok = 0;
    for (const c of alvos) {
        const patch = {};
        if ('is_pro' in c.perfil) patch.is_pro = false;
        if ('is_subscribed' in c.perfil) patch.is_subscribed = false;
        if ('subscription_expires_at' in c.perfil) patch.subscription_expires_at = null;

        const { error } = await supabase.from('profiles').update(patch).eq('id', c.perfil.id);
        if (error) console.error(`     falhou em ${c.perfil.email || c.perfil.id}: ${error.message}`);
        else { ok++; console.log(`     revogado: ${c.perfil.email || c.perfil.id}`); }
    }
    console.log(`\n${ok}/${alvos.length} conta(s) revogada(s).`);
})().catch((e) => {
    console.error('\nErro:', e.message);
    process.exit(1);
});
