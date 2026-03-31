import { useState, useEffect } from 'react';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Opções de períodos para o filtro manual
const PERIOD_OPTIONS = [
  { code: 'A', lb: '08:00' }, { code: 'B', lb: '08:45' }, { code: 'C', lb: '09:45' },
  { code: 'D', lb: '10:30' }, { code: 'E', lb: '11:30' }, { code: 'E1', lb: '12:15' },
  { code: 'F', lb: '14:00' }, { code: 'G', lb: '14:45' }, { code: 'H', lb: '15:45' },
  { code: 'I', lb: '16:30' }, { code: 'J', lb: '17:30' }, { code: 'K', lb: '18:15' },
  { code: 'L', lb: '19:15' }, { code: 'M', lb: '20:00' }, { code: 'N', lb: '21:00' },
  { code: 'P', lb: '21:45' }
];

export default function NextClasses() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [per, setPer] = useState('auto'); // 'auto' ou o código do período (ex: 'K')

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/grade/proximas?dia=${day}&periodo=${per}`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar grade processada:", err);
        setLoading(false);
      });
  }, [day, per]);

  // Função auxiliar para renderizar os cards de aula para não repetir HTML
  const renderCard = (aula, isCurrent) => (
    <div key={aula.id} className={`nx-card ${isCurrent ? 'cur' : 'nxt'}`}>
      <div className="nct">
        <div className="ncr">{aula.sala}</div>
        <div className="ncp">{aula.periodosFormatados}</div>
      </div>
      <div className="ncc">{aula.nome}</div>
      <div className="nct2">
        {isCurrent 
          ? `Término às ${aula.horarioFim}` 
          : `Início às ${aula.horarioInicio} (${aula.quantidadePeriodos} períodos)`
        }
      </div>
      <div className={`ncb ${aula.tipo === 'Interno' ? 'int' : 'reg'}`}>
        {aula.tipo}
      </div>
    </div>
  );

  return (
    <div className="view active" id="vNext" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* TOOLBAR */}
      <div className="toolbar">
        <label>Dia:</label>
        <select value={day} onChange={e => setDay(e.target.value)}>
          {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        
        <label style={{ marginLeft: '8px' }}>Período ref.:</label>
        <select value={per} onChange={e => setPer(e.target.value)}>
          <option value="auto">
            ⟳ Automático {data?.periodoAtualReferencia ? `— Período ${data.periodoAtualReferencia}` : '— Fora de horário'}
          </option>
          {PERIOD_OPTIONS.map(p => (
            <option key={p.code} value={p.code}>{p.code} · {p.lb}</option>
          ))}
        </select>
      </div>
      
      {/* CONTEÚDO */}
      <div className="nx-body" id="nxBody">
        {loading ? (
           <div className="empty-st">Carregando dados do servidor...</div>
        ) : !data ? (
           <div className="empty-st">Erro ao carregar os dados.</div>
        ) : data.periodoAtualReferencia ? (
          <>
            {/* SEÇÃO 1: Em Andamento */}
            <div>
              <div className="nx-hd">Em andamento — <em>Período {data.periodoAtualReferencia}</em> ({data.labelPeriodoAtual})</div>
              {data.emAndamento.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '10px 0' }}>Nenhuma aula neste período.</div>
              ) : (
                <div className="nx-cards">
                  {data.emAndamento.map(aula => renderCard(aula, true))}
                </div>
              )}
            </div>

            {/* SEÇÃO 2: Próximas Aulas */}
            {data.proximas.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div className="nx-hd">A seguir — <em>Iniciando no próximo período</em></div>
                <div className="nx-cards">
                  {data.proximas.map(aula => renderCard(aula, false))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* SEÇÃO 3: Fora de Horário (ou todas as aulas do dia) */
          <div>
            <div className="nx-hd">Todas as aulas — {day}</div>
            {data.todasAsAulas.length === 0 ? (
              <div className="empty-st">Nenhuma aula encontrada para este dia.</div>
            ) : (
              <div className="nx-cards">
                {data.todasAsAulas.map(aula => renderCard(aula, false))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}