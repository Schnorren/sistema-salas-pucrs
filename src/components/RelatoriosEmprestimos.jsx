import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { usePredio } from '../contexts/PredioContext';

const getHojeLocal = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);
};

export default function RelatoriosEmprestimos({ session, acesso }) {
    const { predioAtivo } = usePredio();
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);

    const [dataInicio, setDataInicio] = useState(getHojeLocal());
    const [dataFim, setDataFim] = useState(getHojeLocal());

    useEffect(() => {
        const currentPredioId = predioAtivo || acesso?.predioId || acesso?.predio_id;
        if (!currentPredioId) return;

        setLoading(true);

        const carregar = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/estatisticas?inicio=${dataInicio}&fim=${dataFim}`, {
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                        'x-predio-id': currentPredioId
                    }
                });

                if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);
                const json = await res.json();
                setDados(json);
            } catch (err) {
                console.error("Erro ao carregar relatórios", err);
            } finally {
                setLoading(false);
            }
        };
        carregar();
    }, [session, acesso, predioAtivo, dataInicio, dataFim]);

    if (loading && !dados) return <div style={{ padding: '40px', color: 'var(--muted)' }}>Analisando dados do período...</div>;

    return (
        <div style={{ padding: '24px', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '16px 24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>Painel de Desempenho</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted)' }}>Análise de rotatividade e uso do acervo de empréstimos.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>DATA INÍCIO</label>
                        <input
                            type="date"
                            value={dataInicio}
                            onChange={e => setDataInicio(e.target.value)}
                            style={dateInputStyle}
                        />
                    </div>
                    <span style={{ color: 'var(--muted)', marginTop: '16px' }}>—</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>DATA FIM</label>
                        <input
                            type="date"
                            value={dataFim}
                            onChange={e => setDataFim(e.target.value)}
                            style={dateInputStyle}
                        />
                    </div>
                </div>
            </div>

            {loading && <div style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 'bold' }}>Atualizando gráficos...</div>}

            {(!dados || !dados.resumo) ? (
                <div style={{ padding: '40px', color: '#ef4444' }}>Nenhum dado encontrado para este período.</div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                        <div style={cardStyle}>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold', letterSpacing: '0.5px' }}>TOTAL DE EMPRÉSTIMOS</span>
                            <div style={{ fontSize: '36px', fontWeight: '900', color: '#60a5fa' }}>{dados.resumo.totalEmprestimos}</div>
                        </div>
                        <div style={cardStyle}>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold', letterSpacing: '0.5px' }}>HORAS TOTAIS DE USO</span>
                            <div style={{ fontSize: '36px', fontWeight: '900', color: '#fbbf24' }}>{Math.round(dados.resumo.horasTotais)}h</div>
                        </div>
                        <div style={cardStyle}>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold', letterSpacing: '0.5px' }}>ALUNOS ÚNICOS ATENDIDOS</span>
                            <div style={{ fontSize: '36px', fontWeight: '900', color: '#10b981' }}>{dados.resumo.alunosAtendidos}</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div style={chartContainerStyle}>
                            <h3 style={titleStyle}>🏆 Top 10 Itens Mais Retirados</h3>
                            {dados.rankingItens.length === 0 ? <div style={emptyDataStyle}>Nenhum registro no período.</div> : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={dados.rankingItens} layout="vertical" margin={{ left: 40, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="nome_item" type="category" width={120} style={{ fontSize: '12px', fill: '#cbd5e1', fontWeight: 'bold' }} />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                        <Bar dataKey="total_saidas" name="Vezes Emprestado" fill="#3b82f6" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#fff', fontSize: 12, fontWeight: 'bold' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div style={chartContainerStyle}>
                            <h3 style={titleStyle}>⏳ Itens com Maior Tempo de Uso (Horas)</h3>
                            {dados.rankingHoras.length === 0 ? <div style={emptyDataStyle}>Nenhum registro no período.</div> : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={dados.rankingHoras} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="nome_item" hide />
                                        <YAxis style={{ fontSize: '12px', fill: '#cbd5e1' }} />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                        <Bar dataKey="total_horas" name="Total em Horas" fill="#f59e0b" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#fbbf24', fontSize: 12, fontWeight: 'bold' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div style={chartContainerStyle}>
                            <h3 style={titleStyle}>📈 Fluxo de Atendimento (Por Dia da Semana)</h3>
                            {dados.picos.length === 0 ? <div style={emptyDataStyle}>Nenhum registro no período.</div> : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={dados.picos}>
                                        <defs>
                                            <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="dia_semana" style={{ fontSize: '13px', fill: '#e2e8f0', fontWeight: 'bold' }} />
                                        <YAxis style={{ fontSize: '12px', fill: '#94a3b8' }} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Area type="monotone" name="Atendimentos" dataKey="quantidade" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorQty)" strokeWidth={4} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* 🔥 NOVO GRÁFICO: Picos por Horário */}
                        <div style={chartContainerStyle}>
                            <h3 style={titleStyle}>⏰ Picos de Utilização (Por Horário)</h3>
                            {dados.picosHorario && dados.picosHorario.length === 0 ? <div style={emptyDataStyle}>Nenhum registro no período.</div> : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={dados.picosHorario}>
                                        <defs>
                                            <linearGradient id="colorHora" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="hora" style={{ fontSize: '13px', fill: '#e2e8f0', fontWeight: 'bold' }} />
                                        <YAxis style={{ fontSize: '12px', fill: '#94a3b8' }} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Area type="monotone" name="Empréstimos" dataKey="quantidade" stroke="#10b981" fillOpacity={1} fill="url(#colorHora)" strokeWidth={4} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                    </div>
                </>
            )}
        </div>
    );
}

const dateInputStyle = { padding: '10px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--border)', outline: 'none', colorScheme: 'dark' };
const cardStyle = { background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' };
const chartContainerStyle = { background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' };
const titleStyle = { margin: '0 0 20px 0', fontSize: '16px', color: '#f8fafc', fontWeight: 'bold' };
const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontWeight: 'bold' };
const emptyDataStyle = { color: 'var(--muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' };