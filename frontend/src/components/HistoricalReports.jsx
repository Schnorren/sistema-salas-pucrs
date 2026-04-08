import React, { useState, useMemo, useEffect, Component } from 'react';
import { generateComparisonPDF } from '../utils/reportGenerator';

const COLORS = ['#1c2b4a', '#c8973a', '#4e338a', '#1e6b40', '#a02828', '#1a6878', '#823060'];
const DAYS_OPTIONS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PERIOD_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'E1', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'P'];

class LocalErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false, errorMsg: '' }; }
    static getDerivedStateFromError(error) { return { hasError: true, errorMsg: error.message }; }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40 }}>
                    <div className="empty-st" style={{ border: '1px solid var(--red)', color: 'var(--red)' }}>
                        <h3>⚠️ Falha Crítica de Renderização</h3>
                        <p>O arquivo carregado possui um formato incompatível que quebrou os gráficos.</p>
                        <code>Detalhe: {this.state.errorMsg}</code><br/><br/>
                        <button className="tb-btn" onClick={() => window.location.reload()}>Recarregar Painel</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function HistoricalReports({ session, acesso }) {
    const [semanas, setSemanas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const [activeDays, setActiveDays] = useState(new Set(DAYS_OPTIONS));
    const [activePers, setActivePers] = useState(new Set(PERIOD_OPTIONS));
    const [activeRooms, setActiveRooms] = useState(new Set());

    const allAvailableRooms = useMemo(() => {
        const rooms = new Set();
        semanas.forEach(s => {
            if (s.data?.salasDisponiveis) s.data.salasDisponiveis.forEach(r => rooms.add(r));
        });
        return Array.from(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [semanas]);

    useEffect(() => {
        if (allAvailableRooms.length > 0 && activeRooms.size === 0) {
            setActiveRooms(new Set(allAvailableRooms));
        } else if (allAvailableRooms.length > 0) {
            const current = new Set(activeRooms);
            let changed = false;
            allAvailableRooms.forEach(r => {
                if (!current.has(r) && !Array.from(activeRooms).length) {
                    current.add(r);
                    changed = true;
                }
            });
            if (changed) setActiveRooms(current);
        }
    }, [allAvailableRooms]);

    
    const handleFiles = async (e) => {
        const target = e.target;
        const files = Array.from(target.files);
        if (!files.length) return;

        setLoading(true);
        setErrorMsg('');

        try {
            const processados = await Promise.all(files.map(async (file) => {
                try {
                    const formData = new FormData();
                    formData.append('arquivo', file);

                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/grade/analisar-externo-pdf`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${session?.access_token}`,
                            'x-predio-id': acesso?.predioId || ''
                        },
                        body: formData
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error || `O servidor rejeitou ${file.name}`);
                    }

                    const stats = await res.json();
                    
                    return {
                        id: Math.random().toString(36).substr(2, 9),
                        nome: file.name.replace('.pdf', ''),
                        data: stats
                    };
                } catch (err) {
                    console.error(`Falha no arquivo ${file.name}:`, err);
                    return null;
                }
            }));

            const validos = processados.filter(Boolean);
            if (validos.length > 0) setSemanas(prev => [...prev, ...validos]);
            else setErrorMsg("Nenhum arquivo pôde ser processado. Verifique a formatação do PDF da PUCRS.");
            
        } catch (err) {
            setErrorMsg("Falha crítica ao ler arquivos: " + err.message);
        } finally {
            setLoading(false);
            if (target) target.value = ''; 
        }
    };

    const filteredComparison = useMemo(() => {
        if (!semanas || semanas.length === 0) return [];
        
        return semanas.map(s => {
            if (!s?.data?.ocupacaoBase) return { id: s.id, nome: s?.nome || 'Erro', total: 0, percentual: '0.0', roomStats: {} };

            const baseFiltrada = s.data.ocupacaoBase.filter(item =>
                activeDays.has(item.dia) && activePers.has(item.periodo) && activeRooms.has(item.sala)
            );

            const totalPossivelGeral = activeDays.size * activePers.size * activeRooms.size;
            const percGeral = totalPossivelGeral > 0 ? ((baseFiltrada.length / totalPossivelGeral) * 100).toFixed(1) : '0.0';

            const roomStats = {};
            activeRooms.forEach(room => {
                const aulasDaSala = baseFiltrada.filter(item => item.sala === room).length;
                const possivelPorSala = activeDays.size * activePers.size;
                const percSala = possivelPorSala > 0 ? ((aulasDaSala / possivelPorSala) * 100).toFixed(1) : '0.0';
                roomStats[room] = { count: aulasDaSala, perc: percSala };
            });

            return { 
                id: s.id,
                nome: s.nome, 
                total: baseFiltrada.length, 
                percentual: percGeral,
                roomStats 
            };
        });
    }, [semanas, activeDays, activePers, activeRooms]);

    const toggleFilter = (set, val, setter) => {
        const newSet = new Set(set);
        if (newSet.has(val)) newSet.delete(val); else newSet.add(val);
        setter(newSet);
    };

    const toggleAllRooms = (status) => {
        setActiveRooms(status ? new Set(allAvailableRooms) : new Set());
    };

    return (
        <LocalErrorBoundary>
            <div className="view active" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="toolbar" style={{ borderBottom: '2px solid var(--accent)', background: 'var(--panel2)', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <label className="ms-lbl">Dias Analisados</label>
                                <div className="day-flt">
                                    {DAYS_OPTIONS.map(d => (
                                        <label key={d} className={`dcb ${activeDays.has(d) ? 'on' : ''}`}>
                                            <input type="checkbox" checked={activeDays.has(d)} onChange={() => toggleFilter(activeDays, d, setActiveDays)} />
                                            {d.substring(0, 3)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="ms-lbl">Janela de Períodos</label>
                                <div className="day-flt" style={{ maxWidth: '400px', overflowX: 'auto' }}>
                                    {PERIOD_OPTIONS.map(p => (
                                        <label key={p} className={`dcb ${activePers.has(p) ? 'on' : ''}`}>
                                            <input type="checkbox" checked={activePers.has(p)} onChange={() => toggleFilter(activePers, p, setActivePers)} />
                                            {p}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {allAvailableRooms.length > 0 && (
                            <div>
                                <label className="ms-lbl" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px' }}>
                                    <span>Salas Incluídas no Comparativo</span>
                                    <div className="filter-quick-act">
                                        <span onClick={() => toggleAllRooms(true)}>Todas</span> <span>·</span> <span onClick={() => toggleAllRooms(false)}>Limpar</span>
                                    </div>
                                </label>
                                <div className="day-flt" style={{ flexWrap: 'wrap', maxWidth: '800px', maxHeight: '90px', overflowY: 'auto', padding: '5px' }}>
                                    {allAvailableRooms.map(r => (
                                        <label key={r} className={`dcb ${activeRooms.has(r) ? 'on' : ''}`} style={{ minWidth: '50px', justifyContent: 'center' }}>
                                            <input type="checkbox" checked={activeRooms.has(r)} onChange={() => toggleFilter(activeRooms, r, setActiveRooms)} />
                                            {r}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="file" multiple accept=".pdf" id="histUpload" hidden onChange={handleFiles} />
                        <button className="btn-primary" onClick={() => document.getElementById('histUpload').click()}>
                            {loading ? "Processando..." : "+ Adicionar Semanas (.pdf)"}
                        </button>
                        <button
                            className="exp-btn purple"
                            disabled={semanas.length === 0}
                            onClick={() => generateComparisonPDF(filteredComparison)}
                        >
                            Exportar em PDF
                        </button>
                    </div>
                </div>

                {errorMsg && (
                    <div style={{ padding: '15px 20px 0' }}>
                        <div className="empty-st" style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px' }}>
                            <b>⚠️ Atenção:</b> {errorMsg}
                            <button className="tb-btn" style={{ marginLeft: 15 }} onClick={() => setErrorMsg('')}>X</button>
                        </div>
                    </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--bg)' }}>
                    {semanas.length === 0 ? (
                        <div className="empty-st">
                            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📈</div>
                            Nenhuma semana carregada.<br />
                            Suba os arquivos PDF da secretaria para montar o dashboard de BI.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                            
                            <div className="bar-card">
                                <div className="bar-ttl">Ocupação Consolidada do Prédio</div>
                                <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', marginTop: '15px' }}>
                                    {filteredComparison.map((s, i) => {
                                        const color = COLORS[i % COLORS.length];
                                        return (
                                            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '180px', position: 'relative' }}>
                                                
                                                <button onClick={() => setSemanas(semanas.filter(sem => sem.id !== s.id))} style={{ position: 'absolute', top: 5, right: 5, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px' }}>×</button>
                                                
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy)', marginBottom: '15px', textAlign: 'center' }}>{s.nome}</div>
                                                
                                                <div style={{ 
                                                    width: '100px', height: '100px', borderRadius: '50%', 
                                                    background: `conic-gradient(${color} ${s.percentual}%, #f0ede8 0)`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <div style={{ 
                                                        width: '70px', height: '70px', background: '#fff', borderRadius: '50%', 
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                        fontSize: '18px', fontWeight: 'bold', color: color
                                                    }}>
                                                        {s.percentual}%
                                                    </div>
                                                </div>
                                                
                                                <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--text2)' }}>
                                                    <b>{s.total}</b> aulas registradas
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bar-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div className="bar-ttl" style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: '#fff' }}>Desempenho por Sala</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="heat-tbl" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--panel2)' }}>
                                                <th style={{ padding: '15px', textAlign: 'left' }}>SALA</th>
                                                {filteredComparison.map((s, i) => (
                                                    <th key={s.id} style={{ padding: '15px', color: COLORS[i % COLORS.length] }}>{s.nome}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allAvailableRooms.filter(r => activeRooms.has(r)).map(room => (
                                                <tr key={room} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '15px', fontWeight: 'bold', textAlign: 'left', color: 'var(--navy)' }}>{room}</td>
                                                    
                                                    {filteredComparison.map((s, i) => {
                                                        const stat = s.roomStats[room] || { perc: 0, count: 0 };
                                                        const color = COLORS[i % COLORS.length];
                                                        return (
                                                            <td key={s.id} style={{ padding: '15px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                                                    <div style={{ 
                                                                        width: '24px', height: '24px', borderRadius: '50%', 
                                                                        background: `conic-gradient(${color} ${stat.perc}%, #f0ede8 0)`
                                                                    }}></div>
                                                                    
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{stat.perc}%</span>
                                                                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{stat.count} aulas</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </LocalErrorBoundary>
    );
}