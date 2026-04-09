import { useState, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const timelineCache = {};

const horariosPUCRS = [
  "08:00", "08:45", "09:45", "10:30", "11:30", "12:15",
  "14:00", "14:45", "15:45", "16:30", "17:30", "18:15",
  "19:15", "20:00", "21:00", "21:45"
];

const PERIOD_END_TIMES = {
  'A': '08:45', 'B': '09:30', 'C': '10:30', 'D': '11:15', 'E': '12:15', 'E1': '13:00',
  'F': '14:45', 'G': '15:30', 'H': '16:30', 'I': '17:15', 'J': '18:15', 'K': '19:00',
  'L': '20:00', 'M': '20:45', 'N': '21:45', 'P': '22:30'
};

const formatarAula = (nomeBruto) => {
  if (!nomeBruto) return { codigo: '', nome: '' };
  const partes = nomeBruto.split(' - ');
  if (partes.length > 1) {
    return { codigo: partes[0], nome: partes.slice(1).join(' - ') };
  }
  return { codigo: '', nome: nomeBruto };
};

export default function Timeline({ session, acesso }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [hoveredAulaId, setHoveredAulaId] = useState(null);
  const { predioAtivo } = usePredio();

  const carregarDados = (modoSilencioso = false) => {
    if (!predioAtivo && !acesso?.predioId) return;
    const predioAtual = predioAtivo || acesso?.predioId || '';
    const cacheKey = `${predioAtual}-${day}`;

    if (timelineCache[cacheKey]) {
      setData(timelineCache[cacheKey]);
      if (!modoSilencioso) setLoading(false); 
    } else if (!modoSilencioso) {
      setLoading(true);
    }

    const headers = {
      'Authorization': `Bearer ${session?.access_token}`,
      'x-predio-id': predioAtual
    };

    fetch(`${import.meta.env.VITE_API_URL}/api/grade/timeline?dia=${day}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error("Erro de autorização ou servidor");
        return res.json();
      })
      .then(resData => {
        timelineCache[cacheKey] = resData;
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar timeline:", err);
        if (!timelineCache[cacheKey]) setLoading(false);
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

  if (loading) return <div className="empty-st">Gerando matriz de horários...</div>;
  if (!data) return <div className="empty-st" style={{color: 'var(--red)'}}>Falha ao carregar a matriz.</div>;

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
                  {p.code}<br />
                  <span style={{ fontSize: '0.65rem', fontWeight: 'normal', opacity: 0.8 }}>
                    {p.label} - {PERIOD_END_TIMES[p.code] || ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {data.timeline.map(linha => (
            <div key={linha.sala} className="tl-row" style={{ display: 'flex', minHeight: '65px', alignItems: 'stretch' }}> 
              <div className={`tl-rn ${linha.temAulaAgora ? 'on' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
                {linha.sala}
              </div>
              <div className="tl-cells" style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
                {linha.slots.map((slot, idx) => {
                  const statusClass = !slot.ocupado ? 'empty' : (slot.tipo === 'Interno' ? 'int' : 'reg');
                  const aula = formatarAula(slot.nome);
                  
                  // Chave única para identificar a aula na mesma sala (Nome + ID + Sala)
                  const aulaUniqueKey = slot.ocupado ? `${slot.disciplinaId}-${slot.nome}-${linha.sala}` : null;
                  const isHovered = hoveredAulaId && hoveredAulaId === aulaUniqueKey;

                  const getTooltip = () => {
                    if (!slot.ocupado) return `Livre (${slot.horario})`;
                    const matches = linha.slots.filter(s => s.nome === slot.nome && s.disciplinaId === slot.disciplinaId);
                    if (matches.length > 0) {
                      const first = matches[0];
                      const last = matches[matches.length - 1];
                      const periodosLetras = matches.map(m => m.periodo || m.code).join('');
                      const fimReal = PERIOD_END_TIMES[last.periodo || last.code] || last.horario;
                      return `${slot.nome}\nPeríodos: ${periodosLetras}\nHorário: ${first.horario} às ${fimReal}`;
                    }
                    return `${slot.nome} (${slot.horario})`;
                  };

                  return (
                    <div 
                      key={idx} 
                      className={`tl-cell ${statusClass} ${slot.isAgora ? 'now' : ''}`}
                      title={getTooltip()}
                      onMouseEnter={() => slot.ocupado && setHoveredAulaId(aulaUniqueKey)}
                      onMouseLeave={() => setHoveredAulaId(null)}
                      style={{ 
                        flex: 1,
                        padding: '6px 8px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'center',
                        height: 'auto',
                        minHeight: '100%',
                        boxSizing: 'border-box',
                        cursor: slot.ocupado ? 'pointer' : 'default',
                        transition: 'all 0.2s ease',
                        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.15)' : undefined,
                        outline: isHovered ? '2px solid var(--accent, #ffd700)' : 'none',
                        outlineOffset: '-2px',
                        zIndex: isHovered ? 10 : 1,
                        boxShadow: isHovered ? '0 0 10px rgba(0,0,0,0.5)' : 'none'
                      }}
                    >
                      {slot.ocupado && (
                        <>
                          <div style={{ 
                            fontSize: '0.75rem', 
                            lineHeight: 1.3, 
                            fontWeight: 600, 
                            whiteSpace: 'normal', 
                            wordBreak: 'break-word', 
                            display: '-webkit-box',
                            WebkitLineClamp: 3, 
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            color: isHovered ? '#fff' : undefined
                          }}>
                            {aula.nome}
                          </div>
                          {aula.codigo && (
                            <div style={{ 
                              fontSize: '0.65rem', 
                              opacity: isHovered ? 1 : 0.7, 
                              marginTop: '2px', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {aula.codigo}
                            </div>
                          )}
                        </>
                      )}
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