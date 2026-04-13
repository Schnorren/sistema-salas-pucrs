import { useState, useEffect, useMemo } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, getCurrentPeriod, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PERIOD_OPTIONS = ['A','B','C','D','E','E1','F','G','H','I','J','K','L','M','N','P'];

// Tabela de horários em que a PUC "vira a chave" dos períodos
const horariosPUCRS = [
  "08:00", "08:45", "09:45", "10:30", "11:30", "12:15",
  "14:00", "14:45", "15:45", "16:30", "17:30", "18:15",
  "19:15", "20:00", "21:00", "21:45"
];

export default function LiveMap({ session, acesso }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  
  // 🔥 NOVO: Usamos o nosso hook para trazer o JSON gigante e veloz
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [per, setPer] = useState('auto');
  
  // Força atualização da tela nos horários de troca de aula
  const [, setTick] = useState(0);

  const [tt, setTt] = useState({ visible: false, x: 0, y: 0, sala: '', info: '' });

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      
      if (horariosPUCRS.includes(horaStr)) {
        setTick(t => t + 1); // Força um re-render para recalcular as ocupações
      }
    }, 60000); // Roda a cada 1 minuto

    return () => clearInterval(intervaloRelogio);
  }, []);

  // ==========================================
  // 🔥 O CÉREBRO: PROCESSA O JSON NO FRONTEND
  // ==========================================
  const dataProcessed = useMemo(() => {
    if (!rawGradeData || !rawGradeData.salas) return null;

    const salasDb = rawGradeData.salas;
    const gradeBruta = rawGradeData.grade || [];
    
    // Descobre o período atual se estiver no modo "auto"
    const activePer = per === 'auto' ? getCurrentPeriod() : per;

    // Filtra apenas as aulas que estão acontecendo no dia e período exatos
    const aulasNoMomento = gradeBruta.filter(d => {
        const mesmoDia = d.dia_semana?.toLowerCase().includes(day.toLowerCase());
        const codigoPeriodoBanco = extractPeriodCode(d.periodo);
        const noMesmoPeriodo = codigoPeriodoBanco.includes(activePer);
        return mesmoDia && noMesmoPeriodo;
    });

    // Mapeia as salas base, cruzando com quem tem aula no momento
    const salasProcessadas = salasDb.map(s => {
        if (!s || !s.numero) return null;

        const aula = aulasNoMomento.find(a => {
            const numSala = a.salas?.numero || a.sala;
            return numSala === s.numero;
        });

        // Lógica de cálculo de andares (mesma que ficava no backend)
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
            disciplina: aula ? (aula.nome_aula || aula.disciplinas?.nome) : null,
            tipo: aula ? (aula.tipo || (isInternalClass(aula.nome_aula) ? 'Interno' : 'Regular')) : 'Livre'
        };
    }).filter(Boolean);

    // Agrupa as salas processadas por andar
    const andaresUnicos = [...new Set(salasProcessadas.map(s => String(s.andar)))].sort();
    const andares = andaresUnicos.map(num => ({
        label: num === '0' ? 'Térreo / Outros' : `${num}º Andar`,
        salas: salasProcessadas.filter(s => String(s.andar) === num).sort((a,b) => a.numero.localeCompare(b.numero))
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

  }, [rawGradeData, day, per]); 
  // O 'useMemo' só refaz a conta se a grade baixar, ou se o dia/período mudar.

  // ==========================================
  // INTERAÇÕES DA UI
  // ==========================================
  const handleMouseEnter = (e, sala) => {
    setTt({
      visible: true,
      x: e.clientX + 15,
      y: e.clientY - 10,
      sala: sala.numero,
      info: sala.ocupada ? sala.disciplina : 'Sala Livre'
    });
  };

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (loading) return <div className="empty-st">Carregando mapa das salas do CDN...</div>;
  if (error) return <div className="empty-st" style={{color: 'var(--red)'}}>⚠️ {error}</div>;
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
            {PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
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
                >
                  <div className="rt-n">{sala.numero}</div>
                  <div className="rt-s">{sala.ocupada ? 'Ocupada' : 'Livre'}</div>
                  <div className="rt-c">{sala.ocupada ? (sala.disciplina.substring(0, 40) + '...') : '—'}</div>
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