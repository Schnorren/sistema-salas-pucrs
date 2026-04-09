import { useState, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PERIOD_OPTIONS = ['A','B','C','D','E','E1','F','G','H','I','J','K','L','M','N','P'];

const liveMapCache = {};

const horariosPUCRS = [
  "08:00", "08:45", "09:45", "10:30", "11:30", "12:15",
  "14:00", "14:45", "15:45", "16:30", "17:30", "18:15",
  "19:15", "20:00", "21:00", "21:45"
];

export default function LiveMap({ session, acesso }) {
  const [data, setData] = useState(null);
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [per, setPer] = useState('auto');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { predioAtivo } = usePredio();
  
  const [tt, setTt] = useState({ visible: false, x: 0, y: 0, sala: '', info: '' });

  const carregarDados = (modoSilencioso = false) => {
    if (!predioAtivo && !acesso?.predioId) return;

    const predioAtual = predioAtivo || acesso?.predioId || '';
    const cacheKey = `${predioAtual}-${day}-${per}`;

    if (liveMapCache[cacheKey]) {
      setData(liveMapCache[cacheKey]);
      if (!modoSilencioso) setLoading(false);
      setError(null);
    } else if (!modoSilencioso) {
      setLoading(true);
      setError(null);
    }

    const headers = {
        'Authorization': `Bearer ${session?.access_token}`,
        'x-predio-id': predioAtual
    };

    fetch(`${import.meta.env.VITE_API_URL}/api/grade/planta?dia=${day}&periodo=${per}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`Falha na API: ${res.status}`);
        return res.json();
      })
      .then(resData => {
        liveMapCache[cacheKey] = resData;
        setData(resData);
        setLoading(false);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        if (!liveMapCache[cacheKey] || !modoSilencioso) {
          setError(err.message === 'Failed to fetch' ? 'Servidor indisponível (Backend desligado)' : err.message);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    carregarDados(false);
  }, [day, per, session, acesso, predioAtivo]);

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      
      if (horariosPUCRS.includes(horaStr)) {
        carregarDados(true);
      }
    }, 60000);

    return () => clearInterval(intervaloRelogio);
  }, [day, per, session, acesso, predioAtivo]);

  const handleMouseEnter = (e, sala) => {
    setTt({
      visible: true,
      x: e.clientX + 15,
      y: e.clientY - 10,
      sala: sala.numero,
      info: sala.ocupada ? sala.disciplina : 'Sala Livre'
    });
  };

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