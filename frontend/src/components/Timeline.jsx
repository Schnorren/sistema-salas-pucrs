import { useState, useEffect } from 'react';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export default function Timeline() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');

    useEffect(() => {
        setLoading(true);
        fetch(`${import.meta.env.VITE_API_URL}/api/grade/timeline?dia=${day}`)
            .then(res => res.json())
            .then(resData => {
                setData(resData);
                setLoading(false);
            })
            .catch(err => {
                console.error("Erro ao carregar timeline:", err);
                setLoading(false);
            });
    }, [day]);

    if (loading) return <div className="empty-st">Gerando matriz de horários...</div>;

    return (
    <div className="view active" id="vTl" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div className="toolbar">
        <label>Dia:</label>
        <select value={day} onChange={e => setDay(e.target.value)}>
          {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="sep"></div>
        <div className="tl-leg">
          <span><span className="tl-ldot" style={{ background: 'var(--blue-b)', border: '1px solid rgba(26,78,150,.15)' }}></span>Regular</span>
          <span><span className="tl-ldot" style={{ background: 'var(--purple-b)', border: '1px solid rgba(78,51,138,.15)' }}></span>Interno</span>
          <span style={{ color: 'var(--accent)', fontWeight: 500, fontFamily: 'var(--mono)' }}>| = período atual</span>
        </div>
      </div>

      <div className="tl-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <div id="tlInner">
          
          <div className="tl-hdr">
            <div className="tl-rl">Sala</div>
            <div className="tl-pers">
              {data.periodosCabecalho.map(p => (
                <div key={p.code} className={`tl-phd ${p.isAgora ? 'now' : ''}`}>
                  {p.code}<br />{p.label}
                </div>
              ))}
            </div>
          </div>

          
          {data.timeline.map(linha => (
            <div key={linha.sala} className="tl-row">
              <div className={`tl-rn ${linha.temAulaAgora ? 'on' : ''}`}>{linha.sala}</div>
              <div className="tl-cells">
                {linha.slots.map((slot, idx) => {
                  const statusClass = !slot.ocupado ? 'empty' : (slot.tipo === 'Interno' ? 'int' : 'reg');
                  return (
                    <div 
                      key={idx} 
                      className={`tl-cell ${statusClass} ${slot.isAgora ? 'now' : ''}`}
                      title={slot.ocupado ? `${slot.nome} (${slot.horario})` : `Livre (${slot.horario})`}
                    >
                      {slot.ocupado ? (slot.nome.length > 10 ? slot.nome.substring(0, 10) + '...' : slot.nome) : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div >
  );
}