# Servidor local — Comparação de Mercado (Mercado Livre)

Backend mínimo que guarda as credenciais OAuth do Mercado Livre (`.env`) e expõe endpoints
locais que o `app.js` do IMPOCLICK consome na aba **Viabilidade → Comparação de Mercado**.

Existe porque o Mercado Livre exige um `access_token` autenticado para consultar categoria,
mais vendidos, tarifas de venda e frete — e o `client_secret` nunca pode ficar exposto no
navegador. Este servidor roda só na sua máquina (`127.0.0.1`) e nunca expõe as credenciais
para o front-end; ele só devolve os dados já calculados.

## Como rodar

```powershell
cd server
npm install   # só na primeira vez
npm start
```

Deixe rodando em `http://localhost:4000` enquanto usa o IMPOCLICK no navegador. Sem o
servidor rodando, a aba de Comparação de Mercado continua funcionando, só que com
estimativas locais (tabelas de referência) em vez dos dados reais da sua conta.

## Configuração

As credenciais ficam em `server/.env` (não versionar):

```
ML_CLIENT_ID=...
ML_CLIENT_SECRET=...
ML_ACCESS_TOKEN=...
ML_REFRESH_TOKEN=...
ML_USER_ID=...
```

O `access_token` expira a cada ~6h; o servidor detecta o 401 automaticamente, renova
usando o `refresh_token` e salva o novo par de tokens de volta no `.env` — não precisa
rodar nada manualmente.

## Endpoints

| Rota | Parâmetros | O que retorna |
|---|---|---|
| `GET /api/ml/status` | — | Se está conectado e o nickname/nível da conta |
| `GET /api/ml/category` | `q` (nome do produto) | Categoria real prevista (`domain_discovery`) |
| `GET /api/ml/best-seller` | `category` (id) | Produto #1 do ranking de mais vendidos (`highlights`) — nome e link, não o preço (a API não libera preço de concorrentes para este app) |
| `GET /api/ml/fee` | `price`, `category`, `listingType?` | Taxa de venda real por tipo de anúncio (`listing_prices`) |
| `GET /api/ml/freight` | `weight`(g), `length`/`width`/`height`(cm), `price` | Frete real cobrado do vendedor por peso faturável (`shipping_options/free`) |

## Limitação conhecida

A API não devolve o preço de produtos de outros vendedores para este app (nem por busca,
nem por `buy_box_winner`) — só dados da própria conta autenticada. Por isso o preço do
concorrente mais vendido continua sendo preenchido manualmente depois de conferir no link
que a aba abre.
