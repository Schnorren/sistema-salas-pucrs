import supabase from '../config/supabase.js';

class AvisosRepository {
    _assertPredio(predio_id) {
        if (!predio_id) throw new Error('predio_id é obrigatório para operações de avisos.');
    }

    async buscarAtivos(predio_id) {
        this._assertPredio(predio_id);
        const { data, error } = await supabase
            .from('avisos')
            .select('*')
            .eq('status', 'ATIVO')
            .eq('predio_id', predio_id);
        if (error) throw error;
        return data || [];
    }

    async buscarHistorico(predio_id, limite = 200) {
        this._assertPredio(predio_id);
        const { data, error } = await supabase
            .from('avisos')
            .select('*')
            .eq('status', 'CONCLUIDO')
            .eq('predio_id', predio_id)
            .order('concluido_em', { ascending: false })
            .limit(limite);
        if (error) throw error;
        return data || [];
    }

    async inserir(dados) {
        if (!dados.predio_id) throw new Error('É obrigatório selecionar um prédio para criar um aviso.');
        const { error } = await supabase.from('avisos').insert([dados]);
        if (error) throw error;
    }

    async atualizar(id, predio_id, dados) {
        this._assertPredio(predio_id);
        const { error } = await supabase
            .from('avisos')
            .update(dados)
            .eq('id', id)
            .eq('predio_id', predio_id);
        if (error) throw error;
    }

    async deletar(id, predio_id) {
        this._assertPredio(predio_id);
        const { error } = await supabase
            .from('avisos')
            .delete()
            .eq('id', id)
            .eq('predio_id', predio_id);
        if (error) throw error;
    }
}

export default new AvisosRepository();