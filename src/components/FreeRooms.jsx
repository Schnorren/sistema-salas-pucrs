import { useState, useMemo } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, PERIOD_END_TIMES, getDiaAtual, getCurrentPeriod } from '../../backend_core/utils/timeHelpers';
import { IDX_PERIODO, blocosDoDia, ordenarSalas, andarDaSala, rotuloAndar, janelasLivres, blocoNoPeriodo } from '../utils/blocos';
import { SegDias } from './ui/Seg';
import { Carregando, Erro, SemPredio } from './ui/Estado';

// Salas livres: localizador por faixa de períodos + disponibilidade do dia.
export default function FreeRooms({ acesso }) {
  const { predioAtivo } = usePredio();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const atual = getCurrentPeriod() || 'A';
  const [dia, setDia] = useState(getDiaAtual());
  const [de, setDe] = useState(atual);
  const [ate, setAte] = useState(PERIODS[Math.min(PERIODS.length - 1, IDX_PERIODO[atual] + 1)].code);

  const salas = useMemo(() => ordenarSalas(rawGradeData?.salas), [rawGradeData]);
  const blocos = useMemo(() => blocosDoDia(rawGradeData?.grade, dia), [rawGradeData, dia]);

  const a = IDX_PERIODO[de];
  const b = Math.max(IDX_PERIODO[ate], a);
  const livres = useMemo(() => salas.filter(s => {
    const lista = blocos[s.numero] || [];
    return !lista.some(x => x.idxFim >= a && x.idxIni <= b);
  }).map(s => {
    const prox = (blocos[s.numero] || []).find(x => x.idxIni > b);
    return { s, ate: prox ? prox.inicio : null };
  }), [salas, blocos, a, b]);

  if (!predioAtual) return <SemPredio />;
  if (loading && !rawGradeData) return <Carregando texto="Carregando a disponibilidade…" />;
  if (error) return <Erro texto={error} />;

  const mudarDe = (v) => { setDe(v); if (IDX_PERIODO[ate] < IDX_PERIODO[v]) setAte(v); };
  const mudarAte = (v) => { setAte(v); if (IDX_PERIODO[de] > IDX_PERIODO[v]) setDe(v); };

  return (
    <div className="pg">
      <div className="pg-hd">
        <div><h1 className="t-pg">Salas livres</h1><p className="sub">Encontre uma sala para remanejar uma aula ou atender um pedido de reserva</p></div>
      </div>

      <section className="card">
        <div className="finder">
          <div className="campo"><span className="rot">Dia</span><SegDias valor={dia} onChange={setDia} /></div>
          <div className="campo"><label htmlFor="lv-de">Do período</label>
            <select id="lv-de" className="inp" value={de} onChange={(e) => mudarDe(e.target.value)}>{PERIODS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.lb}</option>)}</select>
          </div>
          <div className="campo"><label htmlFor="lv-ate">Até o período</label>
            <select id="lv-ate" className="inp" value={ate} onChange={(e) => mudarAte(e.target.value)}>{PERIODS.map(p => <option key={p.code} value={p.code}>{p.code} · até {PERIOD_END_TIMES[p.code]}</option>)}</select>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{livres.length} <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>salas livres</span></div>
            <div className="sub" style={{ margin: 0 }}>{dia.toLowerCase()}, {PERIODS[a].lb}–{PERIOD_END_TIMES[PERIODS[b].code]}</div>
          </div>
        </div>
        <div className="card-bd" style={{ borderTop: '1px solid var(--line)' }}>
          {livres.length === 0 ? <div className="vazio">Nenhuma sala livre nessa faixa. Tente períodos vizinhos.</div> : (
            <div className="res-livres">
              {livres.map(({ s, ate: limite }) => (
                <div key={s.numero} className="livre-tile"><b>{s.numero}</b><small>{rotuloAndar(andarDaSala(s))} · {limite ? `livre até ${limite}` : 'livre até o fim do dia'}</small></div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="sec-hd">
          <h2 className="t-sec">Disponibilidade do dia</h2>
          <span className="legenda" style={{ marginLeft: 10 }}>
            <span><i className="lg" style={{ '--c': 'transparent', '--b': 'var(--livre-bg)', border: '1px solid var(--livre)' }} />livre</span>
            <span><i className="lg" style={{ '--c': 'transparent', '--b': 'var(--ocup-bg)' }} />com aula</span>
          </span>
        </div>
        <div className="tabela-wrap">
          <table className="dados">
            <thead><tr><th style={{ width: 70 }}>Sala</th><th><div className="faixa-esc">{PERIODS.map(p => <span key={p.code}>{p.code}</span>)}</div></th><th>Janelas livres</th></tr></thead>
            <tbody>
              {salas.map(s => {
                const lista = blocos[s.numero] || [];
                const jan = janelasLivres(lista);
                return (
                  <tr key={s.numero}>
                    <td className="mono" style={{ fontWeight: 600 }}>{s.numero}</td>
                    <td>
                      <div className="faixa">
                        {PERIODS.map((p, i) => {
                          const bl = blocoNoPeriodo(lista, p.code);
                          return <i key={p.code} className={`${bl ? '' : 'l'} ${i >= a && i <= b ? 'sel' : ''}`} data-tt={`${s.numero} · ${p.code} ${p.lb}–${PERIOD_END_TIMES[p.code]}\n${bl ? bl.titulo : 'Livre'}`} />;
                        })}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{jan.length ? jan.map(j => `${j.inicio}–${j.termino}`).join(' · ') : <span style={{ color: 'var(--muted)' }}>sem janelas</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
