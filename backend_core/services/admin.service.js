import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';
import { sanitizarPermissoes } from '../utils/modulos.js';

// Loga o detalhe real do banco no servidor e devolve um Error com mensagem limpa
// (evita vazar nomes de colunas/constraints para o cliente).
function falha(contexto, error) {
    console.error(`[admin] ${contexto}:`, error?.message || error);
    return new Error(contexto);
}

class AdminService {
    async listarPredios() {
        const { data, error } = await supabase
            .from('predios')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw falha('Erro ao buscar prédios', error);
        return data;
    }

    async criarPredio(nome) {
        const { data, error } = await supabase
            .from('predios')
            .insert([{ nome }])
            .select()
            .single();

        if (error) throw falha('Erro ao criar prédio', error);
        return data;
    }

    async listarPerfis() {
        const { data, error } = await supabase
            .from('perfis')
            .select('id, nome')
            .order('nome', { ascending: true });

        if (error) throw falha('Erro ao buscar perfis', error);
        return data;
    }

    async criarPerfil(nome) {
        const { data, error } = await supabase
            .from('perfis')
            .insert([{ nome }])
            .select()
            .single();

        if (error) throw falha('Erro ao criar perfil', error);
        return data;
    }

    async deletarPredio(id) {
        // Integridade referencial: não apagar prédio que ainda tem membros ou salas.
        const [{ count: membros, error: e1 }, { count: salas, error: e2 }] = await Promise.all([
            supabase.from('usuarios_acessos').select('user_id', { count: 'exact', head: true }).eq('predio_id', id),
            supabase.from('salas').select('id', { count: 'exact', head: true }).eq('predio_id', id),
        ]);
        if (e1 || e2) throw falha('Erro ao verificar referências do prédio', e1 || e2);

        if ((membros || 0) > 0 || (salas || 0) > 0) {
            throw new ErroPublico(
                `Não é possível excluir: o prédio tem ${membros || 0} membro(s) e ${salas || 0} sala(s) vinculada(s). Remova-os antes.`
            );
        }

        const { error } = await supabase.from('predios').delete().eq('id', id);
        if (error) throw falha('Erro ao deletar prédio', error);
    }

    async deletarPerfil(id) {
        const { count, error: eCount } = await supabase
            .from('usuarios_acessos')
            .select('user_id', { count: 'exact', head: true })
            .eq('perfil_id', id);
        if (eCount) throw falha('Erro ao verificar referências do cargo', eCount);

        if ((count || 0) > 0) {
            throw new ErroPublico(`Não é possível excluir: ${count} usuário(s) usam este cargo.`);
        }

        const { error } = await supabase.from('perfis').delete().eq('id', id);
        if (error) throw falha('Erro ao deletar perfil', error);
    }

    async listarModulos() {
        const { data, error } = await supabase
            .from('sistema_modulos')
            .select('id, nome, descricao')
            .order('nome', { ascending: true });

        if (error) throw falha('Erro ao buscar módulos', error);
        return data;
    }

    async listarUsuarios() {
        // Supabase Auth trunca em 1000 sem paginação — busca todas as páginas
        let allUsers = [];
        let page = 1;
        const perPage = 1000;

        while (true) {
            const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
                page,
                perPage
            });
            if (authError) throw falha('Erro ao listar usuários (Auth)', authError);
            allUsers = allUsers.concat(authData.users || []);
            if ((authData.users || []).length < perPage) break;
            page++;
        }

        const { data: accessData, error: accessError } = await supabase
            .from('usuarios_acessos')
            .select(`user_id, predio_id, perfil_id, permissoes, predios (nome), perfis (nome)`);

        if (accessError) throw falha('Erro ao listar acessos', accessError);

        return allUsers.map(authUser => {
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
        if (authError) throw falha('Erro ao atualizar usuário (Auth)', authError);

        const { error: accessError } = await supabase
            .from('usuarios_acessos')
            .upsert({
                user_id: id,
                predio_id: predioId || null,
                perfil_id: perfilId || null,
                // Admin pode conceder qualquer módulo, inclusive 'admin' — mas valores
                // desconhecidos são descartados (não grava uuid/garbage).
                permissoes: sanitizarPermissoes(permissoes, { permitirAdmin: true })
            }, { onConflict: 'user_id' });

        if (accessError) throw falha('Erro ao atualizar acessos', accessError);

        return { success: true };
    }
}

export default new AdminService();
