import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRightLeft, KeyRound, Check, TriangleAlert, List } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { useAvisos } from '../hooks/useAvisos';
import { PERIODS, getDiaAtual, getCurrentPeriod, getDataSaoPaulo } from '../../backend_core/utils/timeHelpers';
import {
  DIA_CURTO, IDX_PERIODO, blocosDoDia, estadoDaSala, ordenarSalas, andarDaSala, rotuloAndar,
  minutos, normalizar, salaCoincide, periodosAfetadosPelaTroca,
} from '../utils/blocos';
import { SegDias } from './ui/Seg';
import { Carregando, Erro, SemPredio } from './ui/Estado';
import GavetaTroca from './GavetaTroca';

const ROTULO = { livre: 'Livre', ocupada: 'Ocupada', interno: 'Interno', trocada: 'Trocada' };

// Fora do horário de aula (antes das 8h, almoço longo, depois das 22h30) a
// Planta mostra o PRÓXIMO período do dia — é o que o balcão vai atender.
const periodoDeReferencia = () => {
  const atual = getCurrentPeriod();
  if (atual) return { code: atual, foraDeHorario: false };
  const agora = getDataSaoPaulo();
  const m = agora.getHours() * 60 + agora.getMinutes();
  const prox = PERIODS.find(p => p.start[0] * 60 + p.start[1] > m);
  return { code: (prox || PERIODS[PERIODS.length - 1]).code, foraDeHorario: true };
};

function Tile({ sala, estado, selecionada, onClick }) {
  let nome, meta;
  if (estado.tipo === 'livre') {
    nome = estado.prox ? `Próxima aula às ${estado.prox.inicio}` : 'Sem mais aulas no dia';
    meta = estado.prox ? `livre até ${estado.prox.inicio}` : 'livre até o fim do dia';
  } else if (estado.tipo === 'trocada') {
    nome = estado.bloco.titulo;
    meta = `→ P${estado.troca.predio_destino} · ${estado.troca.sala_destino}`;
  } else {
    nome = estado.bloco.titulo;
    meta = `até ${estado.bloco.fim} · ${estado.bloco.periodosStr}`;
  }
  return (
    <button className={`sala ${estado.tipo}`} aria-pressed={selecionada} onClick={onClick} aria-label={`Sala ${sala.numero}, ${ROTULO[estado.tipo]}`}>
      <span className="sala-top"><span className="sala-n">{sala.numero}</span><span className="sala-est">{ROTULO[estado.tipo]}</span></span>
      <span className="sala-nome">{nome}</span>
      <span className="sala-meta">{meta}</span>
    </button>
  );
}

export default function LiveMap({ session, acesso, podeVerAvisos, podeEditarGrade, salaInicial, navKey }) {
  const { predioAtivo } = usePredio();
  const { toast } = useUI();
  const navigate = useNavigate();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);
  const trocas = useTrocasSala(predioAtual);
  const { avisos, concluirAviso, isConcluindo } = useAvisos(session, acesso, { ativo: podeVerAvisos });

  const [aoVivo, setAoVivo] = useState(true);
  const [ref, setRef] = useState(periodoDeReferencia);
  const [dia, setDia] = useState(getDiaAtual());
  const [per, setPer] = useState(() => periodoDeReferencia().code);
  const [sala, setSala] = useState(salaInicial || '');
  const [consulta, setConsulta] = useState(salaInicial || '');
  const [trocaAberta, setTrocaAberta] = useState(null);
  const consultaRef = useRef(null);

  // Link /?sala=205 (busca global): seleciona a sala e volta ao "agora"
  useEffect(() => {
    if (!salaInicial) return;
    setSala(salaInicial); setConsulta(salaInicial); setAoVivo(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [salaInicial, navKey]);

  // Relógio: em modo ao vivo acompanha dia/período (fuso de Brasília)
  useEffect(() => {
    const tic = () => {
      const r = periodoDeReferencia();
      setRef(r);
      if (aoVivo) { setDia(getDiaAtual()); setPer(r.code); }
    };
    const t = setInterval(tic, 30000);
    return () => clearInterval(t);
  }, [aoVivo]);

  // Tecla "/" foca a consulta de sala de qualquer ponto da tela
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      e.preventDefault();
      consultaRef.current?.focus();
      consultaRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const salas = useMemo(() => ordenarSalas(rawGradeData?.salas), [rawGradeData]);
  const blocos = useMemo(() => blocosDoDia(rawGradeData?.grade, dia), [rawGradeData, dia]);

  const dados = useMemo(() => {
    const lista = salas.map(s => ({ s, andar: andarDaSala(s), e: estadoDaSala(blocos[s.numero], per, trocas) }));
    const cont = { ocupada: 0, livre: 0, interno: 0, trocada: 0 };
    lista.forEach(x => { cont[x.e.tipo]++; });
    const andares = [...new Set(lista.map(x => x.andar))].sort((a, b) => Number(a) - Number(b))
      .map(a => ({ a, salas: lista.filter(x => x.andar === a) }));
    return { cont, andares };
  }, [salas, blocos, per, trocas]);

  if (!predioAtual) return <SemPredio />;
  if (loading && !rawGradeData) return <Carregando texto="Carregando a grade do prédio…" />;
  if (error) return <Erro texto={error} />;
  if (!salas.length) return <Erro titulo="Este prédio ainda não tem grade" texto="Importe o PDF em Gestão → Atualizar grade." />;

  const hoje = getDiaAtual();
  const ehAgora = aoVivo || (dia === hoje && per === ref.code);
  const P = PERIODS[IDX_PERIODO[per]];

  const escolherSala = (n) => { setSala(n); setConsulta(n); };
  const onConsulta = (v) => {
    setConsulta(v);
    const t = v.trim();
    // Atualiza enquanto digita: número exato abre na hora; 3+ caracteres sem
    // correspondência mostram "não encontrada" com sugestões.
    if (!t || salas.some(s => normalizar(s.numero) === normalizar(t)) || t.length >= 3) setSala(t);
  };
  const submitConsulta = (e) => {
    e.preventDefault();
    const t = normalizar(consulta);
    const s = salas.find(x => normalizar(x.numero) === t) || salas.find(x => normalizar(x.numero).startsWith(t));
    if (s) { escolherSala(s.numero); consultaRef.current?.select(); }
  };
  const mudarPer = (code) => { setPer(code); setAoVivo(false); };
  const passoPer = (d) => mudarPer(PERIODS[Math.min(PERIODS.length - 1, Math.max(0, IDX_PERIODO[per] + d))].code);
  const voltarAoVivo = () => { setAoVivo(true); setDia(getDiaAtual()); setPer(periodoDeReferencia().code); };

  const entregarChave = async (aviso) => {
    try {
      await concluirAviso(aviso.id, 'Chave retirada na secretaria (Baixa Expressa)');
      toast.success(`Chave da sala ${aviso.sala_id} entregue a ${aviso.aluno_nome}.`);
    } catch (err) {
      toast.error(err.message || 'Não foi possível concluir a autorização.');
    }
  };

  return (
    <div className="planta">
      <div className="planta-main">
        <div className="ctx">
          <div>
            <h1 className="t-pg">Planta ao vivo</h1>
            <p className="sub">
              {dia} · período {per} · {P.lb}–{P.end.map(n => String(n).padStart(2, '0')).join(':')}
              {aoVivo && ref.foraDeHorario && ' · fora do horário de aula, mostrando o próximo período'}
            </p>
          </div>
          <div className="ctx-ctrl">
            <SegDias valor={dia} onChange={(d) => { setDia(d); setAoVivo(false); }} />
            <div className="per-step">
              <button onClick={() => passoPer(-1)} aria-label="Período anterior"><ChevronLeft size={16} /></button>
              <select value={per} onChange={(e) => mudarPer(e.target.value)} aria-label="Período">
                {PERIODS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.lb}</option>)}
              </select>
              <button onClick={() => passoPer(1)} aria-label="Próximo período"><ChevronRight size={16} /></button>
            </div>
            <button className={`aovivo ${aoVivo ? 'on' : ''}`} onClick={voltarAoVivo} title="Voltar para o dia e o período atuais"><span className="pt" />Ao vivo</button>
          </div>
          <div className="contagem">
            <span className="chip ocup">{dados.cont.ocupada} ocupadas</span>
            <span className="chip livre">{dados.cont.livre} livres</span>
            {dados.cont.interno > 0 && <span className="chip int">{dados.cont.interno} uso interno</span>}
            {dados.cont.trocada > 0 && <span className="chip troca">{dados.cont.trocada} trocada{dados.cont.trocada > 1 ? 's' : ''}</span>}
          </div>
        </div>

        {dados.andares.map(({ a, salas: doAndar }) => (
          <section key={a} className="andar">
            <h2 className="andar-hd">{rotuloAndar(a)} <span>{doAndar.length} salas · {doAndar.filter(x => x.e.tipo === 'livre').length} livres</span></h2>
            <div className="salas">
              {doAndar.map(x => <Tile key={x.s.numero} sala={x.s} estado={x.e} selecionada={sala === x.s.numero} onClick={() => escolherSala(x.s.numero)} />)}
            </div>
          </section>
        ))}
      </div>

      <aside className="consulta" aria-label="Consulta de sala">
        <form className="cons-busca" onSubmit={submitConsulta}>
          <label htmlFor="cons-inp"><span>Consultar sala</span><span className="kbd" title="Atalho: tecla /">/</span></label>
          <input id="cons-inp" ref={consultaRef} className="inp cons-inp" autoComplete="off" placeholder="Nº da sala" value={consulta} onChange={(e) => onConsulta(e.target.value)} />
          <p className="cons-dica">O professor diz a sala e você digita: o painel atualiza enquanto você digita.</p>
        </form>
        <div className="cons-corpo">
          <PainelSala
            numero={sala} salas={salas} blocos={blocos} trocas={trocas} dia={dia} per={per} ehAgora={ehAgora} hoje={hoje}
            chaves={podeVerAvisos ? (avisos?.chaves || []) : []} isConcluindo={isConcluindo} onEntregar={entregarChave}
            podeEditarGrade={podeEditarGrade} onEscolher={escolherSala}
            onTroca={(b) => setTrocaAberta(b)}
            onLinhaDoTempo={() => navigate(`/linha-do-tempo?${new URLSearchParams({ dia, filtro: sala })}`)}
          />
        </div>
      </aside>

      {trocaAberta && (
        <GavetaTroca bloco={trocaAberta} registro={trocas[trocaAberta.chave]} predioId={predioAtual} onFechar={() => setTrocaAberta(null)} />
      )}
    </div>
  );
}

function PainelSala({ numero, salas, blocos, trocas, dia, per, ehAgora, hoje, chaves, isConcluindo, onEntregar, podeEditarGrade, onEscolher, onTroca, onLinhaDoTempo }) {
  const s = salas.find(x => normalizar(x.numero) === normalizar(numero));
  if (!s) {
    const sug = numero ? salas.filter(x => normalizar(x.numero).startsWith(normalizar(numero))).slice(0, 8) : salas.slice(0, 8);
    return (
      <div className="vazio">
        {numero ? <>Nenhuma sala <b className="mono">{numero}</b> neste prédio.</> : 'Digite o número da sala ou clique num bloco.'}
        {sug.length > 0 && (
          <div className="acoes-linha" style={{ justifyContent: 'center', marginTop: 10 }}>
            {sug.map(x => <button key={x.numero} className="btn sm" onClick={() => onEscolher(x.numero)}>{x.numero}</button>)}
          </div>
        )}
      </div>
    );
  }

  const lista = blocos[s.numero] || [];
  const e = estadoDaSala(lista, per, trocas);
  const quando = ehAgora ? 'Agora' : `${DIA_CURTO[dia]} · período ${per}`;
  const chavesDaSala = chaves.filter(c => salaCoincide(c.sala_id, s.numero));
  const agoraMin = (() => { const d = getDataSaoPaulo(); return d.getHours() * 60 + d.getMinutes(); })();

  let topo;
  if (e.tipo === 'livre') {
    topo = (
      <div className="agora livre">
        <span className="agora-rot">{quando} · livre</span>
        <span className="agora-nome">{e.prox ? `Livre até ${e.prox.inicio}` : 'Livre até o fim do dia'}</span>
        {e.prox && <span className="agora-pe"><span>Próxima: {e.prox.titulo}</span><span className="mono">{e.prox.periodosStr}</span></span>}
      </div>
    );
  } else {
    const b = e.bloco;
    const total = minutos(b.fim) - minutos(b.inicio);
    const decorrido = Math.max(0, Math.min(total, agoraMin - minutos(b.inicio)));
    const progresso = ehAgora && dia === hoje && (
      <>
        <span className="prog"><i style={{ width: `${Math.round((decorrido / total) * 100)}%` }} /></span>
        <span className="agora-pe"><span>Começou às {b.inicio}</span><span>{total - decorrido > 0 ? `termina em ${total - decorrido} min` : 'terminando'}</span></span>
      </>
    );
    if (e.tipo === 'trocada') {
      topo = (
        <div className="aviso-troca" role="alert">
          <span className="agora-rot"><ArrowRightLeft size={13} />{quando} · aula transferida</span>
          <span className="agora-cod">{b.codCred || 'sem código'} · {b.faixa} · {b.inicio}–{b.fim}</span>
          <span className="agora-nome">{b.titulo}</span>
          <div className="destino"><b>{e.troca.sala_destino}</b><span>Prédio {e.troca.predio_destino}</span></div>
          <p className="confira"><TriangleAlert size={14} /><span>Encaminhe o professor para a nova sala{e.troca.motivo ? `. Motivo: ${e.troca.motivo}` : ''}.</span></p>
        </div>
      );
    } else {
      topo = (
        <>
          <div className={`agora ${e.tipo === 'interno' ? 'interno' : ''}`}>
            <span className="agora-rot">{quando} · {e.tipo === 'interno' ? 'uso interno' : 'ocupada'} · per. {b.faixa}</span>
            <span className="agora-cod">{b.codCred || (e.tipo === 'interno' ? 'uso interno' : 'sem código')} · {b.inicio}–{b.fim}</span>
            <span className="agora-nome">{b.titulo}</span>
            {progresso}
          </div>
          {e.tipo === 'ocupada' && <p className="confira"><Check size={14} /><span>Confira a disciplina com o professor antes de entregar a chave.</span></p>}
        </>
      );
    }
  }

  // Dia da sala: blocos + janelas livres intercaladas
  const linhas = [];
  let i = 0;
  const idxPer = IDX_PERIODO[per];
  while (i < PERIODS.length) {
    const b = lista.find(x => x.idxIni === i);
    if (b) {
      const t = trocas[b.chave];
      const afetados = t ? periodosAfetadosPelaTroca(t, b.periodos) : [];
      linhas.push(
        <li key={b.chave} className={`dl ${idxPer >= b.idxIni && idxPer <= b.idxFim ? 'atual' : ''} ${t ? 'trc' : ''}`}>
          <span className="dl-h">{b.inicio}–{b.fim}</span>
          <span className="dl-n">{b.titulo}<small>{t ? `→ P${t.predio_destino} · ${t.sala_destino} (${afetados.join('')}) · ` : ''}{b.codCred || 'interno'} · {b.periodosStr}</small></span>
        </li>
      );
      i = b.idxFim + 1;
    } else {
      let j = i;
      while (j < PERIODS.length && !lista.some(x => x.idxIni <= j && x.idxFim >= j)) j++;
      linhas.push(
        <li key={`l-${i}`} className={`dl gap ${idxPer >= i && idxPer < j ? 'atual' : ''}`}>
          <span className="dl-h">{PERIODS[i].lb}–{String(PERIODS[j - 1].end[0]).padStart(2, '0')}:{String(PERIODS[j - 1].end[1]).padStart(2, '0')}</span>
          <span className="dl-n">Livre</span>
        </li>
      );
      i = j;
    }
  }

  return (
    <>
      <div className="cons-tit">
        <div><h2>Sala {s.numero}</h2><small>{rotuloAndar(andarDaSala(s))}</small></div>
        <span className={`chip ${{ livre: 'livre', ocupada: 'ocup', interno: 'int', trocada: 'troca' }[e.tipo]}`}><span className="pt" />{ROTULO[e.tipo]}</span>
      </div>
      {topo}
      {chavesDaSala.length > 0 && (
        <section>
          <p className="bloco-rot">Autorização de chave</p>
          <div className="pilha">
            {chavesDaSala.map(c => (
              <div key={c.id} className="chave-item">
                <KeyRound size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{c.aluno_nome}</b>
                  <small>{[c.disciplina, c.data_prevista?.split('-').reverse().join('/'), c.periodo && `per. ${c.periodo}`].filter(Boolean).join(' · ')}</small>
                </div>
                <button className="btn sm" onClick={() => onEntregar(c)} disabled={isConcluindo}>Entregar</button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <p className="bloco-rot">{dia === hoje ? 'Hoje' : dia} na sala {s.numero}</p>
        <ul className="dia-lista">{linhas}</ul>
      </section>
      <div className="acoes-linha">
        {e.bloco && (podeEditarGrade || e.tipo === 'trocada') && (
          <button className="btn" onClick={() => onTroca(e.bloco)}><ArrowRightLeft size={16} />{e.tipo === 'trocada' ? 'Ver troca / reimprimir' : 'Registrar troca'}</button>
        )}
        <button className="btn fant" onClick={onLinhaDoTempo}><List size={16} />Ver na linha do tempo</button>
      </div>
    </>
  );
}
