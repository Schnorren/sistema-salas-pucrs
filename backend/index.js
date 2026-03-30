require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializa a conexão com o banco de dados
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Rota de teste
app.get('/', (req, res) => {
  res.send('API da Secretaria Prédio 15 rodando 🚀');
});

// Endpoint para buscar a grade de horários completa
app.get('/api/grade', async (req, res) => {
  const { data, error } = await supabase
    .from('grade')
    .select(`
      id,
      dia_semana,
      periodo,
      tipo,
      nome_aula,
      salas ( numero, andar ),
      disciplinas ( codigo, nome, escola )
    `);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  res.json(data);
});

// Endpoint para importar o CSV e salvar no Supabase
app.post('/api/importar', async (req, res) => {
  const dados = req.body; // Array de aulas que virá do React

  try {
    // 1. Extrair e inserir Salas únicas (Upsert para não duplicar)
    const salasUnicas = [...new Set(dados.map(d => d.Sala))].map(s => ({ numero: s }));
    await supabase.from('salas').upsert(salasUnicas, { onConflict: 'numero' }).select();

    // 2. Buscar as salas recém-inseridas para pegar os IDs (UUIDs)
    const { data: salasDb } = await supabase.from('salas').select('id, numero');
    const salaMap = {};
    salasDb.forEach(s => { salaMap[s.numero] = s.id });

    // 3. Montar os dados da Grade formatados para o banco
    const gradeInsert = dados.map(d => ({
      sala_id: salaMap[d.Sala],
      dia_semana: d.Dia,
      periodo: d.Periodo.split(' ')[0], // Pega apenas a letra (A, B, C...)
      nome_aula: d.Nome_da_Aula,
      tipo: d.Nome_da_Aula.toLowerCase().includes('interno') ? 'Interno' : 'Regular'
    }));

    // 4. Limpar a grade antiga e inserir a nova carga
    await supabase.from('grade').delete().neq('dia_semana', 'Nenhum'); // Truque para apagar tudo
    const { error: insertError } = await supabase.from('grade').insert(gradeInsert);

    if (insertError) throw insertError;

    res.json({ message: 'Importação concluída com sucesso!', count: gradeInsert.length });
  } catch (error) {
    console.error('Erro na importação:', error);
    res.status(500).json({ error: error.message });
  }
});

// Inicializa o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});