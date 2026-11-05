import { useState, useEffect, useMemo } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { slotsDoDia, blocosDaSala, blocoNoPeriodo, trocaNoPeriodo } from '../utils/aulasDoDia';
import { PERIODS, PERIOD_TIMES, PERIOD_OPTIONS, getDiaAtual, getCurrentPeriod, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];


export default function LiveMap({ acesso }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);
  // Trocas de sala da semana (mesmo hook da Linha do tempo e do badge)
  const trocas = useTrocasSala(predioAtual);

  const [day, setDay] = useState(getDiaAtual());
  const [per, setPer] = useState('auto');
  const [, setTick] = useState(0);

  const [tt, setTt] = useState({ visible: false, x: 0, y: 0, sala: '', info: '' });

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;

      if (PERIOD_TIMES.includes(horaStr)) {
        setTick(t => t + 1);
        // Atualiza o dia automaticamente — cobre virada de meia-noite
        setDay(prev => {
          const hoje = getDiaAtual();
          return prev !== hoje ? hoje : prev;
        });
      }
    }, 60000);

    return () => clearInterval(intervaloRelogio);
  }, []);
  const dataProcessed = useMemo(() => {
    if (!rawGradeData || !rawGradeData.salas) return null;

    const salasDb = rawGradeData.salas;
    const gradeBruta = rawGradeData.grade || [];
    const activePer = per === 'auto' ? getCurrentPeriod() : per;
    const aulasNoMomento = gradeBruta.filter(d => {
      const mesmoDia = d.dia_semana?.toLowerCase().includes(day.toLowerCase());
      const codigoPeriodoBanco = extractPeriodCode(d.periodo);
      const noMesmoPeriodo = codigoPeriodoBanco === activePer;
      return mesmoDia && noMesmoPeriodo;
    });
    // Blocos do dia por sala — para achar a troca de sala que vale neste período
    const slots = slotsDoDia(gradeBruta, day);

    const salasProcessadas = salasDb.map(s => {
      if (!s || !s.numero) return null;

      const aula = aulasNoMomento.find(a => {
        const numSala = a.salas?.numero || a.sala;
        return numSala === s.numero;
      });
      let andarDaSala = s.andar;
      if (!andarDaSala) {
        const numString = String(s.numero);
        const partes = numString.split('.');
        if (partes.length >= 4 && partes[0] === 'C') {
          andarDaSala = parseInt(partes[3], 10).toString();
        } else {
          const match = numString.match(/\d/);
          andarDaSala = match ? match[0] : '0';
        }
      }

      return {
        numero: s.numero,
        andar: andarDaSala,
        ocupada: !!aula,
        troca: aula ? trocaNoPeriodo(trocas, blocoNoPeriodo(blocosDaSala(slots.get(s.numero), day, s.numero), activePer), activePer) : null,
        disciplina: aula ? (aula.nome_aula || aula.disciplinas?.nome) : null,
        tipo: aula ? (aula.tipo || (isInternalClass(aula.nome_aula) ? 'Interno' : 'Regular')) : 'Livre'
      };
    }).filter(Boolean);
    const andaresUnicos = [...new Set(salasProcessadas.map(s => String(s.andar)))].sort();
    const andares = andaresUnicos.map(num => ({
      label: num === '0' ? 'Térreo / Outros' : `${num}º Andar`,
      salas: salasProcessadas.filter(s => String(s.andar) === num).sort((a, b) => a.numero.localeCompare(b.numero))
    }));

    return {
      periodoAtual: activePer,
      contagem: {
        total: salasProcessadas.length,
        livres: salasProcessadas.filter(s => !s.ocupada).length,
        ocupadas: salasProcessadas.filter(s => s.ocupada).length
      },
      andares: andares.filter(a => a.salas.length > 0)
    };

  }, [rawGradeData, day, per, trocas]);
  const handleMouseEnter = (e, sala) => {
    setTt({
      visible: true,
      x: e.clientX + 15,
      y: e.clientY - 10,
      sala: sala.numero,
      info: sala.troca
        ? `🔁 Transferida para o prédio ${sala.troca.predio_destino}, sala ${sala.troca.sala_destino} · ${sala.disciplina}`
        : (sala.ocupada ? sala.disciplina : 'Sala Livre')
    });
  };

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (loading) return <div className="empty-st">Carregando mapa das salas do CDN...</div>;
  if (error) return <div className="empty-st" style={{ color: 'var(--red)' }}>⚠️ {error}</div>;
  if (!dataProcessed || !dataProcessed.andares) return <div className="empty-st">Nenhum dado de sala retornado. Atualize a grade do prédio.</div>;

  return (
    <div className="view active" id="vMap" style={{ display: 'flex', height: '100%' }}>

      <div className="map-side">
        <div className="ms-hd">Filtros</div>
        <div className="ms-f">
          <div className="ms-lbl">Dia</div>
          <select className="ms-sel" value={day} onChange={e => setDay(e.target.value)}>
            {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="ms-f" style={{ marginTop: 10 }}>
          <div className="ms-lbl">Período</div>
          <select className="ms-sel" value={per} onChange={e => setPer(e.target.value)}>
            <option value="auto">⟳ Automático ({dataProcessed.periodoAtual || '--'})</option>
            {PERIOD_OPTIONS.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
          </select>
        </div>

        <div className="ms-hd" style={{ marginTop: 20 }}>Contagem</div>
        <div className="cnt-box g">
          <div className="cnt-val">{dataProcessed.contagem?.livres || 0}</div>
          <div className="cnt-lbl">Livres</div>
        </div>
        <div className="cnt-box a">
          <div className="cnt-val">{dataProcessed.contagem?.ocupadas || 0}</div>
          <div className="cnt-lbl">Ocupadas</div>
        </div>
      </div>

      <div className="map-main" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {dataProcessed.andares.map(andar => (
          <div key={andar.label} className="fl-sec">
            <div className="fl-lbl">{andar.label}</div>
            <div className="room-grid">
              {andar.salas.map(sala => (
                <div
                  key={sala.numero}
                  className={`room-tile ${sala.ocupada ? 'busy' : 'free'}`}
                  onMouseEnter={(e) => handleMouseEnter(e, sala)}
                  onMouseLeave={() => setTt({ ...tt, visible: false })}
                  // Troca de sala: mesma faixa vermelha da Linha do tempo
                  style={sala.troca ? { position: 'relative', paddingTop: '20px', borderColor: 'var(--red)', background: 'rgba(239, 68, 68, 0.12)' } : undefined}
                >
                  {sala.troca && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--red)', color: '#fff', fontSize: '9px', fontWeight: 'bold', textAlign: 'center', padding: '2px 0', borderRadius: '4px 4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      🔁 P.{sala.troca.predio_destino} - SL.{sala.troca.sala_destino}
                    </div>
                  )}
                  <div className="rt-n">{sala.numero}</div>
                  <div className="rt-s" style={sala.troca ? { color: 'var(--red)' } : undefined}>{sala.troca ? 'Trocada' : sala.ocupada ? 'Ocupada' : 'Livre'}</div>
                  <div className="rt-c">{sala.ocupada ? (sala.disciplina.length > 40 ? sala.disciplina.substring(0, 40) + '...' : sala.disciplina) : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {tt.visible && (
        <div className="tt" style={{ display: 'block', left: tt.x, top: tt.y }}>
          <div className="tt-room">Sala {tt.sala}</div>
          <div className="tt-row"><b>{day}</b> · Período <b>{per === 'auto' ? dataProcessed.periodoAtual : per}</b></div>
          <div className="tt-row">{tt.info}</div>
        </div>
      )}
    </div>
  );
}