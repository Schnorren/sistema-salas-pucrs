import supabase from '../config/supabase.js';

// Diretório de contatos é GLOBAL: não há predio_id nem filtro por prédio aqui
// (ao contrário de avisos/empréstimos). O isolamento multi-prédio não se aplica.
class ContatosRepository {
    async listarContatos() {
        const { data, error } = await supabase
            .from('contatos')
            .select('*')
            .order('ordem', { ascending: true })
            .order('nome', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async listarCursos() {
        const { data, error } = await supabase
            .from('contato_cursos')
            .select('id, contato_id, nome')
            .order('nome', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async buscarPorId(id) {
        const { data, error } = await supabase
            .from('contatos')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async buscarPorSlug(slug) {
        const { data, error } = await supabase
            .from('contatos')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async inserir(dados) {
        const { data, error } = await supabase
            .from('contatos')
            .insert([dados])
            .select('id, slug, nome, tipo')
            .single();
        if (error) throw error;
        return data;
    }

    // Retorna a linha atualizada (ou null se o id não existe).
    async atualizar(id, dados) {
        const { data, error } = await supabase
            .from('contatos')
            .update(dados)
            .eq('id', id)
            .select('id, slug, nome, tipo');
        if (error) throw error;
        return (data && data[0]) || null;
    }

    // Retorna a linha removida (ou null se nada foi deletado) para auditoria.
    // Filhos (unidades/serviços) e cursos saem junto via ON DELETE CASCADE.
    async deletar(id) {
        const { data, error } = await supabase
            .from('contatos')
            .delete()
            .eq('id', id)
            .select('id, slug, nome, tipo');
        if (error) throw error;
        return (data && data[0]) || null;
    }

    async inserirCurso(contato_id, nome) {
        const { data, error } = await supabase
            .from('contato_cursos')
            .insert([{ contato_id, nome }])
            .select('id, contato_id, nome')
            .single();
        if (error) throw error;
        return data;
    }

    async deletarCurso(id) {
        const { data, error } = await supabase
            .from('contato_cursos')
            .delete()
            .eq('id', id)
            .select('id, contato_id, nome');
        if (error) throw error;
        return (data && data[0]) || null;
    }
}

export default new ContatosRepository();
