import supabase from '../config/supabase.js';

class AdminService {
    async listarPredios() {
        const { data, error } = await supabase
            .from('predios')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw new Error(`Erro ao buscar prédios: ${error.message}`);
        return data;
    }

    async criarPredio(nome) {
        const { data, error } = await supabase
            .from('predios')
            .insert([{ nome }])
            .select()
            .single();

        if (error) throw new Error(`Erro ao criar prédio: ${error.message}`);
        return data;
    }

    async listarPerfis() {
        const { data, error } = await supabase
            .from('perfis')
            .select('id, nome')
            .order('nome', { ascending: true });

        if (error) throw new Error(`Erro ao buscar perfis: ${error.message}`);
        return data;
    }

    async criarPerfil(nome) {
        const { data, error } = await supabase
            .from('perfis')
            .insert([{ nome }])
            .select()
            .single();

        if (error) throw new Error(`Erro ao criar perfil: ${error.message}`);
        return data;
    }

    async listarUsuarios() {
        const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) throw new Error(`Erro Auth: ${authError.message}`);

        const { data: accessData, error: accessError } = await supabase
            .from('usuarios_acessos')
            .select(`user_id, predio_id, perfil_id, permissoes, predios (nome), perfis (nome)`);

        if (accessError) throw new Error(`Erro Acessos: ${accessError.message}`);

        return authData.users.map(authUser => {
            const acesso = accessData.find(a => a.user_id === authUser.id) || {};
            return {
                id: authUser.id,
                email: authUser.email,
                nome: authUser.user_metadata?.nome || '',
                predioId: acesso.predio_id || null,
                predioNome: acesso.predios?.nome || 'Acesso Global / Sem Prédio',
                perfilId: acesso.perfil_id || null,
                perfilNome: acesso.perfis?.nome || 'Sem Cargo',
                permissoes: acesso.permissoes || []
            };
        });
    }


    async atualizarUsuarioCompleto(id, { nome, predioId, perfilId, senha, permissoes }) {
        const authPayload = { user_metadata: { nome } };

        if (senha && senha.trim() !== '') {
            authPayload.password = senha;
        }

        const { error: authError } = await supabase.auth.admin.updateUserById(id, authPayload);
        if (authError) throw new Error(`Erro Auth: ${authError.message}`);

        const { error: accessError } = await supabase
            .from('usuarios_acessos')
            .upsert({
                user_id: id,
                predio_id: predioId || null,
                perfil_id: perfilId || null,
                permissoes: permissoes || []
            }, { onConflict: 'user_id' });

        if (accessError) throw new Error(`Erro Acessos: ${accessError.message}`);

        return { success: true };
    }
}

export default new AdminService();