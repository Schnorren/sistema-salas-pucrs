import supabase from '../config/supabase.js';

class GradeRepository {
    async buscarGradeCompleta(predio_id) {
        let query = supabase.from('grade').select(`
            id, dia_semana, periodo, tipo, nome_aula,
            salas ( numero, andar ),
            disciplinas ( codigo, nome, escola )
        `);
        
        if (predio_id) query = query.eq('predio_id', predio_id);
        
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    async buscarSalas(predio_id) {
        let query = supabase.from('salas').select('numero, andar').order('numero');
        
        if (predio_id) query = query.eq('predio_id', predio_id);
        
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    async upsertSalas(salasArray) {
        const { data, error } = await supabase
            .from('salas')
            .upsert(salasArray, { onConflict: 'numero, predio_id' }) 
            .select('id, numero');
        if (error) throw new Error(error.message);
        return data;
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