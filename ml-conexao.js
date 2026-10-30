// @ts-check
/**
 * Aviso de conta do Mercado Livre não conectada, no topo das abas que leem os
 * dados do vendedor no ML (Avaliações, Catálogos, Promoções e Patrocinados).
 *
 * Sem a conexão essas abas abrem vazias, sem dizer por quê — é o que acontece
 * com toda conta nova. O aviso só aparece quando o servidor AFIRMA que não há
 * conexão (`motivo` do /api/ml-status). Falha de rede ou do ML não mostra nada:
 * um vendedor conectado não pode ver "conecte sua conta" por uma instabilidade.
 */
import { Alert, Button, h } from './design-system/components/index.js';

/** @typedef {{ estado: 'conectado' | 'nao_conectado' | 'expirado' | 'desconhecido', apelido?: string }} Conexao */

/** O que cada aba deixa de carregar sem a conexão. */
const TELAS = /** @type {Record<string, string>} */ ({
  'view-ml-painel': 'o painel da sua conta',
  'view-reviews': 'as avaliações dos seus anúncios',
  'view-catalog': 'os seus anúncios de catálogo',
  'view-promotions': 'as suas promoções',
  'view-ads': 'os seus anúncios patrocinados',
});

// Conectado não muda sozinho no meio da sessão (conectar recarrega a página),
// mas pode ser desfeito em Configurações: depois de 5 minutos pergunta de novo.
const VALIDADE_MS = 5 * 60 * 1000;

/** @type {{ pedido: Promise<Conexao>, em: number } | null} */
let guardado = null;

/** @returns {Promise<Conexao>} */
async function perguntar() {
  const api = /** @type {any} */ (window).mlApiFetch;
  const r = typeof api === 'function' ? await api('/api/ml-status', 10000) : null;
  if (!r) return { estado: 'desconhecido' };
  if (r.connected) return { estado: 'conectado', apelido: r.nickname };
  if (r.motivo === 'nao_conectado' || r.motivo === 'expirado') return { estado: r.motivo };
  return { estado: 'desconhecido' };
}

/**
 * Estado da conexão com o Mercado Livre, compartilhado pelas abas: uma
 * pergunta ao servidor serve a todas. "Desconhecido" não fica guardado — a
 * próxima aba pergunta de novo.
 * @returns {Promise<Conexao>}
 */
export function conexaoMercadoLivre() {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.pedido;
  const pedido = perguntar().then((c) => {
    if (c.estado === 'desconhecido' && guardado && guardado.pedido === pedido) guardado = null;
    return c;
  });
  guardado = { pedido, em: Date.now() };
  return pedido;
}

/** @param {Conexao} c */
export const precisaConectar = (c) => c.estado === 'nao_conectado' || c.estado === 'expirado';

/** @param {Conexao} c @param {string} oQue */
function aviso(c, oQue) {
  const expirou = c.estado === 'expirado';
  return Alert({
    tone: 'warning',
    title: expirou ? 'Reconecte sua conta do Mercado Livre' : 'Conecte sua conta do Mercado Livre',
    children: h('div', {},
      h('p', { className: 'ml-conexao__texto' }, expirou
        ? `O Mercado Livre encerrou a autorização do Impoclick. Até reconectar, esta aba não consegue carregar ${oQue}.`
        : `Sem a conexão, esta aba não consegue carregar ${oQue}. Você entra com a sua conta de vendedor no próprio Mercado Livre e autoriza o Impoclick a ler os dados.`),
      Button({
        className: 'ml-conexao__acao', variant: 'primary', size: 'sm', iconRight: 'arrow_outward',
        children: expirou ? 'Reconectar Mercado Livre' : 'Conectar Mercado Livre',
        on: { click: () => {
          const ir = /** @type {any} */ (window).conectarMercadoLivre;
          if (typeof ir === 'function') ir();
        } },
      })),
  });
}

/** @param {string} id */
async function avisar(id) {
  const c = await conexaoMercadoLivre();
  const tela = document.getElementById(id);
  if (!tela) return;
  let caixa = /** @type {HTMLElement | null} */ (tela.querySelector(':scope > .ml-conexao'));
  if (!precisaConectar(c)) {
    if (caixa) caixa.remove();
    return;
  }
  if (!caixa) {
    caixa = h('div', { className: 'ml-conexao' });
    tela.prepend(caixa);
  }
  caixa.replaceChildren(aviso(c, TELAS[id]));
}

document.addEventListener('impoclick:tela', (e) => {
  const d = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  if (d && TELAS[d.id]) avisar(d.id);
});
