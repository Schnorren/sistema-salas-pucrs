const supabase = require('../config/supabase');

class GradeRepository {
  async buscarGradeCompleta() {
    const { data, error } = await supabase
      .from('grade')
      .select(`
        id, dia_semana, periodo, tipo, nome_aula,
        salas ( numero, andar ),
        disciplinas ( codigo, nome, escola )
      `);
    if (error) throw new Error(error.message);
    return data;
  }

  async buscarSalas() {
    const { data, error } = await supabase
      .from('salas')
      .select('numero, andar')
      .order('numero');
    if (error) throw new Error(error.message);
    return data;
  }

  async upsertSalas(salasArray) {
    const { data, error } = await supabase
      .from('salas')
      .upsert(salasArray, { onConflict: 'numero' })
      .select('id, numero');
    if (error) throw new Error(error.message);
    return data;
  }

  async limparGrade() {
    const { error } = await supabase.from('grade').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(error.message);
  }

  async inserirGradeLote(gradeArray) {
    const { error } = await supabase.from('grade').insert(gradeArray);
    if (error) throw new Error(error.message);
  }

  async pesquisarGrade(termo) {
    const { data, error } = await supabase
      .from('grade')
      .select(`id, dia_semana, periodo, nome_aula, salas(numero), disciplinas(codigo, nome)`)
      .or(`nome_aula.ilike.%${termo}%, periodo.ilike.%${termo}%`);
    if (error) throw new Error(error.message);
    return data;
  }
}

module.exports = new GradeRepository();