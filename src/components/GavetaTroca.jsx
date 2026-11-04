import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import { useUI } from '../contexts/UIContext';
import Gaveta from './ui/Gaveta';
import { PERIODS, PERIOD_END_TIMES, getSemanaAtual } from '../../backend_core/utils/timeHelpers';
import { periodosAfetadosPelaTroca } from '../utils/blocos';
import { abrirCartazTroca } from '../utils/cartazTroca';
import logoPucrs from '../assets/logos/pucrs.jpeg';
import logoLiving360 from '../assets/logos/living360.jpeg';

// Normaliza valores de formulário/banco para gravação e comparação
// (null/undefined e '' equivalem; o banco pode devolver número em predio/sala).
const limpar = (v) => String(v ?? '').trim();

// Mensagem pública para falhas nas mutations de troca (RLS nega com 42501)
const descreverErroTroca = (err, fallback) => {
  if (err?.code === '42501') return 'Você não tem permissão para editar trocas de sala (módulo "Edição da grade").';
  if (err?.publico) return err.message;
  return fallback;
};

// Períodos efetivamente selecionados dentro do bloco + o intervalo de horário
// correspondente. periodosStrDb vai separado por vírgula (formato inequívoco
// para periodosAfetadosPelaTroca); periodosStr é a versão compacta ("LM").
const calcularSelecaoPeriodos = (bloco, periodosSelecionados) => {
  const todos = bloco.periodos;
  const selecionados = todos.filter(p => periodosSelecionados?.includes(p));
  const usados = selecionados.length ? selecionados : todos;
  const primeiro = PERIODS.find(p => p.code === usados[0]);
  const horarioStr = primeiro ? `${primeiro.lb} às ${PERIOD_END_TIMES[usados[usados.length - 1]] || primeiro.lb}` : `${bloco.inicio} às ${bloco.fim}`;
  return { periodos: usados, periodosStrDb: usados.join(','), periodosStr: usados.join(''), horarioStr };
};

// Painel de troca de sala (alteração de aula) — escrito direto em trocas_sala
// pela anon key; a permissão "edicao_grade" é aplicada pela RLS.
// `bloco` vem de utils/blocos.js; `registro` é a troca já salva (ou undefined).
export default function GavetaTroca({ bloco, registro, predioId, onFechar }) {
  const { toast, showConfirm } = useUI();
  const queryClient = useQueryClient();
  const formRef = useRef(null);
  const [form, setForm] = useState(() => ({
    predio: limpar(registro?.predio_destino),
    sala: limpar(registro?.sala_destino),
    motivo: registro?.motivo || '',
    // Auto-preenchimento: cod/cred e nome limpo do padrão "97316-04/1 - NOME"
    nomeAulaEditado: registro?.nome_aula_editado || bloco.nomeAula,
    professor: registro?.professor || '',
    codCred: registro?.cod_cred || bloco.codCred,
    // Bloco (LMNP) começa todo selecionado; reabrir uma troca salva com parte
    // dos períodos restaura só aquela parte marcada.
    periodosSelecionados: periodosAfetadosPelaTroca(registro, bloco.periodos),
  }));
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  const salvarMutation = useMutation({
    // Recebe o form no payload (em vez de ler da closure): evita gravar estado
    // defasado quando a mutation é disparada fora do submit (fluxo de impressão).
    mutationFn: async (f) => {
      const { periodosStrDb, horarioStr } = calcularSelecaoPeriodos(bloco, f.periodosSelecionados);
      const { error } = await supabase.from('trocas_sala').upsert({
        predio_id: predioId,
        aula_unique_key: bloco.chave,
        semana: getSemanaAtual(),
        predio_destino: limpar(f.predio),
        sala_destino: limpar(f.sala),
        motivo: limpar(f.motivo),
        nome_aula_editado: limpar(f.nomeAulaEditado),
        professor: limpar(f.professor) || null,
        cod_cred: limpar(f.codCred) || null,
        periodos_str: periodosStrDb,
        horario_str: horarioStr
      }, { onConflict: 'predio_id,aula_unique_key,semana' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trocas_sala', predioId] }),
    onError: (err) => toast.error(descreverErroTroca(err, 'Não foi possível salvar a troca de sala.')),
  });

  const removerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('trocas_sala').delete()
        .eq('predio_id', predioId).eq('aula_unique_key', bloco.chave).eq('semana', getSemanaAtual())
        .select();
      if (error) throw error;
      // RLS nega DELETE silenciosamente (0 linhas) — transforma em erro visível
      if (!data?.length) {
        const e = new Error('Nenhuma troca foi removida. Confira se você tem o módulo "Edição da grade".');
        e.publico = true;
        throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trocas_sala', predioId] });
      toast.info('Troca de sala removida.');
      onFechar();
    },
    onError: (err) => toast.error(descreverErroTroca(err, 'Não foi possível remover a troca de sala.')),
  });

  const pendente = salvarMutation.isPending || removerMutation.isPending;
  const sel = calcularSelecaoPeriodos(bloco, form.periodosSelecionados);

  // Nunca deixa desmarcar o último período (a troca precisa cobrir pelo menos 1)
  const togglePeriodo = (p) => setForm(f => {
    const ja = f.periodosSelecionados.includes(p);
    if (ja && f.periodosSelecionados.length === 1) return f;
    return { ...f, periodosSelecionados: ja ? f.periodosSelecionados.filter(x => x !== p) : [...f.periodosSelecionados, p] };
  });

  const salvar = (e) => {
    e.preventDefault();
    salvarMutation.mutate(form, {
      onSuccess: () => { toast.success(`Troca salva: ${bloco.titulo} vai para P${limpar(form.predio)} · ${limpar(form.sala)}.`); onFechar(); }
    });
  };

  // Remoção é destrutiva (o aviso some para todos os clientes) — confirma antes.
  const remover = async () => {
    const ok = await showConfirm('A troca deixa de aparecer na grade para todos.', 'Remover troca de sala', { confirmar: 'Remover', perigo: true });
    if (ok) removerMutation.mutate();
  };

  const imprimir = async () => {
    // Força a validação dos campos obrigatórios também no fluxo de impressão
    if (!formRef.current?.reportValidity()) return;
    // O cartaz precisa refletir o que está salvo: regrava quando o form difere
    // do registro (ou não há registro). Sem alterações não grava — quem não tem
    // "edicao_grade" segue podendo reimprimir.
    const difere = !registro ||
      limpar(registro.predio_destino) !== limpar(form.predio) ||
      limpar(registro.sala_destino) !== limpar(form.sala) ||
      limpar(registro.motivo) !== limpar(form.motivo) ||
      limpar(registro.nome_aula_editado) !== limpar(form.nomeAulaEditado) ||
      limpar(registro.professor) !== limpar(form.professor) ||
      limpar(registro.cod_cred) !== limpar(form.codCred) ||
      limpar(registro.periodos_str) !== sel.periodosStrDb;
    if (difere) {
      try { await salvarMutation.mutateAsync(form); } catch { return; } // onError já avisou
    }
    const ok = abrirCartazTroca({
      nomeAula: form.nomeAulaEditado || bloco.nome,
      codCred: form.codCred, professor: form.professor,
      predioDestino: form.predio, salaDestino: form.sala,
      periodos: sel.periodosStr, horario: sel.horarioStr,
      salaOrigem: bloco.sala, dia: bloco.dia,
    });
    if (!ok) toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.');
  };

  return (
    <Gaveta
      titulo={registro ? 'Editar troca de sala' : 'Registrar troca de sala'}
      sub="Vale para esta semana e some sozinha na virada da semana."
      onFechar={onFechar}
      bloquearFechar={pendente}
      rodape={<>
        {registro && <button type="button" className="btn perigo" onClick={remover} disabled={pendente}><Trash2 size={16} />{removerMutation.isPending ? 'Removendo…' : 'Remover'}</button>}
        <span className="esp" />
        <button type="button" className="btn" onClick={imprimir} disabled={pendente}><Printer size={16} />Imprimir cartaz</button>
        <button type="submit" form="form-troca" className="btn pri" disabled={pendente}>{salvarMutation.isPending ? 'Salvando…' : 'Salvar troca'}</button>
      </>}
    >
      <form id="form-troca" ref={formRef} onSubmit={salvar} style={{ display: 'contents' }}>
        <div className="aula-ref">
          <b>{bloco.titulo}</b>
          <small>{bloco.codCred || 'sem código'} · Sala {bloco.sala} · {bloco.dia} · {bloco.periodosStr} · {bloco.inicio}–{bloco.fim}</small>
        </div>

        {bloco.periodos.length > 1 && (
          <div className="campo">
            <span className="rot">Períodos que mudam de sala <span className="dica">· desmarque os que ficam na {bloco.sala}</span></span>
            <div className="pers">
              {bloco.periodos.map(p => {
                const marcado = form.periodosSelecionados.includes(p);
                return (
                  <button key={p} type="button" className="per-chip" aria-pressed={marcado} onClick={() => togglePeriodo(p)}
                    title={marcado ? `Período ${p} muda de sala` : `Período ${p} fica na sala de origem`}>{p}</button>
                );
              })}
            </div>
          </div>
        )}

        <div className="linha-campos">
          <div className="campo"><label htmlFor="tr-predio">Prédio de destino</label><input id="tr-predio" data-autofocus className="inp" required placeholder="Ex.: 32" value={form.predio} onChange={set('predio')} /></div>
          <div className="campo"><label htmlFor="tr-sala">Sala de destino</label><input id="tr-sala" className="inp" required placeholder="Ex.: 301" value={form.sala} onChange={set('sala')} /></div>
        </div>
        <div className="campo"><label htmlFor="tr-nome">Nome da disciplina no cartaz</label><input id="tr-nome" className="inp" required value={form.nomeAulaEditado} onChange={set('nomeAulaEditado')} /></div>
        <div className="linha-campos">
          <div className="campo"><label htmlFor="tr-cod">Cód/Cred <span className="dica">opcional</span></label><input id="tr-cod" className="inp" placeholder="Ex.: 34221-04" value={form.codCred} onChange={set('codCred')} /></div>
          <div className="campo"><label htmlFor="tr-prof">Professor <span className="dica">opcional</span></label><input id="tr-prof" className="inp" placeholder="Ex.: João da Silva" value={form.professor} onChange={set('professor')} /></div>
        </div>
        <div className="campo"><label htmlFor="tr-motivo">Motivo <span className="dica">controle interno, não sai no cartaz</span></label><input id="tr-motivo" className="inp" placeholder="Ex.: Projetor sem sinal" value={form.motivo} onChange={set('motivo')} /></div>

        <div className="cartaz-wrap">
          <span className="rot" style={{ alignSelf: 'flex-start' }}>Prévia do cartaz (A4)</span>
          <div className="cartaz" aria-label="Prévia do cartaz">
            <div className="cz-topo"><img src={logoPucrs} alt="PUCRS" /><i /><img src={logoLiving360} alt="Living 360" /></div>
            <div className="cz-faixa">⚠ Atenção · aviso de troca de sala</div>
            <div className="cz-corpo">
              <div><div className="cz-rot">Aula</div><div className="cz-val">{form.nomeAulaEditado || '—'}</div></div>
              {(limpar(form.codCred) || limpar(form.professor)) && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {limpar(form.codCred) && <div><div className="cz-rot">Cód/Cred</div><div className="cz-val">{form.codCred}</div></div>}
                  {limpar(form.professor) && <div><div className="cz-rot">Professor</div><div className="cz-val">{form.professor}</div></div>}
                </div>
              )}
              <div><div className="cz-rot">Sala de origem</div><div className="cz-val">Sala {bloco.sala}</div></div>
              <div className="cz-destino">
                <div className="cz-rot">Foi transferida para a sala</div>
                <div className="cz-sala">{limpar(form.sala) || '—'}</div>
                <div className="cz-pred">Prédio {limpar(form.predio) || '—'}</div>
              </div>
              <div className="cz-per">{bloco.dia} · PERÍODOS {sel.periodosStr} · {sel.horarioStr}</div>
            </div>
            <div className="cz-pe"><span>Secretaria Acadêmica · PUCRS</span><span>prévia</span></div>
          </div>
        </div>
      </form>
    </Gaveta>
  );
}
