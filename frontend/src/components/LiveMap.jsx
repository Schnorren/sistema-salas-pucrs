import { useState, useEffect } from 'react';

const PERIODS = [
  {code:'A', lb:'08:00',start:[8,0],  end:[8,45]},
  {code:'B', lb:'08:45',start:[8,45], end:[9,30]},
  {code:'C', lb:'09:45',start:[9,45], end:[10,30]},
  {code:'D', lb:'10:30',start:[10,30],end:[11,15]},
  {code:'E', lb:'11:30',start:[11,30],end:[12,15]},
  {code:'E1',lb:'12:15',start:[12,15],end:[13,0]},
  {code:'F', lb:'14:00',start:[14,0], end:[14,45]},
  {code:'G', lb:'14:45',start:[14,45],end:[15,30]},
  {code:'H', lb:'15:45',start:[15,45],end:[16,30]},
  {code:'I', lb:'16:30',start:[16,30],end:[17,15]},
  {code:'J', lb:'17:30',start:[17,30],end:[18,15]},
  {code:'K', lb:'18:15',start:[18,15],end:[19,0]},
  {code:'L', lb:'19:15',start:[19,15],end:[20,0]},
  {code:'M', lb:'20:00',start:[20,0], end:[20,45]},
  {code:'N', lb:'21:00',start:[21,0], end:[21,45]},
  {code:'P', lb:'21:45',start:[21,45],end:[22,30]},
];

const DAYS_PT  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const ALL_DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const FLOORS   = [
  {lb:'1º Andar', t: r => r[0]==='1'},
  {lb:'2º Andar', t: r => r[0]==='2'},
  {lb:'3º Andar', t: r => r[0]==='3'}
];

export default function LiveMap() {
  const [data, setData] = useState([]);
  const [rooms, setRooms] = useState([]);
  
  // Filtros
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [per, setPer] = useState('auto');
  const [autoPer, setAutoPer] = useState(null);

  // Tooltip
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, sala: '', dia: '', per: '', nm: '' });

  // Busca inicial dos dados do PostgreSQL
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/grade`)
      .then(res => res.json())
      .then(resData => {
        // Padroniza os dados da API para bater com a lógica original
        const mappedData = resData.map(d => ({
          Sala: d.salas?.numero || '?',
          Dia: d.dia_semana,
          Periodo: d.periodo,
          Nome_da_Aula: d.nome_aula || (d.disciplinas ? d.disciplinas.nome : '')
        }));
        
        // Extrai salas únicas em ordem
        const uniqueRooms = [...new Set(mappedData.map(d => d.Sala))]
          .filter(r => r !== '?')
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          
        setData(mappedData);
        setRooms(uniqueRooms);
      })
      .catch(err => console.error("Erro ao carregar grade:", err));
  }, []);

  // Relógio do período automático (Idêntico ao clockTick original)
  useEffect(() => {
    const getClockPer = () => {
      const now = new Date();
      const m = now.getHours() * 60 + now.getMinutes();
      for (const p of PERIODS) {
        const s = p.start[0] * 60 + p.start[1];
        const e = p.end[0] * 60 + p.end[1];
        if (m >= s && m < e) return p.code;
      }
      return null;
    };

    setAutoPer(getClockPer());
    const timer = setInterval(() => setAutoPer(getClockPer()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Lógica de ocupação
  const activePer = per === 'auto' ? autoPer : per;
  const busySet = new Set(
    activePer 
      ? data.filter(d => d.Dia === day && d.Periodo.split(' ')[0] === activePer).map(d => d.Sala)
      : []
  );

  const cFree = activePer && rooms.length ? rooms.length - busySet.size : '—';
  const cBusy = activePer ? busySet.size : '—';

  // Lógica do Tooltip flutuante
  const handleMouseMove = (e) => {
    if (!tooltip.visible) return;
    setTooltip(prev => ({ 
      ...prev, 
      x: e.clientX + 14, 
      y: e.clientY - 8 
    }));
  };

  const handleMouseEnter = (e, sala, currDay, currPer, nm) => {
    setTooltip({
      visible: true,
      x: e.clientX + 14,
      y: e.clientY - 8,
      sala,
      dia: currDay,
      per: currPer || '—',
      nm
    });
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  // Prepara opções do select de períodos
  const codes = [...new Set(data.map(d => d.Periodo.split(' ')[0]))];
  const availablePeriods = PERIODS.filter(p => codes.includes(p.code));

  return (
    <div className="view active" id="vMap" style={{ display: 'flex' }} onMouseMove={handleMouseMove}>
      
      {/* BARRA LATERAL (Filtros e Contagem) */}
      <div className="map-side">
        <div>
          <div className="ms-hd">Filtros</div>
          <div className="ms-f">
            <div className="ms-lbl">Dia</div>
            <select className="ms-sel" value={day} onChange={e => setDay(e.target.value)}>
              {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="ms-f" style={{ marginTop: '9px' }}>
            <div className="ms-lbl">Período</div>
            <select className="ms-sel" value={per} onChange={e => setPer(e.target.value)}>
              <option value="auto">
                ⟳ Automático {autoPer ? `— Período ${autoPer}` : '— Fora de horário'}
              </option>
              {availablePeriods.map(p => (
                <option key={p.code} value={p.code}>{p.code} · {p.lb}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div>
          <div className="ms-hd">Legenda</div>
          <div className="leg-row"><div className="leg-dot" style={{ background: 'var(--green)' }}></div>Sala livre</div>
          <div className="leg-row"><div className="leg-dot" style={{ background: 'var(--amber)' }}></div>Sala ocupada</div>
        </div>
        
        <div>
          <div className="ms-hd">Contagem</div>
          <div className="cnt-box g"><div className="cnt-val">{cFree}</div><div className="cnt-lbl">Livres</div></div>
          <div className="cnt-box a"><div className="cnt-val">{cBusy}</div><div className="cnt-lbl">Ocupadas</div></div>
        </div>
      </div>
      
      {/* ÁREA PRINCIPAL DA PLANTA */}
      <div className="map-main">
        {rooms.length === 0 ? (
           <div className="empty-st">Nenhuma sala encontrada no banco de dados.</div>
        ) : (
          FLOORS.map((fl, idx) => {
            const flRooms = rooms.filter(fl.t);
            if (!flRooms.length) return null;
            
            return (
              <div key={idx} className="fl-sec">
                <div className="fl-lbl">{fl.lb}</div>
                <div className="room-grid">
                  {flRooms.map(r => {
                    const isBusy = busySet.has(r);
                    const entries = activePer ? data.filter(d => d.Sala === r && d.Dia === day && d.Periodo.split(' ')[0] === activePer) : [];
                    const nm = entries.length ? entries[0].Nome_da_Aula : '';
                    const shortNm = nm.length > 42 ? nm.substring(0, 42) + '…' : nm;

                    return (
                      <div 
                        key={r}
                        className={`room-tile ${isBusy ? 'busy' : 'free'}`}
                        onMouseEnter={(e) => handleMouseEnter(e, r, day, activePer, nm)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <div className="rt-n">{r}</div>
                        <div className="rt-s">{isBusy ? 'Ocupada' : 'Livre'}</div>
                        <div className="rt-c">{isBusy ? shortNm : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* TOOLTIP DINÂMICO */}
      {tooltip.visible && (
        <div className="tt" style={{ display: 'block', left: tooltip.x, top: tooltip.y }}>
          <div className="tt-room">Sala {tooltip.sala}</div>
          <div className="tt-row"><b>{tooltip.dia}</b> · Período <b>{tooltip.per}</b></div>
          <div className="tt-row">
            {tooltip.nm ? tooltip.nm : <span style={{ color: 'var(--green)' }}>Livre</span>}
          </div>
        </div>
      )}
      
    </div>
  );
}