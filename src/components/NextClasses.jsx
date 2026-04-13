import { useState, useEffect, useMemo } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, getCurrentPeriod, groupConsecutiveClasses } from '../../backend_core/utils/timeHelpers';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const PERIOD_OPTIONS = [
  { code: 'A', lb: '08:00' }, { code: 'B', lb: '08:45' }, { code: 'C', lb: '09:45' },
  { code: 'D', lb: '10:30' }, { code: 'E', lb: '11:30' }, { code: 'E1', lb: '12:15' },
  { code: 'F', lb: '14:00' }, { code: 'G', lb: '14:45' }, { code: 'H', lb: '15:45' },
  { code: 'I', lb: '16:30' }, { code: 'J', line: '17:30' }, { code: 'K', lb: '18:15' },
  { code: 'L', lb: '19:15' }, { code: 'M', lb: '20:00' }, { code: 'N', lb: '21:00' },
  { code: 'P', lb: '21:45' }
];

const horariosPUCRS = [
  "08:00", "08:45", "09:45", "10:30", "11:30", "12:15",
  "14:00", "14:45", "15:45", "16:30", "17:30", "18:15",
  "19:15", "20:00", "21:00", "21:45"
];

const normalizeText = (text) => {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

export default function NextClasses({ session, acesso }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [per, setPer] = useState('auto');
  
  const [filtro, setFiltro] = useState('');
  const [ordem, setOrdem] = useState('sala');
  const [mostrarMaisTarde, setMostrarMaisTarde] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      
      if (horariosPUCRS.includes(horaStr)) {
        setTick(t => t + 1); // Força recálculo
      }
    }, 60000);

    return () => clearInterval(intervaloRelogio);
  }, []);
  const dataProcessed = useMemo(() => {
    if (!rawGradeData || !rawGradeData.grade) return null;

    const gradeBruta = rawGradeData.grade;
    const activePer = per === 'auto' ? getCurrentPeriod() : per;
    const aulasDoDia = gradeBruta.filter(d => d.dia_semana?.toLowerCase().includes(day.toLowerCase()));

    const response = {
      periodoAtualReferencia: activePer, 
      labelPeriodoAtual: '',
      emAndamento: [], proximas: [], restoDoDia: [], todasAsAulas: []
    };

    if (activePer) {
      const pi = PERIODS.findIndex(p => p.code === activePer);
      if (pi >= 0) {
        response.labelPeriodoAtual = PERIODS[pi].lb;
        const todasAgrupadas = groupConsecutiveClasses(aulasDoDia);
        
        response.emAndamento = todasAgrupadas.filter(g => g.periodosFormatados.includes(activePer));
        
        const nextPeriodCodes = PERIODS.slice(pi + 1, pi + 3).map(p => p.code);
        response.proximas = todasAgrupadas.filter(g => nextPeriodCodes.includes(g.periodosFormatados[0]));
        
        const futurePeriodCodes = PERIODS.slice(pi + 3).map(p => p.code);
        response.restoDoDia = todasAgrupadas.filter(g => futurePeriodCodes.includes(g.periodosFormatados[0]));
      }
    } else {
      response.todasAsAulas = groupConsecutiveClasses(aulasDoDia);
    }
    
    return response;
  }, [rawGradeData, day, per, tick]);
  const filteredAndSortedData = useMemo(() => {
    if (!dataProcessed) return { emAndamento: [], proximas: [], restoDoDia: [], todasAsAulas: [] };

    const termo = normalizeText(filtro);
    
    const applyFilterAndSort = (aulasArray) => {
      if (!aulasArray) return [];
      
      let resultado = aulasArray;
      if (termo) {
        resultado = aulasArray.filter(aula => {
          return normalizeText(aula.nome).includes(termo) || 
                 normalizeText(aula.sala).includes(termo);
        });
      }

      return [...resultado].sort((a, b) => {
        if (ordem === 'sala') {
          return a.sala.localeCompare(b.sala, undefined, { numeric: true });
        }
        if (ordem === 'nome') {
          return a.nome.localeCompare(b.nome);
        }
        if (ordem === 'horario') {
          return a.horarioInicio.localeCompare(b.horarioInicio);
        }
        return 0;
      });
    };

    return {
      emAndamento: applyFilterAndSort(dataProcessed.emAndamento),
      proximas: applyFilterAndSort(dataProcessed.proximas),
      restoDoDia: applyFilterAndSort(dataProcessed.restoDoDia),
      todasAsAulas: applyFilterAndSort(dataProcessed.todasAsAulas)
    };
  }, [dataProcessed, filtro, ordem]);
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

  const renderCompactRow = (aula) => (
    <div key={aula.id} style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '12px 16px', borderBottom: '1px solid var(--border, #334155)', 
        background: 'var(--surface, #1e293b)', borderRadius: '6px', marginBottom: '8px' 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontWeight: 'bold', color: '#60a5fa', width: '45px' }}>{aula.horarioInicio}</div>
        <div style={{ fontWeight: 'bold', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px' }}>{aula.sala}</div>
        <div style={{ color: 'var(--text, #f8fafc)', fontSize: '14px', fontWeight: '500' }}>{aula.nome} <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '12px', fontWeight: 'normal' }}>({aula.periodosFormatados})</span></div>
      </div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: aula.tipo === 'Interno' ? '#f59e0b' : '#9ca3af', border: `1px solid ${aula.tipo === 'Interno' ? '#f59e0b' : '#475569'}`, padding: '2px 6px', borderRadius: '4px' }}>
        {aula.tipo}
      </div>
    </div>
  );

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (loading) return <div className="empty-st">Carregando lista de aulas da CDN...</div>;
  if (error) return <div className="empty-st" style={{color: 'var(--red)'}}>⚠️ Erro: {error}</div>;
  if (!dataProcessed) return <div className="empty-st">Erro ao processar os dados da matriz.</div>;

  return (
    <div className="view active" id="vNext" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      
      <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--border, #334155)', paddingBottom: '16px', marginBottom: '16px' }}>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>Dia:</label>
                <select value={day} onChange={e => setDay(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>Período ref.:</label>
                <select value={per} onChange={e => setPer(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <option value="auto">
                    ⟳ Automático {dataProcessed.periodoAtualReferencia ? `— Per. ${dataProcessed.periodoAtualReferencia}` : '— Fora de horário'}
                </option>
                {PERIOD_OPTIONS.map(p => (
                    <option key={p.code} value={p.code}>{p.code} · {p.lb}</option>
                ))}
                </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>⇅</span>
                <select 
                  value={ordem} 
                  onChange={e => setOrdem(e.target.value)} 
                  style={{ 
                    padding: '4px 8px', borderRadius: '4px', background: 'transparent', 
                    color: 'var(--text-secondary)', border: '1px solid transparent', 
                    fontSize: '13px', cursor: 'pointer', outline: 'none', appearance: 'none' 
                  }}
                  onMouseOver={e => e.currentTarget.style.border = '1px solid var(--border)'}
                  onMouseOut={e => e.currentTarget.style.border = '1px solid transparent'}
                  title="Ordenar resultados"
                >
                    <option value="sala">Ordenar por Sala</option>
                    <option value="horario">Ordenar por Horário</option>
                    <option value="nome">Ordenar por Nome</option>
                </select>
            </div>
        </div>

        <div style={{ position: 'relative', width: '100%' }}>
            <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: '#3b82f6' }}>🔍</span>
            <input 
                type="text" 
                placeholder="Qual sala o professor está procurando? Digite o nome da disciplina..." 
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                style={{
                    width: '100%', padding: '14px 44px', borderRadius: '8px',
                    border: '2px solid #3b82f6', background: 'rgba(59, 130, 246, 0.05)', 
                    color: 'var(--text, #f8fafc)', fontSize: '15px', fontWeight: '500',
                    outline: 'none', boxSizing: 'border-box', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
            />
            {filtro && (
                <button 
                    onClick={() => setFiltro('')}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: '#3b82f6', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px' }}
                >
                    LIMPAR
                </button>
            )}
        </div>
      </div>
      
      <div className="nx-body" id="nxBody" style={{ paddingBottom: '40px' }}>
        {dataProcessed.periodoAtualReferencia ? (
          <>
            <div>
              <div className="nx-hd">🔴 Em andamento — <em>Período {dataProcessed.periodoAtualReferencia}</em> ({dataProcessed.labelPeriodoAtual})</div>
              {filteredAndSortedData.emAndamento.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border)', textAlign: 'center' }}>
                    Nenhuma aula encontrada {filtro && `para a busca "${filtro}"`}.
                </div>
              ) : (
                <div className="nx-cards">
                  {filteredAndSortedData.emAndamento.map(aula => renderCard(aula, true))}
                </div>
              )}
            </div>

            {filteredAndSortedData.proximas.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                <div className="nx-hd">🟡 A seguir — <em>Iniciando no(s) próximo(s) período(s)</em></div>
                <div className="nx-cards">
                  {filteredAndSortedData.proximas.map(aula => renderCard(aula, false))}
                </div>
              </div>
            )}

            {filteredAndSortedData.restoDoDia.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                <div 
                    onClick={() => setMostrarMaisTarde(!mostrarMaisTarde)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}
                >
                    <div className="nx-hd" style={{ margin: 0, border: 'none', padding: 0 }}>⚪ Mais tarde — <em>Restante do dia</em></div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '12px' }}>
                        {filteredAndSortedData.restoDoDia.length} aulas
                    </span>
                    <span style={{ marginLeft: 'auto', color: '#60a5fa', fontSize: '14px', fontWeight: 'bold' }}>
                        {mostrarMaisTarde ? 'Ocultar ▴' : 'Expandir ▾'}
                    </span>
                </div>
                
                {(mostrarMaisTarde || filtro) && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {filteredAndSortedData.restoDoDia.map(aula => renderCompactRow(aula))}
                    </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="nx-hd">Todas as aulas — {day}</div>
            {filteredAndSortedData.todasAsAulas.length === 0 ? (
              <div className="empty-st">Nenhuma aula encontrada {filtro && `para a busca "${filtro}"`}.</div>
            ) : (
              <div className="nx-cards">
                {filteredAndSortedData.todasAsAulas.map(aula => renderCard(aula, false))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}