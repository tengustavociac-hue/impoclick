// @ts-check
/**
 * Aba "Navio - Container": os embarques do importador, com o navio no mapa.
 *
 * Segue o modelo `ShipmentScreen` do design system (rota no título, status,
 * números do trajeto, linha do tempo das etapas) e troca o que ali era texto
 * fixo — "12°44′S 38°30′W, 16,4 nós" — por um mapa ao vivo.
 *
 * O mapa é o widget gratuito da VesselFinder, pelo IMO (ou MMSI) do navio. Ele
 * mostra a posição atual e o rastro das últimas 24 horas, mas é uma página
 * deles dentro de um iframe: o site não lê a posição, só a exibe. Por isso os
 * dias restantes saem das datas cadastradas (saída e chegada prevista), não do
 * GPS do navio.
 *
 * Os dados ficam na tabela `shipments` do Supabase (supabase/shipments.sql),
 * acessada por window.db, como o resto do site.
 */
import {
  Card, Stat, Badge, Button, IconButton, Timeline, ProgressBar, Alert,
  EmptyState, Input, Checkbox, Breadcrumbs, h,
} from './design-system/components/index.js';

/**
 * @typedef {{ key: string, done?: boolean, date?: string | null }} EtapaSalva
 * @typedef {{
 *   id?: string,
 *   reference?: string | null,
 *   vessel_name: string,
 *   imo?: string | null,
 *   mmsi?: string | null,
 *   carrier?: string | null,
 *   voyage?: string | null,
 *   container_number?: string | null,
 *   bl_number?: string | null,
 *   origin_port?: string | null,
 *   destination_port?: string | null,
 *   etd?: string | null,
 *   eta?: string | null,
 *   stages?: ReadonlyArray<EtapaSalva>,
 *   notes?: string | null,
 * }} Embarque
 * @typedef {{ key: string, titulo: string, icone: string, auto?: boolean }} EtapaModelo
 * @typedef {EtapaModelo & { done: boolean, date: string | null }} Etapa
 * @typedef {{ dados?: any, erro?: string, ok?: boolean }} RespostaDb
 * @typedef {{
 *   getShipments: () => Promise<RespostaDb>,
 *   saveShipment: (e: Embarque) => Promise<RespostaDb>,
 *   deleteShipment: (id: string) => Promise<RespostaDb>,
 * }} BancoDeEmbarques
 */

/**
 * As etapas do modelo do design system, na ordem. "Em trânsito" é derivada: o
 * mar termina quando o navio atraca, e pedir dois cliques para o mesmo
 * acontecimento seria convite a deixar uma delas para trás.
 * @type {ReadonlyArray<EtapaModelo>}
 */
const ETAPAS = [
  { key: 'pedido', titulo: 'Pedido confirmado', icone: 'handshake' },
  { key: 'coleta', titulo: 'Coleta no fornecedor', icone: 'factory' },
  { key: 'embarque', titulo: 'Embarque', icone: 'directions_boat' },
  { key: 'transito', titulo: 'Em trânsito marítimo', icone: 'public', auto: true },
  { key: 'atracacao', titulo: 'Atracação', icone: 'anchor' },
  { key: 'desembaraco', titulo: 'Desembaraço aduaneiro', icone: 'gavel' },
  { key: 'entrega', titulo: 'Entrega', icone: 'local_shipping' },
];

const ARMADORES = ['MSC', 'Maersk', 'CMA CGM', 'COSCO', 'Hapag-Lloyd', 'ONE', 'Evergreen', 'HMM', 'ZIM', 'Yang Ming', 'PIL', 'Wan Hai'];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIA_MS = 24 * 60 * 60 * 1000;

/** @type {{ embarques: Embarque[], carregado: boolean, erro: string | null, tela: 'lista' | 'detalhe' | 'form', aberto: string | null }} */
const estado = { embarques: [], carregado: false, erro: null, tela: 'lista', aberto: null };

/** @returns {BancoDeEmbarques | null} */
function banco() {
  const db = /** @type {any} */ (window).db;
  return db && typeof db.getShipments === 'function' ? db : null;
}

// ── Datas ─────────────────────────────────────────────────────────────
// Datas chegam do banco como "AAAA-MM-DD", sem hora. Convertê-las com
// new Date("2026-04-07") dá meia-noite em UTC, que no Brasil é o dia anterior.
// Montar pelo construtor de partes mantém o dia que o usuário digitou.

/** @param {string | null | undefined} iso */
function lerData(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

/** @param {number} n */
const doisDigitos = (n) => String(n).padStart(2, '0');

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
}

/** @param {Date} a @param {Date} b */
function diasEntre(a, b) {
  // Arredondar, não truncar: na virada do horário de verão um dia tem 23 ou 25
  // horas, e truncar contaria um dia a menos.
  return Math.round((b.getTime() - a.getTime()) / DIA_MS);
}

/** "07 abr", como no modelo. @param {string | null | undefined} iso */
function dataCurta(iso) {
  const d = lerData(iso);
  return d ? doisDigitos(d.getDate()) + ' ' + MESES[d.getMonth()] : '';
}

/** @param {number} n @param {string} um @param {string} varios */
const plural = (n, um, varios) => n + ' ' + (Math.abs(n) === 1 ? um : varios);

// ── Códigos do embarque ───────────────────────────────────────────────

/**
 * IMO: 7 dígitos, o último é verificador (soma dos seis primeiros com pesos 7 a
 * 2, módulo 10). Um dígito trocado mostraria OUTRO navio no mapa sem aviso
 * nenhum, por isso a conferência.
 * @param {string} n
 */
export function imoValido(n) {
  if (!/^[0-9]{7}$/.test(n)) return false;
  let soma = 0;
  for (let i = 0; i < 6; i++) soma += Number(n[i]) * (7 - i);
  return soma % 10 === Number(n[6]);
}

// Valor de cada letra na ISO 6346: A vale 10 e segue em frente, pulando os
// múltiplos de 11 (11, 22, 33), que a norma reserva.
/** @type {Record<string, number>} */
const VALOR_LETRA = {};
{
  let v = 10;
  for (const letra of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (v % 11 === 0) v++;
    VALOR_LETRA[letra] = v++;
  }
}

/**
 * Contêiner pela ISO 6346: dono (3 letras) + categoria (U, J ou Z) + 6 dígitos
 * + verificador. É o erro de digitação mais comum de toda a documentação de
 * embarque, e a norma existe justamente para pegá-lo.
 * @param {string} n
 */
export function conteinerValido(n) {
  if (!/^[A-Z]{3}[UJZ][0-9]{7}$/.test(n)) return false;
  let soma = 0;
  for (let i = 0; i < 10; i++) {
    const valor = i < 4 ? VALOR_LETRA[n[i]] : Number(n[i]);
    soma += valor * 2 ** i;
  }
  return (soma % 11) % 10 === Number(n[10]);
}

/** "MSKU4721183" → "MSKU 472 118-3", o formato do modelo. @param {string | null | undefined} n */
function conteinerLegivel(n) {
  if (!n || n.length !== 11) return n || '';
  return n.slice(0, 4) + ' ' + n.slice(4, 7) + ' ' + n.slice(7, 10) + '-' + n[10];
}

/** @param {string} texto */
const soCodigo = (texto) => texto.replace(/[\s.\-/]/g, '').toUpperCase();

// ── Estado derivado do embarque ───────────────────────────────────────

/** @param {Embarque} emb @returns {Etapa[]} */
function etapasDe(emb) {
  const salvas = new Map((emb.stages || []).map((e) => [e.key, e]));
  const atracou = !!(salvas.get('atracacao') || {}).done;
  return ETAPAS.map((modelo) => {
    const salva = salvas.get(modelo.key) || { key: modelo.key };
    return {
      ...modelo,
      done: modelo.auto ? atracou : !!salva.done,
      date: modelo.auto ? null : salva.date || null,
    };
  });
}

/** @param {Etapa[]} etapas @param {string} key */
const feita = (etapas, key) => etapas.some((e) => e.key === key && e.done);

/** @param {Etapa[]} etapas @returns {{ rotulo: string, tom: 'neutral' | 'accent' | 'success' | 'warning' }} */
function statusDe(etapas) {
  if (feita(etapas, 'entrega')) return { rotulo: 'Entregue', tom: 'success' };
  if (feita(etapas, 'desembaraco')) return { rotulo: 'Liberado', tom: 'success' };
  if (feita(etapas, 'atracacao')) return { rotulo: 'Em desembaraço', tom: 'warning' };
  if (feita(etapas, 'embarque')) return { rotulo: 'Em trânsito', tom: 'accent' };
  return { rotulo: 'Aguardando embarque', tom: 'neutral' };
}

/**
 * Dias de viagem pelas datas cadastradas. Depois que o navio atraca a barra
 * fica cheia, mesmo que ele tenha chegado antes ou depois do previsto: o que
 * ela mede é o trajeto, e o trajeto acabou.
 * @param {Embarque} emb @param {Etapa[]} etapas
 */
function progressoDe(emb, etapas) {
  const saida = lerData(emb.etd);
  const chegada = lerData(emb.eta);
  if (!saida || !chegada || chegada <= saida) return null;
  const hoje = /** @type {Date} */ (lerData(hojeISO()));
  const total = diasEntre(saida, chegada);
  const atracou = feita(etapas, 'atracacao');
  const decorrido = atracou ? total : Math.min(total, Math.max(0, diasEntre(saida, hoje)));
  return { total, decorrido, restantes: diasEntre(hoje, chegada), atracou };
}

/** A frase curta de chegada, usada no cartão da lista e no número de chegada. @param {Embarque} emb @param {Etapa[]} etapas */
function fraseDeChegada(emb, etapas) {
  if (feita(etapas, 'entrega')) return { texto: 'entregue', direcao: /** @type {const} */ ('up') };
  if (feita(etapas, 'atracacao')) return { texto: 'chegou', direcao: /** @type {const} */ ('up') };
  const chegada = lerData(emb.eta);
  if (!chegada) return { texto: 'sem data prevista', direcao: /** @type {const} */ ('flat') };
  const faltam = diasEntre(/** @type {Date} */ (lerData(hojeISO())), chegada);
  if (faltam > 0) return { texto: 'em ' + plural(faltam, 'dia', 'dias'), direcao: /** @type {const} */ ('flat') };
  if (faltam === 0) return { texto: 'hoje', direcao: /** @type {const} */ ('flat') };
  return { texto: 'atrasado ' + plural(-faltam, 'dia', 'dias'), direcao: /** @type {const} */ ('down') };
}

/** @param {Embarque} emb */
function rotaDe(emb) {
  const origem = (emb.origin_port || '').trim();
  const destino = (emb.destination_port || '').trim();
  if (origem && destino) return origem + ' → ' + destino;
  return origem || destino || emb.vessel_name;
}

/** Referência, contêiner, BL e viagem, na linha monoespaçada do modelo. @param {Embarque} emb */
function linhaDeCodigos(emb) {
  return [
    emb.reference,
    emb.container_number && conteinerLegivel(emb.container_number),
    emb.bl_number && 'BL ' + emb.bl_number,
    emb.voyage && 'Viagem ' + emb.voyage,
  ].filter(Boolean).join(' · ');
}

// ── Mapa ──────────────────────────────────────────────────────────────

/** @param {Embarque} emb */
function linkDoNavio(emb) {
  return emb.imo ? 'https://www.vesselfinder.com/vessels/details/' + emb.imo : null;
}

/**
 * O iframe da VesselFinder. A altura do mapa interno vai na URL e precisa ser
 * a do iframe, senão sobra faixa vazia: ela é lida do layout depois que o
 * elemento entra na página, e a medida fica só no CSS (.navio-mapa).
 * @param {Embarque} emb
 */
function mapaDoNavio(emb) {
  const iframe = /** @type {HTMLIFrameElement} */ (h('iframe', {
    className: 'navio-mapa',
    attrs: { title: 'Posição atual do navio ' + emb.vessel_name, loading: 'lazy' },
  }));
  requestAnimationFrame(() => {
    const params = new URLSearchParams({
      zoom: 'undefined',
      lat: 'undefined',
      lon: 'undefined',
      width: '100%',
      height: String(iframe.clientHeight),
      names: 'true',
      track: 'true',
      fleet: 'false',
      fleet_name: 'false',
      fleet_hide_old_positions: 'false',
      clicktoact: 'false',
      // Sem isto o widget guarda num cookie o ponto em que o mapa foi deixado,
      // e o próximo embarque abriria centrado no navio anterior.
      store_pos: 'false',
      ra: location.href,
    });
    if (emb.imo) params.set('imo', emb.imo);
    else if (emb.mmsi) params.set('mmsi', emb.mmsi);
    iframe.src = 'https://www.vesselfinder.com/aismap?' + params.toString();
  });
  return iframe;
}

// ── Telas ─────────────────────────────────────────────────────────────

/** @param {Node} conteudo */
function desenhar(conteudo) {
  const raiz = document.getElementById('navio-raiz');
  if (!raiz) return;
  raiz.replaceChildren(conteudo);
}

/** @param {string} codigo */
function avisoDeErro(codigo) {
  if (codigo === 'sem_tabela') {
    // A mensagem para o dono do projeto vai no console; a tela diz só o que o
    // usuário final precisa saber, porque ele não tem o que rodar.
    console.warn('[Impoclick] tabela "shipments" não existe: rode supabase/shipments.sql no SQL Editor do Supabase.');
    return Alert({
      tone: 'warning',
      title: 'Embarques ainda indisponíveis',
      children: 'Esta área está sendo preparada. Tente de novo mais tarde.',
    });
  }
  return Alert({
    tone: 'danger',
    title: 'Não foi possível carregar os embarques',
    children: codigo === 'sem_sessao' ? 'Entre de novo na sua conta.' : codigo,
  });
}

function telaLista() {
  const embarques = estado.embarques.slice().sort((a, b) => {
    // Os que ainda estão a caminho primeiro, pela chegada mais próxima; os
    // entregues vão para o fim, que é onde se procura histórico.
    const entregueA = feita(etapasDe(a), 'entrega');
    const entregueB = feita(etapasDe(b), 'entrega');
    if (entregueA !== entregueB) return entregueA ? 1 : -1;
    return (a.eta || '9999').localeCompare(b.eta || '9999');
  });

  const aCaminho = embarques.filter((e) => feita(etapasDe(e), 'embarque') && !feita(etapasDe(e), 'atracacao')).length;
  const botaoNovo = Button({ variant: 'primary', iconLeft: 'add', children: 'Novo embarque', on: { click: () => abrirForm(null) } });

  const topo = h('div', { className: 'navio-topo' },
    h('div', {},
      h('h2', { className: 'navio-h' }, 'Embarques'),
      h('p', { className: 'navio-sub' },
        embarques.length
          ? plural(embarques.length, 'embarque', 'embarques') + ' · ' + aCaminho + ' em trânsito'
          : 'Cadastre o navio e o contêiner para acompanhar o trajeto no mapa.')),
    embarques.length ? botaoNovo : null);

  if (estado.erro) return h('div', { className: 'navio' }, topo, avisoDeErro(estado.erro));

  if (!estado.carregado) {
    return h('div', { className: 'navio' }, topo, h('p', { className: 'navio-sub' }, 'Carregando embarques…'));
  }

  if (!embarques.length) {
    return h('div', { className: 'navio' }, topo, Card({
      children: EmptyState({
        icon: 'directions_boat',
        title: 'Nenhum embarque cadastrado',
        children: 'Informe o navio (pelo IMO), o contêiner e as datas de saída e chegada. O mapa mostra onde o navio está agora.',
        action: botaoNovo,
      }),
    }));
  }

  return h('div', { className: 'navio' }, topo,
    h('div', { className: 'navio-lista' }, embarques.map(cartaoDaLista)));
}

/** @param {Embarque} emb */
function cartaoDaLista(emb) {
  const etapas = etapasDe(emb);
  const status = statusDe(etapas);
  const progresso = progressoDe(emb, etapas);
  const chegada = fraseDeChegada(emb, etapas);
  const abrir = () => abrirDetalhe(/** @type {string} */ (emb.id));

  return Card({
    interactive: true,
    eyebrow: emb.reference || emb.carrier || 'Embarque',
    title: rotaDe(emb),
    attrs: { role: 'button', tabindex: 0, 'aria-label': 'Abrir embarque ' + rotaDe(emb) },
    on: {
      click: abrir,
      keydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
      },
    },
    children: [
      h('div', { className: 'navio-cartao-status' },
        Badge({ tone: status.tom, dot: true, children: status.rotulo })),
      h('p', { className: 'navio-codigos' },
        [emb.vessel_name, emb.container_number && conteinerLegivel(emb.container_number)].filter(Boolean).join(' · ')),
      progresso
        ? ProgressBar({
          value: progresso.decorrido,
          max: progresso.total,
          label: 'Trajeto',
          valueText: chegada.texto,
          tone: chegada.direcao === 'down' ? 'danger' : 'accent',
        })
        : h('p', { className: 'navio-sub' }, 'Chegada ' + chegada.texto),
    ],
  });
}

/** @param {Embarque} emb */
function telaDetalhe(emb) {
  const etapas = etapasDe(emb);
  const status = statusDe(etapas);
  const progresso = progressoDe(emb, etapas);
  const chegada = fraseDeChegada(emb, etapas);
  const codigos = linhaDeCodigos(emb);
  const vesselFinder = linkDoNavio(emb);

  const topo = h('div', { className: 'navio-topo' },
    h('div', {},
      h('div', { className: 'navio-titulo' },
        h('h2', { className: 'navio-h navio-h--grande' }, rotaDe(emb)),
        Badge({ tone: status.tom, dot: true, children: status.rotulo })),
      codigos ? h('p', { className: 'navio-codigos' }, codigos) : null),
    h('div', { className: 'navio-acoes' },
      IconButton({ icon: 'delete', label: 'Excluir embarque', on: { click: () => excluir(emb) } }),
      Button({ variant: 'outline', iconLeft: 'edit', children: 'Editar', on: { click: () => abrirForm(emb) } })));

  const saida = lerData(emb.etd);
  const chegadaData = lerData(emb.eta);
  const numeros = h('div', { className: 'navio-numeros' },
    Card({ compact: true, children: Stat({
      label: 'Saída', size: 'sm',
      value: saida ? doisDigitos(saida.getDate()) : '—',
      suffix: saida ? MESES[saida.getMonth()] : undefined,
    }) }),
    Card({ compact: true, children: Stat({
      label: 'Chegada prevista', size: 'sm',
      value: chegadaData ? doisDigitos(chegadaData.getDate()) : '—',
      suffix: chegadaData ? MESES[chegadaData.getMonth()] : undefined,
      delta: chegada.texto,
      deltaDirection: chegada.direcao,
    }) }),
    Card({ compact: true, children: Stat({
      label: 'Dias de viagem', size: 'sm',
      value: progresso ? String(progresso.decorrido) : '—',
      fraction: progresso ? ' / ' + progresso.total : undefined,
    }) }),
    Card({ compact: true, children: Stat({
      label: 'Armador', size: 'sm',
      value: emb.carrier || '—',
    }) }));

  const temNavio = !!(emb.imo || emb.mmsi);
  const cartaoMapa = Card({
    eyebrow: 'Posição atual',
    title: emb.vessel_name,
    action: vesselFinder
      ? Button({ as: 'a', href: vesselFinder, variant: 'ghost', size: 'sm', iconRight: 'arrow_outward', children: 'VesselFinder', attrs: { target: '_blank', rel: 'noopener' } })
      : null,
    children: temNavio
      ? mapaDoNavio(emb)
      : EmptyState({
        icon: 'map',
        title: 'Falta o IMO do navio',
        children: 'Com o IMO (7 dígitos, está no BL e no site do armador) o mapa mostra onde o navio está agora.',
        action: Button({ variant: 'outline', iconLeft: 'edit', children: 'Informar IMO', on: { click: () => abrirForm(emb) } }),
      }),
  });

  const cartaoEtapas = Card({
    eyebrow: 'Trajeto',
    title: 'Etapas do embarque',
    children: [
      progresso
        ? h('div', { className: 'navio-progresso' }, ProgressBar({
          thick: true,
          label: 'Progresso do trajeto',
          valueText: progresso.decorrido + ' / ' + plural(progresso.total, 'dia', 'dias'),
          value: progresso.decorrido,
          max: progresso.total,
          tone: chegada.direcao === 'down' ? 'danger' : 'accent',
        }))
        : null,
      Timeline({ steps: passosDaLinhaDoTempo(emb, etapas, progresso) }),
      botaoDeAvanco(emb, etapas),
    ],
  });

  return h('div', { className: 'navio' },
    Breadcrumbs({ items: [{ label: 'Embarques', href: '#view-shipping' }, { label: emb.reference || emb.vessel_name }] }),
    topo,
    numeros,
    temNavio
      ? Alert({
        tone: 'info',
        title: 'Posição ao vivo pela VesselFinder',
        children: 'O mapa mostra onde o navio está agora e o rastro das últimas 24 horas. Em alto-mar o sinal pode ficar algumas horas sem atualizar.',
      })
      : null,
    h('div', { className: 'navio-corpo' }, cartaoMapa, cartaoEtapas),
    emb.notes ? Card({ eyebrow: 'Anotações', children: h('p', { className: 'navio-notas' }, emb.notes) }) : null);
}

/**
 * @param {Embarque} emb
 * @param {Etapa[]} etapas
 * @param {ReturnType<typeof progressoDe>} progresso
 */
function passosDaLinhaDoTempo(emb, etapas, progresso) {
  const atual = etapas.findIndex((e) => !e.done);
  return etapas.map((etapa, i) => {
    let titulo = etapa.titulo;
    let date = etapa.date ? dataCurta(etapa.date) : '';
    let meta = '';

    if (etapa.key === 'embarque') {
      if (emb.origin_port) titulo += ' · ' + emb.origin_port;
      if (!etapa.done && emb.etd) date = 'prev. ' + dataCurta(emb.etd);
      meta = [emb.vessel_name, emb.voyage && 'Viagem ' + emb.voyage].filter(Boolean).join(' · ');
    }
    if (etapa.key === 'atracacao') {
      if (emb.destination_port) titulo += ' · ' + emb.destination_port;
      if (!etapa.done && emb.eta) date = 'prev. ' + dataCurta(emb.eta);
    }
    if (etapa.key === 'transito' && i === atual && progresso) {
      meta = progresso.restantes >= 0
        ? plural(progresso.restantes, 'dia restante', 'dias restantes')
        : 'atrasado ' + plural(-progresso.restantes, 'dia', 'dias');
    }

    /** @type {'done' | 'current' | 'todo'} */
    const state = etapa.done ? 'done' : i === atual ? 'current' : 'todo';
    return { title: titulo, date: date || undefined, meta: meta || undefined, state, icon: etapa.icone };
  });
}

/**
 * Um botão só, para a próxima etapa. Avançar é o que se faz nesta tela no dia
 * a dia; editar as datas de etapas antigas fica no formulário.
 * @param {Embarque} emb @param {Etapa[]} etapas
 */
function botaoDeAvanco(emb, etapas) {
  const proxima = etapas.find((e) => !e.done);
  if (!proxima) return null;
  // "Em trânsito" não se conclui: o que termina o mar é a atracação.
  const alvo = proxima.auto ? /** @type {Etapa} */ (etapas.find((e) => e.key === 'atracacao')) : proxima;
  const rotulo = proxima.auto ? 'Registrar chegada ao porto' : 'Concluir: ' + proxima.titulo;

  // Primário, não secundário: no design system o laranja é reservado para
  // conversão (assinar, comprar), e esta é a ação do dia a dia da tela.
  const botao = Button({
    variant: 'primary',
    iconLeft: 'check',
    block: true,
    children: rotulo,
    on: {
      click: async () => {
        botao.setAttribute('disabled', '');
        const stages = etapasDe(emb)
          .filter((e) => !e.auto)
          .map((e) => (e.key === alvo.key ? { key: e.key, done: true, date: hojeISO() } : { key: e.key, done: e.done, date: e.date }));
        const salvo = await salvar({ ...emb, stages });
        if (!salvo) botao.removeAttribute('disabled');
      },
    },
  });
  return h('div', { className: 'navio-avanco' }, botao);
}

/** @param {Embarque | null} emb */
function telaForm(emb) {
  const novo = !emb;
  const base = emb || /** @type {Embarque} */ ({ vessel_name: '' });
  const etapas = etapasDe(base);

  /** @param {string} name @param {string} label @param {Record<string, any>} [extra] */
  const campo = (name, label, extra = {}) => Input({
    name, label, value: /** @type {any} */ (base)[name] || '', ...extra,
  });

  const lista = h('datalist', { attrs: { id: 'navio-armadores' } },
    ARMADORES.map((a) => h('option', { attrs: { value: a } })));

  const buscaImo = h('a', {
    className: 'navio-link',
    attrs: { href: 'https://www.vesselfinder.com/vessels', target: '_blank', rel: 'noopener' },
    on: {
      click: () => {
        // Leva o nome já digitado para a busca: é o caminho mais curto até o
        // IMO para quem só tem o nome do navio no booking.
        const nome = /** @type {HTMLInputElement | null} */ (form.querySelector('[name="vessel_name"]'));
        buscaImo.setAttribute('href', 'https://www.vesselfinder.com/vessels?name=' + encodeURIComponent((nome && nome.value) || ''));
      },
    },
  }, 'Buscar IMO pelo nome');

  const avisos = h('div', { className: 'navio-avisos' });

  const form = /** @type {HTMLFormElement} */ (h('form', {
    className: 'navio',
    attrs: { novalidate: true },
    on: { submit: (e) => { e.preventDefault(); enviar(form, base, avisos); } },
  },
  Breadcrumbs({ items: [{ label: 'Embarques', href: '#view-shipping' }, { label: novo ? 'Novo embarque' : 'Editar embarque' }] }),
  h('div', { className: 'navio-topo' },
    h('h2', { className: 'navio-h' }, novo ? 'Novo embarque' : 'Editar embarque')),
  avisos,
  h('div', { className: 'navio-form' },
    Card({
      eyebrow: 'Navio',
      title: 'Qual navio leva a carga',
      children: h('div', { className: 'navio-campos' },
        campo('vessel_name', 'Nome do navio', { required: true, placeholder: 'MSC BIANCA' }),
        campo('imo', 'IMO', {
          placeholder: '9839430',
          // O link mora na dica do próprio campo: é ali que se percebe que o
          // IMO está faltando.
          hint: ['Mostra o navio no mapa. ', buscaImo],
          attrs: { inputmode: 'numeric', maxlength: 7 },
        }),
        campo('carrier', 'Armador', { placeholder: 'MSC', attrs: { list: 'navio-armadores' } }),
        campo('voyage', 'Viagem', { placeholder: '418W' }),
        campo('mmsi', 'MMSI (opcional)', {
          placeholder: '636019825',
          hint: 'Use só se não tiver o IMO.',
          attrs: { inputmode: 'numeric', maxlength: 9 },
        }),
        lista),
    }),
    Card({
      eyebrow: 'Carga',
      title: 'Contêiner e documentos',
      children: h('div', { className: 'navio-campos' },
        campo('container_number', 'Contêiner', { placeholder: 'MSKU4721183', attrs: { maxlength: 13 } }),
        campo('bl_number', 'BL', { placeholder: 'SZX0482914' }),
        campo('reference', 'Referência interna', { placeholder: 'IMP-2481' })),
    }),
    Card({
      eyebrow: 'Trajeto',
      title: 'Portos e datas',
      children: h('div', { className: 'navio-campos' },
        campo('origin_port', 'Porto de origem', { placeholder: 'Shenzhen' }),
        campo('destination_port', 'Porto de destino', { placeholder: 'Santos' }),
        campo('etd', 'Saída (ETD)', { type: 'date' }),
        campo('eta', 'Chegada prevista (ETA)', { type: 'date' })),
    }),
    Card({
      eyebrow: 'Etapas',
      title: 'O que já aconteceu',
      children: h('div', { className: 'navio-etapas' },
        etapas.filter((e) => !e.auto).map((e) => h('div', { className: 'navio-etapa' },
          Checkbox({ label: e.titulo, name: 'etapa-' + e.key, checked: e.done }),
          Input({ type: 'date', name: 'data-' + e.key, value: e.date || '', attrs: { 'aria-label': 'Data: ' + e.titulo } })))),
    })),
  Card({
    eyebrow: 'Anotações',
    children: Input({ name: 'notes', multiline: true, value: base.notes || '', placeholder: 'Despachante, free time, observações do armador…' }),
  }),
  h('div', { className: 'navio-acoes navio-acoes--fim' },
    // type="button" explícito: o Button da biblioteca não define type, e dentro
    // de um <form> o padrão do navegador é submit — "Cancelar" salvaria.
    Button({
      variant: 'ghost',
      children: 'Cancelar',
      attrs: { type: 'button' },
      on: { click: () => (novo ? abrirLista() : abrirDetalhe(/** @type {string} */ (base.id))) },
    }),
    Button({ variant: 'primary', iconLeft: 'check', children: novo ? 'Cadastrar embarque' : 'Salvar', attrs: { type: 'submit' } }))));

  return form;
}

/**
 * Lê o formulário, confere os códigos e salva. Os erros aparecem todos de uma
 * vez no topo: um por vez obrigaria a salvar várias vezes para descobrir o
 * próximo.
 * @param {HTMLFormElement} form @param {Embarque} base @param {HTMLElement} avisos
 */
async function enviar(form, base, avisos) {
  /** @param {string} name */
  const valor = (name) => {
    const el = /** @type {HTMLInputElement | null} */ (form.querySelector('[name="' + name + '"]'));
    return el ? el.value.trim() : '';
  };
  /** @param {string} name */
  const marcado = (name) => {
    const el = /** @type {HTMLInputElement | null} */ (form.querySelector('[name="' + name + '"]'));
    return !!(el && el.checked);
  };
  /** @param {string} texto */
  const ouNulo = (texto) => texto || null;

  const imo = soCodigo(valor('imo'));
  const mmsi = soCodigo(valor('mmsi'));
  const conteiner = soCodigo(valor('container_number'));
  const etd = valor('etd');
  const eta = valor('eta');

  /** @type {string[]} */
  const erros = [];
  if (!valor('vessel_name')) erros.push('Informe o nome do navio.');
  if (imo && !imoValido(imo)) erros.push('O IMO ' + imo + ' não confere: são 7 dígitos, e o último é de verificação. Um número trocado mostraria outro navio no mapa.');
  if (mmsi && !/^[0-9]{9}$/.test(mmsi)) erros.push('O MMSI tem 9 dígitos.');
  if (conteiner && !conteinerValido(conteiner)) erros.push('O contêiner ' + conteiner + ' não confere com a norma ISO 6346 (4 letras, 7 números, o último de verificação). Confira no BL.');
  if (etd && eta && eta < etd) erros.push('A chegada prevista está antes da saída.');

  if (erros.length) {
    avisos.replaceChildren(Alert({ tone: 'danger', title: 'Revise antes de salvar', children: h('ul', { className: 'navio-erros' }, erros.map((t) => h('li', {}, t))) }));
    avisos.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  /** @type {Embarque} */
  const registro = {
    ...(base.id ? { id: base.id } : {}),
    vessel_name: valor('vessel_name').toUpperCase(),
    imo: ouNulo(imo),
    mmsi: ouNulo(mmsi),
    carrier: ouNulo(valor('carrier')),
    voyage: ouNulo(valor('voyage').toUpperCase()),
    container_number: ouNulo(conteiner),
    bl_number: ouNulo(soCodigo(valor('bl_number'))),
    reference: ouNulo(valor('reference')),
    origin_port: ouNulo(valor('origin_port')),
    destination_port: ouNulo(valor('destination_port')),
    etd: ouNulo(etd),
    eta: ouNulo(eta),
    notes: ouNulo(valor('notes')),
    stages: ETAPAS.filter((e) => !e.auto).map((e) => {
      const done = marcado('etapa-' + e.key);
      // Marcada sem data leva a de hoje: é quase sempre o dia em que o
      // usuário está registrando, e etapa concluída sem data some da linha
      // do tempo.
      const date = valor('data-' + e.key) || (done ? hojeISO() : '');
      return { key: e.key, done, date: date || null };
    }),
  };

  avisos.replaceChildren();
  await salvar(registro);
}

/** @param {Embarque} registro @returns {Promise<boolean>} */
async function salvar(registro) {
  const db = banco();
  if (!db) return false;
  const r = await db.saveShipment(registro);
  if (r.erro) {
    alert(r.erro === 'sem_tabela' ? 'Os embarques ainda não estão disponíveis.' : 'Não foi possível salvar: ' + r.erro);
    return false;
  }
  const salvo = /** @type {Embarque} */ (r.dados);
  const i = estado.embarques.findIndex((e) => e.id === salvo.id);
  if (i >= 0) estado.embarques[i] = salvo;
  else estado.embarques.unshift(salvo);
  abrirDetalhe(/** @type {string} */ (salvo.id));
  return true;
}

/** @param {Embarque} emb */
async function excluir(emb) {
  if (!confirm('Excluir o embarque ' + rotaDe(emb) + '? Isso não pode ser desfeito.')) return;
  const db = banco();
  if (!db || !emb.id) return;
  const r = await db.deleteShipment(emb.id);
  if (r.erro) {
    alert('Não foi possível excluir: ' + r.erro);
    return;
  }
  estado.embarques = estado.embarques.filter((e) => e.id !== emb.id);
  abrirLista();
}

// ── Navegação interna ─────────────────────────────────────────────────

function abrirLista() {
  estado.tela = 'lista';
  estado.aberto = null;
  desenhar(telaLista());
}

/** @param {string} id */
function abrirDetalhe(id) {
  const emb = estado.embarques.find((e) => e.id === id);
  if (!emb) return abrirLista();
  estado.tela = 'detalhe';
  estado.aberto = id;
  desenhar(telaDetalhe(emb));
  window.scrollTo({ top: 0 });
}

/** @param {Embarque | null} emb */
function abrirForm(emb) {
  estado.tela = 'form';
  desenhar(telaForm(emb));
  window.scrollTo({ top: 0 });
}

async function carregar() {
  const db = banco();
  if (!db) return;
  const r = await db.getShipments();
  estado.erro = r.erro || null;
  estado.embarques = r.dados || [];
  estado.carregado = true;
}

/**
 * Entrada da aba. Recarrega do banco toda vez que a aba abre — os dados podem
 * ter mudado em outro aparelho — mas desenha o que já tem antes, para não
 * piscar "Carregando" a cada visita.
 */
async function abrir() {
  abrirLista();
  await carregar();
  if (estado.tela === 'lista') abrirLista();
}

// O app.js avisa a troca de tela por evento; este módulo não mexe no menu.
document.addEventListener('impoclick:tela', (e) => {
  const detalhe = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (detalhe && detalhe.id === 'view-shipping') abrir();
});

// A trilha "Embarques" é um link para #view-shipping. Interceptado aqui, ele
// volta à lista sem recarregar a página nem mexer no histórico.
document.addEventListener('click', (e) => {
  const alvo = /** @type {HTMLElement} */ (e.target);
  const link = alvo && alvo.closest && alvo.closest('#navio-raiz a[href="#view-shipping"]');
  if (!link) return;
  e.preventDefault();
  abrirLista();
});
