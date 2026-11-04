import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Search } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { supabase } from '../supabase';
import { PERIODS, PERIOD_END_TIMES, getDiaAtual, getCurrentPeriod, getDataSaoPaulo } from '../../backend_core/utils/timeHelpers';
import { IDX_PERIODO, blocosDoDia, ordenarSalas, andarDaSala, rotuloAndar, normalizar, periodosAfetadosPelaTroca, minutos } from '../utils/blocos';
import { SegDias } from './ui/Seg';
import { Carregando, Erro, SemPredio } from './ui/Estado';
import GavetaTroca from './GavetaTroca';

// Linha do tempo: grade sala × período do dia. Cada aula de vários períodos é
// UM bloco (mesma regra de blocos das trocas); clicar abre o painel de troca.
export default function Timeline({ acesso, initialDay, initialFiltro }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);
  const trocasAtivas = useTrocasSala(predioAtual);

  const [day, setDay] = useState(initialDay || getDiaAtual());
  const [filtro, setFiltro] = useState(initialFiltro || '');
  const [autoMode, setAutoMode] = useState(!initialDay); // false se veio de busca/link
  const [agora, setAgora] = useState(() => ({ per: getCurrentPeriod(), min: (() => { const d = getDataSaoPaulo(); return d.getHours() * 60 + d.getMinutes(); })() }));
  const [blocoAberto, setBlocoAberto] = useState(null);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const colAgoraRef = useRef(null);

  useEffect(() => {
    if (initialDay) { setDay(initialDay); setAutoMode(false); }
    if (initialFiltro !== null && initialFiltro !== undefined) setFiltro(initialFiltro);
  }, [initialDay, initialFiltro]);

  // Relógio (fuso de Brasília): atualiza a linha do "agora" e, em modo
  // automático, vira o dia à meia-noite.
  useEffect(() => {
    const t = setInterval(() => {
      const d = getDataSaoPaulo();
      setAgora({ per: getCurrentPeriod(), min: d.getHours() * 60 + d.getMinutes() });
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
  const perAgora = isHoje ? agora.per : null;
  const idxAgora = perAgora ? IDX_PERIODO[perAgora] : -1;

  // Rola até o período atual só quando ele está fora da área visível
  useEffect(() => {
    const w = wrapRef.current, c = colAgoraRef.current;
    if (!w || !c) return;
    if (c.offsetLeft + c.offsetWidth > w.clientWidth) w.scrollLeft = Math.max(0, c.offsetLeft - 72 - c.offsetWidth * 2);
  }, [rawGradeData, day, idxAgora]);

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
  const pctAgora = idxAgora >= 0
    ? Math.min(100, Math.max(0, ((agora.min - minutos(PERIODS[idxAgora].lb)) / (minutos(PERIOD_END_TIMES[perAgora]) - minutos(PERIODS[idxAgora].lb))) * 100))
    : 0;

  let linha = 2; // linha 1 = cabeçalho
  const corpo = andares.map(({ a, salas: doAndar }) => {
    const rAndar = linha++;
    return (
      <Fragment key={a}>
        <div className="tl-andar" style={{ gridRow: rAndar }}><span>{rotuloAndar(a)}</span></div>
        {doAndar.map(s => {
          const r = linha++;
          const salaBate = termo && normalizar(s.numero).includes(termo);
          return (
            <Fragment key={s.numero}>
              <div className="tl-sala" style={{ gridRow: r }}>{s.numero}</div>
              {PERIODS.map((p, i) => (
                <div key={p.code} className={`tl-cel ${i === idxAgora ? 'agora' : ''} ${p.code === 'F' ? 'almoco' : ''}`} style={{ gridRow: r, gridColumn: i + 2 }} />
              ))}
              {(blocos[s.numero] || []).map(b => {
                const t = trocasAtivas[b.chave];
                const afetados = t ? periodosAfetadosPelaTroca(t, b.periodos) : [];
                const parcial = t && afetados.length < b.periodos.length;
                const bate = termo && !salaBate && normalizar(`${b.nome} ${b.codCred}`).includes(termo);
                const dica = `${b.titulo}\n${b.codCred || 'uso interno'} · ${b.periodosStr} · ${b.inicio}–${b.fim}${t ? `\nTrocada para P${t.predio_destino} · ${t.sala_destino}${parcial ? ` (só ${afetados.join('')})` : ''}` : ''}`;
                return (
                  <button
                    key={b.chave}
                    className={`tl-b ${t ? 'trc' : b.interno ? 'int' : ''} ${bate ? 'match' : ''}`}
                    style={{ gridRow: r, gridColumn: `${b.idxIni + 2} / span ${b.periodos.length}` }}
                    onClick={() => setBlocoAberto(b)}
                    title={dica}
                  >
                    <span className="tl-b-nome">{b.titulo}</span>
                    <span className="tl-b-meta">{t ? `→ P${t.predio_destino} · ${t.sala_destino}${parcial ? ` (${afetados.join('')})` : ''}` : (b.codCred || 'interno')}</span>
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </Fragment>
    );
  });

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
            <span className="pt" />Hoje
          </button>
          <div className="campo-busca">
            <Search size={16} />
            <input ref={inputRef} className="inp" placeholder="Filtrar sala ou disciplina" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" aria-label="Filtrar sala ou disciplina" />
          </div>
        </div>
      </div>

      <div className="legenda">
        <span><i className="lg" style={{ '--c': 'var(--ocup)', '--b': 'var(--ocup-bg)' }} />Aula</span>
        <span><i className="lg" style={{ '--c': 'var(--int)', '--b': 'var(--int-bg)' }} />Uso interno</span>
        <span><i className="lg trc" style={{ '--c': 'var(--troca)', '--b': 'var(--troca-bg)' }} />Trocada (destino no bloco)</span>
        {idxAgora >= 0 && <span><i className="lg-agora" />Agora</span>}
        <span style={{ color: 'var(--muted)' }}>‖ intervalo de almoço 13:00–14:00</span>
      </div>

      <div className="tl-wrap" ref={wrapRef}>
        {andares.length === 0 ? (
          <div className="vazio" style={{ margin: 20 }}>Nenhuma sala ou aula encontrada para “{filtro}”.</div>
        ) : (
          <div className="tl">
            <div className="tl-h tl-canto" style={{ gridRow: 1, gridColumn: 1 }}>Sala</div>
            {PERIODS.map((p, i) => (
              <div key={p.code} ref={i === idxAgora ? colAgoraRef : null} className={`tl-h ${i === idxAgora ? 'agora' : ''}`} style={{ gridRow: 1, gridColumn: i + 2 }}>
                <b>{p.code}</b><span>{p.lb}–{PERIOD_END_TIMES[p.code]}</span>
              </div>
            ))}
            {corpo}
            {idxAgora >= 0 && (
              <div className="tl-agora" style={{ gridRow: `2 / span ${linha - 2}`, gridColumn: idxAgora + 2 }} aria-hidden="true">
                <i style={{ left: `${pctAgora.toFixed(1)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {blocoAberto && (
        <GavetaTroca bloco={blocoAberto} registro={trocasAtivas[blocoAberto.chave]} predioId={predioAtual} onFechar={() => setBlocoAberto(null)} />
      )}
    </div>
  );
}
