import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, TriangleAlert, Plus, History, Check, MessageSquare, Trash2, Search } from 'lucide-react';
import { useAvisos } from '../hooks/useAvisos';
import { useGrade } from '../hooks/useGrade';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { PERIODS, getDataSaoPaulo } from '../../backend_core/utils/timeHelpers';
import { DIAS_SEMANA, blocosDoDia, normalizar, ordenarSalas } from '../utils/blocos';
import Gaveta from './ui/Gaveta';
import { Seg } from './ui/Seg';
import { Carregando, Erro } from './ui/Estado';

const PRIORIDADE = {
  ALTA: { cls: 'alta', rotulo: 'Alta' },
  NORMAL: { cls: 'media', rotulo: 'Normal' },
  BAIXA: { cls: 'baixa', rotulo: 'Baixa' },
};
const prioDe = (p) => (PRIORIDADE[String(p || '').toUpperCase()] ? String(p).toUpperCase() : 'NORMAL');
const dataBR = (iso) => (typeof iso === 'string' && iso.includes('-') ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
const hojeISO = () => { const d = getDataSaoPaulo(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// O backend anexa cada nota ao fim da descrição como
// "\n\n📌 [dd/mm/aaaa hh:mm - fulano]: texto". Para leitura, separa as notas.
const separarNotas = (descricao) => {
  const partes = String(descricao || '').split(/\n\n📌 \[/);
  const corpo = partes.shift();
  const notas = partes.map(p => {
    const m = p.match(/^(.*?) - (.*?)\]: ([\s\S]*)$/);
    return m ? { quando: m[1], quem: m[2], texto: m[3] } : { quando: '', quem: '', texto: p };
  });
  return { corpo, notas };
};

export default function MuralAvisos({ session, acesso }) {
  const { showConfirm, toast } = useUI();
  const {
    avisos, loading, error,
    isCriando, isConcluindo, isComentando, isExcluindo,
    criarAviso, concluirAviso, excluirAviso, adicionarComentario
  } = useAvisos(session, acesso);

  const [filtro, setFiltro] = useState('todos');
  const [novoAberto, setNovoAberto] = useState(false);
  const [concluindo, setConcluindo] = useState(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [notaPara, setNotaPara] = useState(null);
  const [nota, setNota] = useState('');

  const chaves = avisos?.chaves || [];
  const gerais = avisos?.gerais || [];
  const altas = gerais.filter(a => prioDe(a.prioridade) === 'ALTA');
  const chavesVisiveis = filtro === 'alta' ? [] : chaves;
  const geraisVisiveis = filtro === 'chaves' ? [] : filtro === 'alta' ? altas : gerais;

  const entregarChave = async (aviso) => {
    try {
      await concluirAviso(aviso.id, 'Chave retirada na secretaria (Baixa Expressa)');
      toast.success(`Chave da sala ${aviso.sala_id} entregue a ${aviso.aluno_nome}.`);
    } catch (err) { toast.error(err.message || 'Não foi possível concluir o registro.'); }
  };

  const excluir = async (id) => {
    const ok = await showConfirm('O registro some do mural e do histórico.', 'Apagar registro', { confirmar: 'Apagar', perigo: true });
    if (!ok) return;
    try { await excluirAviso(id); } catch (err) { toast.error(err.message || 'Não foi possível apagar o registro.'); }
  };

  const salvarNota = async (e) => {
    e.preventDefault();
    if (!nota.trim() || isComentando) return;
    try {
      await adicionarComentario(notaPara, nota.trim());
      setNotaPara(null); setNota('');
    } catch (err) { toast.error(err.message || 'Não foi possível salvar a nota.'); }
  };

  if (loading && !chaves.length && !gerais.length) return <Carregando texto="Carregando o mural…" />;
  if (error) return <Erro texto={error} />;

  return (
    <div className="pg">
      <div className="pg-hd">
        <div><h1 className="t-pg">Avisos</h1><p className="sub">Autorizações de chave e intercorrências do prédio</p></div>
        <div className="pg-acoes">
          <button className="btn" onClick={() => setHistoricoAberto(true)}><History size={16} />Histórico</button>
          <button className="btn pri" onClick={() => setNovoAberto(true)} disabled={isCriando}><Plus size={16} />Novo registro</button>
        </div>
      </div>

      <div className="filtros" role="group" aria-label="Filtrar">
        {[['todos', 'Todos', chaves.length + gerais.length], ['chaves', 'Chaves', chaves.length], ['alta', 'Prioridade alta', altas.length]].map(([v, l, n]) => (
          <button key={v} className="f-chip" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{l} <span className="cont">{n}</span></button>
        ))}
      </div>

      <div className="avisos">
        <section>
          <div className="sec-hd"><KeyRound size={18} /><h2 className="t-sec">Autorizações de chave</h2><span className="cont">{chavesVisiveis.length}</span></div>
          <div className="pilha">
            {chavesVisiveis.length === 0 && <div className="vazio">Nenhuma autorização pendente.</div>}
            {chavesVisiveis.map(a => (
              <article key={a.id} className="aviso chave">
                <div className="aviso-top">
                  <b>{a.aluno_nome}</b>
                  <button className="icon-btn" onClick={() => excluir(a.id)} disabled={isExcluindo} aria-label="Apagar autorização" title="Apagar"><Trash2 size={15} /></button>
                </div>
                <div className="meta-linha">
                  <span>Sala <b className="mono">{a.sala_id}</b></span>
                  {a.disciplina && <span><b>{a.disciplina}</b></span>}
                  <span>{a.data_prevista === hojeISO() ? 'Hoje' : dataBR(a.data_prevista)}</span>
                  {a.periodo && <span>Per. <b className="mono">{a.periodo}</b></span>}
                </div>
                {a.created_at && <div className="meta-linha"><span>Registrada em {dataHora(a.created_at)}</span></div>}
                <div className="acoes-linha">
                  <button className="btn pri sm" onClick={() => entregarChave(a)} disabled={isConcluindo}><Check size={14} />{isConcluindo ? 'Registrando…' : 'Entregar chave'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="sec-hd"><TriangleAlert size={18} /><h2 className="t-sec">Avisos e intercorrências</h2><span className="cont">{geraisVisiveis.length}</span></div>
          <div className="pilha">
            {geraisVisiveis.length === 0 && <div className="vazio">Nenhum aviso ativo.</div>}
            {geraisVisiveis.map(a => {
              const p = PRIORIDADE[prioDe(a.prioridade)];
              const { corpo, notas } = separarNotas(a.descricao);
              return (
                <article key={a.id} className={`aviso ${p.cls}`}>
                  <div className="aviso-top">
                    <b>{a.titulo}</b>
                    <span className={`chip ${p.cls === 'baixa' ? 'contorno' : p.cls}`}>{p.rotulo}</span>
                    <button className="icon-btn" onClick={() => excluir(a.id)} disabled={isExcluindo} aria-label="Apagar aviso" title="Apagar"><Trash2 size={15} /></button>
                  </div>
                  {corpo && <p>{corpo}</p>}
                  <div className="meta-linha">
                    {a.created_at && <span>Aberto em {dataHora(a.created_at)}</span>}
                    <span>{notas.length} nota{notas.length === 1 ? '' : 's'}</span>
                  </div>
                  {notas.map((n, i) => (
                    <div key={i} className="nota">{n.quem && <><small>{n.quem} · {n.quando}</small><br /></>}{n.texto}</div>
                  ))}
                  {notaPara === a.id && (
                    <form className="nota-form" onSubmit={salvarNota}>
                      <input className="inp" autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escreva a nota e tecle Enter" maxLength={1000} aria-label="Nota" />
                      <button className="btn pri" disabled={!nota.trim() || isComentando}>{isComentando ? 'Salvando…' : 'Salvar'}</button>
                      <button type="button" className="btn" onClick={() => { setNotaPara(null); setNota(''); }}>Cancelar</button>
                    </form>
                  )}
                  <div className="acoes-linha">
                    <button className="btn sm" onClick={() => setConcluindo(a)} disabled={isConcluindo}><Check size={14} />Marcar resolvido</button>
                    {notaPara !== a.id && <button className="btn fant sm" onClick={() => { setNotaPara(a.id); setNota(''); }}><MessageSquare size={14} />Adicionar nota</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {novoAberto && (
        <GavetaNovoAviso
          isPending={isCriando}
          onFechar={() => setNovoAberto(false)}
          onSalvar={async (dados) => {
            try { await criarAviso(dados); setNovoAberto(false); toast.success('Registro criado e visível para a equipe.'); }
            catch (err) { toast.error(err.message || 'Não foi possível salvar o registro.'); }
          }}
        />
      )}
      {concluindo && (
        <GavetaConcluir
          aviso={concluindo} isPending={isConcluindo}
          onFechar={() => setConcluindo(null)}
          onConfirmar={async (obs) => {
            try { await concluirAviso(concluindo.id, obs); setConcluindo(null); toast.success('Aviso concluído e movido para o histórico.'); }
            catch (err) { toast.error(err.message || 'Não foi possível concluir o registro.'); }
          }}
        />
      )}
      {historicoAberto && <GavetaHistorico session={session} acesso={acesso} onFechar={() => setHistoricoAberto(false)} />}
    </div>
  );
}

// Novo registro. Na autorização de chave, sala + data puxam da grade as aulas
// daquela sala no dia: escolher uma preenche disciplina e períodos.
function GavetaNovoAviso({ onFechar, onSalvar, isPending }) {
  const { predioAtivo } = usePredio();
  const { toast } = useUI();
  const [tipo, setTipo] = useState('CHAVE');
  const [chave, setChave] = useState({ aluno_nome: '', sala_id: '', data_prevista: hojeISO(), disciplina: '', periodos: [] });
  const [geral, setGeral] = useState({ titulo: '', prioridade: 'NORMAL', descricao: '' });
  const [disciplinaManual, setDisciplinaManual] = useState(false);
  const { dados: grade } = useGrade(predioAtivo || '');

  const diaDaData = useMemo(() => {
    const [y, m, d] = String(chave.data_prevista || '').split('-').map(Number);
    if (!y) return null;
    const dow = new Date(y, m - 1, d).getDay(); // data "pura", sem fuso
    return DIAS_SEMANA[(dow + 6) % 7];
  }, [chave.data_prevista]);

  const salaDaGrade = useMemo(
    () => ordenarSalas(grade?.salas).find(s => normalizar(s.numero) === normalizar(chave.sala_id))?.numero || null,
    [grade, chave.sala_id]
  );
  const aulasDoDia = useMemo(
    () => (salaDaGrade && diaDaData ? blocosDoDia(grade?.grade, diaDaData)[salaDaGrade] || [] : []),
    [grade, salaDaGrade, diaDaData]
  );

  const escolherAula = (b) => {
    setChave(c => ({ ...c, disciplina: b.titulo, periodos: [...b.periodos] }));
    setDisciplinaManual(false);
  };
  const togglePer = (code) => setChave(c => {
    const periodos = c.periodos.includes(code) ? c.periodos.filter(p => p !== code) : [...c.periodos, code];
    // Mantém a ordem dos períodos da PUCRS (E1 depois de E) e preenche a
    // disciplina pela grade enquanto o usuário não a editar à mão.
    periodos.sort((a, b) => PERIODS.findIndex(p => p.code === a) - PERIODS.findIndex(p => p.code === b));
    let disciplina = c.disciplina;
    if (!disciplinaManual) {
      const nomes = [...new Set(aulasDoDia.filter(b => b.periodos.some(p => periodos.includes(p))).map(b => b.titulo))];
      disciplina = nomes.join(' / ');
    }
    return { ...c, periodos, disciplina };
  });

  const submit = (e) => {
    e.preventDefault();
    if (isPending) return;
    // Envia só os campos do tipo ativo (não vaza CHAVE num GERAL e vice-versa)
    if (tipo === 'CHAVE') {
      if (!chave.periodos.length) { toast.error('Selecione pelo menos um período.'); return; }
      onSalvar({ tipo, aluno_nome: chave.aluno_nome, sala_id: chave.sala_id, disciplina: chave.disciplina, data_prevista: chave.data_prevista, periodo: chave.periodos.join('') });
      return;
    }
    onSalvar({ tipo, titulo: geral.titulo, prioridade: geral.prioridade, descricao: geral.descricao });
  };

  return (
    <Gaveta
      titulo="Novo registro" sub="Fica visível para toda a equipe do prédio na hora." onFechar={onFechar}
      rodape={<><span className="esp" /><button type="button" className="btn" onClick={onFechar}>Cancelar</button><button type="submit" form="form-aviso" className="btn pri" disabled={isPending}>{isPending ? 'Salvando…' : 'Salvar registro'}</button></>}
    >
      <form id="form-aviso" onSubmit={submit} style={{ display: 'contents' }}>
        <Seg rotulo="Tipo de registro" valor={tipo} onChange={setTipo} opcoes={[['CHAVE', 'Autorização de chave'], ['GERAL', 'Aviso ou intercorrência']]} />
        {tipo === 'CHAVE' ? (
          <>
            <div className="campo"><label htmlFor="na-aluno">Quem vai retirar a chave</label><input id="na-aluno" data-autofocus className="inp" required maxLength={120} placeholder="Ex.: Ana Beatriz Rocha" value={chave.aluno_nome} onChange={(e) => setChave({ ...chave, aluno_nome: e.target.value })} /></div>
            <div className="linha-campos">
              <div className="campo"><label htmlFor="na-sala">Sala</label><input id="na-sala" className="inp" required placeholder="Ex.: 302" value={chave.sala_id} onChange={(e) => setChave({ ...chave, sala_id: e.target.value })} /></div>
              <div className="campo"><label htmlFor="na-data">Data</label><input id="na-data" className="inp" type="date" required value={chave.data_prevista} onChange={(e) => setChave({ ...chave, data_prevista: e.target.value })} /></div>
            </div>
            {salaDaGrade && diaDaData && (
              <div className="campo">
                <span className="rot">Aulas da sala {salaDaGrade} · {diaDaData.toLowerCase()} <span className="dica">· escolha uma para preencher</span></span>
                {aulasDoDia.length === 0
                  ? <span className="dica">Nenhuma aula na grade para esse dia. Preencha a disciplina e os períodos à mão.</span>
                  : <div className="pilha" style={{ gap: 6 }}>{aulasDoDia.map(b => {
                      const ativa = b.periodos.every(p => chave.periodos.includes(p)) && chave.disciplina === b.titulo;
                      return (
                        <button key={b.chave} type="button" className="item-btn" style={ativa ? { borderColor: 'var(--acao-texto)', background: 'var(--acao-suave)' } : undefined} onClick={() => escolherAula(b)}>
                          <b>{b.titulo}</b><small>{b.periodosStr} · {b.inicio}–{b.fim}{b.codCred ? ` · ${b.codCred}` : ''}</small>
                        </button>
                      );
                    })}</div>}
              </div>
            )}
            <div className="campo">
              <span className="rot">Períodos</span>
              <div className="pers">
                {PERIODS.map(p => <button key={p.code} type="button" className="per-chip" style={{ minWidth: 40, height: 32 }} aria-pressed={chave.periodos.includes(p.code)} onClick={() => togglePer(p.code)} title={p.lb}>{p.code}</button>)}
              </div>
            </div>
            <div className="campo"><label htmlFor="na-disc">Disciplina <span className="dica">{disciplinaManual ? 'editada à mão' : 'vem da grade; dá para editar'}</span></label><input id="na-disc" className="inp" required maxLength={200} placeholder="Escolha uma aula acima ou digite" value={chave.disciplina} onChange={(e) => { setDisciplinaManual(true); setChave({ ...chave, disciplina: e.target.value }); }} /></div>
          </>
        ) : (
          <>
            <div className="campo"><label htmlFor="na-titulo">Título</label><input id="na-titulo" data-autofocus className="inp" required maxLength={200} placeholder="Ex.: Projetor da sala 302 com defeito" value={geral.titulo} onChange={(e) => setGeral({ ...geral, titulo: e.target.value })} /></div>
            <div className="campo"><span className="rot">Prioridade</span><Seg rotulo="Prioridade" valor={geral.prioridade} onChange={(v) => setGeral({ ...geral, prioridade: v })} opcoes={[['ALTA', 'Alta'], ['NORMAL', 'Normal'], ['BAIXA', 'Baixa']]} /></div>
            <div className="campo"><label htmlFor="na-desc">Descrição</label><textarea id="na-desc" className="inp" required rows={5} maxLength={4000} placeholder="O que aconteceu, onde, e o que já foi feito" value={geral.descricao} onChange={(e) => setGeral({ ...geral, descricao: e.target.value })} /></div>
          </>
        )}
      </form>
    </Gaveta>
  );
}

function GavetaConcluir({ aviso, onFechar, onConfirmar, isPending }) {
  const [obs, setObs] = useState('');
  return (
    <Gaveta
      titulo="Marcar como resolvido" sub={aviso.titulo} onFechar={onFechar}
      rodape={<><span className="esp" /><button type="button" className="btn" onClick={onFechar}>Cancelar</button><button type="button" className="btn pri" disabled={isPending} onClick={() => onConfirmar(obs.trim())}>{isPending ? 'Concluindo…' : 'Concluir aviso'}</button></>}
    >
      <div className="campo">
        <label htmlFor="rs-obs">O que foi feito <span className="dica">opcional</span></label>
        <textarea id="rs-obs" data-autofocus className="inp" rows={5} maxLength={1000} placeholder="Ex.: Técnico trocou o dreno às 11h." value={obs} onChange={(e) => setObs(e.target.value)} />
        <span className="dica">Vai para o histórico de auditoria junto com a data de conclusão.</span>
      </div>
    </Gaveta>
  );
}

async function parseResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

function GavetaHistorico({ session, acesso, onFechar }) {
  const { predioAtivo } = usePredio();
  const predioId = predioAtivo || acesso?.predioId || '';
  const [aba, setAba] = useState('CHAVE');
  const [busca, setBusca] = useState('');
  const { data: historico, isLoading, error } = useQuery({
    queryKey: ['avisos_historico', predioId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/historico`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}`, 'x-predio-id': predioId }
      });
      return parseResponse(res);
    },
    enabled: !!predioId && !!session?.access_token,
    staleTime: 60 * 1000 // histórico não muda rápido
  });
  const t = normalizar(busca);
  const lista = (aba === 'CHAVE' ? historico?.chaves : historico?.gerais) || [];
  const filtrada = lista.filter(i => !t || normalizar(`${i.titulo || ''} ${i.aluno_nome || ''} ${i.sala_id || ''} ${i.obs_conclusao || ''}`).includes(t));

  return (
    <Gaveta titulo="Histórico de registros" sub="Autorizações e avisos já encerrados" onFechar={onFechar} larga
      rodape={<><span className="esp" /><button className="btn" onClick={onFechar}>Fechar</button></>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Seg rotulo="Tipo" valor={aba} onChange={setAba} opcoes={[['CHAVE', 'Autorizações de chave'], ['GERAL', 'Avisos e intercorrências']]} />
        <div className="campo-busca" style={{ flex: 1, minWidth: 200 }}><Search size={16} /><input className="inp" data-autofocus placeholder="Buscar por título, aluno ou sala" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      </div>
      {isLoading ? <Carregando texto="Carregando o histórico…" />
        : error ? <Erro texto={error.message} />
          : filtrada.length === 0 ? <div className="vazio">Nenhum registro encontrado.</div>
            : (
              <div className="tabela-wrap">
                <table className="dados">
                  <thead><tr><th>Referência</th><th>Concluído em</th>{aba === 'GERAL' && <th>Observação final</th>}</tr></thead>
                  <tbody>
                    {filtrada.map(i => (
                      <tr key={i.id}>
                        <td>{i.tipo === 'CHAVE' ? <><b>Sala {i.sala_id}</b> · {i.aluno_nome}</> : <b>{i.titulo}</b>}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{dataHora(i.concluido_em)}</td>
                        {aba === 'GERAL' && <td style={{ color: 'var(--text-2)' }}>{i.obs_conclusao || '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </Gaveta>
  );
}
