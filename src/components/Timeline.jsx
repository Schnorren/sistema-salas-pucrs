import { useState, useEffect, useMemo, useRef } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, PERIOD_TIMES, getCurrentPeriod, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase'; 
import { useUI } from '../contexts/UIContext';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const PERIOD_END_TIMES = { 'A': '08:45', 'B': '09:30', 'C': '10:30', 'D': '11:15', 'E': '12:15', 'E1': '13:00', 'F': '14:45', 'G': '15:30', 'H': '16:30', 'I': '17:15', 'J': '18:15', 'K': '19:00', 'L': '20:00', 'M': '20:45', 'N': '21:45', 'P': '22:30' };

// Fora do componente — funções puras sem dependência de estado
const getDiaAtual = () => DAYS_PT[new Date().getDay()] || 'Segunda';
const getDataHoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const normalizeText = (text) => text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

const formatarAula = (nomeBruto) => {
  if (!nomeBruto) return { codigo: '', nome: '' };
  const partes = nomeBruto.split(' - ');
  return partes.length > 1 ? { codigo: partes[0], nome: partes.slice(1).join(' - ') } : { codigo: '', nome: nomeBruto };
};

export default function Timeline({ session, acesso, initialDay, initialFiltro }) {
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

  const [modalAvisoOpen, setModalAvisoOpen] = useState(false);
  const [aulaSelecionadaParaTroca, setAulaSelecionadaParaTroca] = useState(null);
  const [formTroca, setFormTroca] = useState({ predio: '', sala: '', motivo: '', nomeAulaEditado: '', professor: '', codCred: '' });

  useEffect(() => {
    if (initialDay) { setDay(initialDay); setAutoMode(false); }
    if (initialFiltro) setFiltro(initialFiltro);
  }, [initialDay, initialFiltro]);

  const { data: trocasAtivas = {} } = useQuery({
    queryKey: ['trocas_sala', predioAtual],
    queryFn: async () => {
        const hoje = getDataHoje();
        const { data, error } = await supabase
            .from('trocas_sala')
            .select('*')
            .eq('predio_id', predioAtual)
            .eq('data_aula', hoje);
        if (error) throw error;
        const map = {};
        data.forEach(t => { map[t.aula_unique_key] = t; });
        return map;
    },
    enabled: !!predioAtual
  });

  const salvarTrocaMutation = useMutation({
    mutationFn: async (payload) => {
        const { error } = await supabase.from('trocas_sala').upsert({
            predio_id: predioAtual,
            aula_unique_key: payload.aulaUniqueKey,
            data_aula: getDataHoje(),
            predio_destino: formTroca.predio,
            sala_destino: formTroca.sala,
            motivo: formTroca.motivo,
            nome_aula_editado: formTroca.nomeAulaEditado,
            professor: formTroca.professor || null,
            cod_cred: formTroca.codCred || null,
            periodos_str: payload.periodosStr,
            horario_str: payload.horarioStr
        }, { onConflict: 'aula_unique_key,data_aula' });
        if (error) throw error;
    },
    onSuccess: () => {
        queryClient.invalidateQueries(['trocas_sala', predioAtual]);
        toast.success('Troca de sala registrada com sucesso!');
        setModalAvisoOpen(false);
    }
  });

  const removerTrocaMutation = useMutation({
    mutationFn: async (aulaUniqueKey) => {
        const { error } = await supabase
            .from('trocas_sala')
            .delete()
            .eq('aula_unique_key', aulaUniqueKey)
            .eq('data_aula', getDataHoje());
        if (error) throw error;
    },
    onSuccess: () => {
        queryClient.invalidateQueries(['trocas_sala', predioAtual]);
        toast.info('Aviso de troca removido.');
        setModalAvisoOpen(false);
    }
  });

  useEffect(() => {
    if (!predioAtual) return;
    const channel = supabase.channel(`trocas_${predioAtual}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trocas_sala' }, () => {
            queryClient.invalidateQueries(['trocas_sala', predioAtual]);
        }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [predioAtual, queryClient]);

  // Relógio: atualiza o highlight do período a cada minuto.
  // Em modo automático: também corrige o dia (virada de meia-noite)
  // e rola para o período atual sempre que o período muda.
  useEffect(() => {
    const verificar = () => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;

      if (PERIOD_TIMES.includes(horaStr)) {
        setTick(t => t + 1);

        // Atualiza o dia automaticamente (cobre virada de meia-noite)
        if (autoMode) {
          setDay(getDiaAtual());
        }

        // Scroll suave para o período atual após a atualização do DOM
        setTimeout(() => {
          periodoAtualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 100);
      }
    };

    const intervaloRelogio = setInterval(verificar, 60000);
    return () => clearInterval(intervaloRelogio);
  }, [autoMode]);

  // Limpeza automática de trocas de dias anteriores — roda uma vez por sessão em background
  useEffect(() => {
    if (!predioAtual) return;
    const limpar = async () => {
      try { await supabase.rpc('limpar_trocas_antigas'); } catch (_) {}
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

  const dataProcessed = useMemo(() => {
    try {
      if (!rawGradeData) return null;
      const salasDb = rawGradeData.salas;
      const gradeBruta = rawGradeData.grade;
      if (!salasDb || !gradeBruta || !Array.isArray(salasDb) || !Array.isArray(gradeBruta)) return null;

      const periodoAtual = getCurrentPeriod();
      const aulasDoDia = gradeBruta.filter(d => d?.dia_semana?.toLowerCase().includes(day.toLowerCase()));
      const periodosCabecalho = PERIODS.map(p => ({ code: p.code, label: p.lb, isAgora: p.code === periodoAtual }));
      const sortedSalas = [...salasDb].sort((a, b) => (a.numero || '').localeCompare(b.numero || '', undefined, { numeric: true }));

      const timeline = sortedSalas.map(salaRef => {
        const slots = PERIODS.map(p => {
          const aulaNoSlot = aulasDoDia.find(d => {
            const numSala = d?.salas?.numero || d?.sala;
            return numSala === salaRef.numero && extractPeriodCode(d?.periodo) === p.code;
          });

          return {
            periodo: p.code, horario: p.lb, isAgora: p.code === periodoAtual,
            ocupado: !!aulaNoSlot,
            nome: aulaNoSlot ? (aulaNoSlot.nome_aula || aulaNoSlot.disciplinas?.nome || '') : null,
            tipo: aulaNoSlot ? (aulaNoSlot.tipo || (isInternalClass(aulaNoSlot.nome_aula) ? 'Interno' : 'Regular')) : 'Livre',
            disciplinaId: aulaNoSlot ? (aulaNoSlot.disciplina_id || aulaNoSlot.nome_aula || '') : null
          };
        });
        return { sala: salaRef.numero, temAulaAgora: slots.some(s => s.isAgora && s.ocupado), slots };
      });

      return { periodosCabecalho, timeline };
    } catch (err) {
      console.error('Erro ao processar grade:', err);
      return null;
    }
  }, [rawGradeData, day, tick]);

  const filteredTimeline = useMemo(() => {
    if (!dataProcessed?.timeline) return [];
    if (!filtro.trim()) return dataProcessed.timeline;
    const termo = normalizeText(filtro);
    return dataProcessed.timeline.filter(linha => {
      const matchSala = normalizeText(linha.sala).includes(termo);
      const matchAula = linha.slots.some(slot => slot.ocupado && normalizeText(slot.nome).includes(termo));
      return matchSala || matchAula;
    });
  }, [dataProcessed, filtro]);

  const handleCellClick = async (slot, linhaSlots, salaAtual) => {
    if (!slot.ocupado) return;

    const aulaUniqueKey = `${slot.disciplinaId}-${slot.nome}-${salaAtual}`;
    const matches = linhaSlots.filter(s => s.nome === slot.nome && s.disciplinaId === slot.disciplinaId);
    const periodosStr = matches.map(m => m.periodo).join('');
    const first = matches[0];
    const last = matches[matches.length - 1];
    const horarioStr = `${first.horario} às ${PERIOD_END_TIMES[last.periodo] || last.horario}`;

    const registroExistente = trocasAtivas[aulaUniqueKey];

    if (!registroExistente) {
        const confirma = await showConfirm('Deseja registrar uma alteração de sala para esta aula?', 'Registrar Troca de Sala');
        if (!confirma) return;
    }

    setAulaSelecionadaParaTroca({ ...slot, salaAtual, aulaUniqueKey, periodosStr, horarioStr });
    setFormTroca({
        predio: registroExistente?.predio_destino || '',
        sala: registroExistente?.sala_destino || '',
        motivo: registroExistente?.motivo || '',
        nomeAulaEditado: registroExistente?.nome_aula_editado || slot.nome,
        professor: registroExistente?.professor || '',
        codCred: registroExistente?.cod_cred || '',
    });
    setModalAvisoOpen(true);
  };

  const handleSalvarTroca = (e) => {
    e.preventDefault();
    salvarTrocaMutation.mutate(aulaSelecionadaParaTroca);
  };

  const handleImprimirCartaz = () => {
    const nomeAula    = formTroca.nomeAulaEditado || aulaSelecionadaParaTroca.nome;
    const codCred     = formTroca.codCred?.trim();
    const professor   = formTroca.professor?.trim();
    const predioDestino = formTroca.predio || predioAtual;
    const salaDestino   = formTroca.sala;
    const periodos      = aulaSelecionadaParaTroca.periodosStr;
    const horario       = aulaSelecionadaParaTroca.horarioStr;

    // Linha em inglês — só inclui os campos que foram preenchidos
    const partesEN = [];
    partesEN.push(`Class: ${nomeAula}`);
    if (codCred)   partesEN.push(`Code/Credits: ${codCred}`);
    if (professor) partesEN.push(`Instructor: ${professor}`);
    partesEN.push(`has been moved to Building ${predioDestino}, Room ${salaDestino}`);
    partesEN.push(`Periods: ${periodos} (${horario.replace('às', 'to')})`);
    const linhaEN = partesEN.join(' · ');

    // Blocos opcionais — só renderiza se preenchido
    const blocoCodCred   = codCred   ? `<div class="info-row"><span class="lbl">COD/CRED</span><span class="val">${codCred}</span></div>` : '';
    const blocoProfessor = professor ? `<div class="info-row"><span class="lbl">PROFESSOR</span><span class="val">${professor}</span></div>` : '';

    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Aviso de Troca de Sala</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Arial', sans-serif;
              background: #fff;
              color: #0f172a;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 30px;
            }
            .container {
              border: 8px solid #dc2626;
              border-radius: 16px;
              padding: 40px 50px;
              width: 100%;
              max-width: 780px;
              display: flex;
              flex-direction: column;
              gap: 18px;
            }
            .atencao {
              font-size: 64px;
              font-weight: 900;
              color: #dc2626;
              text-transform: uppercase;
              letter-spacing: -1px;
              line-height: 1;
              text-align: center;
            }
            .divider {
              border: none;
              border-top: 2px solid #e2e8f0;
            }
            .info-row {
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            .lbl {
              font-size: 11px;
              font-weight: 700;
              color: #64748b;
              letter-spacing: 1.5px;
              text-transform: uppercase;
            }
            .val {
              font-size: 28px;
              font-weight: 700;
              color: #0f172a;
              text-transform: uppercase;
              line-height: 1.2;
            }
            .destaque-box {
              background: #fef2f2;
              border: 3px dashed #fca5a5;
              border-radius: 12px;
              padding: 24px 30px;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .destaque-label {
              font-size: 14px;
              font-weight: 700;
              color: #dc2626;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .destaque-val {
              font-size: 72px;
              font-weight: 900;
              color: #0f172a;
              line-height: 1;
            }
            .destaque-sub {
              font-size: 26px;
              font-weight: 600;
              color: #475569;
            }
            .periodos-badge {
              display: inline-block;
              background: #0f172a;
              color: #fff;
              font-size: 18px;
              font-weight: 700;
              padding: 8px 20px;
              border-radius: 8px;
              letter-spacing: 0.5px;
            }
            .linha-en {
              font-size: 11px;
              color: #94a3b8;
              text-align: center;
              font-style: italic;
              border-top: 1px solid #e2e8f0;
              padding-top: 14px;
              line-height: 1.6;
            }
            @media print {
              body { padding: 20px; }
              .container { border-color: #000; }
              .atencao { color: #000; }
              .destaque-box { background: #f8f8f8; border-color: #999; }
              .destaque-label { color: #000; }
            }
          </style>
        </head>
        <body>
          <div class="container">

            <div class="atencao">⚠ Atenção</div>

            <hr class="divider">

            <div class="info-row">
              <span class="lbl">AULA</span>
              <span class="val">${nomeAula}</span>
            </div>

            ${blocoCodCred}
            ${blocoProfessor}

            <hr class="divider">

            <div class="destaque-box">
              <div class="destaque-label">Foi transferida para</div>
              <div class="destaque-val">${salaDestino || '______'}</div>
              <div class="destaque-sub">Prédio ${predioDestino}</div>
            </div>

            <div>
              <span class="periodos-badge">PERÍODOS: ${periodos} &nbsp;·&nbsp; ${horario}</span>
            </div>

            <div class="linha-en">${linhaEN}</div>

          </div>
          <script>
            window.onload = () => { window.print(); window.close(); }
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
                
                <form onSubmit={handleSalvarTroca}>
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
                            <input autoFocus type="number" placeholder="Ex: 32" value={formTroca.predio} onChange={e => setFormTroca({...formTroca, predio: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} required />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>SALA DESTINO</label>
                            <input type="number" placeholder="Ex: 301" value={formTroca.sala} onChange={e => setFormTroca({...formTroca, sala: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} required />
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
                            <button type="button" onClick={() => removerTrocaMutation.mutate(aulaSelecionadaParaTroca.aulaUniqueKey)} style={{ padding: '10px 16px', background: 'var(--red-b)', color: 'var(--red)', border: '1px solid rgba(160, 40, 40, 0.2)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Remover
                            </button>
                        )}
                        <button type="button" onClick={handleImprimirCartaz} style={{ padding: '10px 16px', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🖨️ Imprimir
                        </button>
                        <button type="submit" disabled={salvarTrocaMutation.isLoading} style={{ padding: '10px 16px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {salvarTrocaMutation.isLoading ? 'Salvando...' : 'Salvar Alteração'}
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
                  {linha.slots.map((slot, idx) => {
                    const statusClass = !slot.ocupado ? 'empty' : (slot.tipo === 'Interno' ? 'int' : 'reg');
                    const aula = formatarAula(slot.nome);

                    const aulaUniqueKey = slot.ocupado ? `${slot.disciplinaId}-${slot.nome}-${linha.sala}` : null;
                    const isHovered = hoveredAulaId && hoveredAulaId === aulaUniqueKey;
                    const temTroca = slot.ocupado ? trocasAtivas[aulaUniqueKey] : null;

                    const matches = slot.ocupado ? linha.slots.filter(s => s.nome === slot.nome && s.disciplinaId === slot.disciplinaId) : [];
                    const isSequenceAgora = matches.some(m => m.isAgora);

                    const termoNormalizado = normalizeText(filtro).trim();
                    const isSearchMatch = termoNormalizado && slot.ocupado && normalizeText(slot.nome).includes(termoNormalizado);
                    const isRoomMatch = termoNormalizado && normalizeText(linha.sala).includes(termoNormalizado);

                    const getTooltip = () => {
                        if (!slot.ocupado) return `Livre (${slot.horario})`;
                        if (matches.length > 0) {
                            const periodosLetras = matches.map(m => m.periodo).join('');
                            const first = matches[0];
                            const last = matches[matches.length - 1];
                            const fimReal = PERIOD_END_TIMES[last.periodo] || last.horario;
                            return `${slot.nome}\nPeríodos: ${periodosLetras}\nHorário: ${first.horario} às ${fimReal}`;
                        }
                        return `${slot.nome} (${slot.horario})`;
                    };

                    return (
                      <div
                        key={idx}
                        className={`tl-cell ${statusClass} ${slot.isAgora ? 'now' : ''}`} 
                        title={getTooltip()} 
                        onClick={() => handleCellClick(slot, linha.slots, linha.sala)}
                        onMouseEnter={() => slot.ocupado && setHoveredAulaId(aulaUniqueKey)}
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
                              {aula.nome}
                            </div>
                            {aula.codigo && (
                              <div style={{ fontSize: '0.65rem', opacity: (isHovered || isSearchMatch) ? 1 : 0.7, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {aula.codigo}
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