import { useState, useEffect } from 'react';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PERIOD_OPTIONS = ['A','B','C','D','E','E1','F','G','H','I','J','K','L','M','N','P'];

export default function LiveMap() {
  const [data, setData] = useState(null);
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [per, setPer] = useState('auto');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Novo estado de erro
  
  const [tt, setTt] = useState({ visible: false, x: 0, y: 0, sala: '', info: '' });

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    
    fetch(`${import.meta.env.VITE_API_URL}/api/grade/planta?dia=${day}&periodo=${per}`)
      .then(res => {
        if (!res.ok) throw new Error(`Falha na API: ${res.status}`);
        return res.json();
      })
      .then(d => {
        if (isMounted) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Erro na Planta:", err);
        if (isMounted) {
          setError(err.message === 'Failed to fetch' ? 'Servidor indisponível (Backend desligado)' : err.message);
          setLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [day, per]);

  const handleMouseEnter = (e, sala) => {
    setTt({
      visible: true,
      x: e.clientX + 15,
      y: e.clientY - 10,
      sala: sala.numero,
      info: sala.ocupada ? sala.disciplina : 'Sala Livre'
    });
  };

  // Tratamentos de Estados (Evita o Silent Crash do React)
  if (loading) return <div className="empty-st">Buscando dados da planta...</div>;
  if (error) return <div className="empty-st" style={{color: 'var(--red)'}}>⚠️ Erro de Conexão: {error}</div>;
  if (!data || !data.andares) return <div className="empty-st">Nenhum dado retornado para este dia.</div>;

  return (
    <div className="view active" id="vMap" style={{ display: 'flex', height: '100%' }}>
      
      <div className="map-side">
        <div className="ms-hd">Filtros</div>
        <div className="ms-f">
          <div className="ms-lbl">Dia</div>
          <select className="ms-sel" value={day} onChange={e => setDay(e.target.value)}>
            {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="ms-f" style={{ marginTop: 10 }}>
          <div className="ms-lbl">Período</div>
          <select className="ms-sel" value={per} onChange={e => setPer(e.target.value)}>
            <option value="auto">⟳ Automático ({data?.periodoAtual || '--'})</option>
            {PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="ms-hd" style={{ marginTop: 20 }}>Contagem</div>
        <div className="cnt-box g">
          <div className="cnt-val">{data?.contagem?.livres || 0}</div>
          <div className="cnt-lbl">Livres</div>
        </div>
        <div className="cnt-box a">
          <div className="cnt-val">{data?.contagem?.ocupadas || 0}</div>
          <div className="cnt-lbl">Ocupadas</div>
        </div>
      </div>

      <div className="map-main" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {data.andares.map(andar => (
          <div key={andar.label} className="fl-sec">
            <div className="fl-lbl">{andar.label}</div>
            <div className="room-grid">
              {andar.salas.map(sala => (
                <div 
                  key={sala.numero}
                  className={`room-tile ${sala.ocupada ? 'busy' : 'free'}`}
                  onMouseEnter={(e) => handleMouseEnter(e, sala)}
                  onMouseLeave={() => setTt({ ...tt, visible: false })}
                >
                  <div className="rt-n">{sala.numero}</div>
                  <div className="rt-s">{sala.ocupada ? 'Ocupada' : 'Livre'}</div>
                  <div className="rt-c">{sala.ocupada ? (sala.disciplina.substring(0, 40) + '...') : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {tt.visible && (
        <div className="tt" style={{ display: 'block', left: tt.x, top: tt.y }}>
          <div className="tt-room">Sala {tt.sala}</div>
          <div className="tt-row"><b>{day}</b> · Período <b>{per === 'auto' ? data.periodoAtual : per}</b></div>
          <div className="tt-row">{tt.info}</div>
        </div>
      )}
    </div>
  );
}