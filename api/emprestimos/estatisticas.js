import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import supabase from '../../backend_core/config/supabase.js';

export default withAuth(async (req, res) => {
    const predioId = req.headers['x-predio-id'];
    if (!predioId) return res.status(400).json({ error: 'Prédio não informado' });

    const hojeStr = new Date().toISOString().split('T')[0];
    const inicioStr = req.query.inicio || hojeStr;
    const fimStr = req.query.fim || hojeStr;

    const p_inicio = `${inicioStr}T00:00:00-03:00`;
    const p_fim = `${fimStr}T23:59:59-03:00`;

    try {
        const { data: rankingItens, error: err1 } = await supabase.rpc('fn_estatisticas_itens', { p_predio_id: predioId, p_inicio, p_fim });
        const { data: picos, error: err2 } = await supabase.rpc('fn_picos_atendimento', { p_predio_id: predioId, p_inicio, p_fim });
        const { data: kpisList, error: err3 } = await supabase.rpc('fn_resumo_emprestimos', { p_predio_id: predioId, p_inicio, p_fim });

        if (err1) throw err1;
        if (err2) throw err2;
        if (err3) throw err3;

        const kpis = kpisList?.[0] || { total_emprestimos: 0, alunos_unicos: 0 };

        const ordenadoPorSaida = [...(rankingItens || [])].sort((a, b) => b.total_saidas - a.total_saidas).slice(0, 10);
        const ordenadoPorHoras = [...(rankingItens || [])].sort((a, b) => b.total_horas - a.total_horas).slice(0, 10);

        res.json({
            resumo: {
                totalEmprestimos: kpis.total_emprestimos || 0,
                alunosAtendidos: kpis.alunos_unicos || 0,
                horasTotais: rankingItens?.reduce((acc, curr) => acc + Number(curr.total_horas), 0) || 0
            },
            rankingItens: ordenadoPorSaida,
            rankingHoras: ordenadoPorHoras,
            picos: picos || []
        });
    } catch (err) {
        console.error("Erro SQL:", err);
        res.status(500).json({ error: err.message });
    }
});