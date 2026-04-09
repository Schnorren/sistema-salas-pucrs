import { useState, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// 📍 1. Cache Global (Fica fora do componente para sobreviver quando a tela fecha)
const timelineCache = {};

// 📍 2. Horários oficiais de troca de período da PUCRS
const horariosPUCRS = [
  "08:00", "08:45", "09:45", "10:30", "11:30", "12:15",
  "14:00", "14:45", "15:45", "16:30", "17:30", "18:15",
  "19:15", "20:00", "21:00", "21:45"
];

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
  const { predioAtivo } = usePredio();

  // 📍 3. Função de carregamento inteligente (Aceita modo "silencioso")
  const carregarDados = (modoSilencioso = false) => {
    if (!predioAtivo && !acesso?.predioId) return;

    const predioAtual = predioAtivo || acesso?.predioId || '';
    const cacheKey = `${predioAtual}-${day}`;

    // Se já temos cache, renderiza na tela NA HORA (Evita a tela piscar)
    if (timelineCache[cacheKey]) {
      setData(timelineCache[cacheKey]);
      if (!modoSilencioso) setLoading(false); 
    } else if (!modoSilencioso) {
      setLoading(true); // Só mostra loading se não tem cache e não for silencioso
    }

    const headers = {
      'Authorization': `Bearer ${session?.access_token}`,
      'x-predio-id': predioAtual
    };

    // Faz a requisição no background para garantir que o dado está atualizado
    fetch(`${import.meta.env.VITE_API_URL}/api/grade/timeline?dia=${day}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error("Erro de autorização ou servidor");
        return res.json();
      })
      .then(resData => {
        timelineCache[cacheKey] = resData; // Atualiza o "bolso"
        setData(resData); // Atualiza a tela suavemente
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar timeline:", err);
        if (!timelineCache[cacheKey]) setLoading(false);
      });
  };

  // 📍 4. Dispara sempre que o usuário trocar de dia ou de prédio manualmente
  useEffect(() => {
    carregarDados(false);
  }, [day, session, acesso, predioAtivo]);

  // 📍 5. O "Relógio" que fica rodando no background
  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      // Formata a hora para ficar igual à nossa lista (Ex: "09:45")
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      
      // Se bateu exatamente o minuto de troca de período da PUCRS...
      if (horariosPUCRS.includes(horaStr)) {
        console.log(`⏰ Troca de período identificada (${horaStr}). Atualizando grade silenciosamente...`);
        carregarDados(true); // ...recarrega a grade sem piscar a tela!
      }
    }, 60000); // Roda essa checagem a cada 1 minuto (60.000 ms)

    return () => clearInterval(intervaloRelogio); // Limpa o relógio se o usuário sair da página
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
                  {p.code}<br />{p.label}
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
                  
                  return (
                    <div 
                      key={idx} 
                      className={`tl-cell ${statusClass} ${slot.isAgora ? 'now' : ''}`}
                      title={slot.ocupado ? `${slot.nome} (${slot.horario})` : `Livre (${slot.horario})`}
                      style={{ 
                        flex: 1,
                        padding: '6px 8px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'center',
                        height: 'auto',
                        minHeight: '100%',
                        boxSizing: 'border-box'
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
                            overflow: 'hidden'
                          }}>
                            {aula.nome}
                          </div>
                          {aula.codigo && (
                            <div style={{ 
                              fontSize: '0.65rem', 
                              opacity: 0.7, 
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