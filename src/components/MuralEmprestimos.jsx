import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ScanBarcode, Check, Wrench, Users, Monitor, Search, LoaderCircle } from 'lucide-react';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { STATUS_ITEM } from '../utils/constants';
import { lerBalcao, salvarBalcao, lerResponsavel } from '../utils/balcao';
import { normalizar } from '../utils/blocos';
import { Seg } from './ui/Seg';
import { Carregando, SemPredio } from './ui/Estado';

const LONGO_MIN = 120; // acima de 2h o tempo fica destacado

const horaDe = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '--:--');
const iniciais = (n) => String(n || '?').split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const duracao = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}`);
const minutosDesde = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));

function TempoDecorrido({ dataIso }) {
  const [min, setMin] = useState(() => minutosDesde(dataIso));
  useEffect(() => {
    const t = setInterval(() => setMin(minutosDesde(dataIso)), 30000);
    return () => clearInterval(t);
  }, [dataIso]);
  return <span className={`tempo ${min >= LONGO_MIN ? 'longo' : ''}`} title={min >= LONGO_MIN ? 'Mais de 2 horas' : undefined}>{duracao(min)}</span>;
}

// Balcão: Crachá -> Item -> (nome, se aluno novo) -> registra. Crachá de quem
// já está com um item abre direto a devolução (Enter confirma).
function Balcao({
  categorias, itensDisponiveis, emprestimosAtivos, consultarAluno, registrarRetirada, registrarDevolucao,
  retirando, devolvendo, categoriaSel, setCategoriaSel,
}) {
  const { toast } = useUI();
  const [passo, setPasso] = useState(1); // 1 crachá · 2 item · 3 nome · 4 devolução
  const [entrada, setEntrada] = useState('');
  const [nomeAluno, setNomeAluno] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [aluno, setAluno] = useState(null);
  const [itemSel, setItemSel] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [passo]);

  const reiniciar = useCallback(() => {
    setPasso(1); setEntrada(''); setNomeAluno(''); setAluno(null); setItemSel(null); setBuscando(false);
  }, []);

  const confirmarDevolucao = useCallback(async () => {
    if (devolvendo) return; // segurar Enter (key repeat) dispararia N devoluções
    const id = aluno?.emprestimoAtivo?.id;
    if (!id) return;
    try {
      await registrarDevolucao(id);
      toast.success(`Devolução de ${aluno.emprestimoAtivo.nomeItem} registrada.`);
      reiniciar();
    } catch (err) { toast.error(`Erro ao registrar devolução: ${err.message || 'tente novamente.'}`); }
  }, [devolvendo, aluno, registrarDevolucao, reiniciar, toast]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && passo > 1) { e.preventDefault(); reiniciar(); }
      if (e.key === 'Enter' && passo === 4) { e.preventDefault(); confirmarDevolucao(); }
      // Leitor de código de barras "digita": se o foco saiu do campo (clique na
      // tabela, por exemplo), a 1ª tecla devolve o foco ao leitor.
      if (passo !== 4 && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
        && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.querySelector('.dlg-fundo, .gaveta')) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [passo, reiniciar, confirmarDevolucao]);

  const biparCracha = async (e) => {
    e.preventDefault();
    const mat = entrada.trim();
    if (!mat || buscando) return;
    const local = emprestimosAtivos.find(x => x.matricula === mat);
    if (local) {
      setAluno({ matricula: mat, nomeCadastrado: local.nomeAluno, emprestimoAtivo: { id: local.id, nomeItem: local.nomeItem, dataRetirada: local.dataRetirada } });
      setPasso(4); setEntrada('');
      return;
    }
    setBuscando(true);
    let dados;
    try { dados = await consultarAluno(mat); }
    catch { toast.error('Não foi possível consultar a matrícula. Verifique a conexão e tente de novo.'); setBuscando(false); return; }
    setBuscando(false);
    setEntrada('');
    if (dados?.emprestimoAtivo) { setAluno(dados); setPasso(4); return; }
    setAluno(dados || { matricula: mat, nomeCadastrado: null });
    setNomeAluno(dados?.nomeCadastrado || '');
    setPasso(2);
  };

  const executarRetirada = async (item, nome) => {
    if (retirando) return;
    try {
      await registrarRetirada({ categoriaId: item.categoria_id, itemId: item.id, matricula: aluno.matricula, nomeAluno: nome, documento: 'Crachá Retido' });
      toast.success(`${item.nome_item} emprestado para ${nome}.`);
      reiniciar();
    } catch (err) { toast.error(`Erro ao registrar empréstimo: ${err.message || 'tente novamente.'}`); }
  };

  const escolherItem = (item) => {
    if (retirando) return; // duplo clique dispararia duas retiradas
    if (item.status === STATUS_ITEM.MANUTENCAO) { toast.error('Este item está em manutenção.'); return; }
    if (nomeAluno) executarRetirada(item, nomeAluno);
    else { setItemSel(item); setPasso(3); }
  };

  const biparItem = (e) => {
    e.preventDefault();
    const t = normalizar(entrada);
    if (!t) return;
    const prontos = itensDisponiveis.filter(i => i.status === STATUS_ITEM.DISPONIVEL);
    const item = prontos.find(i => normalizar(i.patrimonio) === t) || prontos.find(i => normalizar(i.nome_item).includes(t));
    if (item) escolherItem(item);
    else { toast.error('Item não encontrado ou indisponível nesta categoria.'); setEntrada(''); }
  };

  const salvarNome = (e) => {
    e.preventDefault();
    if (nomeAluno.trim()) executarRetirada(itemSel, nomeAluno.trim());
  };

  const passos = [[1, 'Crachá'], [2, 'Item'], [3, 'Confirmar']];
  const estadoPasso = (n) => {
    if (passo === 4) return n === 1 ? 'ativo' : '';
    if (passo === n) return 'ativo';
    return passo > n ? 'feito' : '';
  };
  const prontos = itensDisponiveis.filter(i => i.status === STATUS_ITEM.DISPONIVEL);

  return (
    <section className="card estacao" aria-label="Balcão">
      <ol className="passos">
        {passos.map(([n, l]) => <li key={n} className={`passo ${estadoPasso(n)}`}><i>{estadoPasso(n) === 'feito' ? '✓' : n}</i>{l}</li>)}
      </ol>
      <div className="est-corpo">
        {passo === 1 && (
          <form className="leitor pronto" onSubmit={biparCracha}>
            <label htmlFor="emp-inp"><ScanBarcode size={18} />Bipe o crachá do aluno</label>
            <input id="emp-inp" ref={inputRef} className="inp leitor-inp" autoComplete="off" inputMode="numeric" placeholder={buscando ? 'consultando…' : 'matrícula'} value={entrada} onChange={(e) => setEntrada(e.target.value)} disabled={buscando} />
            <p className="leitor-st">{buscando ? <LoaderCircle size={14} className="girando" /> : <span className="pt" />}{buscando ? 'Consultando a matrícula…' : 'Leitor pronto. Se o aluno estiver com um item, a devolução abre sozinha.'}</p>
          </form>
        )}

        {passo === 4 && aluno && (
          <>
            <div className="aluno-card"><span className="avatar">{iniciais(aluno.nomeCadastrado)}</span><div><b>{aluno.nomeCadastrado || 'Aluno'}</b><small>Matrícula {aluno.matricula}</small></div></div>
            <div className="devol">
              <span className="chip media">Devolução{aluno.emprestimoAtivo?.dataRetirada ? ` · retirado às ${horaDe(aluno.emprestimoAtivo.dataRetirada)}` : ''}</span>
              <span className="item-nome">{aluno.emprestimoAtivo?.nomeItem}</span>
              <button className="btn pri lg" style={{ width: '100%' }} onClick={confirmarDevolucao} disabled={devolvendo}>
                <Check size={18} />{devolvendo ? 'Registrando…' : <>Confirmar devolução <kbd className="kbd" style={{ marginLeft: 6 }}>Enter</kbd></>}
              </button>
            </div>
            <button className="btn fant" onClick={reiniciar}>Cancelar (Esc)</button>
          </>
        )}

        {passo === 2 && aluno && (
          <>
            <div className="aluno-card">
              <span className="avatar">{nomeAluno ? iniciais(nomeAluno) : '?'}</span>
              <div><b>{nomeAluno || 'Aluno novo'}</b><small>Matrícula {aluno.matricula}{nomeAluno ? ' · sem item em aberto' : ' · o nome é pedido ao confirmar'}</small></div>
            </div>
            <form className="leitor pronto" onSubmit={biparItem}>
              <label htmlFor="emp-inp"><ScanBarcode size={18} />Bipe o item</label>
              <input id="emp-inp" ref={inputRef} className="inp leitor-inp" autoComplete="off" placeholder="código ou nome" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
              <p className="leitor-st"><span className="pt" />Ou escolha abaixo.</p>
            </form>
            {categorias.length > 1 && (
              <div className="filtros">{categorias.map(c => <button key={c.id} className="f-chip" aria-pressed={categoriaSel === c.id} onClick={() => setCategoriaSel(c.id)}>{c.nome}</button>)}</div>
            )}
            <div className="itens-grid">
              {prontos.length === 0 && <div className="vazio" style={{ gridColumn: '1 / -1' }}>Nada disponível nesta categoria.</div>}
              {prontos.map(i => <button key={i.id} className="item-btn" onClick={() => escolherItem(i)} disabled={retirando}><b>{i.nome_item}</b><small>{i.patrimonio}</small></button>)}
            </div>
            <button className="btn fant" onClick={reiniciar}>Cancelar (Esc)</button>
          </>
        )}

        {passo === 3 && itemSel && (
          <>
            <div className="aluno-card"><span className="avatar">?</span><div><b>Aluno novo</b><small>Matrícula {aluno.matricula} · {itemSel.nome_item} ({itemSel.patrimonio})</small></div></div>
            <form className="campo" onSubmit={salvarNome}>
              <label htmlFor="emp-inp">Nome do aluno</label>
              <input id="emp-inp" ref={inputRef} className="inp" style={{ height: 48, fontSize: 17 }} placeholder="Nome completo" autoComplete="off" value={nomeAluno} onChange={(e) => setNomeAluno(e.target.value)} />
              <span className="dica">Fica salvo: na próxima vez o crachá já traz o nome.</span>
              <button className="btn pri lg" style={{ marginTop: 8 }} disabled={retirando || !nomeAluno.trim()}>{retirando ? 'Registrando…' : 'Confirmar empréstimo'}</button>
            </form>
            <button className="btn fant" onClick={reiniciar}>Cancelar (Esc)</button>
          </>
        )}
      </div>
    </section>
  );
}

function EmUso({ emprestimosAtivos, historico, registrarDevolucao, devolvendo }) {
  const { toast, showConfirm } = useUI();
  const ordenados = [...emprestimosAtivos].sort((a, b) => new Date(a.dataRetirada) - new Date(b.dataRetirada));

  // Feed dos dois balcões: retiradas em aberto + devoluções recentes
  const feed = useMemo(() => {
    const ev = [
      ...emprestimosAtivos.map(e => ({ quando: e.dataRetirada, resp: e.responsavel, txt: `emprestou ${e.nomeItem} para ${e.nomeAluno}` })),
      ...historico.filter(h => h.dataDevolucao).map(h => ({ quando: h.dataDevolucao, resp: h.responsavel, txt: `recebeu ${h.nomeItem} de ${h.nomeAluno}` })),
    ];
    return ev.sort((a, b) => new Date(b.quando) - new Date(a.quando)).slice(0, 6);
  }, [emprestimosAtivos, historico]);

  const receber = async (emp) => {
    if (devolvendo) return;
    const ok = await showConfirm(`${emp.nomeAluno} está devolvendo ${emp.nomeItem}?`, 'Receber devolução', { confirmar: 'Receber' });
    if (!ok) return;
    try { await registrarDevolucao(emp.id); toast.success('Devolução registrada.'); }
    catch (err) { toast.error(`Erro ao registrar devolução: ${err.message || 'tente novamente.'}`); }
  };

  return (
    <section className="uso">
      <div className="tabela-wrap">
        <table className="dados">
          <thead><tr><th>Aluno</th><th>Item</th><th>Saída</th><th>Com o aluno há</th><th className="dir">Em uso agora · {ordenados.length}</th></tr></thead>
          <tbody>
            {ordenados.length === 0 && <tr><td colSpan={5}><div className="vazio" style={{ margin: 6 }}>Nenhum item emprestado no momento.</div></td></tr>}
            {ordenados.map(e => (
              <tr key={e.id}>
                <td><div className="pessoa"><span className="avatar">{iniciais(e.nomeAluno)}</span><div><b>{e.nomeAluno}</b><small className="mono">{e.matricula}</small></div></div></td>
                <td><b>{e.nomeItem}</b><br /><small className="mono" style={{ color: 'var(--muted)' }}>{e.patrimonio}</small></td>
                <td className="num">{horaDe(e.dataRetirada)}</td>
                <td><TempoDecorrido dataIso={e.dataRetirada} /></td>
                <td className="dir"><button className="btn sm" onClick={() => receber(e)} disabled={devolvendo}>Receber</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-hd"><Users size={16} /><b>Atividade dos balcões</b><span className="sub" style={{ margin: '0 0 0 auto' }}>últimos registros dos dois computadores</span></div>
        <div className="card-bd" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {feed.length === 0 ? <p className="sub">Nenhuma movimentação recente.</p> : (
            <ul className="feed">
              {feed.map((f, i) => {
                const r = lerResponsavel(f.resp);
                return <li key={i}><span className="num">{horaDe(f.quando)}</span><span><span className="bal">{r.balcao || r.quem || 'Sistema'}</span>{r.balcao && r.quem ? ` · ${r.quem}` : ''} {f.txt}</span></li>;
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Estoque({ categorias, itensDisponiveis, categoriaSel, setCategoriaSel, alterarStatusManutencao, alterandoStatus, loadingItens, emprestimosAtivos }) {
  const { toast, showPrompt, showConfirm } = useUI();
  const enviar = async (item) => {
    const motivo = await showPrompt(`Por que ${item.nome_item} vai para manutenção?`, 'Enviar para manutenção', { placeholder: 'Ex.: faltam peças', confirmar: 'Enviar' });
    if (!motivo) return;
    try { await alterarStatusManutencao(item.id, STATUS_ITEM.MANUTENCAO, motivo); toast.success(`${item.nome_item} foi para manutenção.`); }
    catch (err) { toast.error(`Erro ao enviar para manutenção: ${err.message || 'tente novamente.'}`); }
  };
  const liberar = async (item) => {
    if (!(await showConfirm(`Liberar ${item.nome_item} para empréstimo?`, 'Liberar item', { confirmar: 'Liberar' }))) return;
    try { await alterarStatusManutencao(item.id, STATUS_ITEM.DISPONIVEL, null); toast.success(`${item.nome_item} liberado.`); }
    catch (err) { toast.error(`Erro ao liberar item: ${err.message || 'tente novamente.'}`); }
  };
  const emUso = emprestimosAtivos.filter(e => e.itemId).map(e => e.itemId);
  const ST = { [STATUS_ITEM.DISPONIVEL]: ['livre', 'Disponível'], [STATUS_ITEM.MANUTENCAO]: ['media', 'Manutenção'], [STATUS_ITEM.EMPRESTADO]: ['ocup', 'Em uso'] };
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="filtros">{categorias.map(c => <button key={c.id} className="f-chip" aria-pressed={categoriaSel === c.id} onClick={() => setCategoriaSel(c.id)}>{c.nome}</button>)}</div>
      {loadingItens ? <Carregando texto="Carregando os itens…" /> : (
        <div className="estoque">
          {itensDisponiveis.length === 0 && <div className="vazio" style={{ gridColumn: '1 / -1' }}>Nenhum item nesta categoria.</div>}
          {itensDisponiveis.map(i => {
            const st = emUso.includes(i.id) ? STATUS_ITEM.EMPRESTADO : i.status;
            const [cls, rot] = ST[st] || ['contorno', st];
            return (
              <div key={i.id} className={`est-item ${st === STATUS_ITEM.MANUTENCAO ? 'man' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}><b>{i.nome_item}</b><br /><small>{i.patrimonio}</small></div>
                  <span className={`chip ${cls}`}>{rot}</span>
                </div>
                {i.observacoes && st === STATUS_ITEM.MANUTENCAO && <small style={{ fontFamily: 'var(--sans)', color: 'var(--media)' }}>{i.observacoes}</small>}
                <div>
                  {st === STATUS_ITEM.DISPONIVEL && <button className="btn sm fant" onClick={() => enviar(i)} disabled={alterandoStatus}><Wrench size={14} />Enviar para manutenção</button>}
                  {st === STATUS_ITEM.MANUTENCAO && <button className="btn sm" onClick={() => liberar(i)} disabled={alterandoStatus}><Check size={14} />Liberar</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Historico({ historico, loadingHistorico }) {
  const [busca, setBusca] = useState('');
  const t = normalizar(busca);
  const lista = historico.filter(h => !t || normalizar(`${h.nomeAluno} ${h.matricula} ${h.nomeItem}`).includes(t));
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="campo-busca" style={{ maxWidth: 360 }}><Search size={16} /><input className="inp" placeholder="Buscar aluno, matrícula ou item" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      {loadingHistorico ? <Carregando texto="Carregando o histórico…" /> : (
        <div className="tabela-wrap">
          <table className="dados">
            <thead><tr><th>Aluno</th><th>Item</th><th>Saída</th><th>Volta</th><th>Duração</th><th>Atendido por</th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={6}><div className="vazio" style={{ margin: 6 }}>Nenhum registro encontrado.</div></td></tr>}
              {lista.map(h => {
                const r = lerResponsavel(h.responsavel || h.responsavelRetirada);
                return (
                  <tr key={h.id}>
                    <td><b>{h.nomeAluno}</b><br /><small className="mono" style={{ color: 'var(--muted)' }}>{h.matricula}</small></td>
                    <td>{h.nomeItem}</td>
                    <td className="num">{new Date(h.dataRetirada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</td>
                    <td className="num">{h.dataDevolucao ? horaDe(h.dataDevolucao) : '—'}</td>
                    <td>{h.dataDevolucao ? <span className="num">{duracao(Math.floor((new Date(h.dataDevolucao) - new Date(h.dataRetirada)) / 60000))}</span> : <span className="chip ocup">em uso</span>}</td>
                    <td style={{ color: 'var(--text-2)' }}>{r.balcao ? `${r.balcao} · ${r.quem}` : r.quem}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MuralEmprestimos({ session }) {
  const { predioAtivo } = usePredio();
  const { showPrompt, toast } = useUI();
  const [categoriaSel, setCategoriaSel] = useState('');
  const [aba, setAba] = useState('balcao');
  const [balcao, setBalcao] = useState(lerBalcao);
  const hook = useEmprestimos(session, predioAtivo, categoriaSel);

  useEffect(() => {
    if (hook.categorias.length > 0 && !categoriaSel) setCategoriaSel(hook.categorias[0].id); // eslint-disable-line react-hooks/set-state-in-effect
  }, [hook.categorias, categoriaSel]);

  const nomearBalcao = async () => {
    const nome = await showPrompt('Como este computador aparece no histórico e no feed? Os dois PCs da recepção usam o mesmo login, então cada um precisa de um nome.', 'Nome deste computador', { placeholder: 'Ex.: Balcão 1', confirmar: 'Salvar' });
    if (!nome) return;
    salvarBalcao(nome); setBalcao(lerBalcao());
    toast.success(`Este computador agora é "${lerBalcao()}".`);
  };

  if (!predioAtivo) return <SemPredio />;
  if (hook.loadingWizard && !hook.categorias.length) return <Carregando texto="Carregando o balcão…" />;

  return (
    <div className="pg cheia larga">
      <div className="pg-hd">
        <div>
          <h1 className="t-pg">Empréstimos</h1>
          <p className="sub">{hook.emprestimosAtivos.length} em uso agora · leitor de código de barras</p>
        </div>
        <button className="sync" style={{ border: 0, cursor: 'pointer' }} onClick={nomearBalcao} title="Os dois computadores da recepção veem as mesmas listas em tempo real. Clique para dar nome a este computador.">
          <span className="pt" /><Monitor size={14} />{balcao ? `Este computador: ${balcao}` : 'Dar nome a este computador'}
        </button>
        <div className="pg-acoes">
          <Seg rotulo="Seção" valor={aba} onChange={setAba} opcoes={[['balcao', 'Balcão'], ['estoque', 'Estoque'], ['historico', 'Histórico']]} />
        </div>
      </div>
      {aba === 'balcao' && (
        <div className="balcao">
          <Balcao {...hook} categoriaSel={categoriaSel} setCategoriaSel={setCategoriaSel} />
          <EmUso emprestimosAtivos={hook.emprestimosAtivos} historico={hook.historico} registrarDevolucao={hook.registrarDevolucao} devolvendo={hook.devolvendo} />
        </div>
      )}
      {aba === 'estoque' && <Estoque {...hook} categoriaSel={categoriaSel} setCategoriaSel={setCategoriaSel} />}
      {aba === 'historico' && <Historico historico={hook.historico} loadingHistorico={hook.loadingHistorico} />}
    </div>
  );
}
