import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, LoaderCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { getDataSaoPaulo } from '../../backend_core/utils/timeHelpers';
import { normalizar } from '../utils/blocos';
import { Seg } from './ui/Seg';
import { Erro, Carregando } from './ui/Estado';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Atalhos de período calculados no fuso da PUCRS
function intervaloDoAtalho(atalho) {
  const agora = getDataSaoPaulo();
  const ini = new Date(agora); ini.setHours(0, 0, 0, 0);
  if (atalho === 'semana') { const dow = ini.getDay(); ini.setDate(ini.getDate() + (dow === 0 ? -6 : 1 - dow)); }
  if (atalho === 'mes') ini.setDate(1);
  if (atalho === 'semestre') { ini.setMonth(agora.getMonth() >= 6 ? 6 : 0, 1); }
  return { inicio: local(ini), fim: local(agora) };
}
const duracao = (inicioIso, fimIso) => {
  if (!inicioIso || !fimIso) return null;
  const m = Math.floor((new Date(fimIso) - new Date(inicioIso)) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${pad(m % 60)}`;
};
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function Barras({ dados, chaveRotulo, chaveValor, sufixo = '' }) {
  if (!dados?.length) return <p className="sub">Nenhum registro no período.</p>;
  const max = Math.max(1, ...dados.map(d => Number(d[chaveValor]) || 0));
  return (
    <div className="barras">
      {dados.map((d, i) => {
        const v = Number(d[chaveValor]) || 0;
        return (
          <div key={i} className="barra" style={{ '--rot': '140px' }} data-tt={`${d[chaveRotulo]}: ${v}${sufixo}`}>
            <span className="rotulo sans">{d[chaveRotulo]}</span>
            <span className="trilho"><i style={{ width: `${(v / max) * 100}%` }} /></span>
            <span className="v">{Number.isInteger(v) ? v : v.toFixed(1)}{sufixo}</span>
          </div>
        );
      })}
    </div>
  );
}

function Colunas({ dados, chaveRotulo, chaveValor, fmtRotulo = (x) => x }) {
  if (!dados?.length) return <p className="sub">Nenhum registro no período.</p>;
  const max = Math.max(1, ...dados.map(d => Number(d[chaveValor]) || 0));
  return (
    <div className="colunas">
      {dados.map((d, i) => {
        const v = Number(d[chaveValor]) || 0;
        return (
          <div key={i} className="coluna" data-tt={`${fmtRotulo(d[chaveRotulo])}: ${v} retiradas`}>
            <i style={{ height: `${(v / max) * 100}%` }}><span>{v}</span></i>
            <small>{fmtRotulo(d[chaveRotulo])}</small>
          </div>
        );
      })}
    </div>
  );
}

export default function RelatoriosEmprestimos({ session, acesso }) {
  const { predioAtivo } = usePredio();
  const { toast } = useUI();
  const relatorioRef = useRef(null);
  const [atalho, setAtalho] = useState('semana');
  const [intervalo, setIntervalo] = useState(() => intervaloDoAtalho('semana'));
  const [rascunho, setRascunho] = useState(intervalo);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [buscaHist, setBuscaHist] = useState('');
  const [buscaAlunos, setBuscaAlunos] = useState('');
  const predioId = predioAtivo || acesso?.predioId || acesso?.predio_id;

  const { data: dados, isLoading, isError, isFetching } = useQuery({
    queryKey: ['relatorios_emprestimos', predioId, intervalo.inicio, intervalo.fim],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/estatisticas?inicio=${intervalo.inicio}&fim=${intervalo.fim}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'x-predio-id': predioId }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      return json;
    },
    enabled: !!predioId && !!intervalo.inicio && !!intervalo.fim,
    staleTime: 1000 * 60 * 2
  });

  const escolherAtalho = (a) => {
    setAtalho(a);
    if (a !== 'outro') { const i = intervaloDoAtalho(a); setIntervalo(i); setRascunho(i); }
  };
  const aplicar = (e) => { e.preventDefault(); setIntervalo(rascunho); };

  const exportarPDF = async () => {
    if (!relatorioRef.current) return;
    setGerandoPdf(true);
    try {
      const canvas = await html2canvas(relatorioRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: getComputedStyle(relatorioRef.current).backgroundColor });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const w = pdf.internal.pageSize.getWidth();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
      pdf.save(`Relatorio_Emprestimos_${intervalo.inicio.slice(0, 10)}_${intervalo.fim.slice(0, 10)}.pdf`);
      toast.success('PDF exportado.');
    } catch { toast.error('Não foi possível gerar o PDF.'); }
    finally { setGerandoPdf(false); }
  };

  const hist = useMemo(() => {
    const t = normalizar(buscaHist);
    return (dados?.tabelaHistorico || []).filter(h => !t || normalizar(`${h.nomeAluno} ${h.matricula} ${h.nomeItem}`).includes(t));
  }, [dados, buscaHist]);
  const alunos = useMemo(() => {
    const t = normalizar(buscaAlunos);
    return (dados?.tabelaAlunosUnicos || []).filter(a => !t || normalizar(`${a.nome} ${a.matricula}`).includes(t));
  }, [dados, buscaAlunos]);

  if (isError) return <Erro texto="Não foi possível carregar o relatório. Tente de novo em instantes." />;

  const r = dados?.resumo || {};
  const total = Number(r.totalEmprestimos) || 0;
  const mediaHoras = total ? (Number(r.horasTotais) || 0) / total : 0;
  const picoHora = [...(dados?.picosHorario || [])].sort((a, b) => b.quantidade - a.quantidade)[0];
  const fmtMedia = mediaHoras >= 1 ? `${Math.floor(mediaHoras)}h${pad(Math.round((mediaHoras % 1) * 60))}` : `${Math.round(mediaHoras * 60)} min`;

  return (
    <div className="pg">
      <div className="pg-hd">
        <div>
          <h1 className="t-pg">Relatório de empréstimos</h1>
          <p className="sub">Rotatividade e uso do acervo{isFetching && !isLoading ? ' · atualizando…' : ''}</p>
        </div>
        <div className="pg-acoes">
          <Seg rotulo="Período" valor={atalho} onChange={escolherAtalho} opcoes={[['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['semestre', 'Semestre'], ['outro', 'Personalizado']]} />
          <button className="btn" onClick={exportarPDF} disabled={gerandoPdf || !dados}>{gerandoPdf ? <LoaderCircle size={16} className="girando" /> : <Download size={16} />}PDF</button>
        </div>
      </div>

      {atalho === 'outro' && (
        <form className="card finder" onSubmit={aplicar}>
          <div className="campo"><label htmlFor="rel-ini">Início</label><input id="rel-ini" type="datetime-local" className="inp" value={rascunho.inicio} onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })} required /></div>
          <div className="campo"><label htmlFor="rel-fim">Fim</label><input id="rel-fim" type="datetime-local" className="inp" value={rascunho.fim} onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })} required /></div>
          <button className="btn pri" disabled={isFetching}>Aplicar</button>
        </form>
      )}

      {isLoading ? <Carregando texto="Analisando o período…" /> : !total ? (
        <div className="vazio">Nenhum empréstimo entre {dataHora(intervalo.inicio)} e {dataHora(intervalo.fim)}.</div>
      ) : (
        <div ref={relatorioRef} style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--bg)' }}>
          <div className="kpis">
            <div className="card kpi"><div className="kpi-rot">Retiradas</div><div className="kpi-val">{total}</div><div className="kpi-ctx">{dataHora(intervalo.inicio)} a {dataHora(intervalo.fim)}</div></div>
            <div className="card kpi"><div className="kpi-rot">Alunos diferentes</div><div className="kpi-val">{r.alunosAtendidos ?? '—'}</div><div className="kpi-ctx">{dados.tabelaAlunosUnicos?.filter(a => a.total_retiradas > 1).length || 0} vieram mais de uma vez</div></div>
            <div className="card kpi"><div className="kpi-rot">Tempo médio com o item</div><div className="kpi-val">{fmtMedia}</div><div className="kpi-ctx">{Number(r.horasTotais || 0).toFixed(1).replace('.', ',')} h de uso no total</div></div>
            <div className="card kpi"><div className="kpi-rot">Horário de pico</div><div className="kpi-val">{picoHora ? `${picoHora.hora}h` : '—'}</div><div className="kpi-ctx">{picoHora ? `${picoHora.quantidade} retiradas nessa faixa` : ''}</div></div>
          </div>

          <div className="rel-grid">
            <div className="coluna-pilha">
              <section className="card"><div className="card-hd"><b>Itens mais retirados</b><span className="sub" style={{ margin: '0 0 0 auto' }}>retiradas</span></div><div className="card-bd"><Barras dados={dados.rankingItens} chaveRotulo="nome_item" chaveValor="total_saidas" /></div></section>
              <section className="card"><div className="card-hd"><b>Itens com mais tempo de uso</b><span className="sub" style={{ margin: '0 0 0 auto' }}>horas</span></div><div className="card-bd"><Barras dados={dados.rankingHoras} chaveRotulo="nome_item" chaveValor="total_horas" sufixo=" h" /></div></section>
            </div>
            <div className="coluna-pilha">
              <section className="card"><div className="card-hd"><b>Retiradas por hora do dia</b></div><div className="card-bd"><Colunas dados={dados.picosHorario} chaveRotulo="hora" chaveValor="quantidade" fmtRotulo={(h) => `${h}h`} /></div></section>
              <section className="card"><div className="card-hd"><b>Retiradas por dia da semana</b></div><div className="card-bd"><Colunas dados={dados.picos} chaveRotulo="dia_semana" chaveValor="quantidade" fmtRotulo={(d) => String(d).slice(0, 3)} /></div></section>
            </div>
          </div>

          <div className="rel-grid">
            <section>
              <div className="sec-hd"><h2 className="t-sec">Retiradas detalhadas</h2><span className="cont">{hist.length}</span><div className="campo-busca" style={{ marginLeft: 'auto', minWidth: 220 }}><Search size={16} /><input className="inp" placeholder="Aluno, matrícula ou item" value={buscaHist} onChange={(e) => setBuscaHist(e.target.value)} /></div></div>
              <div className="tabela-wrap" style={{ maxHeight: 420 }}>
                <table className="dados">
                  <thead><tr><th>Aluno</th><th>Item</th><th>Retirada</th><th>Duração</th></tr></thead>
                  <tbody>
                    {hist.map(h => (
                      <tr key={h.id}>
                        <td><b>{h.nomeAluno}</b><br /><small className="mono" style={{ color: 'var(--muted)' }}>{h.matricula}</small></td>
                        <td>{h.nomeItem}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{dataHora(h.dataRetirada)}</td>
                        <td>{h.dataDevolucao ? <span className="num">{duracao(h.dataRetirada, h.dataDevolucao)}</span> : <span className="chip ocup">em uso</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <div className="sec-hd"><h2 className="t-sec">Alunos atendidos</h2><span className="cont">{alunos.length}</span><div className="campo-busca" style={{ marginLeft: 'auto', minWidth: 200 }}><Search size={16} /><input className="inp" placeholder="Nome ou matrícula" value={buscaAlunos} onChange={(e) => setBuscaAlunos(e.target.value)} /></div></div>
              <div className="tabela-wrap" style={{ maxHeight: 420 }}>
                <table className="dados">
                  <thead><tr><th>Aluno</th><th className="dir">Retiradas</th></tr></thead>
                  <tbody>
                    {alunos.map(a => (
                      <tr key={a.matricula}><td><b>{a.nome}</b><br /><small className="mono" style={{ color: 'var(--muted)' }}>{a.matricula}</small></td><td className="dir num">{a.total_retiradas}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
