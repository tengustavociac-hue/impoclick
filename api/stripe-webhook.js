const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Configuration to disable Vercel's default body parser
const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to read the raw body from the request stream
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️ Erro na assinatura do Webhook.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
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
