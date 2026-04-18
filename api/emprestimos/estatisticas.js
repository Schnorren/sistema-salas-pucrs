import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

const formatarDataComFuso = (str) => {
    if (!str) return new Date();
    if (str.length === 16 && !str.includes('Z')) {
        return new Date(`${str}:00-03:00`);
    }
    return new Date(str);
};

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const predioId = req.headers['x-predio-id'];
    if (!predioId) return res.status(400).json({ error: 'Prédio não informado' });

    try {
        const inicioStr = req.query.inicio;
        const fimStr = req.query.fim;

        const dataInicio = formatarDataComFuso(inicioStr);
        const dataFim = formatarDataComFuso(fimStr);

        const { data: registros, error } = await supabase
            .from('emprestimos_registro')
            .select(`
                id,
                matricula_aluno,
                nome_aluno,
                data_retirada,
                data_devolucao,
                emprestimo_itens!inner (
                    nome_item,
                    patrimonio,
                    emprestimo_categorias!inner (
                        predio_id
                    )
                )
            `)
            .eq('emprestimo_itens.emprestimo_categorias.predio_id', predioId)
            .gte('data_retirada', dataInicio.toISOString())
            .lte('data_retirada', dataFim.toISOString());

        if (error) {
            console.error("Erro na query Supabase:", error);
            return res.status(500).json({ error: 'Erro ao consultar banco de dados.' });
        }

        const registrosNoPeriodo = registros || [];

        let totalHoras = 0;
        const usuariosSet = new Set();
        const itemSaidasMap = {};
        const itemHorasMap = {};
        const diasMap = {};
        const horasMap = {};

        const historicoFormatado = [];
        const listaAlunosInvertida = {};

        registrosNoPeriodo.forEach(reg => {
            const itemNome = reg.emprestimo_itens?.nome_item || 'Item Desconhecido';
            const patrimonio = reg.emprestimo_itens?.patrimonio || '---';
            const alunoMatricula = reg.matricula_aluno;
            const alunoNome = reg.nome_aluno;

            usuariosSet.add(alunoMatricula);

            if (!listaAlunosInvertida[alunoMatricula]) {
                listaAlunosInvertida[alunoMatricula] = { matricula: alunoMatricula, nome: alunoNome, total_retiradas: 0 };
            }
            listaAlunosInvertida[alunoMatricula].total_retiradas += 1;

            historicoFormatado.push({
                id: reg.id,
                nomeItem: itemNome,
                patrimonio: patrimonio,
                matricula: alunoMatricula,
                nomeAluno: alunoNome,
                dataRetirada: reg.data_retirada,
                dataDevolucao: reg.data_devolucao
            });

            itemSaidasMap[itemNome] = (itemSaidasMap[itemNome] || 0) + 1;

            let horasUso = 0;
            if (reg.data_devolucao) {
                const ms = new Date(reg.data_devolucao) - new Date(reg.data_retirada);
                horasUso = ms / (1000 * 60 * 60);
                totalHoras += horasUso;
            }
            itemHorasMap[itemNome] = (itemHorasMap[itemNome] || 0) + horasUso;

            const diaStr = new Date(reg.data_retirada).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
            const diaCapitalized = diaStr.charAt(0).toUpperCase() + diaStr.slice(1);
            diasMap[diaCapitalized] = (diasMap[diaCapitalized] || 0) + 1;

            const horaStr = new Date(reg.data_retirada).getHours() + 'h';
            horasMap[horaStr] = (horasMap[horaStr] || 0) + 1;
        });

        const rankingItens = Object.keys(itemSaidasMap)
            .map(nome => ({ nome_item: nome, total_saidas: itemSaidasMap[nome] }))
            .sort((a, b) => b.total_saidas - a.total_saidas)
            .slice(0, 10);

        const rankingHoras = Object.keys(itemHorasMap)
            .map(nome => ({ nome_item: nome, total_horas: parseFloat(itemHorasMap[nome].toFixed(1)) }))
            .filter(item => item.total_horas > 0)
            .sort((a, b) => b.total_horas - a.total_horas)
            .slice(0, 10);

        const diasOrdem = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        const picos = diasOrdem
            .map(dia => ({ dia_semana: dia, quantidade: diasMap[dia] || 0 }))
            .filter(d => d.quantidade > 0);

        const picosHorario = Object.keys(horasMap)
            .map(h => ({ hora: h, quantidade: horasMap[h] }))
            .sort((a, b) => parseInt(a.hora) - parseInt(b.hora));

        const tabelaAlunosUnicos = Object.values(listaAlunosInvertida).sort((a, b) => b.total_retiradas - a.total_retiradas);

        historicoFormatado.sort((a, b) => new Date(b.dataRetirada) - new Date(a.dataRetirada));

        return res.status(200).json({
            resumo: {
                totalEmprestimos: registrosNoPeriodo.length,
                horasTotais: totalHoras,
                alunosAtendidos: usuariosSet.size
            },
            rankingItens,
            rankingHoras,
            picos,
            picosHorario,
            tabelaHistorico: historicoFormatado,
            tabelaAlunosUnicos: tabelaAlunosUnicos
        });

    } catch (error) {
        console.error("❌ [API Erro - Estatísticas]:", error);
        return res.status(500).json({ error: error.message });
    }
}

export default withAuth(handler);