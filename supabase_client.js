const SUPABASE_URL = 'https://qmwvzhpyxrkyxvekcazs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5xxYDOzIcWWpz2J37MuVaw_XJCpQM5i';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funções Helpers Globais para Banco de Dados
window.db = {
    // Autenticação
    async signUp(email, password, name) {
        return await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { name: name }
            }
        });
    },
    async signIn(email, password) {
        return await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });
    },
    async signOut() {
        return await supabase.auth.signOut();
    },
    async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) return null;
        
        // Puxar também o perfil do usuário
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();
            
        return {
            ...data.session.user,
            ...profile,
            name: profile?.name || data.session.user.user_metadata?.name || 'Usuário'
        };
    },
    async updateProfile(profileData) {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        return await supabase
            .from('profiles')
            .update(profileData)
            .eq('id', session.session.user.id);
    },

    // Estado Atual (Rascunho)
    async saveActiveSimulation(stateData) {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        return await supabase
            .from('active_simulation')
            .upsert({ user_id: session.session.user.id, state_data: stateData });
    },
    async getActiveSimulation() {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return null;
        const { data } = await supabase
            .from('active_simulation')
            .select('state_data')
            .eq('user_id', session.session.user.id)
            .single();
        return data?.state_data || null;
    },

    // Histórico
    async saveHistory(name, stateData) {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        return await supabase
            .from('import_history')
            .insert({ user_id: session.session.user.id, name: name, state_data: stateData });
    },
    async getHistory() {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return [];
        const { data } = await supabase
            .from('import_history')
            .select('*')
            .eq('user_id', session.session.user.id)
            .order('created_at', { ascending: false });
        return data || [];
    },
    async deleteHistory(id) {
        return await supabase.from('import_history').delete().eq('id', id);
    },

    // Catálogo
    async getCatalog() {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return [];
        const { data } = await supabase
            .from('products_catalog')
            .select('*')
            .eq('user_id', session.session.user.id)
            .order('created_at', { ascending: false });
        return data || [];
    },
    async saveCatalogItem(item) {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        
        if (item.id && typeof item.id === 'string' && item.id.includes('-')) {
            // Edit
            return await supabase
                .from('products_catalog')
                .update({ sku: item.sku, name: item.name, ncm: item.ncm, unit_price: item.price, weight: item.weight })
                .eq('id', item.id);
        } else {
            // Insert
            return await supabase
                .from('products_catalog')
                .insert({ user_id: session.session.user.id, sku: item.sku, name: item.name, ncm: item.ncm, unit_price: item.price, weight: item.weight });
        }
    },
    async deleteCatalogItem(id) {
        return await supabase.from('products_catalog').delete().eq('id', id);
    },

    // Empresa
    async getCompany() {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return null;
        const { data } = await supabase
            .from('company_settings')
            .select('*')
            .eq('user_id', session.session.user.id)
            .single();
        return data || null;
    },
    async saveCompany(companyData) {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        return await supabase
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
