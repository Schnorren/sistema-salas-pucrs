import React, { useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { usePredio } from '../contexts/PredioContext';
import { useQuery } from '@tanstack/react-query';
import { useUI } from '../contexts/UIContext';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const getInicioHojeLocal = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10) + 'T00:00';
};

const getAgoraLocal = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().slice(0, 16);
};

const calcularDuracaoTotal = (inicioIso, fimIso) => {
    if (!inicioIso || !fimIso) return '--';
    const diffMs = new Date(fimIso) - new Date(inicioIso);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin} min`;
    return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
};

export default function RelatoriosEmprestimos({ session, acesso }) {
    const { predioAtivo } = usePredio();
    const { toast } = useUI();
    const relatorioRef = useRef(null);

    const [inputInicio, setInputInicio] = useState(getInicioHojeLocal());
    const [inputFim, setInputFim] = useState(getAgoraLocal());
    const [filtroInicio, setFiltroInicio] = useState(getInicioHojeLocal());
    const [filtroFim, setFiltroFim] = useState(getAgoraLocal());

    const [gerandoPdf, setGerandoPdf] = useState(false);

    const [mostrarTodosAlunos, setMostrarTodosAlunos] = useState(false);
    const [mostrarTodoHistorico, setMostrarTodoHistorico] = useState(false);

    const currentPredioId = predioAtivo || acesso?.predioId || acesso?.predio_id;

    const { data: dados, isLoading: loading, isError, isFetching } = useQuery({
        queryKey: ['relatorios_emprestimos', currentPredioId, filtroInicio, filtroFim],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/estatisticas?inicio=${filtroInicio}&fim=${filtroFim}`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'x-predio-id': currentPredioId
                }
            });
            if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);
            return res.json();
        },
        enabled: !!currentPredioId && !!filtroInicio && !!filtroFim,
        staleTime: 1000 * 60 * 2
    });

    const handleAtualizar = (e) => {
        if (e) e.preventDefault();
        setFiltroInicio(inputInicio);
        setFiltroFim(inputFim);

        setMostrarTodosAlunos(false);
        setMostrarTodoHistorico(false);
    };

    const handleExportarPDF = async () => {
        const elemento = relatorioRef.current;
        if (!elemento) return;

        setGerandoPdf(true);
        toast.info('Gerando PDF... Aguarde um momento.');

        try {
            const canvas = await html2canvas(elemento, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Relatorio_Emprestimos_${new Date().getTime()}.pdf`);

            toast.success('PDF exportado com sucesso!');
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            toast.error('Ocorreu um erro ao gerar o PDF.');
        } finally {
            setGerandoPdf(false);
        }
    };

    const limiteAlunos = 5;
    const totalAlunos = dados?.tabelaAlunosUnicos?.length || 0;
    const alunosRenderizados = mostrarTodosAlunos
        ? dados?.tabelaAlunosUnicos
        : dados?.tabelaAlunosUnicos?.slice(0, limiteAlunos);

    const limiteHistorico = 8; // Mostra 8 registros no histórico por padrão
    const totalHistorico = dados?.tabelaHistorico?.length || 0;
    const historicoRenderizado = mostrarTodoHistorico
        ? dados?.tabelaHistorico
        : dados?.tabelaHistorico?.slice(0, limiteHistorico);

    if (isError) return <div className="empty-st" style={{ color: 'var(--red)' }}>Erro ao carregar relatórios. Tente novamente.</div>;

    return (
        <div className="relatorios-container">

            <div className="relatorios-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                        Painel de Desempenho
                        {isFetching && <span className="badge-atualizando">Atualizando...</span>}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted)' }}>Análise de rotatividade e uso do acervo.</p>
                </div>

                <form className="filtros-wrapper" onSubmit={handleAtualizar}>
                    <div className="input-filtro-box">
                        <label>INÍCIO</label>
                        <input type="datetime-local" value={inputInicio} onChange={e => setInputInicio(e.target.value)} className="input-filtro" />
                    </div>
                    <div className="input-filtro-box">
                        <label>FIM</label>
                        <input type="datetime-local" value={inputFim} onChange={e => setInputFim(e.target.value)} className="input-filtro" />
                    </div>

                    <button type="submit" disabled={isFetching} className="btn-atualizar-filtro">
                        Atualizar
                    </button>
                </form>
            </div>

            {(loading && !dados) ? (
                <div className="empty-st">Analisando dados do período...</div>
            ) : (!dados || !dados.resumo) ? (
                <div className="empty-st" style={{ color: 'var(--red)' }}>Nenhum dado encontrado para este período.</div>
            ) : (

                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                        <button
                            type="button"
                            onClick={handleExportarPDF}
                            disabled={loading || !dados || gerandoPdf}
                            className="btn-exportar-pdf"
                            title="Baixar Relatório em PDF"
                            style={{ border: '1px solid var(--border)' }}
                        >
                            {gerandoPdf ? '⏳ Gerando...' : '📄 Exportar PDF'}
                        </button>
                    </div>

                    <div ref={relatorioRef} className="pdf-export-area">
                        <div className="kpi-grid" style={{ marginBottom: '24px' }}>
                            <div className="kpi-card">
                                <span className="kpi-titulo">TOTAL DE EMPRÉSTIMOS</span>
                                <div className="kpi-valor blue">{dados.resumo.totalEmprestimos}</div>
                            </div>
                            <div className="kpi-card">
                                <span className="kpi-titulo">HORAS TOTAIS DE USO</span>
                                <div className="kpi-valor amber">{Math.round(dados.resumo.horasTotais)}h</div>
                            </div>
                            <div className="kpi-card">
                                <span className="kpi-titulo">ALUNOS ÚNICOS ATENDIDOS</span>
                                <div className="kpi-valor green">{dados.resumo.alunosAtendidos}</div>
                            </div>
                        </div>

                        <div className="charts-grid" style={{ marginBottom: '24px' }}>
                            <div className="chart-box">
                                <h3 className="chart-title">🏆 Top 10 Itens Mais Retirados</h3>
                                {dados.rankingItens.length === 0 ? <div className="empty-st">Nenhum registro.</div> : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={dados.rankingItens} layout="vertical" margin={{ left: 40, right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="nome_item" type="category" width={120} style={{ fontSize: '12px', fill: 'var(--text2)', fontWeight: 'bold' }} />
                                            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} cursor={{ fill: 'var(--panel2)' }} />
                                            <Bar dataKey="total_saidas" name="Vezes Emprestado" fill="var(--blue)" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: 'var(--text)', fontSize: 12, fontWeight: 'bold' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            <div className="chart-box">
                                <h3 className="chart-title">⏳ Itens com Maior Tempo de Uso</h3>
                                {dados.rankingHoras.length === 0 ? <div className="empty-st">Nenhum registro.</div> : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={dados.rankingHoras} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="nome_item" hide />
                                            <YAxis style={{ fontSize: '12px', fill: 'var(--text2)' }} />
                                            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} cursor={{ fill: 'var(--panel2)' }} />
                                            <Bar dataKey="total_horas" name="Total em Horas" fill="var(--amber)" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: 'var(--amber)', fontSize: 12, fontWeight: 'bold' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            <div className="chart-box">
                                <h3 className="chart-title">📈 Fluxo de Atendimento (Semana)</h3>
                                {dados.picos.length === 0 ? <div className="empty-st">Nenhum registro.</div> : (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <AreaChart data={dados.picos}>
                                            <defs>
                                                <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--purple)" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="var(--purple)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="dia_semana" style={{ fontSize: '13px', fill: 'var(--text)', fontWeight: 'bold' }} />
                                            <YAxis style={{ fontSize: '12px', fill: 'var(--muted)' }} />
                                            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} />
                                            <Area type="monotone" name="Atendimentos" dataKey="quantidade" stroke="var(--purple)" fillOpacity={1} fill="url(#colorQty)" strokeWidth={4} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            <div className="chart-box">
                                <h3 className="chart-title">⏰ Picos de Utilização (Horário)</h3>
                                {dados.picosHorario && dados.picosHorario.length === 0 ? <div className="empty-st">Nenhum registro.</div> : (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <AreaChart data={dados.picosHorario}>
                                            <defs>
                                                <linearGradient id="colorHora" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--green)" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="hora" style={{ fontSize: '13px', fill: 'var(--text)', fontWeight: 'bold' }} />
                                            <YAxis style={{ fontSize: '12px', fill: 'var(--muted)' }} />
                                            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} />
                                            <Area type="monotone" name="Empréstimos" dataKey="quantidade" stroke="var(--green)" fillOpacity={1} fill="url(#colorHora)" strokeWidth={4} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        <div className="tables-grid">

                            <div className="chart-box" style={{ display: 'flex', flexDirection: 'column' }}>
                                <h3 className="chart-title">📄 Registro Detalhado de Retiradas</h3>
                                {dados.tabelaHistorico && dados.tabelaHistorico.length === 0 ? <div className="empty-st">Sem registros no período.</div> : (
                                    <div className="table-wrapper" style={{ maxHeight: 'none', overflowY: 'visible', display: 'flex', flexDirection: 'column' }}>
                                        <table className="table-historico" style={{ flex: 1 }}>
                                            <thead style={{ background: 'var(--panel2)' }}>
                                                <tr>
                                                    <th>Aluno</th>
                                                    <th>Item</th>
                                                    <th>Retirada</th>
                                                    <th>Duração</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {historicoRenderizado?.map(h => (
                                                    <tr key={h.id}>
                                                        <td>
                                                            <div className="th-aluno-nome">{h.nomeAluno}</div>
                                                            <div className="th-aluno-mat">{h.matricula}</div>
                                                        </td>
                                                        <td className="th-item">{h.nomeItem}</td>
                                                        <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                                                            {new Date(h.dataRetirada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td>
                                                            {h.dataDevolucao ? (
                                                                <span className="tag-status concluido">{calcularDuracaoTotal(h.dataRetirada, h.dataDevolucao)}</span>
                                                            ) : (
                                                                <span className="tag-status pendente">Pendente</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {totalHistorico > limiteHistorico && (
                                            <button
                                                type="button"
                                                className="btn-ver-mais"
                                                onClick={() => setMostrarTodoHistorico(!mostrarTodoHistorico)}
                                                data-html2canvas-ignore="true"
                                            >
                                                {mostrarTodoHistorico ? 'Ver Menos ▲' : `Ver mais ${totalHistorico - limiteHistorico} registros ▼`}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="chart-box" style={{ display: 'flex', flexDirection: 'column' }}>
                                <h3 className="chart-title">👥 Tabela de Alunos Únicos</h3>
                                {dados.tabelaAlunosUnicos && dados.tabelaAlunosUnicos.length === 0 ? <div className="empty-st">Sem registros no período.</div> : (
                                    <div className="table-wrapper" style={{ maxHeight: 'none', overflowY: 'visible', display: 'flex', flexDirection: 'column' }}>
                                        <table className="table-historico" style={{ flex: 1 }}>
                                            <thead style={{ background: 'var(--panel2)' }}>
                                                <tr>
                                                    <th>Aluno</th>
                                                    <th style={{ textAlign: 'center' }}>Qtd. Retiradas</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {alunosRenderizados?.map(a => (
                                                    <tr key={a.matricula}>
                                                        <td>
                                                            <div className="th-aluno-nome">{a.nome}</div>
                                                            <div className="th-aluno-mat">{a.matricula}</div>
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--green)', fontSize: '14px' }}>
                                                            {a.total_retiradas}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {totalAlunos > limiteAlunos && (
                                            <button
                                                type="button"
                                                className="btn-ver-mais"
                                                onClick={() => setMostrarTodosAlunos(!mostrarTodosAlunos)}
                                                data-html2canvas-ignore="true"
                                            >
                                                {mostrarTodosAlunos ? 'Ver Menos ▲' : `Ver mais ${totalAlunos - limiteAlunos} alunos ▼`}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}