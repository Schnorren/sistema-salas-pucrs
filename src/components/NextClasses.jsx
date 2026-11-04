import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { PERIODS, PERIOD_END_TIMES, getDiaAtual, getCurrentPeriod, getDataSaoPaulo } from '../../backend_core/utils/timeHelpers';
import { IDX_PERIODO, blocosDoDia, normalizar, minutos, periodosAfetadosPelaTroca } from '../utils/blocos';
import { Seg, SegDias } from './ui/Seg';
import { Carregando, Erro, SemPredio } from './ui/Estado';

const ORDENS = {
  sala: (a, b) => a.sala.localeCompare(b.sala, undefined, { numeric: true }) || a.idxIni - b.idxIni,
  hora: (a, b) => a.idxIni - b.idxIni || a.sala.localeCompare(b.sala, undefined, { numeric: true }),
  nome: (a, b) => a.titulo.localeCompare(b.titulo) || a.idxIni - b.idxIni,
};

// Fora do horário de aula, a referência é o próximo período do dia
const periodoReferencia = () => {
  const atual = getCurrentPeriod();
  if (atual) return atual;
  const d = getDataSaoPaulo();
  const m = d.getHours() * 60 + d.getMinutes();
  return (PERIODS.find(p => p.start[0] * 60 + p.start[1] > m) || PERIODS[PERIODS.length - 1]).code;
};

function Linha({ b, modo, troca, agoraMin }) {
  const afetados = troca ? periodosAfetadosPelaTroca(troca, b.periodos) : [];
  let dir;
  if (modo === 'andamento') {
    const tot = minutos(b.fim) - minutos(b.inicio);
    const pct = Math.max(0, Math.min(100, ((agoraMin - minutos(b.inicio)) / tot) * 100));
    dir = <div className="lp-dir"><b>até {b.fim}</b><span className="prog"><i style={{ width: `${pct}%` }} /></span></div>;
  } else {
    dir = <div className="lp-dir"><b>{b.inicio}</b><span>até {b.fim}</span></div>;
  }
  return (
    <li className={`lp ${troca ? 'trc' : ''} ${b.interno ? 'int' : ''}`}>
      <span className="lp-sala">{b.sala}</span>
      <div style={{ minWidth: 0 }}>
        <span className="lp-nome">{b.titulo}</span>
        <span className="lp-meta">
          {b.codCred || 'uso interno'} · {b.periodosStr}
          {troca && <> · <b className="trc-txt">→ P{troca.predio_destino} · {troca.sala_destino}{afetados.length < b.periodos.length ? ` (${afetados.join('')})` : ''}</b></>}
        </span>
      </div>
      {dir}
    </li>
  );
}

export default function NextClasses({ acesso }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);
  const trocas = useTrocasSala(predioAtual);

  const [day, setDay] = useState(getDiaAtual());
  const [per, setPer] = useState('auto');
  const [filtro, setFiltro] = useState('');
  const [ordem, setOrdem] = useState('sala');
  const [relogio, setRelogio] = useState(() => ({ ref: periodoReferencia(), min: getDataSaoPaulo().getHours() * 60 + getDataSaoPaulo().getMinutes() }));

  // Relógio: a cada 30 s recalcula o período de referência e vira o dia à meia-noite
  useEffect(() => {
    const t = setInterval(() => {
      const d = getDataSaoPaulo();
      setRelogio({ ref: periodoReferencia(), min: d.getHours() * 60 + d.getMinutes() });
      setDay(prev => (per === 'auto' ? getDiaAtual() : prev));
    }, 30000);
    return () => clearInterval(t);
  }, [per]);

  const refCode = per === 'auto' ? relogio.ref : per;
  const ehAgora = per === 'auto' && day === getDiaAtual() && Boolean(getCurrentPeriod());
  const blocos = useMemo(() => blocosDoDia(rawGradeData?.grade, day), [rawGradeData, day]);

  const colunas = useMemo(() => {
    const t = normalizar(filtro);
    const pi = IDX_PERIODO[refCode];
    const todas = Object.values(blocos).flat()
      .filter(b => !t || normalizar(`${b.nome} ${b.codCred} ${b.sala}`).includes(t))
      .sort(ORDENS[ordem]);
    return [
      todas.filter(b => pi >= b.idxIni && pi <= b.idxFim),
      todas.filter(b => b.idxIni > pi && b.idxIni <= pi + 2),
      todas.filter(b => b.idxIni > pi + 2),
    ];
  }, [blocos, filtro, ordem, refCode]);

  if (!predioAtual) return <SemPredio />;
  if (loading && !rawGradeData) return <Carregando texto="Carregando as aulas do dia…" />;
  if (error) return <Erro texto={error} />;

  const pi = IDX_PERIODO[refCode];
  const P = PERIODS[pi];
  const seguintes = PERIODS.slice(pi + 1, pi + 3);
  const depois = PERIODS[pi + 3];
  const cols = [
    { modo: 'andamento', titulo: ehAgora ? 'Em andamento' : `No período ${refCode}`, sub: `Período ${refCode} · ${P.lb}–${PERIOD_END_TIMES[refCode]}`, cor: 'var(--ocup)' },
    { modo: 'seguir', titulo: 'Começam a seguir', sub: seguintes.length ? `Períodos ${seguintes.map(p => p.code).join(' e ')} · a partir de ${seguintes[0].lb}` : 'Fim do dia', cor: 'var(--ouro)' },
    { modo: 'tarde', titulo: 'Mais tarde', sub: depois ? `A partir de ${depois.lb}` : 'Fim do dia', cor: 'var(--border)' },
  ];

  return (
    <div className="pg cheia">
      <div className="pg-hd">
        <div>
          <h1 className="t-pg">Próximas aulas</h1>
          <p className="sub">{day} · referência: {per === 'auto' ? (ehAgora ? `agora, período ${refCode}` : `próximo período (${refCode}, ${P.lb})`) : `período ${refCode} (${P.lb})`}</p>
        </div>
        <div className="pg-acoes">
          <SegDias valor={day} onChange={setDay} />
          <select className="inp" value={per} onChange={(e) => setPer(e.target.value)} aria-label="Período de referência">
            <option value="auto">Agora ({relogio.ref})</option>
            {PERIODS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.lb}</option>)}
          </select>
          <div className="campo-busca">
            <Search size={16} />
            <input className="inp" placeholder="Filtrar disciplina, código ou sala" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" aria-label="Filtrar" />
          </div>
          <Seg rotulo="Ordenar por" valor={ordem} onChange={setOrdem} opcoes={[['sala', 'Sala'], ['hora', 'Horário'], ['nome', 'Disciplina']]} />
        </div>
      </div>

      <div className="prox">
        {cols.map((c, k) => (
          <section key={c.modo} className="col">
            <div className="col-hd">
              <span className="pt" style={{ '--c': c.cor }} />
              <div><b>{c.titulo}</b><small>{c.sub}</small></div>
              <span className="cont">{colunas[k].length}</span>
            </div>
            <ul className="col-lista">
              {colunas[k].length
                ? colunas[k].map(b => <Linha key={b.chave} b={b} modo={k === 0 ? (ehAgora ? 'andamento' : 'seguir') : c.modo} troca={trocas[b.chave]} agoraMin={relogio.min} />)
                : <li className="vazio">Nenhuma aula{filtro ? ` para “${filtro}”` : ''}.</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
