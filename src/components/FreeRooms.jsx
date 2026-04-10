import { useState, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const freeRoomsCache = {};

const horariosPUCRS = [
  "08:00", "08:45", "09:45", "10:30", "11:30", "12:15",
  "14:00", "14:45", "15:45", "16:30", "17:30", "18:15",
  "19:15", "20:00", "21:00", "21:45"
];

export default function FreeRooms({ session, acesso }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const { predioAtivo } = usePredio();

  const carregarDados = (modoSilencioso = false) => {
    if (!predioAtivo && !acesso?.predioId) return;

    const predioAtual = predioAtivo || acesso?.predioId || '';
    const cacheKey = `${predioAtual}-${day}`;

    if (freeRoomsCache[cacheKey]) {
      setData(freeRoomsCache[cacheKey]);
      if (!modoSilencioso) setLoading(false);
    } else if (!modoSilencioso) {
      setLoading(true);
    }

    const headers = {
      'Authorization': `Bearer ${session?.access_token}`,
      'x-predio-id': predioAtual
    };

    fetch(`${import.meta.env.VITE_API_URL}/api/grade/livres?dia=${day}`, { headers })
      .then(res => {
          if (!res.ok) throw new Error('Falha de autenticação ou rede');
          return res.json();
      })
      .then(resData => {
        freeRoomsCache[cacheKey] = resData;
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        if (!freeRoomsCache[cacheKey]) setLoading(false);
      });
  };

  useEffect(() => {
    carregarDados(false);
  }, [day, session, acesso, predioAtivo]);

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      
      if (horariosPUCRS.includes(horaStr)) {
        carregarDados(true);
      }
    }, 60000);

    return () => clearInterval(intervaloRelogio);
  }, [day, session, acesso, predioAtivo]);

  return (
    <div className="view active" id="vFree" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      
      <div className="toolbar">
        <label>Dia:</label>
        <select value={day} onChange={e => setDay(e.target.value)}>
          {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="free-body" id="freeBody" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {loading ? (
          <div className="empty-st">Analisando disponibilidade de salas...</div>
        ) : data.length === 0 ? (
          <div className="empty-st">Nenhuma sala livre encontrada para este dia. (Prédio 100% ocupado!)</div>
        ) : (
          data.map(sala => (
            <div key={sala.sala} className="free-card">
              <div className="free-summary">
                <div className="free-room-title">Sala {sala.sala}</div>
                <div className="free-badge">{sala.quantidadeLivres} períodos livres</div>
              </div>
              <div className="free-content">
                {sala.periodos.map(p => (
                  <div key={p.code} className="free-slot">
                    <div className="free-slot-code">{p.code}</div>
                    <div>{p.label} até {p.fim}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

      </div>
    </div>
  );
}