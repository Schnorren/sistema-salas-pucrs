import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Search } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { supabase } from '../supabase';
import { PERIODS, PERIOD_END_TIMES, getDiaAtual, getCurrentPeriod } from '../../backend_core/utils/timeHelpers';
import { IDX_PERIODO, blocosDoDia, ordenarSalas, andarDaSala, rotuloAndar, normalizar, periodosAfetadosPelaTroca } from '../utils/blocos';
import { SegDias } from './ui/Seg';
import { Carregando, Erro, SemPredio } from './ui/Estado';
import GavetaTroca from './GavetaTroca';

// Início de turno (tarde F, noite L): um respiro maior entre as colunas
const PAUSAS = new Set(['F', 'L']);

// Linha do tempo no layout do app antigo (preferido pela equipe): uma linha
// por sala, uma célula por período ocupando a largura da tela, o nome da aula
// repetido em cada período e o bloco inteiro aceso no hover. Clicar abre o
// painel de troca de sala (mesma regra de blocos/chaves de utils/blocos.js).
export default function Timeline({ acesso, initialDay, initialFiltro }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);
  const trocasAtivas = useTrocasSala(predioAtual);

  const [day, setDay] = useState(initialDay || getDiaAtual());
  const [filtro, setFiltro] = useState(initialFiltro || '');
  const [autoMode, setAutoMode] = useState(!initialDay); // false se veio de busca/link
  const [perAgora, setPerAgora] = useState(getCurrentPeriod());
  const [hoverKey, setHoverKey] = useState(null);
  const [blocoAberto, setBlocoAberto] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (initialDay) { setDay(initialDay); setAutoMode(false); } // eslint-disable-line react-hooks/set-state-in-effect
    if (initialFiltro !== null && initialFiltro !== undefined) setFiltro(initialFiltro);
  }, [initialDay, initialFiltro]);

  // Relógio (fuso de Brasília): atualiza o período atual e, em modo
  // automático, vira o dia à meia-noite.
  useEffect(() => {
    const t = setInterval(() => {
      setPerAgora(getCurrentPeriod());
      if (autoMode) setDay(getDiaAtual());
    }, 30000);
    return () => clearInterval(t);
  }, [autoMode]);

  // Limpeza automática de trocas de semanas anteriores — 1x por prédio, em background
  useEffect(() => {
    if (!predioAtual) return;
    supabase.rpc('limpar_trocas_antigas').then(() => {}, () => {}); // erros ignorados de propósito
  }, [predioAtual]);

  // Digitar em qualquer lugar da tela começa a filtrar
  useEffect(() => {
    const onKey = (e) => {
      if (blocoAberto || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length === 1 && e.key !== '/') inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocoAberto]);

  const isHoje = day === getDiaAtual();
  const idxAgora = isHoje && perAgora ? IDX_PERIODO[perAgora] : -1;

  const salas = useMemo(() => ordenarSalas(rawGradeData?.salas), [rawGradeData]);
  const blocos = useMemo(() => blocosDoDia(rawGradeData?.grade, day), [rawGradeData, day]);

  const termo = normalizar(filtro);
  const andares = useMemo(() => {
    const visiveis = salas.filter(s => !termo || normalizar(s.numero).includes(termo)
      || (blocos[s.numero] || []).some(b => normalizar(`${b.nome} ${b.codCred}`).includes(termo)));
    const porAndar = {};
    visiveis.forEach(s => { const a = andarDaSala(s); (porAndar[a] = porAndar[a] || []).push(s); });
    return Object.keys(porAndar).sort((a, b) => Number(a) - Number(b)).map(a => ({ a, salas: porAndar[a] }));
  }, [salas, blocos, termo]);

  if (!predioAtual) return <SemPredio />;
  if (loading && !rawGradeData) return <Carregando texto="Carregando a grade de horários…" />;
  if (error) return <Erro texto={error} />;
  if (!salas.length) return <Erro titulo="Este prédio ainda não tem grade" texto="Importe o PDF em Gestão → Atualizar grade." />;

  const totalTrocas = Object.keys(trocasAtivas).length;

  const celula = (s, p, i, bloco, salaBate) => {
    const pausa = PAUSAS.has(p.code) ? 'lt-pausa' : '';
    if (!bloco) {
      return <div key={p.code} className={`lt-cell ${pausa} ${i === idxAgora ? 'now' : ''}`} title={`Livre · ${p.lb}–${PERIOD_END_TIMES[p.code]}`} />;
    }
    const registro = trocasAtivas[bloco.chave];
    const afetados = registro ? periodosAfetadosPelaTroca(registro, bloco.periodos) : [];
    const temTroca = registro && afetados.includes(p.code);
    const blocoAgora = idxAgora >= bloco.idxIni && idxAgora <= bloco.idxFim;
    const bate = termo && !salaBate && normalizar(`${bloco.nome} ${bloco.codCred}`).includes(termo);
    const classes = [
      'lt-cell', pausa,
      temTroca ? 'trc' : bloco.interno ? 'int' : 'reg',
      i === idxAgora ? 'now' : blocoAgora ? 'seq' : '',
      hoverKey === bloco.chave ? 'hover' : '',
      bate ? 'match' : '',
    ].join(' ');
    const dica = `${bloco.nome}\nPeríodos: ${bloco.periodosStr} · ${bloco.inicio}–${bloco.fim}${registro ? `\nTrocada para o prédio ${registro.predio_destino}, sala ${registro.sala_destino} (${afetados.join('')})` : ''}`;
    return (
      <button
        key={p.code} type="button" className={classes} title={dica}
        onClick={() => setBlocoAberto(bloco)}
        onMouseEnter={() => setHoverKey(bloco.chave)}
        onMouseLeave={() => setHoverKey(null)}
        onFocus={() => setHoverKey(bloco.chave)}
        onBlur={() => setHoverKey(null)}
      >
        {temTroca && <span className="lt-cell-troca">→ P{registro.predio_destino} · {registro.sala_destino}</span>}
        <span className="lt-cell-nome">{bloco.nomeAula}</span>
        {bloco.codCred && <span className="lt-cell-cod">{bloco.codCred}</span>}
      </button>
    );
  };

  return (
    <div className="pg cheia larga">
      <div className="pg-hd">
        <div>
          <h1 className="t-pg">Linha do tempo</h1>
          <p className="sub">{day}{totalTrocas ? ` · ${totalTrocas} troca${totalTrocas > 1 ? 's' : ''} de sala nesta semana` : ''} · clique numa aula para registrar troca</p>
        </div>
        <div className="pg-acoes">
          <SegDias valor={day} onChange={(d) => { setDay(d); setAutoMode(false); }} />
          <button className={`aovivo ${autoMode && isHoje ? 'on' : ''}`} onClick={() => { setAutoMode(true); setDay(getDiaAtual()); }} title="Voltar para hoje e acompanhar o relógio">
            <span className="pt" />Ao vivo
          </button>
          <div className="campo-busca">
            <Search size={16} />
            <input ref={inputRef} className="inp" placeholder="Pesquisar por disciplina ou sala" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" aria-label="Pesquisar por disciplina ou sala" />
          </div>
        </div>
      </div>

      <div className="legenda">
        <span><i className="lg" style={{ '--c': 'var(--ocup)', '--b': 'var(--ocup-bg)' }} />Regular</span>
        <span><i className="lg" style={{ '--c': 'var(--int)', '--b': 'var(--int-bg)' }} />Interno</span>
        <span><i className="lg" style={{ '--c': 'var(--troca)', '--b': 'var(--troca-bg)' }} />Trocada (destino no topo da célula)</span>
        <span><i className="lg" style={{ '--c': 'var(--ouro)', '--b': 'transparent', outline: '2px solid var(--ouro)', outlineOffset: -1 }} />Período atual</span>
      </div>

      <div className="tl-wrap">
        {andares.length === 0 ? (
          <div className="vazio" style={{ margin: 20 }}>Nenhuma sala ou aula encontrada para “{filtro}”.</div>
        ) : (
          <div className="lt-grade">
            <div className="lt-hdr">
              <div className="lt-rl">Sala</div>
              <div className="lt-pers">
                {PERIODS.map((p, i) => (
                  <div key={p.code} className={`lt-phd ${PAUSAS.has(p.code) ? 'lt-pausa' : ''} ${i === idxAgora ? 'now' : ''}`}>
                    <b>{p.code}</b>{p.lb}–{PERIOD_END_TIMES[p.code]}
                  </div>
                ))}
              </div>
            </div>
            {andares.map(({ a, salas: doAndar }) => (
              <Fragment key={a}>
                <div className="tl-andar">{rotuloAndar(a)}</div>
                {doAndar.map(s => {
                  const lista = blocos[s.numero] || [];
                  const porPeriodo = PERIODS.map((_, i) => lista.find(b => i >= b.idxIni && i <= b.idxFim) || null);
                  const salaBate = termo && normalizar(s.numero).includes(termo);
                  const temAulaAgora = idxAgora >= 0 && Boolean(porPeriodo[idxAgora]);
                  return (
                    <div key={s.numero} className="lt-row">
                      <div className={`lt-rn ${temAulaAgora ? 'on' : ''}`}>{s.numero}</div>
                      <div className="lt-cells">{PERIODS.map((p, i) => celula(s, p, i, porPeriodo[i], salaBate))}</div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {blocoAberto && (
        <GavetaTroca bloco={blocoAberto} registro={trocasAtivas[blocoAberto.chave]} predioId={predioAtual} onFechar={() => setBlocoAberto(null)} />
      )}
    </div>
  );
}
