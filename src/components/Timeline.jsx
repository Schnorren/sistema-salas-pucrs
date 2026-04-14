import { useState, useEffect, useMemo, useRef } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, getCurrentPeriod, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

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

const normalizeText = (text) => {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [filtro, setFiltro] = useState('');
  const [hoveredAulaId, setHoveredAulaId] = useState(null);
  const [tick, setTick] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      if (horariosPUCRS.includes(horaStr)) {
        setTick(t => t + 1);
      }
    }, 60000);
    return () => clearInterval(intervaloRelogio);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length === 1) {
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  const dataProcessed = useMemo(() => {
    if (!rawGradeData || !rawGradeData.salas || !rawGradeData.grade) return null;

    const salasDb = rawGradeData.salas;
    const gradeBruta = rawGradeData.grade;
    const periodoAtual = getCurrentPeriod();

    const aulasDoDia = gradeBruta.filter(d => d.dia_semana?.toLowerCase().includes(day.toLowerCase()));

    const periodosCabecalho = PERIODS.map(p => ({
      code: p.code,
      label: p.lb,
      isAgora: p.code === periodoAtual
    }));
    const sortedSalas = [...salasDb].sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

    const timeline = sortedSalas.map(salaRef => {
      const slots = PERIODS.map(p => {
        const aulaNoSlot = aulasDoDia.find(d => {
          const numSala = d.salas?.numero || d.sala;
          return numSala === salaRef.numero && extractPeriodCode(d.periodo) === p.code;
        });

        return {
          periodo: p.code,
          horario: p.lb,
          isAgora: p.code === periodoAtual,
          ocupado: !!aulaNoSlot,
          nome: aulaNoSlot ? (aulaNoSlot.nome_aula || aulaNoSlot.disciplinas?.nome) : null,
          tipo: aulaNoSlot ? (aulaNoSlot.tipo || (isInternalClass(aulaNoSlot.nome_aula) ? 'Interno' : 'Regular')) : 'Livre',
          disciplinaId: aulaNoSlot ? (aulaNoSlot.disciplina_id || aulaNoSlot.nome_aula) : null
        };
      });

      return {
        sala: salaRef.numero,
        temAulaAgora: slots.some(s => s.isAgora && s.ocupado),
        slots
      };
    });

    return { periodosCabecalho, timeline };
  }, [rawGradeData, day, tick]);
  const filteredTimeline = useMemo(() => {
    if (!dataProcessed?.timeline) return [];
    if (!filtro.trim()) return dataProcessed.timeline;

    const termo = normalizeText(filtro);

    return dataProcessed.timeline.filter(linha => {
      const matchSala = normalizeText(linha.sala).includes(termo);
      const matchAula = linha.slots.some(slot =>
        slot.ocupado && normalizeText(slot.nome).includes(termo)
      );
      return matchSala || matchAula;
    });
  }, [dataProcessed, filtro]);

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (loading) return <div className="empty-st">Carregando matriz de horários da CDN...</div>;
  if (error) return <div className="empty-st" style={{ color: 'var(--red)' }}>⚠️ Erro: {error}</div>;
  if (!dataProcessed) return <div className="empty-st">Nenhuma matriz encontrada para este prédio.</div>;

  return (
    <div className="view active" id="vTl" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label>Dia:</label>
          <select value={day} onChange={e => setDay(e.target.value)}>
            {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Pesquisar por disciplina ou sala..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 32px 6px 12px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '13px'
            }}
          />
          {filtro && (
            <span
              onClick={() => setFiltro('')}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, fontSize: '12px' }}
            >
              ✕
            </span>
          )}
        </div>

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
              {dataProcessed.periodosCabecalho.map(p => (
                <div key={p.code} className={`tl-phd ${p.isAgora ? 'now' : ''}`}>
                  {p.code}<br />
                  <span style={{ fontSize: '0.65rem', fontWeight: 'normal', opacity: 0.8 }}>
                    {p.label} - {PERIOD_END_TIMES[p.code] || ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {filteredTimeline.length === 0 ? (
            <div className="empty-st" style={{ padding: '40px' }}>Nenhuma sala ou aula encontrada para "{filtro}".</div>
          ) : (
            filteredTimeline.map(linha => (
              <div key={linha.sala} className="tl-row" style={{ display: 'flex', minHeight: '65px', alignItems: 'stretch' }}>
                <div className={`tl-rn ${linha.temAulaAgora ? 'on' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
                  {linha.sala}
                </div>
                <div className="tl-cells" style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
                  {linha.slots.map((slot, idx) => {
                    const statusClass = !slot.ocupado ? 'empty' : (slot.tipo === 'Interno' ? 'int' : 'reg');
                    const aula = formatarAula(slot.nome);

                    const aulaUniqueKey = slot.ocupado ? `${slot.disciplinaId}-${slot.nome}-${linha.sala}` : null;
                    const isHovered = hoveredAulaId && hoveredAulaId === aulaUniqueKey;

                    const termoNormalizado = normalizeText(filtro).trim();
                    const isSearchMatch = termoNormalizado && slot.ocupado && normalizeText(slot.nome).includes(termoNormalizado);
                    const isRoomMatch = termoNormalizado && normalizeText(linha.sala).includes(termoNormalizado);

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
                          backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.15)' : (isSearchMatch ? 'rgba(59, 130, 246, 0.25)' : undefined),
                          outline: isHovered ? '2px solid var(--accent, #ffd700)' : (isSearchMatch ? '2px solid #3b82f6' : (isRoomMatch ? '1px dashed rgba(255,255,255,0.3)' : 'none')),
                          outlineOffset: '-2px',
                          zIndex: isHovered || isSearchMatch ? 10 : 1,
                          boxShadow: isHovered ? '0 0 10px rgba(0,0,0,0.5)' : (isSearchMatch ? '0 0 8px rgba(59, 130, 246, 0.4)' : 'none')
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
                              color: (isHovered || isSearchMatch) ? '#fff' : undefined
                            }}>
                              {aula.nome}
                            </div>
                            {aula.codigo && (
                              <div style={{
                                fontSize: '0.65rem',
                                opacity: (isHovered || isSearchMatch) ? 1 : 0.7,
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
            ))
          )}
        </div>
      </div>
    </div >
  );
}