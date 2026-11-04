import { useState, useMemo, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Download, FileUp, LoaderCircle, TriangleAlert } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { useGrade } from '../hooks/useGrade';
import { ROTAS } from '../rotas';
import { generateHeatmapPDF } from '../utils/reportGenerator';
import { PERIODS, extractPeriodCode } from '../../backend_core/utils/timeHelpers';
import { DIAS_SEMANA, DIA_CURTO, TURNO_DO_PERIODO, numeroSala, andarDaSala, rotuloAndar } from '../utils/blocos';
import { Seg } from './ui/Seg';
import { Carregando, Erro, SemPredio } from './ui/Estado';

const TURNOS = [['todos', 'Todos'], ['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']];
const NOME_TURNO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const UTEIS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

// "C.15.02.2.05" -> "205" (mesma regra do relatório de BI antigo)
const nomeCurtoSala = (bruto) => {
  if (!bruto || bruto === 'Desconhecida') return bruto;
  const p = String(bruto).split('.');
  return p.length >= 2 ? `${parseInt(p[p.length - 2], 10)}${p[p.length - 1]}` : bruto;
};

// Gráfico de área de uma série (salas ocupadas por período). Hover por coluna.
function Curva({ valores, rotulos, max }) {
  const W = 600, H = 210, pl = 30, pr = 14, pt = 22, pb = 24, iw = W - pl - pr, ih = H - pt - pb, n = valores.length;
  if (!n || !max) return <p className="sub">Sem dados para os filtros atuais.</p>;
  const x = (i) => pl + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pt + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f));
  const pts = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const pk = valores.indexOf(Math.max(...valores));
  const passo = iw / Math.max(1, n - 1);
  const fmt = (v) => String(v).replace('.', ',');
  return (
    <svg className="svg-graf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Salas ocupadas por período; pico de ${fmt(valores[pk])} no período ${rotulos[pk]}`}>
      {ticks.map(t => <g key={t}><line className="g" x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} /><text className="t" x={pl - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
      <polygon className="area" points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} />
      <polyline className="linha" points={pts} />
      <circle className="ponto" cx={x(pk)} cy={y(valores[pk])} r="5" />
      <text className="tv" x={Math.max(pl + 40, Math.min(x(pk), W - pr - 50))} y={y(valores[pk]) - 10} textAnchor="middle">pico {fmt(valores[pk])} · {rotulos[pk]}</text>
      {rotulos.map((l, i) => <text key={l} className="t" x={x(i)} y={H - 6} textAnchor="middle">{l}</text>)}
      {valores.map((v, i) => (
        <rect key={i} className="hit" x={x(i) - passo / 2} y={pt} width={passo} height={ih}
          data-tt={`Período ${rotulos[i]} (${PERIODS.find(p => p.code === rotulos[i])?.lb})\n${fmt(v)} salas ocupadas em média`} />
      ))}
    </svg>
  );
}

// Ocupação das salas — tela única para a grade publicada ("atual") e para a
// análise de um PDF de outro semestre ("pdf", antigo Histórico de Aulas/BI).
export default function Ocupacao({ acesso, fonte, podeAtual, podePdf }) {
  const { predioAtivo } = usePredio();
  const { toast } = useUI();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(fonte === 'atual' ? predioAtual : '');

  const [turno, setTurno] = useState('todos');
  const [andar, setAndar] = useState('todos');
  const [dias, setDias] = useState(() => new Set(DIAS_SEMANA.slice(0, 6)));
  const [pdf, setPdf] = useState(null); // { nome, base, salas }
  const [enviando, setEnviando] = useState(false);
  const [erroPdf, setErroPdf] = useState('');
  const arquivoRef = useRef(null);

  // Base comum: [{ sala, dia, periodo }] + lista de salas
  const base = useMemo(() => {
    if (fonte === 'pdf') return pdf ? { registros: pdf.base, salas: pdf.salas } : null;
    if (!rawGradeData?.grade) return null;
    const registros = rawGradeData.grade.map(g => ({ sala: numeroSala(g), dia: g.dia_semana, periodo: extractPeriodCode(g.periodo) })).filter(r => r.sala && r.dia);
    const salas = (rawGradeData.salas || []).map(s => ({ numero: s.numero, andar: andarDaSala(s) }));
    return { registros, salas };
  }, [fonte, pdf, rawGradeData]);

  const andaresDisponiveis = useMemo(() => [...new Set((base?.salas || []).map(s => s.andar))].sort((a, b) => Number(a) - Number(b)), [base]);

  const stats = useMemo(() => {
    if (!base) return null;
    const salas = base.salas.filter(s => andar === 'todos' || s.andar === andar).map(s => s.numero);
    const salaSet = new Set(salas);
    const pers = PERIODS.filter((p, i) => turno === 'todos' || TURNO_DO_PERIODO(i) === turno).map(p => p.code);
    const diasAtivos = DIAS_SEMANA.filter(d => dias.has(d));
    // ocupado[dia][periodo] = Set(salas); 1 sala conta 1x por slot
    const ocup = {};
    base.registros.forEach(r => {
      const dia = DIAS_SEMANA.find(d => String(r.dia).toLowerCase().includes(d.toLowerCase()));
      if (!dia || !salaSet.has(r.sala) || !pers.includes(r.periodo)) return;
      ((ocup[dia] = ocup[dia] || {})[r.periodo] = ocup[dia][r.periodo] || new Set()).add(r.sala);
    });
    const n = salas.length || 1;
    const qtd = (d, p) => ocup[d]?.[p]?.size || 0;
    const matriz = pers.map(p => ({ p, porDia: diasAtivos.map(d => ({ d, v: Math.round((qtd(d, p) / n) * 100), q: qtd(d, p) })) }));
    const uteis = diasAtivos.filter(d => UTEIS.includes(d));
    const refDias = uteis.length ? uteis : diasAtivos;
    let soma = 0, pico = { v: -1 };
    pers.forEach(p => refDias.forEach(d => { const v = (qtd(d, p) / n) * 100; soma += v; if (v > pico.v) pico = { v: Math.round(v), d, p }; }));
    const media = refDias.length && pers.length ? Math.round(soma / (refDias.length * pers.length)) : 0;
    const porSala = salas.map(s => {
      let o = 0;
      refDias.forEach(d => pers.forEach(p => { if (ocup[d]?.[p]?.has(s)) o++; }));
      return { sala: s, o, pct: refDias.length && pers.length ? Math.round((o / (refDias.length * pers.length)) * 100) : 0 };
    }).sort((a, b) => b.pct - a.pct || a.sala.localeCompare(b.sala, undefined, { numeric: true }));
    const curva = pers.map(p => Number((refDias.reduce((t, d) => t + qtd(d, p), 0) / Math.max(1, refDias.length)).toFixed(1)));

    // Formato do relatório em PDF legado (generateHeatmapPDF)
    const legado = (() => {
      let totalOccupied = 0;
      const possivel = diasAtivos.length * pers.length;
      const heatmap = [...salas].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(sala => {
        const contagemPorDia = {}; let totalSala = 0;
        diasAtivos.forEach(d => { const c = pers.filter(p => ocup[d]?.[p]?.has(sala)).length; contagemPorDia[d] = c; totalSala += c; });
        totalOccupied += totalSala;
        return { sala, contagemPorDia, totalSala, percSala: possivel ? ((totalSala / possivel) * 100).toFixed(1) : '0.0' };
      });
      const totalPossible = possivel * salas.length;
      return { heatmap, mxCount: Math.max(1, ...heatmap.map(h => h.totalSala)), totalOccupied, totalPossible, percGeral: totalPossible ? ((totalOccupied / totalPossible) * 100).toFixed(1) : '0.0', usageByDay: [] };
    })();

    return { salas, pers, diasAtivos, matriz, media, pico, porSala, curva, n, legado, refUteis: uteis.length > 0 };
  }, [base, andar, turno, dias]);

  const enviarPdf = async (file) => {
    if (!file) return;
    if (!predioAtual) { setErroPdf('Escolha um prédio no topo antes de enviar o arquivo.'); return; }
    setEnviando(true); setErroPdf('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const baseUrl = import.meta.env.VITE_PYTHON_API_URL || '';
      const url = baseUrl ? baseUrl.replace('/extract-pdf', '/analyze-bi') : '';
      if (!url) throw new Error('URL da API de extração não configurada.');
      const res = await fetch(url, { method: 'POST', body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || j.error || `Erro ${res.status}`); }
      const dados = await res.json();
      const registros = (dados.rawRecords || []).map(a => ({ dia: a.Dia || '', periodo: a.Periodo ? a.Periodo.split(' ')[0] : '', sala: nomeCurtoSala(a.Sala) }))
        .filter(r => r.sala && r.sala !== 'Desconhecida' && r.dia);
      if (!registros.length) throw new Error('O PDF não tem aulas reconhecíveis.');
      const salas = [...new Set(registros.map(r => r.sala))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(numero => ({ numero, andar: andarDaSala({ numero }) }));
      setPdf({ nome: file.name, base: registros, salas });
    } catch (err) {
      setErroPdf(`Não foi possível analisar o arquivo: ${err.message}`);
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  };

  const exportarCSV = () => {
    if (!stats) return;
    const d = stats.diasAtivos;
    let csv = `Sala,${d.join(',')},% ocupação (seg-sex)\n`;
    stats.legado.heatmap.forEach(r => { csv += `${r.sala},${d.map(x => r.contagemPorDia[x] || 0).join(',')},${stats.porSala.find(s => s.sala === r.sala)?.pct ?? 0}%\n`; });
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ocupacao_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const exportarPDF = () => {
    if (!stats?.legado.heatmap.length) { toast.error('Nada para exportar com os filtros atuais.'); return; }
    generateHeatmapPDF(stats.legado, stats.diasAtivos);
  };

  if (!predioAtual) return <SemPredio />;
  if (fonte === 'atual' && loading && !rawGradeData) return <Carregando texto="Calculando a ocupação…" />;
  if (fonte === 'atual' && error) return <Erro texto={error} />;

  const toggleDia = (d) => setDias(s => { const n = new Set(s); if (n.has(d)) { if (n.size > 1) n.delete(d); } else n.add(d); return n; });
  const cls = (v) => Math.min(6, Math.floor((v / 100) * 7));

  return (
    <div className="pg">
      <div className="pg-hd">
        <div>
          <h1 className="t-pg">Ocupação das salas</h1>
          <p className="sub">{fonte === 'atual' ? 'Grade atual publicada' : 'Análise de uma grade de outro semestre, a partir do PDF do Espaço Físico'}</p>
        </div>
        <div className="pg-acoes">
          {podeAtual && podePdf && (
            <div className="seg" role="group" aria-label="Fonte dos dados">
              <NavLink to={ROTAS.ocupacao}>Grade atual</NavLink>
              <NavLink to={ROTAS.historicoAulas}>PDF de outro semestre</NavLink>
            </div>
          )}
          <button className="btn" onClick={exportarPDF} disabled={!stats}><Download size={16} />PDF</button>
          <button className="btn" onClick={exportarCSV} disabled={!stats}><Download size={16} />CSV</button>
        </div>
      </div>

      {fonte === 'pdf' && (
        <div className="fonte">
          {enviando ? <LoaderCircle size={16} className="girando" /> : <FileUp size={16} />}
          <span>{enviando ? 'Analisando o PDF… a API pode levar até 40 s na primeira chamada.' : pdf ? <>Fonte: <b>{pdf.nome}</b> · {pdf.base.length} alocações · {pdf.salas.length} salas</> : 'Envie o PDF da agenda de um semestre para analisar.'}</span>
          <input ref={arquivoRef} type="file" accept="application/pdf" hidden id="oc-pdf" onChange={(e) => enviarPdf(e.target.files?.[0])} />
          <label htmlFor="oc-pdf" className={`btn sm ${pdf ? '' : 'pri'}`} style={{ marginLeft: 'auto', cursor: 'pointer' }} aria-disabled={enviando}>{pdf ? 'Carregar outro PDF' : 'Escolher PDF'}</label>
        </div>
      )}
      {erroPdf && <div className="alerta-box erro"><TriangleAlert size={16} /><span>{erroPdf}</span></div>}

      {!stats ? (fonte === 'pdf' && !enviando && <div className="vazio">Os indicadores aparecem aqui depois que o PDF for analisado.</div>) : (
        <>
          <div className="filtros">
            <span className="rot" style={{ marginRight: 2 }}>Dias</span>
            {DIAS_SEMANA.slice(0, 6).map(d => <button key={d} className="f-chip" aria-pressed={dias.has(d)} onClick={() => toggleDia(d)}>{DIA_CURTO[d]}</button>)}
            <span className="rot" style={{ margin: '0 2px 0 12px' }}>Turno</span>
            <Seg rotulo="Turno" valor={turno} onChange={setTurno} opcoes={TURNOS} />
            {andaresDisponiveis.length > 1 && <>
              <span className="rot" style={{ margin: '0 2px 0 12px' }}>Andar</span>
              <Seg rotulo="Andar" valor={andar} onChange={setAndar} opcoes={[['todos', 'Todos'], ...andaresDisponiveis.map(a => [a, a === '0' ? 'Térreo' : `${a}º`])]} />
            </>}
          </div>

          <div className="kpis">
            <div className="card kpi"><div className="kpi-rot">Ocupação média{stats.refUteis ? ' (seg–sex)' : ''}</div><div className="kpi-val">{stats.media}<small>%</small></div><div className="kpi-ctx">{stats.salas.length} salas × {stats.pers.length} períodos</div></div>
            <div className="card kpi"><div className="kpi-rot">Horário de pico</div><div className="kpi-val">{Math.max(0, stats.pico.v)}<small>%</small></div><div className="kpi-ctx">{stats.pico.d ? `${stats.pico.d} · período ${stats.pico.p} (${PERIODS.find(p => p.code === stats.pico.p)?.lb})` : '—'}</div></div>
            <div className="card kpi"><div className="kpi-rot">Sala mais usada</div><div className="kpi-val mono">{stats.porSala[0]?.sala || '—'}<small>{stats.porSala[0] ? `${stats.porSala[0].pct}%` : ''}</small></div><div className="kpi-ctx">dos períodos filtrados</div></div>
            <div className="card kpi"><div className="kpi-rot">Sala menos usada</div><div className="kpi-val mono">{stats.porSala.at(-1)?.sala || '—'}<small>{stats.porSala.at(-1) ? `${stats.porSala.at(-1).pct}%` : ''}</small></div><div className="kpi-ctx">candidata a remanejamentos</div></div>
          </div>

          <div className="rel-grid">
            <section className="card">
              <div className="card-hd"><b>Ocupação por período e dia</b><span className="escala" style={{ marginLeft: 'auto' }}>0%{[0, 2, 4, 6].map(k => <i key={k} style={{ background: `var(--h${k})` }} />)}100%</span></div>
              <div className="card-bd" style={{ overflowX: 'auto' }}>
                <div className="hm" role="table" aria-label="Percentual de salas ocupadas por período e dia" style={{ '--ndias': stats.diasAtivos.length }}>
                  <span />
                  {stats.diasAtivos.map(d => <span key={d} className="hm-h">{DIA_CURTO[d]}</span>)}
                  {stats.matriz.map(({ p, porDia }, i) => {
                    const t = TURNO_DO_PERIODO(PERIODS.findIndex(x => x.code === p));
                    const ant = i > 0 ? TURNO_DO_PERIODO(PERIODS.findIndex(x => x.code === stats.matriz[i - 1].p)) : null;
                    return [
                      turno === 'todos' && t !== ant && <span key={`t-${t}`} className="hm-turno">{NOME_TURNO[t]}</span>,
                      <span key={`l-${p}`} className="hm-l">{p} <span>{PERIODS.find(x => x.code === p)?.lb}</span></span>,
                      ...porDia.map(({ d, v, q }) => {
                        const k = cls(v);
                        return <span key={`${p}-${d}`} className={`hm-c ${k >= 4 ? 'e' : ''}`} style={{ background: `var(--h${k})` }} data-tt={`${d} · período ${p}\n${v}% das salas ocupadas (${q} de ${stats.n})`}>{v}</span>;
                      }),
                    ];
                  })}
                </div>
              </div>
            </section>
            <div className="coluna-pilha">
              <section className="card">
                <div className="card-hd"><b>Salas ocupadas ao longo do dia</b><span className="sub" style={{ margin: '0 0 0 auto' }}>média{stats.refUteis ? ' seg–sex' : ''} · de {stats.salas.length}</span></div>
                <div className="card-bd"><Curva valores={stats.curva} rotulos={stats.pers} max={stats.salas.length} /></div>
              </section>
              <section className="card">
                <div className="card-hd"><b>Uso por sala</b><span className="sub" style={{ margin: '0 0 0 auto' }}>% dos períodos{stats.refUteis ? ' seg–sex' : ''}</span></div>
                <div className="card-bd" style={{ maxHeight: 340, overflow: 'auto' }}>
                  <div className="barras">
                    {stats.porSala.map((s, i) => (
                      <div key={s.sala} className={`barra ${i >= stats.porSala.length - 3 ? 'baixa' : ''}`} data-tt={`Sala ${s.sala} (${rotuloAndar(andarDaSala({ numero: s.sala }))}): ${s.pct}% dos períodos`}>
                        <span className="rotulo">{s.sala}</span><span className="trilho"><i style={{ width: `${s.pct}%` }} /></span><span className="v">{s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
