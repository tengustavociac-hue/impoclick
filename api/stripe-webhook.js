const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Configuration to disable Vercel's default body parser
const config = {
  api: {
    bodyParser: false,
  },
};

// A verificação de assinatura do Stripe exige os BYTES EXATOS do corpo. Se a
// config de bodyParser acima não for aplicada, o Vercel consome o stream e
// entrega req.body já parseado — e aí o stream volta vazio. Reconstruir o JSON
// a partir do objeto não resolve: a serialização quase nunca bate byte a byte
// com o que o Stripe assinou.
//
// Então tratamos os três casos e, no caso perdido, dizemos exatamente qual é o
// problema. Antes isso virava um "No signatures found matching..." genérico,
// indistinguível de um segredo errado — e todo pagamento aprovado deixava de
// virar PRO sem ninguém entender por quê.
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const streamed = Buffer.concat(chunks);
  if (streamed.length > 0) return streamed;

  // bodyParser desativado corretamente, mas requisição sem corpo
  if (req.body === undefined || req.body === null) return streamed;

  // Corpo preservado cru por algum caminho alternativo
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');

  // Já parseado como objeto: bytes originais perdidos, sem recuperação possível
  const err = new Error(
    'O corpo da requisição chegou já parseado — a config `bodyParser: false` não foi ' +
    'aplicada por este runtime. Sem os bytes originais é impossível validar a assinatura ' +
    'do Stripe. Converta este arquivo para ESM com `export const config` ou use o runtime ' +
    'de Functions novo do Vercel.'
  );
  err.rawBodyUnavailable = true;
  throw err;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  let stripe;
  let supabaseAdmin;
  try {
    // Instanciados aqui dentro (não no topo do módulo): se faltar alguma env
    // var, isso agora vira um 500 tratado em vez de derrubar a função inteira
    // sem log assim que o Vercel carrega o módulo.
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    if (err.rawBodyUnavailable) {
      // Erro de configuração, não de assinatura. 500 (e não 400) faz o Stripe
      // reenviar a notificação depois, então nenhum pagamento se perde enquanto
      // isso não for corrigido.
      console.error('🚨 CONFIGURAÇÃO: ' + err.message);
      return res.status(500).send('Webhook misconfigured: raw body unavailable');
    }
    // text/plain e mensagem fixa: `res.send(string)` responde como text/html
    // neste runtime, e devolver err.message interpolado é a mesma classe de
    // reflexão que virou XSS no ml-callback.js. O detalhe fica no log — o
    // Stripe não lê esse corpo, só o status.
    console.error('⚠️ Erro na assinatura do Webhook.', err.message);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      const mode = session.mode; // 'payment' (Único/PIX) ou 'subscription' (Recorrente/Cartão)

      if (userId) {
        console.log(`Liberando acesso PRO para o usuário: ${userId} (Modo: ${mode})`);
        
        let updateData = { is_pro: true, stripe_customer_id: customerId };
        
        if (mode === 'payment') {
          // Pagamento único: expira em 30 dias
          const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          updateData.subscription_expires_at = expires;
        } else {
          // Assinatura: fica ativo até cancelar
          updateData.subscription_expires_at = null;
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
          
        if (error) console.error('Erro no Supabase:', error);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      console.log(`Cancelando acesso PRO para o cliente Stripe: ${customerId}`);
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_pro: false })
        .eq('stripe_customer_id', customerId);
        
      if (error) console.error('Erro no Supabase:', error);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro ao processar:', err);
    res.status(500).send('Internal Server Error');
  }
};

module.exports.config = config;
