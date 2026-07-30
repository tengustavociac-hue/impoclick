const SUPABASE_URL = 'https://qmwvzhpyxrkyxvekcazs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5xxYDOzIcWWpz2J37MuVaw_XJCpQM5i';

// Guarda o hash original ANTES do supabase-js processá-lo/limpá-lo, para o
// app.js saber depois se essa sessão veio de um link de confirmação de e-mail
// (type=signup) e mostrar uma mensagem de boas-vindas apropriada.
window.__authRedirectHash = window.location.hash || '';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funções Helpers Globais para Banco de Dados
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
    async signOut() {
        return await supabaseClient.auth.signOut();
    },
    async getSession() {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session) return null;
        
        // Puxar também o perfil do usuário
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();
            
        return {
            ...data.session.user,
            ...profile,
            name: profile?.name || data.session.user.user_metadata?.name || 'Usuário',
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
            .single();
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

    // Catálogo
    async getCatalog() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return [];
        const { data } = await supabaseClient
            .from('products_catalog')
            .select('*')
            .eq('user_id', session.session.user.id)
            .order('created_at', { ascending: false });
        return data || [];
    },
    async saveCatalogItem(item) {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return;
        
        if (item.id && typeof item.id === 'string' && item.id.includes('-')) {
            // Edit
            return await supabaseClient
                .from('products_catalog')
                .update({ sku: item.sku, name: item.name, ncm: item.ncm, unit_price: item.price, weight: item.weight })
                .eq('id', item.id);
        } else {
            // Insert
            return await supabaseClient
                .from('products_catalog')
                .insert({ user_id: session.session.user.id, sku: item.sku, name: item.name, ncm: item.ncm, unit_price: item.price, weight: item.weight });
        }
    },
    async deleteCatalogItem(id) {
        return await supabaseClient.from('products_catalog').delete().eq('id', id);
    },

    // Empresa
    async getCompany() {
        const { data: session } = await supabaseClient.auth.getSession();
        if (!session?.session?.user) return null;
        const { data } = await supabaseClient
            .from('company_settings')
            .select('*')
            .eq('user_id', session.session.user.id)
            .single();
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
    }
};
