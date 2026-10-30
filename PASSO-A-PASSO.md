# Passo a passo — correção dos itens críticos do Impoclick

Sequência montada em 15/08/2026. Detalhe de ordem que importa: a troca do segredo na Vercel
e o `.vercelignore` entram **no mesmo deploy**, então é um deploy só, na etapa 3.

---

## Etapa 0 — Conferir o RLS do Supabase (30 segundos)

Faça isto **antes** de tudo. Se estiver desligado, vira prioridade zero e passa na frente até
da rotação do segredo, porque aí são dados dos seus clientes expostos, não os seus.

1. Abrir <https://supabase.com/dashboard> → projeto `qmwvzhpyxrkyxvekcazs`
2. Menu lateral → **Table Editor**
3. Olhar estas quatro tabelas:
   - `import_history`
   - `products_catalog`
   - `company_settings`
   - `active_simulation`
4. Procurar o aviso **"RLS disabled"** / cadeado aberto ao lado do nome.

**Se as quatro estiverem com RLS habilitado:** seguir pra etapa 1.

**Se alguma estiver desabilitada:** SQL Editor → New query → colar o conteúdo de
`supabase/fix_rls_exposed_tables.sql` → Run. Depois voltar ao Table Editor e confirmar que o
aviso sumiu. Só então seguir.

---

## Etapa 1 — Rotacionar o `ML_CLIENT_SECRET`

Este é o item que realmente para o vazamento. O `.vercelignore` fecha a porta pra quem ainda
não entrou; a rotação expulsa quem já baixou o arquivo nesses 9 dias.

Por que resolve de vez: o refresh token vazado **não funciona sozinho**. Pra trocar refresh
token por access token novo, a API do Mercado Livre exige `client_id` + `client_secret` +
`refresh_token` juntos (é o que o `api/_ml-helper.js` faz na função `refreshMlToken`). Sem o
secret válido, o que vazou vira papel. O `ML_ACCESS_TOKEN` que também estava no arquivo já
expirou faz tempo sozinho — access token do ML dura poucas horas.

### 1.1 — Abrir as duas abas ANTES de gerar o segredo novo

Entre gerar o segredo e salvá-lo na Vercel, os recursos de Mercado Livre do site ficam
quebrados. Deixe as duas abas abertas e faça em seguida pra essa janela durar segundos:

- Aba A: <https://developers.mercadolivre.com.br/devcenter> → sua aplicação
- Aba B: <https://vercel.com/dashboard> → projeto **impoclick** → **Settings** →
  **Environment Variables**

### 1.2 — Gerar o segredo novo (aba A)

1. Clicar na aplicação → **Editar**
2. Achar o campo **Secret Key** (ou "Chave secreta")
3. Clicar em gerar/renovar
4. **Copiar o valor novo** — em geral ele só aparece por inteiro uma vez

Não mexa no `client_id` (App ID). Ele continua o mesmo, e é isso que preserva as conexões
dos usuários.

### 1.3 — Salvar na Vercel (aba B)

1. Localizar a variável `ML_CLIENT_SECRET`
2. **Edit** → colar o valor novo
3. Confirmar que o ambiente **Production** está marcado
4. Save

> A Vercel **não** republica sozinha quando você muda uma variável. O valor novo só passa a
> valer no próximo deploy — que é a etapa 3.

---

## Etapa 2 — (opcional, mesma visita aos painéis)

Dois itens baratos que você já está com o painel aberto pra resolver:

**Item 7 — assinatura do webhook do Mercado Pago.** Hoje, sem o secret configurado, o
endpoint aceita notificação sem verificar assinatura.
- Painel do Mercado Pago → **Suas integrações** → aplicação → **Webhooks** → copiar a
  chave secreta
- Vercel → Environment Variables → **Add New** → nome `MP_WEBHOOK_SECRET`, valor colado,
  ambiente Production

**Item 12 — webhook do Stripe.** Só uma conferida, não precisa mexer em nada:
- Stripe → **Developers** → **Webhooks** → seu endpoint
- Olhar a taxa de entregas com falha. Se estiver alta, é o bug de `bodyParser` que eu
  levantei, e aí pagamentos aprovados não estão virando PRO. Me avise que eu corrijo.

---

## Etapa 3 — Deploy

Um único deploy leva tudo junto: `.vercelignore`, o `ML_CLIENT_SECRET` novo, as correções do
PRO vitalício e a trava de plano no servidor.

```bash
cd "c:/Users/gusta/Desktop/IMPOCLICK"
vercel --prod
```

---

## Etapa 4 — Verificar que funcionou

### 4.1 — Os arquivos saíram do ar

Todos devem responder **404**:

```bash
for u in "server/.env" "supabase/fix_rls_exposed_tables.sql" \
         "docs/shopee_pentest_elegibilidade.pdf" "build_novo.py" \
         "check2.ps1" "fix2.ps1" "server/server.js" ".mcp.json" \
         ".vscode/settings.json" "extension/content.js" \
         "index.backup.html" "design-modelo-v4.html" "aduanize_logo.png"; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "https://www.impoclick.com.br/$u")  /$u"
done
```

### 4.2 — O site continua de pé

Todos devem responder **200**:

```bash
for u in "" "app.js?v=5" "style.css?v=4" "supabase_client.js?v=1" \
         "ncm_db.js?v=4" "impoclick_logo.png" "sitemap.xml" \
         "robots.txt" "googleb6f1f0b6b1c1a5f0.html"; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "https://www.impoclick.com.br/$u")  /$u"
done
```

O `googleb6f1f0b6b1c1a5f0.html` é o que mantém a verificação do Google Search Console —
se ele der 404, o site sai de verificado.

### 4.3 — O Mercado Livre voltou com o segredo novo

Este é o teste que importa da etapa 1. **Sem sair da conta**, abrir o site logado e:

1. Ver se o painel do Mercado Livre carrega (nickname e reputação aparecem)
2. Abrir a aba de avaliações ou catálogo e ver se lista

Se aparecer erro de conexão com o ML, é porque o refresh token dos usuários não sobreviveu à
rotação. Não é grave e tem conserto simples: desconectar e reconectar a conta do ML pelo
próprio site (o fluxo "Conectar Mercado Livre"), o que gera tokens novos com o segredo novo.
Vale avisar os usuários se acontecer.

### 4.4 — O PRO não é mais vitalício

Se você tiver uma conta de teste com `subscription_expires_at` no passado e `is_pro = true`,
ela deve cair no paywall agora. Dá pra simular no Supabase: Table Editor → `profiles` →
editar a linha da conta de teste → `subscription_expires_at` = uma data de ontem → recarregar
o site logado nela → tem que aparecer **"Sua Assinatura Expirou"**.

---

## O que fica pendente depois disso

Nada mais é bloqueante. Da lista de 17 itens da `AUDITORIA.md` sobram, em ordem de retorno:

| Item | O que é | Esforço |
|---|---|---|
| 14 | Fixar versão do `supabase-js` + SRI | baixo, eu faço |
| 15 | Trocar `xlsx` pelo CDN da SheetJS (CVE) | baixo, eu faço |
| 6 | Estimativa por NCM quebrada (IBPT saiu do ar) | precisa decidir: novo provedor ou remover |
| 9 | Cache dos assets estáticos | baixo, eu faço |
| 8, 16, 17 | Falhas silenciosas no código | baixo, eu faço |
| 10, 11 | CSP e rate limit | médio |
| 13 | Teto de 12 funções da Vercel | só planejamento |

O item 6 é o único que precisa de decisão sua — os outros eu resolvo quando você mandar.
