import { useState, useMemo } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, extractPeriodCode } from '../../backend_core/utils/timeHelpers';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Mapeamento de horários de fim de aula para preencher os cards
const PERIOD_END_TIMES = {
  'A': '08:45', 'B': '09:30', 'C': '10:30', 'D': '11:15', 'E': '12:15', 'E1': '13:00',
  'F': '14:45', 'G': '15:30', 'H': '16:30', 'I': '17:15', 'J': '18:15', 'K': '19:00',
  'L': '20:00', 'M': '20:45', 'N': '21:45', 'P': '22:30'
};

export default function FreeRooms({ session, acesso }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';

  // 🔥 Hook consumindo o Super Index via CDN!
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');

  // ==========================================
  // 🔥 PROCESSAMENTO: BACKEND -> FRONTEND
  // ==========================================
  const dataProcessed = useMemo(() => {
    if (!rawGradeData || !rawGradeData.salas || !rawGradeData.grade) return [];

    const aulasDoDia = rawGradeData.grade.filter(d => 
      d.dia_semana?.toLowerCase().includes(day.toLowerCase())
    );

    const salasLivres = rawGradeData.salas.map(salaRef => {
      // Encontra todas as aulas desta sala neste dia
      const aulasDaSala = aulasDoDia.filter(d => {
        const numSala = d.salas?.numero || d.sala;
        return numSala === salaRef.numero;
      });

      // Filtra os períodos deixando apenas os que NÃO tem aula
      const freePeriods = PERIODS.filter(p => {
        const isOccupied = aulasDaSala.some(aula => {
            const codes = extractPeriodCode(aula.periodo);
            return codes && codes.includes(p.code);
        });
        return !isOccupied; // Retorna true se estiver livre
      });

      return {
        sala: salaRef.numero,
        quantidadeLivres: freePeriods.length,
        periodos: freePeriods.map(f => ({
          code: f.code,
          label: f.lb,
          fim: PERIOD_END_TIMES[f.code] || ''
        }))
      };
    });

    // Retorna apenas salas que tenham pelo menos 1 período livre, ordenadas
    return salasLivres
      .filter(s => s.quantidadeLivres > 0)
      .sort((a, b) => a.sala.localeCompare(b.sala, undefined, { numeric: true }));

  }, [rawGradeData, day]);

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (error) return <div className="empty-st" style={{color: 'var(--red)'}}>⚠️ Erro: {error}</div>;

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
          <div className="empty-st">Baixando matriz de disponibilidade da CDN...</div>
        ) : dataProcessed.length === 0 ? (
          <div className="empty-st">Nenhuma sala livre encontrada para este dia. (Prédio 100% ocupado!)</div>
        ) : (
          dataProcessed.map(sala => (
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