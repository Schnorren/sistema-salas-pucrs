import React, { useState, useMemo, useEffect, Component } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { generateSingleReportPDF } from '../utils/reportGenerator';
import { usePredio } from '../contexts/PredioContext';

const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#ec4899'];
const DAYS_OPTIONS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PERIOD_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'E1', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'P'];

class LocalErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false, errorMsg: '' }; }
    static getDerivedStateFromError(error) { return { hasError: true, errorMsg: error.message }; }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, background: 'var(--bg)' }}>
                    <div style={{ border: '1px solid var(--red)', color: 'var(--red)', background: 'var(--panel2)', padding: '20px', borderRadius: '8px' }}>
                        <h3 style={{ margin: '0 0 10px 0' }}>⚠️ Falha de Renderização</h3>
                        <p style={{ margin: '0 0 10px 0' }}>Ocorreu um erro no motor de gráficos.</p>
                        <code style={{ display: 'block', background: 'var(--surface)', padding: '10px', borderRadius: '4px' }}>Detalhe: {this.state.errorMsg}</code><br />
                        <button className="btn-primary" onClick={() => window.location.reload()}>Recarregar Painel</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function HistoricalReportsCore({ session, acesso }) {
    const predioContext = usePredio() || {};
    const predioAtivo = predioContext.predioAtivo;

    const [semanaAtiva, setSemanaAtiva] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [sortOrder, setSortOrder] = useState('alpha');

    const [activeDays, setActiveDays] = useState(new Set(DAYS_OPTIONS));
    const [activePers, setActivePers] = useState(new Set(PERIOD_OPTIONS));
    const [activeRooms, setActiveRooms] = useState(new Set());

    const formatRoomName = (rawName) => {
        if (!rawName || rawName === 'Desconhecida') return rawName;
        const parts = rawName.split('.');
        if (parts.length >= 2) {
            const p1 = parseInt(parts[parts.length - 2], 10);
            const p2 = parts[parts.length - 1];
            return `${p1}${p2}`;
        }
        return rawName;
    };

    const allAvailableRooms = useMemo(() => {
        const rooms = new Set();
        if (semanaAtiva?.data?.salasDisponiveis) {
            semanaAtiva.data.salasDisponiveis.forEach(r => rooms.add(r));
        }
        return Array.from(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [semanaAtiva]);

    useEffect(() => {
        if (allAvailableRooms.length > 0 && activeRooms.size === 0) {
            setActiveRooms(new Set(allAvailableRooms));
        }
    }, [allAvailableRooms]);

    const handleFile = async (e) => {
        const target = e.target;
        const file = target.files?.[0];
        if (!file) return;

        const currentPredioId = predioAtivo || acesso?.predioId || acesso?.predio_id;
        if (!currentPredioId) {
            setErrorMsg("Selecione um prédio no menu superior antes de enviar o arquivo.");
            target.value = '';
            return;
        }

        setLoading(true);
        setErrorMsg('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const baseUrl = import.meta.env.VITE_PYTHON_API_URL || '';
            const analyzeUrl = baseUrl ? baseUrl.replace('/extract-pdf', '/analyze-bi') : '';

            if (!analyzeUrl) throw new Error("URL da API Python não configurada.");

            const res = await fetch(analyzeUrl, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.error || `Erro ${res.status}`);
            }

            const rawData = await res.json();
            const rawRecords = rawData.rawRecords || [];
            if (rawRecords.length === 0) throw new Error(`O PDF está vazio.`);

            const ocupacaoBase = rawRecords.map(aula => {
                let pLetter = aula.Periodo ? aula.Periodo.split(' ')[0] : 'Desconhecido';
                return {
                    dia: aula.Dia || 'Desconhecido',
                    periodo: pLetter,
                    sala: formatRoomName(aula.Sala)
                };
            }).filter(aula => aula.sala !== 'Desconhecida' && aula.dia !== 'Desconhecido');

            const salasDisponiveis = [...new Set(ocupacaoBase.map(a => a.sala))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            setSemanaAtiva({
                id: Math.random().toString(36).substr(2, 9),
                nome: file.name.replace('.pdf', ''),
                data: {
                    ocupacaoBase,
                    salasDisponiveis,
                    kpis: rawData.kpis || {}
                }
            });

        } catch (err) {
            setErrorMsg("Falha ao analisar arquivo: " + err.message);
        } finally {
            setLoading(false);
            target.value = '';
        }
    };

    const reportData = useMemo(() => {
        if (!semanaAtiva || !semanaAtiva.data) return null;

        const safeOcupacaoBase = semanaAtiva.data.ocupacaoBase || [];
        const baseFiltrada = safeOcupacaoBase.filter(item =>
            activeDays.has(item.dia) && activePers.has(item.periodo) && activeRooms.has(item.sala)
        );

        const totalPossivelGeral = activeDays.size * activePers.size * activeRooms.size;
        const percGeral = totalPossivelGeral > 0 ? ((baseFiltrada.length / totalPossivelGeral) * 100).toFixed(1) : '0.0';

        const roomStats = {};
        let maxAulas = 0;
        let salaMaisDemandada = '-';

        activeRooms.forEach(room => {
            const aulasDaSala = baseFiltrada.filter(item => item.sala === room).length;
            const possivelPorSala = activeDays.size * activePers.size;
            const percSala = possivelPorSala > 0 ? ((aulasDaSala / possivelPorSala) * 100).toFixed(1) : '0.0';
            roomStats[room] = { count: aulasDaSala, perc: percSala };

            if (aulasDaSala > maxAulas && aulasDaSala > 0) {
                maxAulas = aulasDaSala;
                salaMaisDemandada = room;
            }
        });

        const curvaMap = {};
        baseFiltrada.forEach(item => {
            curvaMap[item.periodo] = (curvaMap[item.periodo] || 0) + 1;
        });
        const curvaHorario = PERIOD_OPTIONS.filter(p => activePers.has(p)).map(p => ({
            horario: p,
            salasOcupadas: curvaMap[p] || 0
        }));

        let manha = 0, tarde = 0, noite = 0;
        baseFiltrada.forEach(item => {
            if (['A', 'B', 'C', 'D', 'E', 'E1'].includes(item.periodo)) manha++;
            else if (['F', 'G', 'H', 'I', 'J'].includes(item.periodo)) tarde++;
            else noite++;
        });
        const turnos = [
            { name: 'Manhã', value: manha },
            { name: 'Tarde', value: tarde },
            { name: 'Noite', value: noite }
        ].filter(t => t.value > 0);

        const heatmap = [];
        DAYS_OPTIONS.forEach(d => {
            const row = { dia: d };
            PERIOD_OPTIONS.forEach(p => row[p] = 0);
            heatmap.push(row);
        });
        baseFiltrada.forEach(item => {
            const row = heatmap.find(h => h.dia === item.dia);
            if (row) row[item.periodo]++;
        });

        return {
            ...semanaAtiva,
            totalFiltrado: baseFiltrada.length,
            percentual: Number(percGeral),
            roomStats,
            salaMaisDemandada,
            dinamico: { curvaHorario, turnos, heatmap }
        };
    }, [semanaAtiva, activeDays, activePers, activeRooms]);

    const toggleFilter = (set, val, setter) => {
        const newSet = new Set(set);
        if (newSet.has(val)) newSet.delete(val); else newSet.add(val);
        setter(newSet);
    };

    const sortedRooms = useMemo(() => {
        if (!reportData) return [];
        return allAvailableRooms.filter(r => activeRooms.has(r)).sort((a, b) => {
            const statA = reportData.roomStats[a]?.perc || 0;
            const statB = reportData.roomStats[b]?.perc || 0;
            if (sortOrder === 'desc') return statB - statA;
            if (sortOrder === 'asc') return statA - statB;
            return a.localeCompare(b, undefined, { numeric: true });
        });
    }, [allAvailableRooms, activeRooms, reportData, sortOrder]);

    const handleExport = () => {
        if (!reportData) return;
        const exportData = {
            ...reportData,
            data: { ...reportData.data, turnos: reportData.dinamico.turnos }
        };
        const activeRoomsArray = allAvailableRooms.filter(r => activeRooms.has(r));
        generateSingleReportPDF(exportData, sortedRooms, Array.from(activeDays), Array.from(activePers));
    };

    return (
        <div className="view active" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', position: 'relative', background: 'var(--bg)' }}>

            {loading && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', backdropFilter: 'blur(4px)' }}>
                    <div style={{ width: '60px', height: '60px', border: '5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <h2 style={{ marginTop: '20px', marginBottom: '5px', color: '#fff' }}>Processando Relatório...</h2>
                    <p style={{ color: 'rgba(255,255,255,0.7)' }}>Extraindo matrizes e calculando ocupações.</p>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            <div className="toolbar" style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                borderBottom: '2px solid var(--accent)',
                background: 'var(--panel2)',
                alignItems: 'stretch',
                display: reportData ? 'flex' : 'none',
                flexWrap: 'wrap',
                gap: '20px',
                padding: '15px 20px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', flex: 1 }}>

                    <div style={{ flex: '1 1 180px' }}>
                        <label className="ms-lbl">Dias Analisados</label>
                        <div className="day-flt" style={{ flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto' }}>
                            {DAYS_OPTIONS.map(d => (
                                <label key={d} className={`dcb ${activeDays.has(d) ? 'on' : ''}`}>
                                    <input type="checkbox" checked={activeDays.has(d)} onChange={() => toggleFilter(activeDays, d, setActiveDays)} />
                                    {d.substring(0, 3)}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div style={{ flex: '1 1 200px' }}>
                        <label className="ms-lbl">Janela de Períodos</label>
                        <div className="day-flt" style={{ flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto' }}>
                            {PERIOD_OPTIONS.map(p => (
                                <label key={p} className={`dcb ${activePers.has(p) ? 'on' : ''}`}>
                                    <input type="checkbox" checked={activePers.has(p)} onChange={() => toggleFilter(activePers, p, setActivePers)} />
                                    {p}
                                </label>
                            ))}
                        </div>
                    </div>

                    {allAvailableRooms.length > 0 && (
                        <div style={{ flex: '2 1 300px' }}>
                            <label className="ms-lbl" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <span>Salas Incluídas na Análise</span>
                                <div className="filter-quick-act">
                                    <span onClick={() => setActiveRooms(new Set(allAvailableRooms))}>Todas</span> <span>·</span> <span onClick={() => setActiveRooms(new Set())}>Limpar</span>
                                </div>
                            </label>
                            <div className="day-flt" style={{ flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto', padding: '5px' }}>
                                {allAvailableRooms.map(r => (
                                    <label key={`room-filter-${r}`} className={`dcb ${activeRooms.has(r) ? 'on' : ''}`} style={{ minWidth: '50px', justifyContent: 'center' }}>
                                        <input type="checkbox" checked={activeRooms.has(r)} onChange={() => toggleFilter(activeRooms, r, setActiveRooms)} />
                                        {r}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', minWidth: '200px' }}>
                    <input type="file" accept=".pdf" id="histUpload" hidden onChange={handleFile} />
                    <button className="btn-primary" onClick={() => document.getElementById('histUpload').click()} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                        🔄 Substituir Agenda
                    </button>
                    <button className="exp-btn purple" disabled={!reportData} onClick={handleExport}>
                        Exportar Relatório PDF
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div style={{ padding: '15px 20px 0', background: 'var(--bg)' }}>
                    <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px', borderRadius: '4px', background: '#fee2e2' }}>
                        <b>⚠️ Atenção:</b> {errorMsg}
                        <button className="tb-btn" style={{ marginLeft: 15 }} onClick={() => setErrorMsg('')}>X</button>
                    </div>
                </div>
            )}

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

                {!reportData ? (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                        <div
                            onClick={() => document.getElementById('histUploadMain').click()}
                            style={{
                                border: '3px dashed var(--accent)', borderRadius: '16px', padding: '60px',
                                textAlign: 'center', cursor: 'pointer', background: 'var(--surface)',
                                maxWidth: '600px', width: '100%', transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            <input type="file" accept=".pdf" id="histUploadMain" hidden onChange={handleFile} />
                            <div style={{ fontSize: '64px', marginBottom: '20px' }}>📄</div>
                            <h2 style={{ margin: '0 0 10px 0', color: 'var(--text)' }}>Analisar Nova Grade</h2>
                            <p style={{ color: 'var(--muted)', margin: '0 0 30px 0' }}>Faça o upload do PDF exportado pela secretaria para gerar o Dashboard de BI Operacional.</p>
                            <button className="btn-primary" style={{ padding: '15px 30px', fontSize: '16px' }}>
                                Selecionar Arquivo PDF
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderTop: `4px solid ${COLORS[0]}`, borderRadius: '10px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--text)' }}>Eficiência do Prédio</h3>
                                <div style={{ fontSize: '32px', fontWeight: '800', color: COLORS[0] }}>{reportData.percentual.toFixed(1)}%</div>
                                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>Taxa de Ocupação Global</div>
                            </div>
                            <div style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderTop: `4px solid ${COLORS[1]}`, borderRadius: '10px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--text)' }}>Volume de Aulas</h3>
                                <div style={{ fontSize: '32px', fontWeight: '800', color: COLORS[1] }}>{reportData.totalFiltrado}</div>
                                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>Alocações nos Filtros Ativos</div>
                            </div>
                            <div style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderTop: `4px solid ${COLORS[2]}`, borderRadius: '10px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--text)' }}>Salas Analisadas</h3>
                                <div style={{ fontSize: '32px', fontWeight: '800', color: COLORS[2] }}>{activeRooms.size}</div>
                                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>Sala mais demandada: {reportData.salaMaisDemandada}</div>
                            </div>
                        </div>

                        {reportData.dinamico.curvaHorario.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                                <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: 'var(--text)', fontWeight: 'bold' }}>🌊 Curva de Ocupação</h3>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <AreaChart data={reportData.dinamico.curvaHorario} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorCurva" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="horario" style={{ fill: 'var(--muted)', fontSize: '12px', fontWeight: 'bold' }} />
                                            <YAxis style={{ fill: 'var(--muted)', fontSize: '12px' }} />
                                            <RechartsTooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }} />
                                            <Area type="monotone" dataKey="salasOcupadas" name="Salas em Uso" stroke={COLORS[0]} fillOpacity={1} fill="url(#colorCurva)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>

                                <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                                    <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--text)', fontWeight: 'bold' }}>🌗 Uso por Turno</h3>
                                    <div style={{ flex: 1, minHeight: '200px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={reportData.dinamico.turnos} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                    {reportData.dinamico.turnos.map((entry, index) => (
                                                        <Cell key={`pie-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }} />
                                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto' }}>
                            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: 'var(--text)', fontWeight: 'bold' }}>🔥 Heatmap Operacional</h3>
                            <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: 'var(--muted)' }}>Intensidade reflete a quantidade de salas ocupadas no horário.</p>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '10px', color: 'var(--muted)', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>Horário</th>
                                        {DAYS_OPTIONS.map(d => (
                                            activeDays.has(d) && <th key={`th-${d}`} style={{ padding: '10px', color: 'var(--text)', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>{d.substring(0, 3)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {PERIOD_OPTIONS.map(p => {
                                        if (!activePers.has(p)) return null;
                                        const totalSalas = activeRooms.size || 1;
                                        return (
                                            <tr key={`tr-${p}`}>
                                                <td style={{ padding: '10px', color: 'var(--muted)', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>{p}</td>
                                                {DAYS_OPTIONS.map(d => {
                                                    if (!activeDays.has(d)) return null;

                                                    const diaData = reportData.dinamico.heatmap.find(h => h.dia === d);
                                                    const qtdSalasOcupadas = diaData ? (diaData[p] || 0) : 0;
                                                    const intensity = Math.min(qtdSalasOcupadas / totalSalas, 1);

                                                    return (
                                                        <td key={`td-${p}-${d}`} style={{
                                                            padding: '10px', textAlign: 'center', borderBottom: '1px solid var(--border)',
                                                            background: `rgba(59, 130, 246, ${intensity * 0.8})`
                                                        }}>
                                                            <span style={{ fontWeight: 'bold', color: intensity > 0.4 ? '#fff' : 'var(--text)' }}>
                                                                {qtdSalasOcupadas > 0 ? qtdSalasOcupadas : '-'}
                                                            </span>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text)', fontWeight: 'bold' }}>📍 Ranking de Utilização por Sala</h3>
                                <select
                                    value={sortOrder}
                                    onChange={e => setSortOrder(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                                >
                                    <option value="alpha">Ordem Numérica (0-9)</option>
                                    <option value="desc">Maior Ocupação ↓</option>
                                    <option value="asc">Menor Ocupação ↑</option>
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                                {sortedRooms.map(room => {
                                    const stat = reportData.roomStats[room] || { perc: 0, count: 0 };
                                    const pNum = Number(stat.perc);
                                    const ringColor = pNum > 80 ? '#ef4444' : pNum > 45 ? '#f59e0b' : '#3b82f6';

                                    return (
                                        <div key={`room-card-${room}`} style={{ background: 'var(--bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                            <h4 style={{ margin: '0 0 15px 0', color: 'var(--text)', fontSize: '18px' }}>{room}</h4>

                                            <div style={{
                                                width: '110px', height: '110px', borderRadius: '50%',
                                                background: `conic-gradient(${ringColor} ${pNum}%, var(--border) 0)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                marginBottom: '15px'
                                            }}>
                                                <div style={{ width: '85px', height: '85px', background: 'var(--bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px', color: 'var(--text)' }}>
                                                    {stat.perc}%
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>
                                                {stat.count} aulas alocadas
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}

export default function HistoricalReportsWithBoundary(props) {
    return (
        <LocalErrorBoundary>
            <HistoricalReportsCore {...props} />
        </LocalErrorBoundary>
    );
}