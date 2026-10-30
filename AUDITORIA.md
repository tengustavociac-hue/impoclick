# Levantamento de erros e falhas — Impoclick

Verificação de 15/08/2026 · site em produção (`www.impoclick.com.br`) + código local.
Cada item marcado **[confirmado]** foi reproduzido contra o site no ar; **[verificar]** é
suspeita que depende de acesso que eu não tenho (painel Vercel/Supabase/Stripe).

---

## Status das correções — 15/08/2026

Última verificação: 15/08/2026. Itens 1–5 e 22–23 nasceram como críticos; os demais
seguem ordenados por severidade dentro do documento.

| Item | Situação |
|---|---|
| 1. `server/.env` público | ✅ **fechado** — arquivo em 404, segredo rotacionado, painel do ML testado e funcionando |
| 2. Repositório inteiro publicado | ✅ resolvido — os 15 arquivos respondem 404 |
| 3. PRO vitalício | ✅ corrigido e no ar |
| 4. Paywall só no navegador | ✅ corrigido e no ar — `requireAccess()` em 5 endpoints |
| 5. RLS do Supabase | ✅ já estava corrigido — as 4 tabelas retornam `[]` para a chave anônima |
| 6. NCM quebrado | ✅ **resolvido sem API** — tabela local com 10.507 NCMs (TEC + TIPI oficiais) |
| 21. Base curada com alíquotas erradas | ✅ **novo, grave** — 31 dos 42 divergiam do oficial; agora o oficial vence |
| **22. XSS refletido em `/api/ml-callback`** | ✅ **novo, CRÍTICO** — `?error=` era ecoado como text/html na origem do app; permitia roubo do token de sessão. Corrigido: redirect sem reflexão + `text/plain` |
| **23. `MP_ACCESS_TOKEN` ausente na Vercel** | ✅ criado e publicado (conta CPF nova). Falta o teste de checkout logado |
| 7. Assinatura do webhook MP | ✅ ativa em produção — POST sem assinatura e com assinatura falsa respondem 401. Falta confirmar que o secret é o da conta nova (histórico de entregas no painel MP) |
| 8. Fallback silencioso de chave | ✅ falha alto em vez de degradar |
| 9. Cache dos assets | ✅ `max-age=86400, stale-while-revalidate` |
| 10. CSP | ⚠️ **no ar em Report-Only** — precisa de uma checagem no console pra virar enforcing |
| 11. Rate limit | ✅ 30/min por IP no endpoint público (testado: 6× 429) |
| 12. Body do webhook Stripe | ⚠️ agora diagnosticável (500 + log explícito); **falta olhar o painel do Stripe** |
| 13. Teto de 12 funções | ℹ️ nada a corrigir — é limite do plano |
| 14. `supabase-js` sem pin | ✅ fixado em 2.112.3 + SRI |
| 15. `xlsx` com CVE | ✅ migrado pro CDN da SheetJS 0.20.3 + SRI |
| 16. Restauração parcial silenciosa | ✅ `setFieldValue`/`setFieldChecked` com aviso |
| 17. `catch` vazio | ✅ passa a logar |
| **18. Imposto zero sem aviso** | ✅ **corrigido** — aviso nas duas telas de decisão |
| 19. 406 do Supabase no console | ✅ `.single()` → `.maybeSingle()` em 3 queries |
| 20. ~115 imagens em `http://` | ✅ `secure_thumbnail` + normalização no front + `upgrade-insecure-requests` |
| 24. Erro interno devolvido ao cliente | 🟢 baixa — 14 pontos devolvem `err.message` / corpo do upstream em JSON. Só para usuário autenticado e sem segredo, mas expõe string de configuração. Não corrigido: mexer nos 14 tira mensagem útil de diagnóstico |
| 25. `payer_email` fixo na assinatura | ✅ **novo** — preapproval nascia vinculado a `cliente@impoclick.com`; botão "Confirmar" ficava desabilitado para qualquer outro e-mail. Agora usa o e-mail da sessão |

**O item 1 está encerrado.** O arquivo saiu do ar, o `ML_CLIENT_SECRET` foi rotacionado no
Devcenter do Mercado Livre — o que invalida o que vazou nos 9 dias de exposição — e o painel
do ML foi testado logado, confirmando que os refresh tokens dos usuários sobreviveram à troca.

**O que ainda depende de você:** confirmar no painel do Stripe a taxa de falha do webhook
(item 12), checar o console do navegador para eu tirar o CSP do Report-Only (item 10), e
validar o checkout do Mercado Pago logado (item 23).

Verificação pós-deploy, tudo confirmado em produção:

- 15/15 arquivos expostos → 404
- 9/9 assets essenciais → 200 (incluindo o `googleb6f1f0b6b1c1a5f0.html` do Search Console)
- `app.js` no ar contém as duas correções (expiração e tratamento do 402)
- 5 endpoints protegidos → 401 sem sessão, nenhum 500
- `mp-checkout` e `mp-subscription` → 401, seguem fora da trava (é por onde se paga)
- cron do `ml-reviews` com segredo inválido → 403, ramo do cron alcançado antes da trava

---

## 🔴 CRÍTICO — resolver hoje

### 1. `server/.env` está público, com os segredos do Mercado Livre **[confirmado]**

```
https://www.impoclick.com.br/server/.env  →  200 OK, 398 bytes
PORT= / ML_CLIENT_ID= / ML_CLIENT_SECRET= / ML_ACCESS_TOKEN= / ML_REFRESH_TOKEN= / ML_USER_ID=
```

Qualquer pessoa baixa o arquivo e fica com o `ML_CLIENT_SECRET` e o `ML_REFRESH_TOKEN` da
aplicação. Com o refresh token dá pra emitir access tokens novos indefinidamente e agir na
conta do ML.

O `.gitignore` tem `.env*` — por isso o arquivo nunca foi pro Git e passou despercebido. Mas
o deploy é por `vercel --prod`, que sobe a **pasta local inteira**, não o que está no Git. O
`.env.local` da raiz o Vercel filtra sozinho; o `server/.env` não.

**Ação:**
1. Revogar/rotacionar o `ML_CLIENT_SECRET` no painel de aplicações do Mercado Livre — isso
   invalida os tokens vazados. Fazer isso **antes** do redeploy.
2. Criar `.vercelignore` (item 2) e republicar.
3. Conferir no ML se houve chamada estranha com esse client.

### 2. O repositório inteiro está sendo publicado em produção **[confirmado]**

Tudo abaixo responde 200 pra qualquer visitante:

| URL | O que é |
|---|---|
| `/server/.env` | segredos do ML (item 1) |
| `/supabase/fix_rls_exposed_tables.sql` | **descreve por escrito uma falha de segurança do banco** |
| `/supabase/ml_reviews.sql` e demais `.sql` | esquema completo do banco |
| `/docs/shopee_pentest_elegibilidade.pdf` | documento interno de pentest (105 KB) |
| `/server/server.js`, `/server/package.json`, `/server/README.md` | backend antigo inteiro |
| `/build_novo.py` (27 KB), `/check2.ps1`, `/fix2.ps1` | scripts internos de build |
| `/.mcp.json`, `/.vscode/settings.json` | config do ambiente de dev |
| `/index.backup.html` (149 KB), `/design-modelo-v4.html` (120 KB) | versões antigas do site |
| `/aduanize_logo.png` (360 KB) | imagem do projeto antigo, não usada em lugar nenhum |

O `fix_rls_exposed_tables.sql` é o pior da lista depois do `.env`: ele explica em português
qual tabela ficou sem RLS e o que dava pra ler dela. É um mapa pronto pra quem quiser atacar.

O `robots.txt` bloqueia só `index.backup.html` e `design-modelo-v4.html` — e robots.txt não
protege nada, só pede pro buscador não indexar. Os arquivos continuam acessíveis por URL direta.

**Ação:** criar `.vercelignore` na raiz:

```
.env*
server/
supabase/
docs/
.vscode/
.github/
.mcp.json
build_novo.py
*.ps1
index.backup.html
design-modelo-v4.html
aduanize_logo.png
node_modules
```

### 3. Quem paga uma vez fica PRO pra sempre **[confirmado no código]**

Em [app.js:2945-2956](app.js#L2945-L2956):

```js
if (user.is_pro) {
    return { hasAccess: true, isTrial: false, daysRemaining: 30, isSubscribed: true };
}
```

`subscription_expires_at` **nunca é lido**. E os dois webhooks gravam justamente esse campo
pro pagamento avulso: [mp-webhook.js:78-82](api/mp-webhook.js#L78-L82) e
[stripe-webhook.js:60-63](api/stripe-webhook.js#L60-L63) salvam `is_pro: true` +
`subscription_expires_at = hoje + 30 dias`.

Nada no sistema volta `is_pro` pra `false` quando essa data passa:
- o Stripe só desliga em `customer.subscription.deleted`, que é o fluxo de assinatura
  recorrente — o pagamento único não gera esse evento;
- o `mp-webhook.js` não trata cancelamento nenhum: só reage a `payment` e a
  `subscription_preapproval` **criada**. Assinatura cancelada no Mercado Pago segue PRO.

Ou seja: um PIX de R$ 29,90 compra acesso vitalício. É vazamento de receita direto.

**Ação:**
1. No `checkSubscriptionStatus`, respeitar a data:
   `if (user.is_pro && (!user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date()))`
2. Tratar `subscription_preapproval` com status `cancelled`/`paused` no `mp-webhook.js`.
3. Mesma checagem de expiração precisa existir no servidor (item 4) — a do front sozinha não
   segura ninguém.

---

### 18. O simulador mostra imposto ZERO para NCM fora da base curada, sem avisar **[confirmado]**

Este é hoje o achado mais grave da lista, e é consequência direta do item 6.

`getProductTaxRates()` ([app.js:1181](app.js#L1181)) tem quatro camadas de fallback:

| # | Camada | Situação |
|---|---|---|
| 1 | `lookupLocalNcm` — base curada do `ncm_db.js` | **42 NCMs**, contados |
| 2 | Estimativa do IBPT | **morta** (provedor 404, item 6) |
| 3 | `state.ncmCache` | só descrição; devolve II/IPI/PIS/COFINS = **0** |
| 4 | Fallback final | devolve tudo **0** |

Enquanto o IBPT respondia, a camada 2 cobria quase tudo que faltava. Com ela fora, qualquer
NCM que não esteja entre os 42 cai direto em alíquota zero.

**E a tela não avisa.** A tabela de resultado renderiza `${rates.ii.toFixed(1)}%`
([app.js:1974](app.js#L1974)), então aparece **"0.0%"** — visualmente idêntico a um produto
legitimamente isento. O campo `source` (`'local'` / `'ibpt-estimate'` / `'fallback'`) existe
justamente pra distinguir esses casos e **não é lido em lugar nenhum do código**. O texto
"NCM Não Cadastrado na Base" só existe na linha onde é atribuído; nunca chega à tela.

O resultado é pior que um erro: é um **número errado com cara de certo**. Alguém simula a
importação de um produto cujo NCM não está entre os 42, vê o custo total sem II, IPI, PIS e
COFINS — subestimado em algo próximo de 60% em muitos casos — e decide importar com base
nisso. Um erro visível teria feito a pessoa parar; um zero silencioso não.

**Ação (curta, não mexe em cálculo):** ler o `source` na renderização e, quando for
`'fallback'` ou `'online'`, marcar a linha com aviso claro — algo como "sem alíquota
cadastrada, imposto não calculado" — em vez de exibir `0.0%`. Se possível, bloquear o
resumo de viabilidade enquanto houver item nessa condição.

**Ação de fundo:** resolver o item 6, que é o que devolve a cobertura ampla.

---

## 🟠 ALTO

### 4. O paywall só existe no navegador **[confirmado]**

Nenhum endpoint da `api/` consulta `is_pro`. Todos param na autenticação:
`getVerifiedUserId(req)` confirma que existe uma sessão válida do Supabase e libera. Vale pra
`ml-market`, `ml-reviews`, `ml-status`, `ml-freight` e `inpi-marca`.

Consequência: qualquer conta gratuita — ou com o trial de 7 dias já vencido — chama as APIs
direto e usa o produto inteiro. Nem precisa de perícia: basta mexer no `is_pro` pelo console
do navegador que a interface destrava, e o backend responde normalmente.

**Ação:** um helper `requirePro(userId)` no `_ml-helper.js` que lê `profiles.is_pro` **e**
`subscription_expires_at` pelo `supabaseAdmin`, chamado logo depois do `getVerifiedUserId` em
todo endpoint pago.

### 5. O RLS do Supabase pode continuar aberto **[verificar]**

O `supabase/fix_rls_exposed_tables.sql` (30/07) começa com *"URGENTE — Rodar manualmente no
SQL Editor do Supabase assim que possível"* e relata que um `curl` anônimo, só com a chave
pública, leu linhas de outros usuários em `import_history`.

Ele nunca deixou de ser um arquivo solto na pasta. Não consegui testar se foi aplicado (a
verificação exigia consultar a API do Supabase, e a permissão foi negada nesta sessão).

**Ação:** abrir o painel do Supabase → Database → Tables e conferir se `import_history`,
`products_catalog`, `company_settings` e `active_simulation` estão com RLS **Enabled**. Se
não estiverem, rodar o SQL. Depois apagar o arquivo do deploy (item 2).

**Enquanto estiver aberto, as quatro tabelas são legíveis por qualquer um** — histórico de
importação, catálogo de produtos e dados da empresa importadora de todos os usuários.

### 6. `/api/ncm-tax-estimate` está quebrado em produção **[confirmado]**

```
GET /api/ncm-tax-estimate?ncm=85171231
→ 502 {"error":"Falha ao consultar a API do IBPT."}
```

A causa é externa: a API do IBPT que o proxy usa saiu do ar.

```
https://api-ibpt.seunegocionanuvem.com.br/api_ibpt.php?codigo=...&uf=SP  →  404
```

Não é intermitência, o endpoint upstream não existe mais. Efeito prático: todo NCM fora da
base curada do `ncm_db.js` fica sem estimativa de carga tributária, silenciosamente.

**Ação:** trocar o provedor (a API oficial do IBPT hoje é a `deolhonoimposto.ibpt.org.br`,
que exige token de cadastro) ou remover o recurso e deixar claro na interface que só os NCMs
da base curada têm estimativa.

### 7. Webhook do Mercado Pago aceita notificação sem assinatura **[confirmado no código]**

[mp-webhook.js:10-12](api/mp-webhook.js#L10-L12): se `MP_WEBHOOK_SECRET` não estiver
configurado, a verificação é pulada (`skipped: true`) e a notificação passa. A intenção está
documentada — não quebrar o que já funciona — mas o secret precisa ser configurado pra trava
valer, e o código não avisa em lugar nenhum além de um `console.warn` no log da Vercel.

**Ação:** pegar o secret no painel de Webhooks do MP, colocar como env var na Vercel, e
confirmar nos logs que o `console.warn` parou de aparecer.

### 8. Fallback silencioso de chave do Supabase **[confirmado no código]**

[_ml-helper.js:9-12](api/_ml-helper.js#L9-L12):

```js
supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);
```

Se a service role key sumir da Vercel, o cliente é criado com a chave anônima e o `if
(!supabaseAdmin)` de todos os endpoints continua passando. As escritas em `profiles` (salvar
token do ML, renovar token) passam a falhar por RLS, uma a uma, sem erro claro. Um bug desses
some por semanas.

**Ação:** falhar explícito quando a service role key faltar, em vez de cair na anon.

---

### 14. `supabase-js` carregado sem versão fixa e sem SRI **[confirmado]**

O `index.html` carrega a biblioteca que sustenta **todo o login** direto de um CDN, num
range aberto:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

O `@2` não é uma versão, é uma faixa. O jsDelivr resolve na hora da requisição — hoje está
entregando a **2.112.3** (confirmado no header `x-jsd-version`). Qualquer release 2.x nova
entra em produção sozinha, sem passar por teste nenhum. Se uma delas quebrar, o site perde o
login e não houve deploy pra correlacionar.

Some o `integrity` (SRI) também, nos dois scripts de CDN. Sem SRI, o navegador executa o que
vier do CDN sem conferir — e essa página manipula token de sessão e fluxo de pagamento.

**Ação:** fixar a versão exata e adicionar SRI:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"
        integrity="sha384-..." crossorigin="anonymous"></script>
```

O hash sai em `https://www.jsdelivr.com/package/npm/@supabase/supabase-js` ou por
`curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`. Subir de versão passa a
ser uma decisão sua, com deploy pra reverter.

### 15. `xlsx@0.18.5` tem vulnerabilidade conhecida e não tem upgrade pelo npm **[confirmado]**

```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

A 0.18.5 é afetada pela CVE-2023-30533 (prototype pollution no parser, corrigida só na
0.19.3) e pela CVE-2024-22363 (ReDoS, corrigida na 0.20.2). O agravante: a SheetJS saiu do
npm, e o `xlsx` de lá está congelado justamente na 0.18.5 — confirmei consultando o registro,
`latest` = `0.18.5`. Ou seja, não existe upgrade por esse caminho, o CDN vai servir a versão
vulnerável pra sempre.

O vetor é o parsing de planilha enviada pelo usuário. Como o parse roda no navegador de quem
subiu o arquivo, o alcance é limitado — mas é a mesma página que guarda o token de sessão.

**Ação:** migrar pro CDN oficial da SheetJS, que tem as versões corrigidas
(`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`), com SRI junto.

---

## 🟡 MÉDIO

### 16. Restaurar a simulação salva pode parar no meio, em silêncio **[confirmado]**

De [app.js:129](app.js#L129) em diante, uns 50 `document.getElementById('...').value = ...`
seguidos, sem nenhuma guarda de nulo. Está tudo dentro de um `try`, então a página não
quebra — mas se **um** id mudar de nome no HTML, a primeira linha a falhar aborta o resto do
bloco e a simulação do usuário volta pela metade: alguns campos preenchidos, outros no
padrão. O `catch` grava no console e mais nada, então ninguém fica sabendo.

É frágil pro tamanho: qualquer renomeação de id no `index.html` vira corrupção silenciosa do
estado salvo. Vale um helper `setField(id, valor)` que testa o elemento e loga o id faltando.

### 17. `catch (e) {}` vazio ao carregar catálogo e empresa **[confirmado]**

[app.js:108](app.js#L108) engole o erro sem log nenhum. Se a leitura do catálogo ou dos dados
da empresa falhar, o app segue com `state.catalog = []` como se o usuário não tivesse nada
salvo. Basta um `console.error` pra parar de esconder.

### 9. Todo asset estático revalida a cada carregamento **[confirmado]**

```
app.js?v=5     → Cache-Control: public, max-age=0, must-revalidate
style.css?v=4  → idem
ncm_db.js?v=4  → idem
impoclick_logo.png → idem
```

O `?v=N` já resolve o cache-busting, então o `max-age=0` só adiciona 4 round-trips
condicionais por visita. Em 4G no Brasil isso é meio segundo de atraso à toa.

**Ação:** no `vercel.json`, `Cache-Control: public, max-age=31536000, immutable` para
`.js`, `.css` e imagens — mantendo o `index.html` como está.

### 10. Sem Content-Security-Policy **[confirmado]**

O `vercel.json` traz nosniff, X-Frame-Options, HSTS, Referrer-Policy e Permissions-Policy —
mas nenhum CSP. É a única camada que sobraria caso algum HTML escapasse do escape.

Crédito onde é devido: o escape **está** correto. Varri as 75 chamadas de `innerHTML` do
`app.js` e as da extensão procurando interpolação de dado externo (título de anúncio,
nickname, comentário de avaliação) sem `escapeHtml` — não achei nenhuma.

### 11. Nenhum endpoint tem rate limit **[confirmado]**

Sem throttle em lugar nenhum da `api/`. O `ncm-tax-estimate` é o mais exposto: não exige
login, então é um proxy aberto que qualquer um pode martelar. Os demais exigem sessão, mas
uma conta só já consegue queimar a cota da API do Mercado Livre da conta conectada.

### 12. `module.exports.config` no webhook do Stripe **[verificar]**

[stripe-webhook.js:96](api/stripe-webhook.js#L96) exporta a config de `bodyParser: false`
como propriedade da função handler (padrão CommonJS). O Vercel documenta esse controle na
forma ESM (`export const config`). Se a Vercel não estiver lendo essa config, o body chega
já consumido, `buffer(req)` volta vazio e **toda** notificação do Stripe falha na assinatura
— pagamento aprovado que nunca vira PRO.

Sondei o endpoint em produção e ele responde com erro de assinatura, o que é o esperado pra
uma requisição falsa e não distingue os dois casos.

**Ação:** abrir Stripe → Developers → Webhooks e olhar a taxa de entregas com falha. Se
estiver alta, é isso. Um pagamento de teste confirma em um minuto.

### 13. `api/` está no teto de funções da Vercel **[confirmado]**

12 arquivos de endpoint (o `_ml-helper.js` não conta, o underscore o exclui) contra o limite
de 12 do plano Hobby. O `ml-status.js` já traz um comentário explicando que dois endpoints
foram fundidos por causa disso. Qualquer endpoint novo quebra o deploy.

---

## ✅ O que está correto

Levantado junto, pra não virar retrabalho depois:

- **Sem erro de sintaxe** em nenhum JS do projeto (`node --check` em `api/`, raiz,
  `extension/` e `server/`).
- **Sem segredo hardcoded** no código publicado — `build_novo.py` e `supabase_client.js`
  estão limpos, a chave do Supabase exposta é a publicável mesmo.
- **Sem `console.log` de depuração, `debugger` ou TODO** esquecido.
- **Autenticação bem resolvida:** o `getVerifiedUserId` valida o access token contra o
  Supabase Auth em vez de confiar num UUID mandado pelo front — o comentário no
  `_ml-helper.js` mostra que a falha anterior foi corrigida direito.
- **Redirecionamentos certos:** apex → www e http → https, ambos 308.
- **Compressão brotli ativa** em js/css.
- **SEO sólido:** canonical, OG, Twitter Card, JSON-LD de `SoftwareApplication` e `FAQPage`,
  sitemap e robots no lugar.
- **XSS tratado** com `escapeHtml` consistente no site e na extensão.
- **Webhook do Stripe verifica assinatura** de verdade, com `constructEvent`.

---

## Ordem sugerida

1. Rotacionar o `ML_CLIENT_SECRET` (item 1) — antes de qualquer outra coisa.
2. `.vercelignore` + `vercel --prod` (itens 1 e 2).
3. Conferir o RLS no painel do Supabase (item 5).
4. Expiração do PRO, no front e no servidor (itens 3 e 4).
5. `MP_WEBHOOK_SECRET` na Vercel (item 7) e taxa de falha do webhook Stripe (item 12).
6. Substituir ou aposentar a estimativa por NCM (item 6).
7. Cache dos assets, CSP e rate limit (itens 9, 10, 11).
