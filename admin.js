// @ts-check
/**
 * Painel de cadastros: quem criou conta no Impoclick, quem confirmou o e-mail,
 * quem de fato usou o produto e quem assina.
 *
 * Os dados vêm de admin_cadastros() (supabase/admin_cadastros.sql), que só
 * responde para contas registradas em app_admins. Esconder o item do menu aqui
 * é conveniência: quem não é admin e abrir a tela à força recebe "acesso
 * negado" do banco.
 */
import {
  Card, Stat, Badge, Button, IconButton, Input, Tabs, Tooltip, Alert, EmptyState, DataTable, SparkBars, h,
} from './design-system/components/index.js';

/**
 * `assinante`: Pro valendo hoje (mesma regra do app.js). `pro_marcado`: a flag
 * is_pro está ligada, mesmo vencida. `assinatura_recorrente`: Pro sem data de
 * vencimento, ou seja, cartão no Mercado Pago renovando sozinho.
 * @typedef {{ id: string, email: string, nome: string | null, criado_em: string, ultimo_acesso: string | null,
 *   confirmou_email: boolean, assinante: boolean, pro_marcado?: boolean, assinatura_recorrente?: boolean,
 *   assinatura_expira_em: string | null, ml_conectado: boolean,
 *   simulacoes: number, produtos: number, admin: boolean }} Conta
 */

const FUSO = 'America/Sao_Paulo';
const DIA = 86400000;
const DIAS_NO_GRAFICO = 14;

/** @type {{ contas: Conta[] | null, em: string | null, erro: string | null, carregando: boolean, filtro: string }} */
const estado = { contas: null, em: null, erro: null, carregando: false, filtro: 'todos' };

const db = () => /** @type {any} */ (window).db;

// ── Formatação ────────────────────────────────────────────────────────

/** @param {string} iso */
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO });
/** @param {string} iso */
const horaBR = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
/** Dia no fuso de Brasília, "AAAA-MM-DD". Comparar dias pelo UTC jogaria o
 *  cadastro das 22h no dia seguinte. @param {string | number | Date} quando */
const chaveDia = (quando) => new Date(quando).toLocaleDateString('en-CA', { timeZone: FUSO });

/** Dias de calendário entre a data e hoje, no fuso de Brasília. @param {string} iso */
const diasAtras = (iso) => Math.round((Date.parse(chaveDia(Date.now())) - Date.parse(chaveDia(iso))) / DIA);

/** @param {string} iso */
function relativo(iso) {
  const minutos = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutos < 60) return minutos <= 1 ? 'agora há pouco' : `há ${minutos} min`;
  const dias = diasAtras(iso);
  if (dias === 0) return `hoje às ${horaBR(iso)}`;
  if (dias === 1) return `ontem às ${horaBR(iso)}`;
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

/** @param {number} n @param {string} um @param {string} varios */
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

// ── Regras ────────────────────────────────────────────────────────────

/** Usou = deixou rastro no produto, não só criou a conta. @param {Conta} c */
const usou = (c) => c.simulacoes > 0 || c.produtos > 0 || c.ml_conectado;

// O banco só enxerga o que ficou salvo: quem abriu a calculadora e saiu sem
// salvar não deixa rastro, e cai em "Nunca usaram". A legenda diz isso por
// extenso; a `dica` é a versão de uma linha que o Tooltip comporta.
const NAO_USOU = 'Nada salvo e sem Mercado Livre conectado';

const FILTROS = [
  { value: 'todos', label: 'Todos', teste: (/** @type {Conta} */ _c) => true, dica: '',
    legenda: 'Todas as contas criadas, da mais nova para a mais antiga. A sua conta não entra na lista.' },
  { value: 'assinantes', label: 'Assinantes', teste: (/** @type {Conta} */ c) => c.assinante,
    dica: 'Acesso Pro valendo hoje',
    legenda: 'Contas com acesso Pro valendo hoje: assinatura no cartão, PIX dentro dos 30 dias ou liberação feita por você.' },
  { value: 'nunca-usaram', label: 'Nunca usaram', teste: (/** @type {Conta} */ c) => !usou(c),
    dica: NAO_USOU,
    legenda: 'Criaram a conta, mas ainda não salvaram nenhuma simulação, não cadastraram produto e não conectaram '
      + 'o Mercado Livre. Quem só abriu a calculadora sem salvar também aparece aqui, porque esse uso não fica registrado.' },
  { value: 'sem-confirmar', label: 'E-mail não confirmado', teste: (/** @type {Conta} */ c) => !c.confirmou_email,
    dica: 'Não clicaram no link de confirmação',
    legenda: 'Não clicaram no link de confirmação enviado por e-mail e, sem ele, não conseguem entrar. '
      + 'Se forem muitas, vale conferir se o e-mail de confirmação está caindo no spam.' },
];

/** @param {unknown} e */
function explicarErro(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/acesso negado/i.test(msg)) return 'Esta conta não está registrada como admin no banco.';
  if (/could not find the function|PGRST202/i.test(msg)) {
    return 'A função admin_cadastros ainda não existe no banco. Rode supabase/admin_cadastros.sql no SQL Editor do Supabase.';
  }
  return 'O banco não respondeu agora. Tente atualizar em instantes.';
}

// ── Dados ─────────────────────────────────────────────────────────────

async function buscar() {
  const banco = db();
  if (!banco || typeof banco.getAdminCadastros !== 'function' || estado.carregando) return;
  estado.carregando = true;
  estado.erro = null;
  desenhar();
  try {
    const r = await banco.getAdminCadastros();
    // A sua própria conta e as de outros admins não são clientes: ficam fora
    // dos números e da lista.
    estado.contas = (r && Array.isArray(r.usuarios) ? /** @type {Conta[]} */ (r.usuarios) : []).filter((c) => !c.admin);
    estado.em = (r && r.gerado_em) || new Date().toISOString();
  } catch (e) {
    estado.erro = explicarErro(e);
  }
  estado.carregando = false;
  desenhar();
}

// ── Blocos da tela ────────────────────────────────────────────────────

/** @param {Conta[]} contas */
function numeros(contas) {
  const total = contas.length;
  const naSemana = contas.filter((c) => diasAtras(c.criado_em) < 7).length;
  const confirmaram = contas.filter((c) => c.confirmou_email).length;
  const usaram = contas.filter(usou).length;
  const assinantes = contas.filter((c) => c.assinante).length;
  const fatia = (/** @type {number} */ n) => (total ? Math.round((n / total) * 100) + '% do total' : '—');
  const de = ' / ' + total.toLocaleString('pt-BR');

  return h('div', { className: 'ad-numeros' },
    Card({ compact: true, children: Stat({
      label: 'Contas criadas', size: 'sm', value: total.toLocaleString('pt-BR'),
      delta: naSemana ? `+${naSemana} nos últimos 7 dias` : 'nenhuma nos últimos 7 dias',
      deltaDirection: naSemana ? 'up' : 'flat',
    }) }),
    Card({ compact: true, children: Stat({
      label: 'Confirmaram o e-mail', size: 'sm', value: confirmaram.toLocaleString('pt-BR'), fraction: de,
      delta: fatia(confirmaram), deltaDirection: 'flat',
    }) }),
    Card({ compact: true, attrs: { title: 'Salvou uma simulação, cadastrou um produto ou conectou o Mercado Livre.' },
      children: Stat({
        label: 'Usaram o produto', size: 'sm', value: usaram.toLocaleString('pt-BR'), fraction: de,
        delta: fatia(usaram), deltaDirection: 'flat',
      }) }),
    Card({ compact: true, variant: 'accent', children: Stat({
      label: 'Assinantes', size: 'sm', value: assinantes.toLocaleString('pt-BR'), fraction: de,
      delta: fatia(assinantes), deltaDirection: 'flat',
    }) }));
}

/** @param {Conta[]} contas */
function grafico(contas) {
  const dias = Array.from({ length: DIAS_NO_GRAFICO }, (_, i) => chaveDia(Date.now() - (DIAS_NO_GRAFICO - 1 - i) * DIA));
  const porDia = dias.map((d) => contas.filter((c) => chaveDia(c.criado_em) === d).length);
  const soma = porDia.reduce((a, b) => a + b, 0);

  return Card({
    title: 'Novas contas por dia',
    eyebrow: `Últimos ${DIAS_NO_GRAFICO} dias · ${plural(soma, 'conta', 'contas')}`,
    // Sem cadastro no período, a barra "de destaque" cairia num dia qualquer
    // com zero — o texto diz a mesma coisa sem sugerir um pico que não houve.
    children: soma
      ? h('div', { className: 'ad-grafico' },
        SparkBars({ data: porDia, labels: dias.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)) }))
      : h('p', { className: 'ad-sub' }, `Ninguém criou conta nos últimos ${DIAS_NO_GRAFICO} dias.`),
  });
}

/** @param {Conta} c */
function situacao(c) {
  const selos = [];
  let detalhe = null;
  if (c.assinatura_recorrente) {
    selos.push(Badge({ tone: 'success', dot: true, children: 'Assinante' }));
    detalhe = 'Cartão · renova sozinha';
  } else if (c.assinante) {
    selos.push(Badge({ tone: 'success', dot: true, children: 'Pro' }));
    detalhe = c.assinatura_expira_em ? 'Até ' + dataBR(c.assinatura_expira_em) : null;
  } else if (c.pro_marcado && c.assinatura_expira_em) {
    // PIX de 30 dias que venceu: o is_pro continua ligado no banco, mas o
    // site já não libera nada. Mostrar "Grátis" esconderia que a pessoa pagou.
    selos.push(Badge({ tone: 'neutral', children: 'Pro vencido' }));
    detalhe = 'Venceu em ' + dataBR(c.assinatura_expira_em);
  } else {
    selos.push(Badge({ tone: 'neutral', children: 'Grátis' }));
  }
  if (!c.confirmou_email) selos.push(Badge({ tone: 'warning', children: 'E-mail não confirmado' }));
  return h('div', {},
    h('div', { className: 'ad-selos' }, selos),
    detalhe ? h('span', { className: 'ad-detalhe' }, detalhe) : null);
}

/** @param {Conta} c */
function uso(c) {
  if (!usou(c)) return Tooltip({ label: NAO_USOU, children: h('span', { className: 'ad-detalhe' }, 'Ainda não usou') });
  const partes = [];
  if (c.simulacoes) partes.push(plural(c.simulacoes, 'simulação', 'simulações'));
  if (c.produtos) partes.push(plural(c.produtos, 'produto', 'produtos'));
  if (c.ml_conectado) partes.push('Mercado Livre conectado');
  return partes.join(' · ');
}

/** @param {Conta[]} linhas */
function tabela(linhas) {
  return DataTable({
    columns: [
      { key: 'conta', label: 'Conta', render: (/** @type {Conta} */ c) => h('div', {},
        h('span', { className: 'ad-conta-email' }, c.email),
        c.nome ? h('span', { className: 'ad-conta-nome' }, c.nome) : null) },
      { key: 'criada', label: 'Criada em', render: (/** @type {Conta} */ c) => h('div', {},
        dataBR(c.criado_em),
        h('span', { className: 'ad-detalhe' }, relativo(c.criado_em))) },
      { key: 'acesso', label: 'Último acesso', render: (/** @type {Conta} */ c) => (c.ultimo_acesso ? relativo(c.ultimo_acesso) : 'Nunca entrou') },
      { key: 'uso', label: 'Uso', render: uso },
      { key: 'situacao', label: 'Situação', render: situacao },
      { key: 'acoes', label: '', render: (/** @type {Conta} */ c) => Button({
        variant: 'ghost', size: 'sm', children: 'Gerenciar',
        attrs: { 'aria-label': 'Gerenciar a conta ' + c.email },
        on: { click: (e) => abrirConta(c.id, /** @type {HTMLElement} */ (e.currentTarget)) },
      }) },
    ],
    rows: linhas,
  });
}

/** @param {Conta[]} contas */
function lista(contas) {
  const alvo = h('div', { className: 'ad-lista' });
  const desenharLista = () => {
    const filtro = FILTROS.find((f) => f.value === estado.filtro) || FILTROS[0];
    const linhas = contas.filter(filtro.teste);
    alvo.replaceChildren(
      h('p', { className: 'ad-legenda' }, filtro.legenda),
      linhas.length ? tabela(linhas) : h('p', { className: 'ad-sub' }, 'Nenhuma conta neste filtro.'));
  };
  const abas = Tabs({
    value: estado.filtro,
    items: FILTROS.map((f) => ({ value: f.value, label: f.label, badge: contas.filter(f.teste).length })),
    // O Tabs já move a aba ativa sozinho; aqui só troca a lista embaixo.
    onChange: (v) => { estado.filtro = v; desenharLista(); },
  });
  // O Tabs não aceita dica por aba: cada botão é embrulhado num Tooltip
  // depois de montado. O clique continua funcionando porque o Tabs guarda os
  // botões numa lista própria, não pela posição no DOM.
  for (const botao of /** @type {NodeListOf<HTMLButtonElement>} */ (abas.querySelectorAll('.ic-tabs__item'))) {
    const filtro = FILTROS.find((f) => f.value === botao.dataset.value);
    if (!filtro || !filtro.dica) continue;
    const depois = botao.nextSibling;
    abas.insertBefore(Tooltip({ label: filtro.dica, children: botao }), depois);
  }
  desenharLista();
  return Card({ children: [abas, alvo] });
}

function tela() {
  const topo = h('div', { className: 'ad-topo' },
    h('div', {},
      h('h2', { className: 'ad-h' }, 'Quem se cadastrou'),
      h('p', { className: 'ad-sub' }, estado.em
        ? `Atualizado às ${horaBR(estado.em)} · sem contar contas de admin`
        : 'Contas criadas no Impoclick, da mais nova para a mais antiga.')),
    Button({
      variant: 'outline', iconLeft: 'refresh', children: estado.carregando ? 'Atualizando…' : 'Atualizar',
      disabled: estado.carregando, on: { click: () => { buscar(); } },
    }));

  if (estado.erro) {
    return h('div', { className: 'ad' }, topo,
      Alert({ tone: 'danger', title: 'Não foi possível carregar os cadastros', children: estado.erro }));
  }
  if (!estado.contas) {
    return h('div', { className: 'ad' }, topo, Card({ children: h('p', { className: 'ad-sub' }, 'Buscando as contas…') }));
  }
  if (!estado.contas.length) {
    return h('div', { className: 'ad' }, topo, Card({ children: EmptyState({
      icon: 'group', title: 'Nenhuma conta criada ainda',
      children: 'Quando alguém se cadastrar no site, a conta aparece aqui.',
    }) }));
  }

  return h('div', { className: 'ad' }, topo, numeros(estado.contas), grafico(estado.contas), lista(estado.contas));
}

function desenhar() {
  const raiz = document.getElementById('admin-raiz');
  if (raiz) raiz.replaceChildren(tela());
}

// ── Painel da conta: confirmar e-mail, Pro e exclusão ─────────────────
//
// As regras de verdade (quem pode, assinatura recorrente, e-mail digitado na
// exclusão) são do banco — supabase/admin_acoes.sql. Aqui elas só aparecem
// antes, para o botão nem se oferecer quando o banco vai recusar.

/** @type {{ id: string | null, ocupado: boolean, erro: string | null, data: string, confirmacao: string, voltarFoco: HTMLElement | null }} */
const painel = { id: null, ocupado: false, erro: null, data: '', confirmacao: '', voltarFoco: null };

/** @param {string} msg */
function avisar(msg) {
  const f = /** @type {any} */ (window).showToast;
  if (typeof f === 'function') f(msg, 'success');
}

/**
 * Confirmação do próprio app (showConfirm no app.js), para o painel não
 * inventar um segundo estilo de caixa de diálogo.
 * @param {string} msg @param {{ title: string, confirmText: string, danger?: boolean }} opcoes
 * @returns {Promise<boolean>}
 */
function confirmar(msg, opcoes) {
  const f = /** @type {any} */ (window).showConfirm;
  return typeof f === 'function' ? f(msg, opcoes) : Promise.resolve(window.confirm(msg));
}

/** "AAAA-MM-DD" daqui a n dias, no fuso de Brasília — o formato do campo de data. @param {number} n */
const diaMais = (n) => chaveDia(Date.now() + n * DIA);

/** @param {string} iso "AAAA-MM-DD" */
const dataDoCampo = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

/** @param {unknown} e */
function erroDeAcao(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/could not find the function|PGRST202/i.test(msg)) {
    return 'As ações ainda não existem no banco. Rode supabase/admin_acoes.sql no SQL Editor do Supabase.';
  }
  return msg;
}

/** @param {string} id @param {HTMLElement | null} origem */
function abrirConta(id, origem) {
  const c = estado.contas && estado.contas.find((x) => x.id === id);
  if (!c) return;
  painel.id = id;
  painel.erro = null;
  painel.confirmacao = '';
  painel.data = c.assinante && !c.assinatura_recorrente && c.assinatura_expira_em
    ? chaveDia(c.assinatura_expira_em)
    : diaMais(30);
  painel.voltarFoco = origem;
  document.addEventListener('keydown', teclaPainel);
  desenharPainel();
}

function fecharConta() {
  painel.id = null;
  painel.erro = null;
  document.removeEventListener('keydown', teclaPainel);
  const el = document.getElementById('ad-painel');
  if (el) el.remove();
  // A lista pode ter sido redesenhada enquanto o painel estava aberto; aí o
  // botão de origem já não existe e o foco fica onde o navegador deixar.
  if (painel.voltarFoco && painel.voltarFoco.isConnected) painel.voltarFoco.focus();
  painel.voltarFoco = null;
}

/** @param {KeyboardEvent} e */
function teclaPainel(e) {
  if (e.key !== 'Escape' || painel.ocupado) return;
  // Esc dentro da confirmação do app fecha só a confirmação.
  const confirmacao = document.getElementById('confirm-modal');
  if (confirmacao && !confirmacao.classList.contains('hidden')) return;
  fecharConta();
}

/**
 * Roda uma ação do painel: trava os botões, recarrega a lista e redesenha.
 * @param {() => Promise<string>} acao devolve a mensagem de sucesso
 * @param {boolean} [fecharNoFim] fecha o painel no sucesso (exclusão)
 */
async function executar(acao, fecharNoFim = false) {
  if (painel.ocupado) return;
  painel.ocupado = true;
  painel.erro = null;
  desenharPainel();
  try {
    const msg = await acao();
    painel.ocupado = false;
    if (fecharNoFim) fecharConta();
    avisar(msg);
    await buscar();
  } catch (e) {
    painel.ocupado = false;
    painel.erro = erroDeAcao(e);
  }
  if (painel.id) desenharPainel();
}

/** @param {string} titulo @param {...any} conteudo */
const secao = (titulo, ...conteudo) =>
  h('section', { className: 'ad-painel-secao' }, h('h4', { className: 'ad-painel-h' }, titulo), ...conteudo);

/** @param {string} frase */
const texto = (frase) => h('p', { className: 'ad-texto' }, frase);

/** @param {Conta} c */
function secaoEmail(c) {
  if (c.confirmou_email) return secao('E-mail', texto('Confirmado. A pessoa consegue entrar normalmente.'));
  return secao('E-mail',
    texto('Ainda não confirmado, e sem isso a pessoa não consegue entrar. Use quando ela avisar que o e-mail de confirmação não chegou.'),
    h('div', { className: 'ad-painel-acoes' },
      Button({
        variant: 'outline', size: 'sm', iconLeft: 'mark_email_read', children: 'Confirmar e-mail agora',
        disabled: painel.ocupado,
        on: { click: () => executar(async () => {
          await db().adminConfirmarEmail(c.id);
          return 'E-mail confirmado. A pessoa já consegue entrar.';
        }) },
      })));
}

/** @param {Conta} c */
function secaoPro(c) {
  if (c.assinatura_recorrente) {
    return secao('Acesso Pro', texto('Assinatura no cartão pelo Mercado Pago, que renova sozinha. Para mudar, cancele ou altere '
      + 'pelo Mercado Pago: qualquer mudança feita aqui seria desfeita no próximo pagamento.'));
  }

  const hoje = diaMais(0);
  let status = 'Sem acesso Pro.';
  if (c.assinante && c.assinatura_expira_em) status = `Pro até ${dataBR(c.assinatura_expira_em)}.`;
  else if (c.pro_marcado && c.assinatura_expira_em) status = `O Pro venceu em ${dataBR(c.assinatura_expira_em)}.`;

  const campo = Input({
    label: c.assinante ? 'Mudar para até' : 'Liberar Pro até', type: 'date', value: painel.data,
    disabled: painel.ocupado, attrs: { min: hoje },
    on: { input: (e) => { painel.data = /** @type {HTMLInputElement} */ (e.target).value; } },
  });
  const liberar = Button({
    variant: 'outline', size: 'sm', iconLeft: 'workspace_premium', children: c.assinante ? 'Mudar a data' : 'Liberar Pro',
    disabled: painel.ocupado,
    on: { click: () => {
      const ate = painel.data;
      if (!ate || ate < hoje) {
        painel.erro = 'Escolha uma data de hoje em diante.';
        desenharPainel();
        return;
      }
      executar(async () => {
        await db().adminDefinirPro(c.id, ate);
        return `Pro liberado até ${dataDoCampo(ate)}.`;
      });
    } },
  });
  const retirar = c.assinante
    ? Button({
      variant: 'ghost', size: 'sm', children: 'Retirar Pro', disabled: painel.ocupado,
      on: { click: async () => {
        const ok = await confirmar(
          `${c.email} perde o acesso Pro agora. Se o acesso veio de um PIX, o que falta dos 30 dias não é devolvido automaticamente.`,
          { title: 'Retirar o Pro?', confirmText: 'Retirar Pro', danger: true });
        if (ok) executar(async () => { await db().adminDefinirPro(c.id, null); return 'Pro retirado.'; });
      } },
    })
    : null;

  return secao('Acesso Pro', texto(status), h('div', { className: 'ad-painel-acoes' }, campo, liberar, retirar));
}

/** @param {Conta} c */
function secaoExcluir(c) {
  const corpo = [];
  if (c.assinatura_recorrente) {
    corpo.push(texto('Tem assinatura no cartão ativa. Cancele no Mercado Pago primeiro: excluir antes deixaria o Mercado Pago '
      + 'cobrando uma conta que não existe mais.'));
  } else {
    corpo.push(texto('Apaga a conta e tudo o que é dela: simulações, produtos, dados da empresa e a conexão e os dados do '
      + 'Mercado Livre. Não dá para desfazer.'));
    if (c.assinante && c.assinatura_expira_em) {
      corpo.push(Alert({ tone: 'warning', children: `Esta conta tem Pro até ${dataBR(c.assinatura_expira_em)}. O que já foi pago não é devolvido automaticamente.` }));
    }
    const confere = () => painel.confirmacao.trim().toLowerCase() === c.email.toLowerCase();
    const excluir = /** @type {HTMLButtonElement} */ (Button({
      variant: 'danger', size: 'sm', iconLeft: 'delete', children: 'Excluir conta',
      disabled: painel.ocupado || !confere(),
      on: { click: () => {
        if (!confere()) return;
        executar(async () => {
          const n = await db().adminExcluirConta(c.id, painel.confirmacao.trim());
          return n
            ? `Conta ${c.email} excluída, com ${plural(n, 'registro', 'registros')} de dados.`
            : `Conta ${c.email} excluída.`;
        }, true);
      } },
    }));
    const campo = Input({
      label: 'Para confirmar, digite o e-mail da conta', type: 'email', placeholder: c.email, value: painel.confirmacao,
      disabled: painel.ocupado, attrs: { autocomplete: 'off', spellcheck: 'false' },
      // Só liga o botão; redesenhar o painel a cada tecla tiraria o foco do campo.
      on: { input: (e) => {
        painel.confirmacao = /** @type {HTMLInputElement} */ (e.target).value;
        excluir.disabled = painel.ocupado || !confere();
      } },
    });
    corpo.push(h('div', { className: 'ad-painel-acoes' }, campo, excluir));
  }
  return h('section', { className: 'ad-painel-secao is-perigo' }, h('h4', { className: 'ad-painel-h' }, 'Excluir conta'), ...corpo);
}

function desenharPainel() {
  const antigo = document.getElementById('ad-painel');
  const c = painel.id && estado.contas ? estado.contas.find((x) => x.id === painel.id) : null;
  if (!c) {
    if (painel.id || antigo) fecharConta();
    return;
  }

  const fechar = IconButton({ icon: 'close', label: 'Fechar', on: { click: () => { if (!painel.ocupado) fecharConta(); } } });
  const cartao = h('div', {
    className: 'modal-card ad-painel',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ad-painel-titulo', 'aria-busy': String(painel.ocupado) },
  },
  h('div', { className: 'ad-painel-topo' },
    h('div', {},
      h('h3', { className: 'ad-painel-titulo', attrs: { id: 'ad-painel-titulo' } }, c.email),
      h('p', { className: 'ad-sub' }, c.nome ? `${c.nome} · criada em ${dataBR(c.criado_em)}` : `Criada em ${dataBR(c.criado_em)}`)),
    fechar),
  painel.erro ? Alert({ tone: 'danger', title: 'Não deu certo', children: painel.erro }) : null,
  secaoEmail(c),
  secaoPro(c),
  secaoExcluir(c));

  const fundo = h('div', { className: 'modal-overlay ad-painel-fundo', attrs: { id: 'ad-painel' } }, cartao);
  fundo.addEventListener('click', (e) => { if (e.target === fundo && !painel.ocupado) fecharConta(); });

  if (antigo) antigo.replaceWith(fundo);
  else document.body.appendChild(fundo);
  fechar.focus();
}

// ── Menu e ciclo de vida ──────────────────────────────────────────────

/** @param {boolean} sim */
function mostrarMenu(sim) {
  document.querySelectorAll('[data-admin-only]').forEach((el) => el.classList.toggle('hidden', !sim));
}

async function conferirAdmin() {
  const banco = db();
  const sim = !!(banco && typeof banco.isAppAdmin === 'function' && await banco.isAppAdmin());
  mostrarMenu(sim);
  if (!sim) {
    // Saiu da conta (ou entrou outra): nada da lista fica na memória nem na tela.
    fecharConta();
    estado.contas = null;
    estado.em = null;
    estado.erro = null;
    const raiz = document.getElementById('admin-raiz');
    if (raiz) raiz.replaceChildren();
  }
}

const banco = db();
if (banco && typeof banco.onAuthChange === 'function') {
  banco.onAuthChange((/** @type {string} */ evento) => {
    // Fora do callback: chamar o Supabase de dentro do evento de auth pode
    // travar o supabase-js, que segura um lock enquanto o evento roda.
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') setTimeout(conferirAdmin, 0);
  });
} else {
  conferirAdmin();
}

document.addEventListener('impoclick:tela', (e) => {
  const d = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (d && d.id === 'view-admin') buscar();
});
