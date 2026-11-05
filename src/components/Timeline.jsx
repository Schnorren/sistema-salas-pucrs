import { useState, useEffect, useMemo, useRef } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, PERIOD_END_TIMES, getDiaAtual, getCurrentPeriod, getProximaOcorrencia, getProximosSeteDias, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCelular } from '../hooks/useCelular';
import MiniGrade from './celular/MiniGrade';
import AgendaSala from './celular/AgendaSala';
import Icone from './celular/Icone';
import { supabase } from '../supabase';
import { useUI } from '../contexts/UIContext';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { parsearNomeAula, periodosAfetadosPelaTroca, blocoDaChave, listarTrocas, horarioDosPeriodos, dataCurta, dataPorExtenso } from '../utils/aulasDoDia';
import { imprimirCartazTroca } from '../utils/cartazTroca';
import ModalAulaTroca from './ModalAulaTroca';
import ModalTrocaSala from './ModalTrocaSala';
import ModalListaTrocas from './ModalListaTrocas';
import logoPucrs from '../assets/logos/pucrs.jpeg';
import logoLiving360 from '../assets/logos/living360.jpeg';

const LOGOS_CARTAZ = { pucrs: logoPucrs, living360: logoLiving360 };

// Fora do componente — funções puras sem dependência de estado.
// parsearNomeAula/periodosAfetadosPelaTroca/blocoDaChave/listarTrocas vêm de
// utils/aulasDoDia (compartilhados com Planta/Próximas aulas/busca do topo).

const normalizeText = (text) => text ? text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : '';

// Normaliza valores de formulário/banco para gravação e comparação
// (null/undefined e '' equivalem; o banco pode devolver número em predio/sala).
const limpar = (v) => String(v ?? '').trim();

// Mensagem pública para falhas nas mutations de troca (RLS nega com 42501)
const descreverErroTroca = (err, fallback) => {
  if (err?.code === '42501') return 'Você não tem permissão para editar trocas de sala (módulo "edicao_grade").';
  if (err?.publico) return err.message;
  return fallback;
};

// Campos de trocas_sala vindos do formulário. Também serve para comparar com o
// registro salvo ("Salvar e imprimir" sem mudança só reimprime).
const camposDaTroca = (aula, form) => {
  const marcados = aula.periodos.filter(p => form.periodosSelecionados?.includes(p));
  const periodos = marcados.length ? marcados : aula.periodos; // nada marcado → bloco inteiro (não deveria ocorrer)
  return {
    predio_destino: limpar(form.predio),
    sala_destino: limpar(form.sala),
    motivo: limpar(form.motivo),
    nome_aula_editado: limpar(form.nomeAulaEditado) || aula.nomeAula || aula.nome || '',
    professor: limpar(form.professor) || null,
    cod_cred: limpar(form.codCred) || null,
    // separado por vírgula: formato inequívoco para periodosAfetadosPelaTroca
    periodos_str: periodos.join(','),
    horario_str: horarioDosPeriodos(periodos),
  };
};

// Fluxo da troca de sala (como numa agenda):
//   clique na aula → ModalAulaTroca (detalhes; botão "Trocar de sala")
//                  → ModalTrocaSala (data, períodos, destino; cartaz recolhido)
//   botão "Trocas" / badge da aba → ModalListaTrocas (reimprimir, editar, desfazer)
// Uma troca vale para UMA data: a próxima ocorrência do dia da aula (hoje
// incluso) — ver getProximosSeteDias no timeHelpers.
//
// canEditGrade = mesma flag do Dashboard ('edicao_grade' ou admin, com prédio).
// Sem ela a aula abre só para consulta/reimpressão — a RLS de trocas_sala é a
// barreira real; aqui é só para não oferecer um fluxo que vai falhar no fim.
// abrirTrocas = valor de ?trocas= (badge da aba): muda a cada clique e abre a lista.
//
// Parâmetros de URL lidos aqui (vêm da Planta e da busca no celular):
//   ?aula=<chave>[&trocar=1] — abre a aula (trocar=1: já no formulário de troca)
//   ?sala=<número>           — no celular, abre a agenda da sala
// No celular (useCelular) a grade vira a mini-grade (16 períodos sem texto) e
// tocar numa sala abre a agenda dela; os modais de troca são os mesmos.
export default function Timeline({ acesso, canEditGrade = false, initialDay, initialFiltro, abrirTrocas }) {
  const celular = useCelular();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const salaAberta = celular ? searchParams.get('sala') : null;
  const aulaDaUrl = searchParams.get('aula');
  const trocarDaUrl = searchParams.get('trocar') === '1';
  const { predioAtivo, predioNome } = usePredio();
  const { toast, showConfirm } = useUI();
  const queryClient = useQueryClient();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const [day, setDay] = useState(initialDay || getDiaAtual());
  const [filtro, setFiltro] = useState(initialFiltro || '');
  const [hoveredAulaId, setHoveredAulaId] = useState(null);
  const [tick, setTick] = useState(0);
  const [autoMode, setAutoMode] = useState(!initialDay); // false se veio de busca
  const inputRef = useRef(null);
  const periodoAtualRef = useRef(null); // ref para o cabeçalho do período atual
  const ultimoPeriodoRef = useRef(getCurrentPeriod()); // último período visto pelo relógio

  const [aulaAberta, setAulaAberta] = useState(null);    // bloco da grade + { data, semana }
  const [formAberto, setFormAberto] = useState(false);   // formulário por cima do painel da aula
  const [listaAberta, setListaAberta] = useState(false);
  const algumModalAberto = !!aulaAberta || listaAberta;

  useEffect(() => {
    if (initialDay) { setDay(initialDay); setAutoMode(false); } // eslint-disable-line react-hooks/set-state-in-effect
    if (initialFiltro) setFiltro(initialFiltro);
  }, [initialDay, initialFiltro]);

  useEffect(() => {
    if (abrirTrocas) setListaAberta(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [abrirTrocas]);

  // Busca + Realtime vivem no hook (compartilhado com o badge do Dashboard)
  const trocasAtivas = useTrocasSala(predioAtual);

  // ?aula= (painel da sala da Planta no celular): abre a aula assim que a grade
  // carrega e tira o parâmetro da URL (voltar não reabre).
  useEffect(() => {
    if (!aulaDaUrl || !rawGradeData?.grade) return;
    const bloco = blocoDaChave(rawGradeData.grade, aulaDaUrl);
    if (bloco) {
      const { data, semana } = getProximaOcorrencia(bloco.dia);
      setAulaAberta({ ...bloco, data, semana }); // eslint-disable-line react-hooks/set-state-in-effect
      setFormAberto(trocarDaUrl && canEditGrade);
    }
    setSearchParams(p => { const n = new URLSearchParams(p); n.delete('aula'); n.delete('trocar'); return n; }, { replace: true });
  }, [aulaDaUrl, trocarDaUrl, rawGradeData, canEditGrade, setSearchParams]);

  // Agenda da sala no celular: abrir empilha no histórico (o Voltar do celular
  // fecha a agenda); fechar desempilha se foi aberta aqui.
  const abrirSala = (sala) => setSearchParams(p => {
    const n = new URLSearchParams(p); n.set('sala', sala); n.delete('trocas'); return n;
  }, { state: { abriuSala: true } });
  const fecharSala = () => {
    if (location.state?.abriuSala) navigate(-1);
    else setSearchParams(p => { const n = new URLSearchParams(p); n.delete('sala'); return n; }, { replace: true });
  };

  const salvarTrocaMutation = useMutation({
    mutationFn: async ({ aula, campos }) => {
        const { error } = await supabase.from('trocas_sala').upsert({
            predio_id: predioAtual,
            aula_unique_key: aula.chave,
            // Semana da DATA da aula (fixada ao abrir o painel), não a de hoje:
            // numa quinta, a troca de "Segunda" é da segunda que vem.
            semana: aula.semana,
            ...campos,
        }, { onConflict: 'predio_id,aula_unique_key,semana' });
        if (error) throw error;
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['trocas_sala', predioAtual] });
    },
    onError: (err) => {
        toast.error(descreverErroTroca(err, 'Não foi possível salvar a troca de sala.'));
    }
  });

  const removerTrocaMutation = useMutation({
    mutationFn: async ({ chave, semana }) => {
        const { data, error } = await supabase
            .from('trocas_sala')
            .delete()
            .eq('predio_id', predioAtual)
            .eq('aula_unique_key', chave)
            .eq('semana', semana)
            .select();
        if (error) throw error;
        // RLS nega DELETE silenciosamente (0 linhas) — transforma em erro visível
        if (!data?.length) {
            const e = new Error('Nenhuma troca foi desfeita — verifique se você tem a permissão "edicao_grade".');
            e.publico = true;
            throw e;
        }
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['trocas_sala', predioAtual] });
        toast.info('Troca de sala desfeita.');
    },
    onError: (err) => {
        toast.error(descreverErroTroca(err, 'Não foi possível desfazer a troca de sala.'));
    }
  });

  // Relógio: a cada minuto compara o período/dia calculados (fuso de Brasília)
  // com o último valor visto, em vez de esperar o minuto exato de início de
  // período — assim o highlight também LIMPA em intervalos longos (13h–14h) e
  // no fim do dia, o dia vira à meia-noite em modo automático, e ticks pulados
  // por throttling de aba em background não perdem a transição.
  useEffect(() => {
    const verificar = () => {
      // Em modo automático, mantém o dia sincronizado (no-op se não mudou)
      if (autoMode) setDay(getDiaAtual());

      const periodo = getCurrentPeriod();
      if (periodo !== ultimoPeriodoRef.current) {
        ultimoPeriodoRef.current = periodo;
        setTick(t => t + 1);

        // Scroll suave para o período atual após a atualização do DOM
        setTimeout(() => {
          periodoAtualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 100);
      }
    };

    const intervaloRelogio = setInterval(verificar, 60000);
    return () => clearInterval(intervaloRelogio);
  }, [autoMode]);

  // Limpeza automática de trocas de semanas anteriores — roda uma vez por sessão em background
  useEffect(() => {
    if (!predioAtual) return;
    const limpar = async () => {
      try { await supabase.rpc('limpar_trocas_antigas'); } catch { // intencional — limpeza em background, erros ignorados
    }
    };
    limpar();
  }, [predioAtual]);

  // Scroll inicial para o período atual quando a aba carrega
  useEffect(() => {
    if (!loading && autoMode) {
      setTimeout(() => {
        periodoAtualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 300);
    }
  }, [loading, autoMode]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length === 1 && !algumModalAberto) inputRef.current?.focus();
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [algumModalAberto]);

  // Esc fecha o modal de cima: o formulário volta ao painel da aula; painel e
  // lista fecham. Diálogo de confirmação aberto (UIContext) tem prioridade.
  useEffect(() => {
    if (!algumModalAberto) return;
    const onEsc = (e) => {
      if (e.key !== 'Escape' || document.querySelector('[data-ui-modal]')) return;
      if (formAberto) setFormAberto(false);
      else if (aulaAberta) setAulaAberta(null);
      else setListaAberta(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [algumModalAberto, formAberto, aulaAberta]);

  const dataProcessed = useMemo(() => {
    try {
      if (!rawGradeData) return null;
      const salasDb = rawGradeData.salas;
      const gradeBruta = rawGradeData.grade;
      if (!salasDb || !gradeBruta || !Array.isArray(salasDb) || !Array.isArray(gradeBruta)) return null;

      // "Agora" só faz sentido quando o dia exibido é o dia de hoje — navegando
      // para outro dia, nenhuma coluna/sala deve aparecer como período atual.
      const isHoje = day === getDiaAtual();
      const periodoAtual = isHoje ? getCurrentPeriod() : null;
      const aulasDoDia = gradeBruta.filter(d => d?.dia_semana?.toLowerCase().includes(day.toLowerCase()));
      const periodosCabecalho = PERIODS.map(p => ({ code: p.code, label: p.lb, isAgora: p.code === periodoAtual }));
      const sortedSalas = [...salasDb].sort((a, b) => (a.numero || '').localeCompare(b.numero || '', undefined, { numeric: true }));

      // Índice "sala|período" → aula (1ª ocorrência, como o find antigo): troca a
      // varredura O(aulas) por célula por um lookup O(1) em salas × 16 períodos.
      const aulasPorSlot = new Map();
      for (const d of aulasDoDia) {
        const numSala = d?.salas?.numero || d?.sala;
        const code = extractPeriodCode(d?.periodo);
        const chave = `${numSala}|${code}`;
        if (numSala && code && !aulasPorSlot.has(chave)) aulasPorSlot.set(chave, d);
      }

      const timeline = sortedSalas.map(salaRef => {
        const slots = PERIODS.map(p => {
          const aulaNoSlot = aulasPorSlot.get(`${salaRef.numero}|${p.code}`);
          const nome = aulaNoSlot ? (aulaNoSlot.nome_aula || aulaNoSlot.disciplinas?.nome || '') : null;

          return {
            periodo: p.code, horario: p.lb, isAgora: p.code === periodoAtual,
            ocupado: !!aulaNoSlot,
            nome,
            nomeNorm: aulaNoSlot ? normalizeText(nome) : '',
            aulaParseada: aulaNoSlot ? parsearNomeAula(nome) : null,
            tipo: aulaNoSlot ? (aulaNoSlot.tipo || (isInternalClass(aulaNoSlot.nome_aula) ? 'Interno' : 'Regular')) : 'Livre',
            disciplinaId: aulaNoSlot ? (aulaNoSlot.disciplina_id || aulaNoSlot.nome_aula || '') : null
          };
        });

        // Blocos de períodos CONSECUTIVOS da mesma aula (adjacência no array de 16
        // períodos = consecutividade — mesma regra de groupConsecutiveClasses()).
        // Cada slot do bloco recebe a chave da troca e os textos derivados, calculados
        // UMA vez aqui em vez de por célula a cada render (hover re-renderiza tudo).
        // Chave estável: dia + sala + período inicial do bloco — independe do texto de
        // nome_aula (sobrevive ao re-import) e distingue dias e prédios.
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i].ocupado) continue;
          let fim = i;
          while (
            fim + 1 < slots.length && slots[fim + 1].ocupado &&
            slots[fim + 1].nome === slots[i].nome &&
            slots[fim + 1].disciplinaId === slots[i].disciplinaId
          ) fim++;
          const bloco = slots.slice(i, fim + 1);
          const first = bloco[0];
          const last = bloco[bloco.length - 1];
          const dadosBloco = {
            aulaUniqueKey: `${day}-${salaRef.numero}-${first.periodo}`,
            periodos: bloco.map(m => m.periodo),
            periodosStr: bloco.map(m => m.periodo).join(''),
            horarioStr: `${first.horario} às ${PERIOD_END_TIMES[last.periodo] || last.horario}`,
            isSequenceAgora: bloco.some(m => m.isAgora)
          };
          bloco.forEach(s => Object.assign(s, dadosBloco));
          i = fim;
        }

        return { sala: salaRef.numero, salaNorm: normalizeText(salaRef.numero), temAulaAgora: slots.some(s => s.isAgora && s.ocupado), slots };
      });

      return { periodosCabecalho, timeline };
    } catch {
      return null;
    }
  }, [rawGradeData, day, tick]);

  // Termo de busca normalizado — calculado 1x por render (era por célula) e
  // comparado contra nomeNorm/salaNorm pré-computados no dataProcessed.
  const termoNormalizado = normalizeText(filtro).trim();

  const filteredTimeline = useMemo(() => {
    if (!dataProcessed?.timeline) return [];
    const termo = normalizeText(filtro).trim();
    if (!termo) return dataProcessed.timeline;
    return dataProcessed.timeline.filter(linha =>
      linha.salaNorm.includes(termo) ||
      linha.slots.some(slot => slot.ocupado && slot.nomeNorm.includes(termo))
    );
  }, [dataProcessed, filtro]);

  // Trocas de hoje até 6 dias à frente, em ordem — a mesma seleção do badge da
  // aba (o hook só devolve trocas vigentes e troca de chave a cada dia).
  const itensTrocas = useMemo(
    () => listarTrocas(trocasAtivas, rawGradeData?.grade, getProximosSeteDias()),
    [trocasAtivas, rawGradeData]
  );
  const totalTrocasNaGrade = itensTrocas.filter(i => i.bloco).length;

  // Aula = bloco da grade (mesma regra de blocos de utils/aulasDoDia) + a data
  // da próxima ocorrência do dia dela — é para essa data que vale a troca.
  const abrirAula = (chave, { editar = false } = {}) => {
    const bloco = blocoDaChave(rawGradeData?.grade, chave);
    if (!bloco) return;
    const { data, semana } = getProximaOcorrencia(bloco.dia);
    setAulaAberta({ ...bloco, data, semana });
    setFormAberto(editar && canEditGrade);
  };

  // Clicar MOSTRA a aula (para todos); trocar de sala é um botão no painel.
  const handleCellClick = (slot) => {
    if (slot.ocupado) abrirAula(slot.aulaUniqueKey);
  };

  // Cartaz a partir do registro salvo (ou do que acabou de ser salvo).
  const imprimir = (aula, registro) => {
    const afetados = periodosAfetadosPelaTroca(registro, aula.periodos);
    const ok = imprimirCartazTroca({
      nomeAula: registro.nome_aula_editado || aula.nomeAula || aula.nome,
      codCred: registro.cod_cred,
      professor: registro.professor,
      predioDestino: registro.predio_destino,
      salaDestino: registro.sala_destino,
      salaOrigem: aula.sala,
      periodos: afetados.join(''),
      horario: horarioDosPeriodos(afetados),
      dia: aula.dia,
      dataAula: aula.data,
      nomePredio: predioNome || acesso?.predioNome || '',
      logos: LOGOS_CARTAZ,
    });
    if (!ok) toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente.');
  };

  // Salvar (e imprimir). Sem mudança em relação ao salvo, não regrava — só
  // reimprime se pedido.
  const salvar = async (form, { imprimir: imprimirDepois }) => {
    const aula = aulaAberta;
    if (!aula || !canEditGrade) return;
    const registro = trocasAtivas[aula.chave];
    const campos = camposDaTroca(aula, form);
    const mudou = !registro || Object.keys(campos).some(k => limpar(registro[k]) !== limpar(campos[k]));
    if (mudou) {
      try {
        await salvarTrocaMutation.mutateAsync({ aula, campos });
      } catch {
        return; // onError da mutation já mostrou o motivo; o formulário continua aberto
      }
      toast.success(`Troca de sala registrada para ${dataPorExtenso(aula.dia, aula.data)}.`);
    }
    if (imprimirDepois) imprimir(aula, { ...registro, ...campos });
    setFormAberto(false);
    setAulaAberta(null);
  };

  // Desfazer apaga o aviso para todos — confirma antes.
  const desfazer = async (chave, semana) => {
    const confirma = await showConfirm('Desfazer esta troca de sala? O aviso deixa de aparecer na grade para todos.', 'Desfazer troca de sala');
    if (confirma) removerTrocaMutation.mutate({ chave, semana });
  };

  // Aula de um item da lista (troca cuja aula saiu da grade: monta o mínimo para o cartaz)
  const aulaDoItem = (item) => item.bloco
    ? { ...item.bloco, data: item.data, semana: item.registro.semana }
    : { chave: item.chave, sala: item.sala, dia: item.dia, data: item.data, semana: item.registro.semana, periodos: item.afetados, nomeAula: item.registro.nome_aula_editado };

  const verNaGrade = (item) => {
    setListaAberta(false);
    setDay(item.dia);
    setAutoMode(false);
    if (celular) abrirSala(item.sala);
    else setFiltro(item.sala);
  };

  const editarDaLista = (item) => {
    if (!item.bloco) return;
    setListaAberta(false);
    setAulaAberta(aulaDoItem(item));
    setFormAberto(true);
  };

  const ultimoDia = getProximosSeteDias()[6];
  const registroAberto = aulaAberta ? trocasAtivas[aulaAberta.chave] || null : null;

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (loading || (!rawGradeData && !error)) return <div className="empty-st">Carregando matriz de horários...</div>;
  if (error) return <div className="empty-st" style={{ color: 'var(--red)' }}>⚠️ Erro: {error}</div>;
  if (!dataProcessed) return <div className="empty-st">Nenhuma matriz encontrada para este prédio.</div>;

  const modais = (
    <>
      {aulaAberta && !formAberto && (
        <ModalAulaTroca
          aula={aulaAberta}
          registro={registroAberto}
          canEditGrade={canEditGrade}
          desfazendo={removerTrocaMutation.isPending}
          onFechar={() => setAulaAberta(null)}
          onTrocar={() => setFormAberto(true)}
          onDesfazer={() => desfazer(aulaAberta.chave, registroAberto?.semana || aulaAberta.semana)}
          onImprimir={() => registroAberto && imprimir(aulaAberta, registroAberto)}
        />
      )}

      {aulaAberta && formAberto && canEditGrade && (
        <ModalTrocaSala
          key={aulaAberta.chave}
          aula={aulaAberta}
          registro={registroAberto}
          salvando={salvarTrocaMutation.isPending}
          onCancelar={() => setFormAberto(false)}
          onSalvar={salvar}
        />
      )}

      {listaAberta && (
        <ModalListaTrocas
          itens={itensTrocas}
          ate={dataPorExtenso(ultimoDia.dia, ultimoDia.data)}
          canEditGrade={canEditGrade}
          desfazendoChave={removerTrocaMutation.isPending ? removerTrocaMutation.variables?.chave : null}
          onFechar={() => setListaAberta(false)}
          onVerNaGrade={verNaGrade}
          onImprimir={(item) => imprimir(aulaDoItem(item), item.registro)}
          onEditar={editarDaLista}
          onDesfazer={(item) => desfazer(item.chave, item.registro.semana)}
        />
      )}
    </>
  );

  if (celular) {
    const dias = getProximosSeteDias();
    const hojeOuDia = dias.find(o => o.dia === day);
    const rotuloDia = hojeOuDia ? `${day}, ${dataCurta(hojeOuDia.data)}${hojeOuDia.emDias === 0 ? ' (hoje)' : ''}` : day;
    const linhaAberta = salaAberta ? dataProcessed.timeline.find(l => l.sala === salaAberta) : null;
    return (
      <div className="cel-pagina" id="vTl">
        {modais}
        {/* Os próximos 7 dias com data: a troca vale para a data do dia escolhido */}
        <div className="cel-dias" role="tablist" aria-label="Dia">
          {dias.map(o => (
            <button
              key={o.dia} type="button" role="tab" aria-selected={o.dia === day}
              className={`cel-dia${o.dia === day ? ' ativo' : ''}`}
              onClick={() => { setDay(o.dia); setAutoMode(o.emDias === 0); }}
            >
              <b>{o.emDias === 0 ? 'Hoje' : o.dia.slice(0, 3)}</b><small>{dataCurta(o.data)}</small>
            </button>
          ))}
        </div>

        {salaAberta ? (
          linhaAberta ? (
            <AgendaSala
              linha={linhaAberta} rotuloDia={rotuloDia}
              trocas={trocasAtivas} onVoltar={fecharSala} onAbrirAula={abrirAula}
            />
          ) : (
            <div className="empty-st">
              A sala {salaAberta} não está na grade deste prédio.<br /><br />
              <button type="button" className="cel-botao" onClick={fecharSala}>Ver todas as salas</button>
            </div>
          )
        ) : (
          <>
            <div className="cel-filtro-linha">
              <label className="cel-filtro">
                <Icone nome="lupa" tamanho={16} />
                <input ref={inputRef} type="search" placeholder="Sala ou disciplina" aria-label="Filtrar por sala ou disciplina" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
                {filtro && <button type="button" className="cel-limpar" onClick={() => setFiltro('')} aria-label="Limpar filtro">×</button>}
              </label>
              <button type="button" className={`cel-btn-trocas${totalTrocasNaGrade > 0 ? ' com' : ''}`} onClick={() => setListaAberta(true)}>
                🔁 Trocas{totalTrocasNaGrade > 0 ? ` ${totalTrocasNaGrade}` : ''}
              </button>
            </div>
            <div className="cel-legenda">
              <span><i style={{ background: 'var(--blue)' }} />Regular</span>
              <span><i style={{ background: 'var(--purple)' }} />Interno</span>
              <span><i style={{ background: 'var(--red)' }} />Trocada</span>
              <span><i style={{ boxShadow: '0 0 0 2px var(--accent) inset' }} />Agora</span>
            </div>
            {filteredTimeline.length === 0 ? (
              <div className="empty-st">Nenhuma sala ou aula encontrada para "{filtro}".</div>
            ) : (
              <MiniGrade linhas={filteredTimeline} periodos={dataProcessed.periodosCabecalho} trocas={trocasAtivas} onAbrirSala={abrirSala} onAbrirAula={abrirAula} />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="view active" id="vTl" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {modais}

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label>Dia:</label>
          {/* Próximos 7 dias a partir de hoje, com data: o dia escolhido é a
              próxima vez que ele acontece — é para essa data que vale a troca */}
          <select value={day} onChange={e => { setDay(e.target.value); setAutoMode(false); }}>
            {getProximosSeteDias().map(o => (
              <option key={o.dia} value={o.dia}>{o.dia}, {dataCurta(o.data)}{o.emDias === 0 ? ' (hoje)' : ''}</option>
            ))}
          </select>
          <button
            onClick={() => { setAutoMode(true); setDay(getDiaAtual()); setTimeout(() => periodoAtualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 100); }}
            title="Voltar para o dia e período atual automaticamente"
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid',
              background: autoMode ? 'rgba(34,197,94,0.15)' : 'var(--panel2)',
              borderColor: autoMode ? 'rgba(34,197,94,0.4)' : 'var(--border)',
              color: autoMode ? '#22c55e' : 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: '5px'
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: autoMode ? '#22c55e' : 'var(--muted)', display: 'inline-block', animation: autoMode ? 'pulse 2s infinite' : 'none' }} />
            Ao vivo
          </button>
          <button
            onClick={() => setListaAberta(true)}
            title="Trocas de sala de hoje e dos próximos 6 dias — reimprimir, editar ou desfazer"
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid',
              background: totalTrocasNaGrade > 0 ? 'rgba(234, 88, 12, 0.12)' : 'var(--panel2)',
              borderColor: totalTrocasNaGrade > 0 ? 'rgba(234, 88, 12, 0.45)' : 'var(--border)',
              color: totalTrocasNaGrade > 0 ? '#ea580c' : 'var(--muted)',
            }}
          >
            🔁 Trocas{totalTrocasNaGrade > 0 ? ` (${totalTrocasNaGrade})` : ''}
          </button>
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input
            ref={inputRef} type="text" placeholder="Pesquisar por disciplina ou sala..."
            value={filtro} onChange={(e) => setFiltro(e.target.value)}
            style={{ width: '100%', padding: '6px 32px 6px 12px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '13px' }}
          />
          {filtro && <span onClick={() => setFiltro('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, fontSize: '12px' }}>✕</span>}
        </div>

        <div className="tl-leg">
          <span><span className="tl-ldot" style={{ background: 'var(--blue-b)', border: '1px solid rgba(26,78,150,.15)' }}></span>Regular</span>
          <span><span className="tl-ldot" style={{ background: 'var(--purple-b)', border: '1px solid rgba(78,51,138,.15)' }}></span>Interno</span>
          <span><span className="tl-ldot" style={{ background: 'var(--red)', border: '1px solid var(--red)' }}></span>Alterada</span>
          <span style={{ color: 'var(--accent)', fontWeight: 500, fontFamily: 'var(--mono)' }}>| = período atual</span>
        </div>
      </div>

      <div className="tl-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <div id="tlInner">
          <div className="tl-hdr">
            <div className="tl-rl">Sala</div>
            <div className="tl-pers">
              {dataProcessed.periodosCabecalho.map(p => (
                <div
                  key={p.code}
                  ref={p.isAgora ? periodoAtualRef : null}
                  className={`tl-phd ${p.isAgora ? 'now' : ''}`}
                >
                  {p.code}<br />
                  <span style={{ fontSize: '0.65rem', fontWeight: 'normal', opacity: 0.8 }}>
                    {p.label} - {PERIOD_END_TIMES[p.code] || ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {filteredTimeline.length === 0 ? (
            <div className="empty-st" style={{ padding: '40px' }}>Nenhuma sala ou aula encontrada para "{filtro}".</div>
          ) : (
            filteredTimeline.map(linha => (
              <div key={linha.sala} className="tl-row" style={{ display: 'flex', minHeight: '65px', alignItems: 'stretch' }}>
                <div className={`tl-rn ${linha.temAulaAgora ? 'on' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
                  {linha.sala}
                </div>
                <div className="tl-cells" style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
                  {linha.slots.map((slot) => {
                    const statusClass = !slot.ocupado ? 'empty' : (slot.tipo === 'Interno' ? 'int' : 'reg');
                    // Derivados por célula já vêm prontos do dataProcessed
                    // (aulaParseada, aulaUniqueKey, periodos, periodosStr,
                    // horarioStr, isSequenceAgora) — aqui só resta cruzar com o estado vivo.
                    const aula = slot.aulaParseada;
                    const isHovered = !!hoveredAulaId && hoveredAulaId === slot.aulaUniqueKey;
                    // O registro vale pro bloco inteiro, mas a troca pode cobrir só uma
                    // parte dos períodos (ex: LM de um bloco LMNP) — só marca em vermelho
                    // os períodos realmente afetados.
                    const registroTroca = slot.ocupado ? trocasAtivas[slot.aulaUniqueKey] : null;
                    const temTroca = registroTroca && periodosAfetadosPelaTroca(registroTroca, slot.periodos).includes(slot.periodo)
                        ? registroTroca
                        : null;
                    const isSequenceAgora = !!slot.isSequenceAgora;

                    const isSearchMatch = termoNormalizado && slot.ocupado && slot.nomeNorm.includes(termoNormalizado);
                    const isRoomMatch = termoNormalizado && linha.salaNorm.includes(termoNormalizado);

                    const tooltip = slot.ocupado
                        ? `${slot.nome}\nPeríodos: ${slot.periodosStr}\nHorário: ${slot.horarioStr}\n\n${canEditGrade ? 'Clique para ver a aula ou trocar de sala' : 'Clique para ver a aula'}`
                        : `Livre (${slot.horario})`;

                    return (
                      <div
                        key={slot.periodo}
                        className={`tl-cell ${statusClass} ${slot.isAgora ? 'now' : ''}`}
                        title={tooltip}
                        onClick={() => handleCellClick(slot)}
                        onMouseEnter={() => slot.ocupado && setHoveredAulaId(slot.aulaUniqueKey)}
                        onMouseLeave={() => setHoveredAulaId(null)}
                        style={{
                          flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 'auto', minHeight: '100%', boxSizing: 'border-box', cursor: slot.ocupado ? 'pointer' : 'default', transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden',
                          
                          backgroundColor: temTroca ? 'rgba(239, 68, 68, 0.15)' : (isHovered ? 'rgba(255, 255, 255, 0.15)' : (isSearchMatch ? 'rgba(59, 130, 246, 0.25)' : undefined)),
                          
                          outline: isHovered ? '2px solid var(--accent)' : (isSearchMatch ? '2px solid #3b82f6' : (isRoomMatch ? '1px dashed var(--border2)' : (isSequenceAgora && !slot.isAgora ? '3px solid rgba(200, 151, 58, 0.5)' : 'none'))),
                          
                          outlineOffset: '-2px', zIndex: isHovered || isSearchMatch ? 10 : 1,
                          borderColor: temTroca ? 'rgba(239, 68, 68, 0.4)' : undefined,
                          boxShadow: isHovered ? '0 0 10px rgba(0,0,0,0.5)' : (isSearchMatch ? '0 0 8px rgba(59, 130, 246, 0.4)' : 'none')
                        }}
                      >
                        {temTroca && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--red)', color: '#fff', fontSize: '8px', fontWeight: 'bold', textAlign: 'center', padding: '2px 0', zIndex: 2 }}>
                                🔁 P.{temTroca.predio_destino} - SL.{temTroca.sala_destino}
                            </div>
                        )}

                        {slot.ocupado && (
                          <div style={{ marginTop: temTroca ? '14px' : '0' }}>
                            <div style={{
                              fontSize: '0.75rem', lineHeight: 1.3, fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              color: temTroca ? 'var(--red)' : ((isHovered || isSearchMatch) ? 'var(--text)' : undefined)
                            }}>
                              {aula.nomeAula}
                            </div>
                            {aula.codCred && (
                              <div style={{ fontSize: '0.65rem', opacity: (isHovered || isSearchMatch) ? 1 : 0.7, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {aula.codCred}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div >
  );
}