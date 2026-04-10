import supabase from '../config/supabase.js';

class AvisosRepository {
    async buscarAtivos(predio_id) {
        let query = supabase.from('avisos').select('*').eq('status', 'ATIVO');
        
        if (predio_id) {
            query = query.eq('predio_id', predio_id);
        } else {
            query = query.eq('predio_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    async buscarHistorico(predio_id, limite = 200) {
        let query = supabase.from('avisos').select('*').eq('status', 'CONCLUIDO').order('concluido_em', { ascending: false }).limit(limite);
        
        if (predio_id) {
            query = query.eq('predio_id', predio_id);
        } else {
            query = query.eq('predio_id', '00000000-0000-0000-0000-000000000000');
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    async inserir(dados) {
        if (!dados.predio_id) throw new Error("É obrigatório selecionar um prédio para criar um aviso.");
        
        const { error } = await supabase.from('avisos').insert([dados]);
        if (error) throw error;
    }

    async atualizar(id, predio_id, dados) {
        let query = supabase.from('avisos').update(dados).eq('id', id);
        
        if (predio_id) {
            query = query.eq('predio_id', predio_id);
        } else {
            query = query.eq('predio_id', '00000000-0000-0000-0000-000000000000'); 
        }

        const { error } = await query;
        if (error) throw error;
    }

    async deletar(id, predio_id) {
        let query = supabase.from('avisos').delete().eq('id', id);
        
        if (predio_id) {
            query = query.eq('predio_id', predio_id);
        } else {
            query = query.eq('predio_id', '00000000-0000-0000-0000-000000000000');
        }

        const { error } = await query;
        if (error) throw error;
    }
}

export default new AvisosRepository();