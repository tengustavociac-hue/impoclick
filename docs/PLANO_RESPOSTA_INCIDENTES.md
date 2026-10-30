# Plano de Resposta a Incidentes de Segurança — Impoclick

Última revisão: 27/10/2026
Próxima revisão obrigatória: até 27/04/2027 (ciclo semestral)

## 1. Responsável

Gustavo (operador único do Impoclick) é o responsável por toda a cadeia de
resposta a incidentes: detecção, contenção, investigação, comunicação e
revisão pós-incidente. Não há equipe de segurança dedicada — por ser
operação individual, todos os papéis abaixo são exercidos pela mesma pessoa.

Contato: tengustavociac@gmail.com

## 2. O que conta como incidente

Qualquer evento que comprometa, ou possa ter comprometido, a confidencialidade,
integridade ou disponibilidade de dados de terceiros (incluindo dados obtidos
via APIs da Amazon, Mercado Livre ou Shopee), entre eles:

- Vazamento ou acesso não autorizado a tokens de acesso/refresh de contas
  conectadas (ML, Shopee, Amazon) armazenados no Supabase.
- Comprometimento da `SUPABASE_SERVICE_ROLE_KEY` ou de qualquer segredo
  configurado como variável de ambiente na Vercel.
- Acesso indevido ao painel administrativo do Impoclick.
- Qualquer indício de que dados de pedidos, produtos ou informações de
  vendedores conectados foram expostos, alterados ou exportados sem
  autorização.

## 3. Procedimento ao detectar um incidente

1. **Conter**: revogar/rotacionar imediatamente a credencial comprometida
   (regenerar chave no Supabase, revogar tokens OAuth afetados nas
   plataformas parceiras — ML/Shopee/Amazon —, remover acesso do painel se
   aplicável).
2. **Avaliar o escopo**: identificar quais usuários/contas conectadas foram
   afetados e quais dados estavam expostos.
3. **Notificar a Amazon**: se o incidente envolver dados obtidos via Amazon
   SP-API, enviar relato para **security@amazon.com** em até **24 horas**
   após a detecção, descrevendo o que ocorreu, o escopo e as ações de
   contenção já tomadas.
4. **Notificar usuários afetados do Impoclick**, quando aplicável, assim que
   o escopo estiver razoavelmente claro.
5. **Registrar o incidente**: data de detecção, causa raiz, dados afetados,
   ações tomadas e data de resolução, guardado junto a este documento (seção
   5, abaixo).
6. **Corrigir a causa raiz** antes de considerar o incidente encerrado (ex.:
   corrigir a vulnerabilidade que permitiu o acesso, não só trocar a chave).

## 4. Revisão periódica

Este plano é revisado a cada 6 meses (ou imediatamente após qualquer
incidente real) para refletir mudanças na arquitetura do sistema, novas
integrações (novas APIs conectadas) e lições aprendidas.

## 5. Histórico de incidentes

Nenhum incidente registrado até a data desta revisão (27/10/2026).
