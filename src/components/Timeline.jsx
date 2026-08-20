import { useState, useEffect, useMemo, useRef } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, PERIOD_END_TIMES, getDiaAtual, getCurrentPeriod, getSemanaAtual, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useUI } from '../contexts/UIContext';
import { useTrocasSala } from '../hooks/useTrocasSala';
import logoPucrs from '../assets/logos/pucrs.jpeg';
import logoLiving360 from '../assets/logos/living360.jpeg';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
// Dia em inglês para a linha EN do cartaz de impressão
const DAYS_EN = { Segunda: 'Monday', 'Terça': 'Tuesday', Quarta: 'Wednesday', Quinta: 'Thursday', Sexta: 'Friday', 'Sábado': 'Saturday', Domingo: 'Sunday' };

// Fora do componente — funções puras sem dependência de estado.
// Extrai código/crédito e nome limpo do padrão "97316-04/1 - BRANDED CONTENT"
const parsearNomeAula = (nomeBruto) => {
  if (!nomeBruto) return { codCred: '', nomeAula: nomeBruto || '' };
  // Padrão: sequência alfanumérica com hífens/barras, seguida de " - ", seguida do nome
  const match = nomeBruto.match(/^([A-Z0-9]{3,}[-/][A-Z0-9/]+)\s+-\s+(.+)$/i);
  if (match) return { codCred: match[1].trim(), nomeAula: match[2].trim() };
  return { codCred: '', nomeAula: nomeBruto };
};

const normalizeText = (text) => text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

// Escapa valores interpolados no HTML do cartaz de impress\u00e3o (inclui dados
// gravados por outros usu\u00e1rios \u2014 sem escape vira vetor de XSS na janela de print).
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Normaliza valores de formul\u00e1rio/banco para grava\u00e7\u00e3o e compara\u00e7\u00e3o
// (null/undefined e '' equivalem; o banco pode devolver n\u00famero em predio/sala).
const limpar = (v) => String(v ?? '').trim();

// Mensagem p\u00fablica para falhas nas mutations de troca (RLS nega com 42501)
const descreverErroTroca = (err, fallback) => {
  if (err?.code === '42501') return 'Voc\u00ea n\u00e3o tem permiss\u00e3o para editar trocas de sala (m\u00f3dulo "edicao_grade").';
  if (err?.publico) return err.message;
  return fallback;
};

export default function Timeline({ acesso, initialDay, initialFiltro }) {
  const { predioAtivo } = usePredio();
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
  const formRef = useRef(null); // form do modal — validação também no fluxo de impressão

  const [modalAvisoOpen, setModalAvisoOpen] = useState(false);
  const [aulaSelecionadaParaTroca, setAulaSelecionadaParaTroca] = useState(null);
  const [formTroca, setFormTroca] = useState({ predio: '', sala: '', motivo: '', nomeAulaEditado: '', professor: '', codCred: '' });

  useEffect(() => {
    if (initialDay) { setDay(initialDay); setAutoMode(false); } // eslint-disable-line react-hooks/set-state-in-effect
    if (initialFiltro) setFiltro(initialFiltro);
  }, [initialDay, initialFiltro]);

  // Busca + Realtime vivem no hook (compartilhado com o badge do Dashboard)
  const trocasAtivas = useTrocasSala(predioAtual);

  // Toast/fechamento do modal ficam nos callbacks de cada chamada: salvar via
  // formulário fecha o modal; salvar antes de imprimir não fecha.
  const salvarTrocaMutation = useMutation({
    // Recebe aula + form no payload (em vez de ler formTroca da closure):
    // evita gravar estado defasado quando a mutation é disparada fora do submit.
    mutationFn: async ({ aula, form }) => {
        const { error } = await supabase.from('trocas_sala').upsert({
            predio_id: predioAtual,
            aula_unique_key: aula.aulaUniqueKey,
            semana: getSemanaAtual(),
            predio_destino: limpar(form.predio),
            sala_destino: limpar(form.sala),
            motivo: limpar(form.motivo),
            nome_aula_editado: limpar(form.nomeAulaEditado),
            professor: limpar(form.professor) || null,
            cod_cred: limpar(form.codCred) || null,
            periodos_str: aula.periodosStr,
            horario_str: aula.horarioStr
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
    mutationFn: async (aulaUniqueKey) => {
        const { data, error } = await supabase
            .from('trocas_sala')
            .delete()
            .eq('predio_id', predioAtual)
            .eq('aula_unique_key', aulaUniqueKey)
            .eq('semana', getSemanaAtual())
            .select();
        if (error) throw error;
        // RLS nega DELETE silenciosamente (0 linhas) — transforma em erro visível
        if (!data?.length) {
            const e = new Error('Nenhuma troca foi removida — verifique se você tem a permissão "edicao_grade".');
            e.publico = true;
            throw e;
        }
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['trocas_sala', predioAtual] });
        toast.info('Aviso de troca removido.');
        setModalAvisoOpen(false);
    },
    onError: (err) => {
        toast.error(descreverErroTroca(err, 'Não foi possível remover a troca de sala.'));
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
      if (e.key.length === 1 && !modalAvisoOpen) inputRef.current?.focus();
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [modalAvisoOpen]);

  // Esc fecha o modal de troca (padrão de modal; descarta edições não salvas)
  useEffect(() => {
    if (!modalAvisoOpen) return;
    const onEsc = (e) => { if (e.key === 'Escape') setModalAvisoOpen(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [modalAvisoOpen]);

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

  const handleCellClick = async (slot, salaAtual) => {
    if (!slot.ocupado) return;

    const registroExistente = trocasAtivas[slot.aulaUniqueKey];

    if (!registroExistente) {
        const confirma = await showConfirm('Deseja registrar uma alteração de sala para esta aula?', 'Registrar Troca de Sala');
        if (!confirma) return;
    }

    // slot já carrega aulaUniqueKey/periodosStr/horarioStr (calculados no
    // dataProcessed); `dia` entra para o cartaz de impressão.
    setAulaSelecionadaParaTroca({ ...slot, salaAtual, dia: day });

    // Auto-preenchimento: cod/cred e nome limpo do padrão "97316-04/1 - NOME DA
    // AULA", já parseados na montagem da grade.
    const { codCred: codAutoDetectado, nomeAula: nomeAutoDetectado } = slot.aulaParseada;

    setFormTroca({
        predio: registroExistente?.predio_destino || '',
        sala: registroExistente?.sala_destino || '',
        motivo: registroExistente?.motivo || '',
        nomeAulaEditado: registroExistente?.nome_aula_editado || nomeAutoDetectado,
        professor: registroExistente?.professor || '',
        codCred: registroExistente?.cod_cred || codAutoDetectado,
    });
    setModalAvisoOpen(true);
  };

  const handleSalvarTroca = (e) => {
    e.preventDefault();
    salvarTrocaMutation.mutate({ aula: aulaSelecionadaParaTroca, form: formTroca }, {
        onSuccess: () => {
            toast.success('Troca de sala registrada com sucesso!');
            setModalAvisoOpen(false);
        }
    });
  };

  // Remoção é destrutiva (o aviso some para todos os clientes) — confirma antes.
  const handleRemoverTroca = async () => {
    const confirma = await showConfirm('Remover o aviso de troca desta aula? Ele deixa de aparecer na grade para todos.', 'Remover Troca de Sala');
    if (!confirma) return;
    removerTrocaMutation.mutate(aulaSelecionadaParaTroca.aulaUniqueKey);
  };

  const handleImprimirCartaz = async () => {
    // O botão é type="button" — força a validação dos campos obrigatórios do
    // form (prédio/sala destino) também no fluxo de impressão.
    if (!formRef.current?.reportValidity()) return;

    // O cartaz impresso precisa refletir o que está salvo: regrava quando o form
    // difere do registro (ou não há registro) — sem isso, editar um campo e clicar
    // direto em Imprimir gerava cartaz com dados novos e grade/banco com os velhos.
    // Sem alterações, não grava: quem não tem 'edicao_grade' segue podendo reimprimir.
    const registro = trocasAtivas[aulaSelecionadaParaTroca?.aulaUniqueKey];
    const formDifereDoSalvo = !registro ||
        limpar(registro.predio_destino)    !== limpar(formTroca.predio) ||
        limpar(registro.sala_destino)      !== limpar(formTroca.sala) ||
        limpar(registro.motivo)            !== limpar(formTroca.motivo) ||
        limpar(registro.nome_aula_editado) !== limpar(formTroca.nomeAulaEditado) ||
        limpar(registro.professor)         !== limpar(formTroca.professor) ||
        limpar(registro.cod_cred)          !== limpar(formTroca.codCred);
    if (formDifereDoSalvo) {
        try {
            await salvarTrocaMutation.mutateAsync({ aula: aulaSelecionadaParaTroca, form: formTroca });
        } catch {
            return; // onError da mutation já exibiu o motivo
        }
    }

    // Tudo que entra no HTML do cartaz passa por escapeHtml (dados vêm do
    // form e de registros gravados por outros usuários).
    const nomeAula      = escapeHtml(formTroca.nomeAulaEditado || aulaSelecionadaParaTroca.nome);
    const codCred       = escapeHtml(limpar(formTroca.codCred));
    const professor     = escapeHtml(limpar(formTroca.professor));
    const predioDestino = escapeHtml(limpar(formTroca.predio));
    const salaDestino   = escapeHtml(limpar(formTroca.sala));
    const periodos      = escapeHtml(aulaSelecionadaParaTroca.periodosStr);
    const horario       = escapeHtml(aulaSelecionadaParaTroca.horarioStr);
    const salaOrigem    = escapeHtml(aulaSelecionadaParaTroca.salaAtual);
    const diaSemana     = escapeHtml(aulaSelecionadaParaTroca.dia);
    // "Gerado em" no fuso da PUCRS, não no do browser (regra do projeto)
    const geradoEm      = escapeHtml(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));

    // Linha em inglês — só inclui os campos preenchidos
    const partesEN = [`Class: ${nomeAula}`];
    if (codCred)   partesEN.push(`Code/Credits: ${codCred}`);
    if (professor) partesEN.push(`Instructor: ${professor}`);
    partesEN.push(`has been moved from Room ${salaOrigem} to Room ${salaDestino}, Building ${predioDestino}`);
    partesEN.push(`${DAYS_EN[aulaSelecionadaParaTroca.dia] || diaSemana} · Periods: ${periodos} (${horario.replace(' às ', ' to ')})`);
    const linhaEN = partesEN.join(' · ');

    const blocoCodCred   = codCred   ? `
      <div class="field">
        <div class="field-label">COD / CRED</div>
        <div class="field-value small">${codCred}</div>
      </div>` : '';

    const blocoProfessor = professor ? `
      <div class="field">
        <div class="field-label">PROFESSOR</div>
        <div class="field-value">${professor}</div>
      </div>` : '';

    const printWindow = window.open('', '', 'width=794,height=1123');
    if (!printWindow) {
        toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente.');
        return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Aviso de Troca de Sala</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }

            body {
              font-family: 'Arial', sans-serif;
              width: 210mm;
              min-height: 297mm;
              background: #fff;
              color: #0f172a;
              display: flex;
              align-items: stretch;
            }

            .page {
              width: 100%;
              min-height: 297mm;
              display: flex;
              flex-direction: column;
            }

            /* Cabeçalho — logos PUCRS + Living 360 */
            .header {
              background: #fff;
              padding: 18px 36px;
              display: flex;
              align-items: center;
              gap: 24px;
              border-bottom: 4px solid #003DA5;
            }

            .header-logo-pucrs { height: 48px; width: auto; display: block; }
            .header-logo-living360 { height: 42px; width: auto; display: block; }

            .header-divider-v {
              width: 1px;
              height: 42px;
              background: #CBD5E1;
              flex-shrink: 0;
            }

            /* Faixa vermelha de atenção */
            .atencao-bar {
              background: #DC2626;
              padding: 18px 36px;
              display: flex;
              align-items: center;
              gap: 14px;
            }
            .atencao-icon { font-size: 36px; line-height: 1; }
            .atencao-text {
              font-size: 36px;
              font-weight: 900;
              color: #fff;
              letter-spacing: 2px;
              text-transform: uppercase;
            }

            /* Corpo */
            .body {
              flex: 1;
              padding: 32px 36px;
              display: flex;
              flex-direction: column;
              gap: 24px;
            }

            /* Seção da aula */
            .aula-section {
              background: #F8FAFC;
              border: 2px solid #E2E8F0;
              border-left: 6px solid #003DA5;
              border-radius: 8px;
              padding: 20px 24px;
              display: flex;
              flex-direction: column;
              gap: 14px;
            }

            .field-label {
              font-size: 10px;
              font-weight: 700;
              color: #64748B;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              margin-bottom: 3px;
            }

            .field-value {
              font-size: 26px;
              font-weight: 800;
              color: #0F172A;
              text-transform: uppercase;
              line-height: 1.2;
            }

            .field-value.small { font-size: 18px; }

            .divider {
              border: none;
              border-top: 1px solid #E2E8F0;
            }

            /* Caixa destino — centralizada, destaque total */
            .destino-section {
              background: linear-gradient(135deg, #DC2626 0%, #9B1C1C 100%);
              border-radius: 12px;
              padding: 36px 24px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 10px;
              text-align: center;
            }

            .destino-label {
              font-size: 13px;
              font-weight: 700;
              color: rgba(255,255,255,0.8);
              letter-spacing: 2px;
              text-transform: uppercase;
            }

            .destino-sala {
              font-size: 110px;
              font-weight: 900;
              color: #fff;
              line-height: 1;
              letter-spacing: -4px;
            }

            .destino-predio {
              font-size: 22px;
              font-weight: 600;
              color: rgba(255,255,255,0.9);
              background: rgba(0,0,0,0.2);
              padding: 6px 20px;
              border-radius: 20px;
              margin-top: 4px;
            }

            /* Badge de períodos */
            .periodos-section {
              display: flex;
              justify-content: center;
            }

            .periodos-badge {
              background: #003DA5;
              color: #fff;
              font-size: 17px;
              font-weight: 700;
              padding: 12px 28px;
              border-radius: 50px;
              letter-spacing: 0.5px;
              text-align: center;
            }

            /* Linha em inglês */
            .en-line {
              font-size: 10px;
              color: #94A3B8;
              text-align: center;
              font-style: italic;
              line-height: 1.6;
              padding: 0 20px;
            }

            /* Rodapé */
            .footer {
              background: #F1F5F9;
              border-top: 2px solid #E2E8F0;
              padding: 12px 36px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .footer-left { font-size: 10px; color: #64748B; }
            .footer-right { font-size: 10px; color: #94A3B8; font-style: italic; }

            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="page">

            <!-- Cabeçalho — logos PUCRS + Living 360 -->
            <div class="header">
              <img class="header-logo-pucrs" src="${logoPucrs}" alt="PUCRS" />
              <div class="header-divider-v"></div>
              <img class="header-logo-living360" src="${logoLiving360}" alt="Living 360" />
            </div>

            <!-- Faixa de atenção -->
            <div class="atencao-bar">
              <div class="atencao-icon">⚠</div>
              <div class="atencao-text">Atenção — Aviso de Troca de Sala</div>
            </div>

            <!-- Corpo -->
            <div class="body">

              <!-- Dados da aula -->
              <div class="aula-section">
                <div class="field">
                  <div class="field-label">Aula</div>
                  <div class="field-value">${nomeAula}</div>
                </div>
                ${blocoCodCred ? `<hr class="divider">${blocoCodCred}` : ''}
                ${blocoProfessor ? `<hr class="divider">${blocoProfessor}` : ''}
                <hr class="divider">
                <div class="field">
                  <div class="field-label">Sala de Origem</div>
                  <div class="field-value small">Sala ${salaOrigem}</div>
                </div>
              </div>

              <!-- Destino — centralizado e em destaque -->
              <div class="destino-section">
                <div class="destino-label">Foi transferida para a sala</div>
                <div class="destino-sala">${salaDestino}</div>
                <div class="destino-predio">Prédio ${predioDestino}</div>
              </div>

              <!-- Períodos -->
              <div class="periodos-section">
                <div class="periodos-badge">
                  ${diaSemana} &nbsp;·&nbsp; PERÍODOS: ${periodos} &nbsp;·&nbsp; ${horario}
                </div>
              </div>

              <!-- Linha em inglês -->
              <div class="en-line">${linhaEN}</div>

            </div>

            <!-- Rodapé -->
            <div class="footer">
              <div class="footer-left">Secretaria Acadêmica — PUCRS</div>
              <div class="footer-right">Gerado em ${geradoEm}</div>
            </div>

          </div>
          <script>
            // print() é assíncrono em alguns navegadores — fechar a janela logo
            // após chamá-lo cancelava o diálogo. onafterprint fecha só ao concluir
            // (ou cancelar) a impressão.
            window.onload = () => { window.focus(); window.print(); };
            window.onafterprint = () => window.close();
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!predioAtual) return <div className="empty-st">Selecione um prédio no menu superior.</div>;
  if (loading || (!rawGradeData && !error)) return <div className="empty-st">Carregando matriz de horários...</div>;
  if (error) return <div className="empty-st" style={{ color: 'var(--red)' }}>⚠️ Erro: {error}</div>;
  if (!dataProcessed) return <div className="empty-st">Nenhuma matriz encontrada para este prédio.</div>;

  return (
    <div className="view active" id="vTl" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {modalAvisoOpen && aulaSelecionadaParaTroca && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--panel)', padding: '30px', borderRadius: '12px', width: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h2 style={{ margin: '0 0 10px 0', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    🔁 Registrar Troca de Sala
                </h2>
                
                <form onSubmit={handleSalvarTroca} ref={formRef}>
                    <div style={{ padding: '15px', background: 'var(--panel2)', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '5px' }}>NOME DA DISCIPLINA (IMPRESSÃO)</div>
                        <input 
                            type="text" 
                            value={formTroca.nomeAulaEditado} 
                            onChange={e => setFormTroca({...formTroca, nomeAulaEditado: e.target.value})} 
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 'bold' }} 
                            required 
                        />
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>De: Sala {aulaSelecionadaParaTroca.salaAtual}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 'bold' }}>Períodos {aulaSelecionadaParaTroca.periodosStr}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>COD/CRED <span style={{ fontWeight: 'normal', opacity: 0.6 }}>(opcional)</span></label>
                            <input type="text" placeholder="Ex: 34221-04" value={formTroca.codCred} onChange={e => setFormTroca({...formTroca, codCred: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                        </div>
                        <div style={{ flex: 2 }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>PROFESSOR <span style={{ fontWeight: 'normal', opacity: 0.6 }}>(opcional)</span></label>
                            <input type="text" placeholder="Ex: João da Silva" value={formTroca.professor} onChange={e => setFormTroca({...formTroca, professor: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>PRÉDIO DESTINO</label>
                            <input autoFocus type="text" placeholder="Ex: 32" value={formTroca.predio} onChange={e => setFormTroca({...formTroca, predio: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} required />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>SALA DESTINO</label>
                            <input type="text" placeholder="Ex: 301" value={formTroca.sala} onChange={e => setFormTroca({...formTroca, sala: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} required />
                        </div>
                    </div>
                    
                    <div style={{ marginBottom: '25px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>MOTIVO (CONTROLE INTERNO)</label>
                        <input type="text" placeholder="Ex: Problema no projetor..." value={formTroca.motivo} onChange={e => setFormTroca({...formTroca, motivo: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setModalAvisoOpen(false)} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Cancelar
                        </button>
                        {trocasAtivas[aulaSelecionadaParaTroca.aulaUniqueKey] && (
                            <button type="button" onClick={handleRemoverTroca} disabled={removerTrocaMutation.isPending} style={{ padding: '10px 16px', background: 'var(--red-b)', color: 'var(--red)', border: '1px solid rgba(160, 40, 40, 0.2)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {removerTrocaMutation.isPending ? 'Removendo...' : 'Remover'}
                            </button>
                        )}
                        <button type="button" onClick={handleImprimirCartaz} disabled={salvarTrocaMutation.isPending} style={{ padding: '10px 16px', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🖨️ Imprimir
                        </button>
                        <button type="submit" disabled={salvarTrocaMutation.isPending} style={{ padding: '10px 16px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {salvarTrocaMutation.isPending ? 'Salvando...' : 'Salvar Alteração'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label>Dia:</label>
          <select value={day} onChange={e => { setDay(e.target.value); setAutoMode(false); }}>
            {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
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
                    // (aulaParseada, aulaUniqueKey, periodosStr, horarioStr,
                    // isSequenceAgora) — aqui só resta cruzar com o estado vivo.
                    const aula = slot.aulaParseada;
                    const isHovered = !!hoveredAulaId && hoveredAulaId === slot.aulaUniqueKey;
                    const temTroca = slot.ocupado ? trocasAtivas[slot.aulaUniqueKey] : null;
                    const isSequenceAgora = !!slot.isSequenceAgora;

                    const isSearchMatch = termoNormalizado && slot.ocupado && slot.nomeNorm.includes(termoNormalizado);
                    const isRoomMatch = termoNormalizado && linha.salaNorm.includes(termoNormalizado);

                    const tooltip = slot.ocupado
                        ? `${slot.nome}\nPeríodos: ${slot.periodosStr}\nHorário: ${slot.horarioStr}`
                        : `Livre (${slot.horario})`;

                    return (
                      <div
                        key={slot.periodo}
                        className={`tl-cell ${statusClass} ${slot.isAgora ? 'now' : ''}`}
                        title={tooltip}
                        onClick={() => handleCellClick(slot, linha.sala)}
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