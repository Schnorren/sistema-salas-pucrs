import supabase from '../config/supabase.js';

class GradeRepository {
    async buscarGradeCompleta(predio_id) {
        let query = supabase.from('grade').select(`
            id, dia_semana, periodo, tipo, nome_aula,
            salas ( numero, andar, status ),
            disciplinas ( codigo, nome, escola )
        `);
        
        if (predio_id) query = query.eq('predio_id', predio_id);
        
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    // Todas as salas do prédio, inclusive ocultas/pendentes (o filtro de
    // visibilidade é do service — ver backend_core/utils/salas.js)
    async buscarSalas(predio_id) {
        let query = supabase.from('salas').select('numero, andar, status').order('numero');
        
        if (predio_id) query = query.eq('predio_id', predio_id);
        
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    async buscarSalasComId(predio_id) {
        const { data, error } = await supabase
            .from('salas')
            .select('id, numero, status')
            .eq('predio_id', predio_id);
        if (error) throw new Error(error.message);
        return data || [];
    }

    // Só cria as salas que faltam: ignoreDuplicates nunca sobrescreve o status
    // de uma sala existente (a escolha de visibilidade sobrevive ao re-import).
    async inserirSalasNovas(salasArray) {
        if (!salasArray.length) return;
        const { error } = await supabase
            .from('salas')
            .upsert(salasArray, { onConflict: 'numero,predio_id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
    }

    async atualizarStatusSalas(predio_id, numeros, status) {
        if (!numeros.length) return;
        const { error } = await supabase
            .from('salas')
            .update({ status })
            .eq('predio_id', predio_id)
            .in('numero', numeros);
        if (error) throw new Error(error.message);
    }

    async limparGrade(predio_id) {
        let query = supabase.from('grade').delete();
        
        if (predio_id) {
            query = query.eq('predio_id', predio_id);
        } else {
            query = query.neq('id', '00000000-0000-0000-0000-000000000000'); 
        }

        const { error } = await query;
        if (error) throw new Error(error.message);
    }

    async inserirGradeLote(gradeArray) {
        const { error } = await supabase.from('grade').insert(gradeArray);
        if (error) throw new Error(error.message);
    }
}

export default new GradeRepository();