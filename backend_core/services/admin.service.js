import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';
import { sanitizarPermissoes } from '../utils/modulos.js';
import { validarSenha } from '../utils/senha.js';

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

        // 23505 = UNIQUE (nome): antes virava 500 genérico
        if (error?.code === '23505') throw new ErroPublico('Já existe um prédio com esse nome.', 409);
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

        // 23505 = UNIQUE (nome): antes virava 500 genérico
        if (error?.code === '23505') throw new ErroPublico('Já existe um cargo com esse nome.', 409);
        if (error) throw falha('Erro ao criar perfil', error);
        return data;
    }

    async deletarPredio(id) {
        // Integridade referencial: não apagar prédio que ainda tem dados. Avisos,
        // pontos/acervo e bloqueios têm FK ON DELETE CASCADE (sumiriam em
        // silêncio); registros de empréstimo são RESTRICT (o delete falhava
        // com 500). Trocas de sala não têm FK (predio_id é texto).
        const contar = (tabela) =>
            supabase.from(tabela).select('predio_id', { count: 'exact', head: true }).eq('predio_id', id);
        const tabelas = [
            ['usuarios_acessos', 'membro(s)'],
            ['salas', 'sala(s)'],
            ['avisos', 'aviso(s)'],
            ['emprestimo_pontos', 'ponto(s) de empréstimo'],
            ['emprestimos_registro', 'registro(s) de empréstimo'],
            ['trocas_sala', 'troca(s) de sala'],
        ];
        const resultados = await Promise.all(tabelas.map(([t]) => contar(t)));
        const erro = resultados.find(r => r.error)?.error;
        if (erro) throw falha('Erro ao verificar referências do prédio', erro);

        const vinculados = resultados
            .map((r, i) => ((r.count || 0) > 0 ? `${r.count} ${tabelas[i][1]}` : null))
            .filter(Boolean);
        if (vinculados.length) {
            throw new ErroPublico(`Não é possível excluir: o prédio ainda tem ${vinculados.join(', ')}. Remova-os antes.`);
        }

        const { error } = await supabase.from('predios').delete().eq('id', id);
        if (error) throw falha('Erro ao deletar prédio', error);

        // JSON público da grade do prédio (best effort — não existir não é erro)
        const { error: errStorage } = await supabase.storage.from('grades').remove([`grade_predio_${id}.json`]);
        if (errStorage) console.error('[admin] prédio excluído, mas o JSON da grade ficou no Storage:', errStorage.message);
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

    // Registro de auditoria (tabela auditoria_log, gravada por registrarAuditoria).
    // Só leitura, para o Painel Admin; os mais recentes primeiro.
    async listarAuditoria(limite = 500) {
        const { data, error } = await supabase
            .from('auditoria_log')
            .select('id, user_email, acao, entidade, entidade_id, predio_id, detalhes, criado_em')
            .order('criado_em', { ascending: false })
            .limit(Math.min(Math.max(Number(limite) || 500, 1), 1000));
        if (error) throw falha('Não foi possível carregar a auditoria', error);
        return data || [];
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


    async atualizarUsuarioCompleto(id, { nome, predioId, perfilId, senha, permissoes }, editor = null) {
        const permissoesFinais = sanitizarPermissoes(permissoes, { permitirAdmin: true });

        // Espelha a tela (o Painel não deixa editar o próprio acesso): o admin
        // não tira de si mesmo a permissão 'admin' — com um admin só, o sistema
        // ficaria sem ninguém para devolver.
        if (editor?.id && editor.id === id && !permissoesFinais.includes('admin')) {
            throw new ErroPublico('Você não pode remover a sua própria permissão de administrador.');
        }

        const authPayload = { user_metadata: { nome } };

        if (typeof senha === 'string' && senha !== '') {
            const problema = validarSenha(senha);
            if (problema) throw new ErroPublico(problema);
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
                permissoes: permissoesFinais
            }, { onConflict: 'user_id' });

        if (accessError) throw falha('Erro ao atualizar acessos', accessError);

        return { success: true };
    }
}

export default new AdminService();
