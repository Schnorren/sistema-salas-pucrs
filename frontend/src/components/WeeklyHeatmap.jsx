import { useState, useEffect, useMemo } from 'react';
import { generateHeatmapPDF } from '../utils/reportGenerator';
import { usePredio } from '../contexts/PredioContext'; // 📍 1. Import

const COLORS = ['#1c2b4a', '#1e6b40', '#4e338a', '#a02828', '#96520a', '#1a6878', '#3a6e1a', '#823060'];

export default function WeeklyHeatmap({ session, acesso }) {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeDays, setActiveDays] = useState(new Set());
  const [activeRooms, setActiveRooms] = useState(new Set());
  const [activePers, setActivePers] = useState(new Set());

  const { predioAtivo } = usePredio(); // 📍 2. Hook

  useEffect(() => {
    if (!predioAtivo && !acesso?.predioId) return;
    setLoading(true);

    const headers = {
      'Authorization': `Bearer ${session?.access_token}`,
      'x-predio-id': predioAtivo || acesso?.predioId || ''
    };

    fetch(`${import.meta.env.VITE_API_URL}/api/grade/ocupacao`, { headers })
      .then(res => {
        if (!res.ok) throw new Error("Erro na API");
        return res.json();
      })
      .then(d => {
        setRawData(d);
        setActiveDays(new Set(d.diasDisponiveis));
        setActiveRooms(new Set(d.salasDisponiveis));
        setActivePers(new Set(d.periodosDisponiveis));
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao buscar dados de ocupação:", err);
        setLoading(false);
      });
  }, [session, acesso, predioAtivo]); // 📍 4. Dependência adicionada

  const stats = useMemo(() => {
    if (!rawData) return null;

    const filtered = rawData.ocupacaoBase.filter(item =>
      activeDays.has(item.dia) &&
      activeRooms.has(item.sala) &&
      activePers.has(item.periodo)
    );

    let totalOccupied = 0;
    const possiblePerRoom = activeDays.size * activePers.size;

    const heatmap = [...activeRooms]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(sala => {
        const contagemPorDia = {};
        let totalSala = 0;

        [...activeDays].forEach(dia => {
          const aulasNoDia = filtered.filter(f => f.sala === sala && f.dia === dia);
          const count = new Set(aulasNoDia.map(a => a.periodo)).size;

          contagemPorDia[dia] = count;
          totalSala += count;
        });

        totalOccupied += totalSala;
        const percSala = possiblePerRoom > 0 ? ((totalSala / possiblePerRoom) * 100).toFixed(1) : '0.0';

        return { sala, contagemPorDia, totalSala, percSala };
      });

    const totalPossible = possiblePerRoom * activeRooms.size;
    const percGeral = totalPossible > 0 ? ((totalOccupied / totalPossible) * 100).toFixed(1) : '0.0';

    const mxCount = Math.max(1, ...heatmap.map(h => h.totalSala));
    const usageByDay = [...activeDays].map(dia => {
      const aulasNoDiaGeral = filtered.filter(f => f.dia === dia);
      const slotsUnicosOcupados = new Set(aulasNoDiaGeral.map(a => `${a.sala}-${a.periodo}`)).size;
      return {
        dia,
        total: slotsUnicosOcupados
      };
    });

    return { heatmap, usageByDay, mxCount, totalOccupied, totalPossible, percGeral };
  }, [rawData, activeDays, activeRooms, activePers]);

  const handleFilterChange = (set, value, setter) => {
    const newSet = new Set(set);
    if (newSet.has(value)) newSet.delete(value);
    else newSet.add(value);
    setter(newSet);
  };

  const toggleAll = (type, value) => {
    if (type === 'rooms') setActiveRooms(value ? new Set(rawData.salasDisponiveis) : new Set());
    if (type === 'pers') setActivePers(value ? new Set(rawData.periodosDisponiveis) : new Set());
  };

  const getHeatClass = (v) => {
    if (!v) return 'h0';
    const totalPersNoDia = activePers.size;
    const ratio = v / totalPersNoDia;
    if (ratio < 0.12) return 'h1';
    if (ratio < 0.28) return 'h2';
    if (ratio < 0.50) return 'h3';
    if (ratio < 0.75) return 'h4';
    return 'h5';
  };

  const exportCSV = () => {
    const days = [...activeDays];
    let csv = `Sala,${days.join(',')},Total Ocupado,Total Possivel,% Ocupacao\n`;
    const possibleSlots = days.length * activePers.size;

    stats.heatmap.forEach(row => {
      const perc = possibleSlots > 0 ? ((row.totalSala / possibleSlots) * 100).toFixed(1) : 0;
      const rowData = days.map(d => row.contagemPorDia[d] || 0);
      csv += `${row.sala},${rowData.join(',')},${row.totalSala},${possibleSlots},${perc}%\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ocupacao_secretaria_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  if (loading) return <div className="empty-st">Analisando histórico de ocupação...</div>;

  return (
    <div className="view active" id="vHeat" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div className="toolbar" style={{ alignItems: 'flex-start', padding: '14px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ minWidth: 60 }}>Dias:</label>
            <div className="day-flt">
              {rawData.diasDisponiveis.map(d => (
                <label key={d} className={`dcb ${activeDays.has(d) ? 'on' : ''}`}>
                  <input type="checkbox" checked={activeDays.has(d)} onChange={() => handleFilterChange(activeDays, d, setActiveDays)} />
                  {d.substring(0, 3).toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <label style={{ minWidth: 60, marginTop: 6 }}>
              Salas:
              <div className="filter-quick-act">
                <span onClick={() => toggleAll('rooms', true)}>Todos</span> <span style={{ color: 'var(--muted)' }}>·</span> <span onClick={() => toggleAll('rooms', false)}>Limpar</span>
              </div>
            </label>
            <div className="day-flt" style={{ maxHeight: 85, overflowY: 'auto', paddingRight: 5 }}>
              {rawData.salasDisponiveis.map(r => (
                <label key={r} className={`dcb ${activeRooms.has(r) ? 'on' : ''}`}>
                  <input type="checkbox" checked={activeRooms.has(r)} onChange={() => handleFilterChange(activeRooms, r, setActiveRooms)} />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <label style={{ minWidth: 60, marginTop: 6 }}>
              Períodos:
              <div className="filter-quick-act">
                <span onClick={() => toggleAll('pers', true)}>Todos</span> <span style={{ color: 'var(--muted)' }}>·</span> <span onClick={() => toggleAll('pers', false)}>Limpar</span>
              </div>
            </label>
            <div className="day-flt" style={{ maxHeight: 60, overflowY: 'auto', paddingRight: 5 }}>
              {rawData.periodosDisponiveis.map(p => (
                <label key={p} className={`dcb ${activePers.has(p) ? 'on' : ''}`}>
                  <input type="checkbox" checked={activePers.has(p)} onChange={() => handleFilterChange(activePers, p, setActivePers)} />
                  {p}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="sep" style={{ height: 'auto', alignSelf: 'stretch' }}></div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="exp-btn purple" onClick={() => generateHeatmapPDF(stats, activeDays, activePers.size)}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}><path d="M4 4V2h8v2M4 12v2h8v-2M2 6h12v6H2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            Relatório Visual (PDF)
          </button>
          <button className="exp-btn" onClick={exportCSV}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}><path d="M8 1v9M4 7l4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Exportar Tabela
          </button>

          <div className="ht-leg" style={{ marginTop: 'auto', paddingTop: 8 }}>
            <div className="hls h0"></div>0 <div className="hls h2"></div>Baixo <div className="hls h3"></div>Médio <div className="hls h5"></div>Alto
          </div>
        </div>
      </div>

      <div className="heat-body" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

        {stats.heatmap.length > 0 && (
          <div className="bar-card" style={{ marginBottom: 25, background: '#fff' }}>
            <div className="bar-ttl">Ocupação Consolidada (Filtros Ativos)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginTop: '15px' }}>

              <div style={{
                width: '110px', height: '110px', borderRadius: '50%',
                background: `conic-gradient(#1c2b4a ${stats.percGeral}%, #f0ede8 0)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '80px', height: '80px', background: '#fff', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', fontWeight: 'bold', color: '#1c2b4a'
                }}>
                  {stats.percGeral}%
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text2)' }}>
                  <b>{stats.totalOccupied}</b> aulas alocadas nas configurações selecionadas.
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text2)' }}>
                  <b>{stats.totalPossible - stats.totalOccupied}</b> janelas (slots) livres e ociosas.
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  Base de cálculo: {stats.totalPossible} slots totais.
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 30 }}>
          <table className="heat-tbl">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: 14 }}>Sala</th>
                {[...activeDays].map(d => <th key={d}>{d.substring(0, 3).toUpperCase()}</th>)}
                <th style={{ textAlign: 'right', paddingRight: 20 }}>Ocupação</th>
              </tr>
            </thead>
            <tbody>
              {stats.heatmap.length === 0 ? (
                <tr><td colSpan={10} className="empty-st">Nenhuma sala selecionada nos filtros.</td></tr>
              ) : (
                stats.heatmap.map((row, idx) => (
                  <tr key={row.sala}>
                    <td className="ht-room">{row.sala}</td>
                    {[...activeDays].map(dia => {
                      const val = row.contagemPorDia[dia] || 0;
                      return (
                        <td key={dia}>
                          <div className={`ht-cell ${getHeatClass(val)}`} title={`${row.sala} · ${dia}: ${val} aula(s)`}>
                            {val || '·'}
                          </div>
                        </td>
                      );
                    })}

                    <td style={{ textAlign: 'right', paddingRight: '20px', minWidth: '120px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>{row.percSala}%</span>
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{row.totalSala} aulas</span>
                        </div>
                        <div style={{
                          width: '26px', height: '26px', borderRadius: '50%',
                          background: `conic-gradient(${COLORS[idx % COLORS.length]} ${row.percSala}%, #f0ede8 0)`,
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
                        }}></div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bars">
          <div className="bar-card">
            <div className="bar-ttl">Salas com maior utilização no período</div>
            {[...stats.heatmap]
              .sort((a, b) => b.totalSala - a.totalSala)
              .slice(0, 8)
              .map((s, i) => (
                <div key={s.sala} className="bar-row">
                  <div className="bar-lbl">{s.sala}</div>
                  <div className="bar-trk">
                    <div className="bar-fil" style={{
                      width: `${(s.totalSala / stats.mxCount) * 100}%`,
                      background: COLORS[i % COLORS.length]
                    }}>{s.totalSala}</div>
                  </div>
                </div>
              ))}
          </div>

          <div className="bar-card">
            <div className="bar-ttl">Distribuição diária de aulas</div>
            {stats.usageByDay.map((d, i) => {
              const maxDay = Math.max(1, ...stats.usageByDay.map(x => x.total));
              return (
                <div key={d.dia} className="bar-row">
                  <div className="bar-lbl" style={{ width: 44 }}>{d.dia.substring(0, 3).toUpperCase()}</div>
                  <div className="bar-trk">
                    <div className="bar-fil" style={{
                      width: `${(d.total / maxDay) * 100}%`,
                      background: COLORS[i % COLORS.length]
                    }}>{d.total}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}