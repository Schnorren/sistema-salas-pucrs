import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';

// O PostgREST devolve no máximo 1000 linhas por requisição (max_rows do
// Supabase) e corta o resto SEM erro. A grade do prédio 15 tem ~750 períodos;
// um prédio maior (ou um semestre mais cheio) publicaria um JSON incompleto.
// Toda leitura da grade passa por aqui, em páginas.
const PAGINA = 1000;

async function lerTodasAsPaginas(montarQuery) {
    const linhas = [];
    for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await montarQuery().range(inicio, inicio + PAGINA - 1);
        if (error) throw new Error(error.message);
        linhas.push(...(data || []));
        if (!data || data.length < PAGINA) return linhas;
    }
}

class GradeRepository {
    async buscarGradeCompleta(predio_id) {
        return lerTodasAsPaginas(() => {
            let query = supabase.from('grade').select(`
                id, dia_semana, periodo, tipo, nome_aula,
                salas ( numero, andar, status ),
                disciplinas ( codigo, nome, escola )
            `).order('id');
            if (predio_id) query = query.eq('predio_id', predio_id);
            return query;
        });
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

    // Sem prédio, NÃO apaga nada — antes caía num delete de todas as grades
    // de todos os prédios.
    async limparGrade(predio_id) {
        if (!predio_id) throw new Error('limparGrade: prédio obrigatório.');
        const { error } = await supabase.from('grade').delete().eq('predio_id', predio_id);
        if (error) throw new Error(error.message);
    }

    async inserirGradeLote(gradeArray) {
        const { error } = await supabase.from('grade').insert(gradeArray);
        if (error) throw new Error(error.message);
    }

    // Troca a grade do prédio numa transação (supabase/migrations/grade_substituir_rpc.sql):
    // ou entra a nova inteira, ou fica a antiga. Se a função ainda não existir
    // no banco (deploy antes da migration), cai no caminho antigo em 2 passos.
    async substituirGrade(predio_id, linhas) {
        if (!predio_id) throw new Error('substituirGrade: prédio obrigatório.');
        const { data, error } = await supabase.rpc('grade_substituir', { p_predio_id: predio_id, p_linhas: linhas });
        if (!error) return data;
        if (error.code === 'PGRST202') {
            console.warn('[grade] grade_substituir() não existe no banco — rode npm run migrate. Usando delete+insert.');
            await this.limparGrade(predio_id);
            await this.inserirGradeLote(linhas.map(l => ({ ...l, predio_id })));
            return linhas.length;
        }
        // RAISE EXCEPTION da função (P0001) é mensagem pensada para o usuário
        if (error.code === 'P0001') throw new ErroPublico(error.message);
        throw new Error(error.message);
    }
}

export default new GradeRepository();
