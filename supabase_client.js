const SUPABASE_URL = 'https://qmwvzhpyxrkyxvekcazs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5xxYDOzIcWWpz2J37MuVaw_XJCpQM5i';

// Guarda o hash original ANTES do supabase-js processá-lo/limpá-lo, para o
// app.js saber depois se essa sessão veio de um link de confirmação de e-mail
// (type=signup) e mostrar uma mensagem de boas-vindas apropriada.
window.__authRedirectHash = window.location.hash || '';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funções Helpers Globais para Banco de Dados
// Tabela que ainda não foi criada chega com códigos diferentes conforme a
// camada que recusa: PGRST205 no PostgREST ("not in the schema cache"), 42P01
// no Postgres. Os dois querem dizer a mesma coisa para quem usa a tela.
function erroDeTabela(error) {
    const codigo = error && error.code;
    const texto = (error && error.message) || '';
    if (codigo === 'PGRST205' || codigo === '42P01' || /schema cache|does not exist/i.test(texto)) {
        return 'sem_tabela';
    }
    return texto || 'erro_desconhecido';
}

window.db = {
    // Autenticação
    async signUp(email, password, name) {
        return await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { name: name },
                emailRedirectTo: window.location.origin
            }
        });
    },
    async signIn(email, password) {
        return await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });
    },
    async resendConfirmation(email) {
        return await supabaseClient.auth.resend({
            type: 'signup',
            email: email,
            options: { emailRedirectTo: window.location.origin }
        });
    },
    // "Esqueci minha senha": o Supabase manda o link e, na volta, abre a sessão
    // sozinho com type=recovery no endereço — o app.js pede a senha nova aí.
    async resetPassword(email) {
        return await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    },
    async updatePassword(password) {
        return await supabaseClient.auth.updateUser({ password });
    },
    // 'local': sair do site encerra só ESTE navegador. O padrão do Supabase é
    // 'global', que derrubava junto a sessão da extensão do Chrome (e de outros
    // aparelhos): a extensão passava a receber 401 e o cartão do anúncio ficava
    // todo em "—".
    async signOut() {
        return await supabaseClient.auth.signOut({ scope: 'local' });
    },
    async getSession() {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session) return null;
        
        // Puxar também o perfil do usuário.
        // maybeSingle() e não single(): conta recém-criada pode ainda não ter
        // linha em profiles, e o single() responde 406 nesse caso — erro que
        // aparecia no console em toda sessão sem perfil, sem significar nada.
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .maybeSingle();

        // Dono/admin do app tem acesso infinito (checkSubscriptionStatus no
        // app.js), sem depender de is_pro/subscription_expires_at.
        const { data: ehAdmin } = await supabaseClient.rpc('is_app_admin');

        return {
            ...data.session.user,
            ...profile,
            name: profile?.name || data.session.user.user_metadata?.name || 'Usuário',
            is_app_admin: ehAdmin === true,
            // access_token da sessão (supabase-js já renova sozinho) — usado pra
            // autenticar as chamadas às nossas próprias APIs (Authorization: Bearer).
            access_token: data.session.access_token,
        };
    },
    async updateProfile(profileData) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        return await supabaseClient
            .from('profiles')
            .update(profileData)
            .eq('id', session.session.user.id);
    },

    // Estado Atual (Rascunho)
    async saveActiveSimulation(stateData) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        return await supabaseClient
            .from('active_simulation')
            .upsert({ user_id: session.session.user.id, state_data: stateData });
    },
    async getActiveSimulation() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return null;
        const { data } = await supabaseClient
            .from('active_simulation')
            .select('state_data')
            .eq('user_id', session.session.user.id)
            .maybeSingle(); // sem rascunho salvo é normal — single() daria 406
        return data?.state_data || null;
    },

    // Histórico
    async saveHistory(name, stateData) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session) {
            return { error: new Error('Sua sessão expirou. Por favor, atualize a página e faça login novamente.') };
        }
        
        // Adicionando .select() para forçar o retorno do erro se o RLS bloquear o insert
        return await supabaseClient
            .from('import_history')
            .insert({ user_id: data.session.user.id, name: name, state_data: stateData })
            .select();
    },
    async getHistory() {
        const { data: authData, error: authError } = await supabaseClient.auth.getSession();
        if (authError || !authData.session) return [];
        
        const { data, error } = await supabaseClient
            .from('import_history')
            .select('*')
            .eq('user_id', authData.session.user.id)
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('Erro getHistory Supabase:', error);
            alert('Erro ao buscar histórico: ' + error.message);
        }
        return data || [];
    },
    async deleteHistory(id) {
        return await supabaseClient.from('import_history').delete().eq('id', id);
    },

    // Embarques (aba Navio - Container). Diferente dos métodos acima, estes não
    // abrem alert(): devolvem { dados } ou { erro } e a tela decide o que dizer.
    // O caso mais provável de erro no começo é a tabela ainda não existir —
    // supabase/shipments.sql precisa ser rodado à mão — e "sem_tabela" deixa a
    // tela explicar isso em vez de mostrar a mensagem crua do PostgREST.
    async getShipments() {
        const { data: s } = await supabaseClient.auth.getSession();
        if (!s?.session?.user) return { erro: 'sem_sessao', dados: [] };
        const { data, error } = await supabaseClient
            .from('shipments')
            .select('*')
            .eq('user_id', s.session.user.id)
            .order('created_at', { ascending: false });
        if (error) return { erro: erroDeTabela(error), dados: [] };
        return { dados: data || [] };
    },
    async saveShipment(registro) {
        const { data: s } = await supabaseClient.auth.getSession();
        if (!s?.session?.user) return { erro: 'sem_sessao' };
        const { id, ...campos } = registro;
        const consulta = id
            ? supabaseClient.from('shipments')
                .update({ ...campos, updated_at: new Date().toISOString() })
                .eq('id', id)
            : supabaseClient.from('shipments')
                .insert({ ...campos, user_id: s.session.user.id });
        const { data, error } = await consulta.select().single();
        if (error) return { erro: erroDeTabela(error) };
        return { dados: data };
    },
    async deleteShipment(id) {
        const { error } = await supabaseClient.from('shipments').delete().eq('id', id);
        return error ? { erro: erroDeTabela(error) } : { ok: true };
    },

    // Painel de Patrocinados: custo unitário por anúncio (MLB) e a alíquota de
    // imposto sobre a venda. Mesmo contrato dos embarques: { dados } ou
    // { erro }, com "sem_tabela" enquanto supabase/ml_ads_margem.sql não rodou.
    async getAdsMargemDados() {
        const { data: s } = await supabaseClient.auth.getSession();
        if (!s?.session?.user) return { erro: 'sem_sessao' };
        const uid = s.session.user.id;
        const [custos, config] = await Promise.all([
            supabaseClient.from('ml_item_costs').select('ml_item_id, unit_cost').eq('user_id', uid),
            supabaseClient.from('ml_ads_settings').select('sales_tax_pct').eq('user_id', uid).maybeSingle(),
        ]);
        const erro = custos.error || config.error;
        if (erro) return { erro: erroDeTabela(erro) };
        const porItem = {};
        (custos.data || []).forEach((l) => { porItem[l.ml_item_id] = Number(l.unit_cost); });
        return { dados: { custos: porItem, impostoPct: config.data ? Number(config.data.sales_tax_pct) : null } };
    },
    async saveItemCost(mlItemId, unitCost) {
        const { data: s } = await supabaseClient.auth.getSession();
        if (!s?.session?.user) return { erro: 'sem_sessao' };
        const uid = s.session.user.id;
        const { error } = unitCost == null
            ? await supabaseClient.from('ml_item_costs').delete().eq('user_id', uid).eq('ml_item_id', mlItemId)
            : await supabaseClient.from('ml_item_costs').upsert({
                user_id: uid, ml_item_id: mlItemId, unit_cost: unitCost, updated_at: new Date().toISOString(),
            });
        return error ? { erro: erroDeTabela(error) } : { ok: true };
    },
    async saveAdsTax(pct) {
        const { data: s } = await supabaseClient.auth.getSession();
        if (!s?.session?.user) return { erro: 'sem_sessao' };
        const { error } = await supabaseClient.from('ml_ads_settings').upsert({
            user_id: s.session.user.id, sales_tax_pct: pct, updated_at: new Date().toISOString(),
        });
        return error ? { erro: erroDeTabela(error) } : { ok: true };
    },

    // Catálogo
    async getCatalog() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return [];
        const { data } = await supabaseClient
            .from('products_catalog')
            .select('*')
            .eq('user_id', session.session.user.id)
            .order('created_at', { ascending: false });

        // A coluna no banco chama unit_price, mas TODO o app lê p.price
        // (renderCatalogTable, dropdown do catálogo, cálculo de custo). Sem
        // esta normalização, `p.price` vinha undefined depois de recarregar a
        // página e `p.price.toFixed(2)` quebrava a tabela de catálogo inteira
        // com TypeError — o produto salvava, mas sumia da tela no reload.
        return (data || []).map(p => ({
            ...p,
            price: p.price !== undefined && p.price !== null ? p.price : p.unit_price,
        }));
    },
    async saveCatalogItem(item) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        
        // currency, taxation, description e image entram aqui: o formulário
        // sempre coletou os quatro, mas eles não eram gravados e voltavam
        // vazios do banco. A moeda era a perda mais cara — produto cadastrado
        // em dólar voltava sem moeda e era somado como real.
        const campos = {
            sku: item.sku,
            name: item.name,
            ncm: item.ncm,
            unit_price: item.price,
            weight: item.weight,
            currency: item.currency || 'BRL',
            taxation: item.taxation || null,
            description: item.description || null,
            image: item.image || null,
        };

        if (item.id && typeof item.id === 'string' && item.id.includes('-')) {
            // Edit
            return await supabaseClient
                .from('products_catalog')
                .update(campos)
                .eq('id', item.id);
        } else {
            // Insert
            return await supabaseClient
                .from('products_catalog')
                .insert({ user_id: session.session.user.id, ...campos });
        }
    },
    async deleteCatalogItem(id) {
        return await supabaseClient.from('products_catalog').delete().eq('id', id);
    },

    // Preço mínimo por anúncio. Chaveado pelo MLB, sem passar pelo catálogo:
    // exigir vínculo com um produto cadastrado só para digitar um número era
    // limitação de armazenamento virando exigência de interface.
    async getPromoItemConfigs() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return {};
        const { data } = await supabaseClient
            .from('ml_promo_item_config')
            .select('ml_item_id, min_price, last_deal_price, current_price, current_net, current_net_at, updated_at')
            .eq('user_id', session.session.user.id);
        const porItem = {};
        for (const r of data || []) porItem[r.ml_item_id] = r;
        return porItem;
    },

    async setPromoItemMinPrice(mlItemId, minPrice) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        return await supabaseClient
            .from('ml_promo_item_config')
            .upsert({
                user_id: session.session.user.id,
                ml_item_id: mlItemId,
                min_price: minPrice,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,ml_item_id' });
    },

    // Configuração da automação de promoções.
    async getPromoAutomation() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return null;
        const { data } = await supabaseClient
            .from('ml_promo_automation')
            .select('*')
            .eq('user_id', session.session.user.id)
            .maybeSingle();
        return data || null;
    },

    async savePromoAutomation(cfg) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        return await supabaseClient
            .from('ml_promo_automation')
            .upsert({
                user_id: session.session.user.id,
                ...cfg,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
    },

    // Histórico do que o robô fez — inclusive as decisões de NÃO agir.
    async getPromoActions(limit = 50, outcomes = null) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return [];
        let query = supabaseClient
            .from('ml_promo_actions')
            .select('*')
            .eq('user_id', session.session.user.id);
        // Cada verificação grava vários "não entrou". Sem filtrar por resultado,
        // eles empurram os "entrou" para fora do limite e a aba de aprovados
        // aparece vazia mesmo quando a automação colocou anúncios em promoção.
        if (outcomes) query = query.in('outcome', outcomes);
        const { data } = await query
            .order('created_at', { ascending: false })
            .limit(limit);
        return data || [];
    },

    // Empresa
    async getCompany() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return null;
        const { data } = await supabaseClient
            .from('company_settings')
            .select('*')
            .eq('user_id', session.session.user.id)
            .maybeSingle(); // sem empresa cadastrada é normal — single() daria 406
        return data || null;
    },
    async saveCompany(companyData) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        return await supabaseClient
            .from('company_settings')
            .upsert({ 
                user_id: session.session.user.id, 
                corporate_name: companyData.name, 
                trading_name: companyData.tradingName, 
                cnpj: companyData.cnpj, 
                state_registration: companyData.ie 
            });
    },

    // Painel de cadastros (supabase/admin_cadastros.sql). Quem é admin é
    // decidido no banco: para qualquer outra conta, is_app_admin devolve false
    // e admin_cadastros recusa — esconder o menu no site é só conveniência.
    async isAppAdmin() {
        const { data, error } = await supabaseClient.rpc('is_app_admin');
        return !error && data === true;
    },
    async getAdminCadastros() {
        const { data, error } = await supabaseClient.rpc('admin_cadastros');
        if (error) throw new Error(error.message);
        return data;
    },
    // Ações da tela Cadastros (supabase/admin_acoes.sql). As regras — quem pode,
    // assinatura recorrente, e-mail de confirmação da exclusão — ficam no banco;
    // aqui só se repassa o erro em português que ele devolve.
    async adminConfirmarEmail(alvo) {
        const { error } = await supabaseClient.rpc('admin_confirmar_email', { alvo });
        if (error) throw new Error(error.message);
    },
    async adminDefinirPro(alvo, ate) {
        const { error } = await supabaseClient.rpc('admin_definir_pro', { alvo, ate });
        if (error) throw new Error(error.message);
    },
    async adminExcluirConta(alvo, confirmacaoEmail) {
        const { data, error } = await supabaseClient.rpc('admin_excluir_conta', { alvo, confirmacao_email: confirmacaoEmail });
        if (error) throw new Error(error.message);
        return data;
    },
    onAuthChange(callback) {
        return supabaseClient.auth.onAuthStateChange(callback);
    }
};
