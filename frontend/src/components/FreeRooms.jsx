import { useState, useEffect } from 'react';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export default function FreeRooms() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/grade/livres?dia=${day}`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar salas livres:", err);
        setLoading(false);
      });
  }, [day]);

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