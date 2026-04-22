import { useState, useEffect, useMemo, useRef } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useGrade } from '../hooks/useGrade';
import { PERIODS, getCurrentPeriod, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase'; 
import { useUI } from '../contexts/UIContext';

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ALL_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const horariosPUCRS = ["08:00", "08:45", "09:45", "10:30", "11:30", "12:15", "14:00", "14:45", "15:45", "16:30", "17:30", "18:15", "19:15", "20:00", "21:00", "21:45"];
const PERIOD_END_TIMES = { 'A': '08:45', 'B': '09:30', 'C': '10:30', 'D': '11:15', 'E': '12:15', 'E1': '13:00', 'F': '14:45', 'G': '15:30', 'H': '16:30', 'I': '17:15', 'J': '18:15', 'K': '19:00', 'L': '20:00', 'M': '20:45', 'N': '21:45', 'P': '22:30' };

const normalizeText = (text) => text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

const formatarAula = (nomeBruto) => {
  if (!nomeBruto) return { codigo: '', nome: '' };
  const partes = nomeBruto.split(' - ');
  return partes.length > 1 ? { codigo: partes[0], nome: partes.slice(1).join(' - ') } : { codigo: '', nome: nomeBruto };
};

export default function Timeline({ session, acesso }) {
  const { predioAtivo } = usePredio();
  const { toast } = useUI();
  const queryClient = useQueryClient();
  const predioAtual = predioAtivo || acesso?.predioId || '';
  const { dados: rawGradeData, loading, error } = useGrade(predioAtual);

  const [day, setDay] = useState(DAYS_PT[new Date().getDay()] || 'Segunda');
  const [filtro, setFiltro] = useState('');
  const [hoveredAulaId, setHoveredAulaId] = useState(null);
  const [tick, setTick] = useState(0);
  const inputRef = useRef(null);

  const [modalAvisoOpen, setModalAvisoOpen] = useState(false);
  const [aulaSelecionadaParaTroca, setAulaSelecionadaParaTroca] = useState(null);
  const [formTroca, setFormTroca] = useState({ predio: '', sala: '', motivo: '', nomeAulaEditado: '' });

  const { data: trocasAtivas = {} } = useQuery({
    queryKey: ['trocas_sala', predioAtual],
    queryFn: async () => {
        const { data, error } = await supabase.from('trocas_sala').select('*').eq('predio_id', predioAtual);
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
            predio_destino: formTroca.predio,
            sala_destino: formTroca.sala,
            motivo: formTroca.motivo,
            nome_aula_editado: formTroca.nomeAulaEditado,
            periodos_str: payload.periodosStr,
            horario_str: payload.horarioStr
        }, { onConflict: 'aula_unique_key' });
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
        const { error } = await supabase.from('trocas_sala').delete().eq('aula_unique_key', aulaUniqueKey);
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

  useEffect(() => {
    const intervaloRelogio = setInterval(() => {
      const agora = new Date();
      const horaStr = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
      if (horariosPUCRS.includes(horaStr)) setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(intervaloRelogio);
  }, []);

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
    if (!rawGradeData || !rawGradeData.salas || !rawGradeData.grade) return null;
    const salasDb = rawGradeData.salas;
    const gradeBruta = rawGradeData.grade;
    const periodoAtual = getCurrentPeriod();
    const aulasDoDia = gradeBruta.filter(d => d.dia_semana?.toLowerCase().includes(day.toLowerCase()));
    const periodosCabecalho = PERIODS.map(p => ({ code: p.code, label: p.lb, isAgora: p.code === periodoAtual }));
    const sortedSalas = [...salasDb].sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

    const timeline = sortedSalas.map(salaRef => {
      const slots = PERIODS.map(p => {
        const aulaNoSlot = aulasDoDia.find(d => {
          const numSala = d.salas?.numero || d.sala;
          return numSala === salaRef.numero && extractPeriodCode(d.periodo) === p.code;
        });

        return {
          periodo: p.code, horario: p.lb, isAgora: p.code === periodoAtual,
          ocupado: !!aulaNoSlot,
          nome: aulaNoSlot ? (aulaNoSlot.nome_aula || aulaNoSlot.disciplinas?.nome) : null,
          tipo: aulaNoSlot ? (aulaNoSlot.tipo || (isInternalClass(aulaNoSlot.nome_aula) ? 'Interno' : 'Regular')) : 'Livre',
          disciplinaId: aulaNoSlot ? (aulaNoSlot.disciplina_id || aulaNoSlot.nome_aula) : null
        };
      });
      return { sala: salaRef.numero, temAulaAgora: slots.some(s => s.isAgora && s.ocupado), slots };
    });

    return { periodosCabecalho, timeline };
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

  const handleCellClick = (slot, linhaSlots, salaAtual) => {
    if (!slot.ocupado) return;

    const aulaUniqueKey = `${slot.disciplinaId}-${slot.nome}-${salaAtual}`;
    const matches = linhaSlots.filter(s => s.nome === slot.nome && s.disciplinaId === slot.disciplinaId);
    const periodosStr = matches.map(m => m.periodo).join('');
    const first = matches[0];
    const last = matches[matches.length - 1];
    const horarioStr = `${first.horario} às ${PERIOD_END_TIMES[last.periodo] || last.horario}`;

    const registroExistente = trocasAtivas[aulaUniqueKey];

    if (!registroExistente) {
        const confirma = window.confirm('Deseja registrar uma alteração de sala para esta aula?');
        if (!confirma) return;
    }

    setAulaSelecionadaParaTroca({ ...slot, salaAtual, aulaUniqueKey, periodosStr, horarioStr });
    setFormTroca({
        predio: registroExistente?.predio_destino || '',
        sala: registroExistente?.sala_destino || '',
        motivo: registroExistente?.motivo || '',
        nomeAulaEditado: registroExistente?.nome_aula_editado || slot.nome
    });
    setModalAvisoOpen(true);
  };

  const handleSalvarTroca = (e) => {
    e.preventDefault();
    salvarTrocaMutation.mutate(aulaSelecionadaParaTroca);
  };

  const handleImprimirCartaz = () => {
    const nomeAula = formTroca.nomeAulaEditado || aulaSelecionadaParaTroca.nome;
    
    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(`
      <html>
        <head>
          <title>Aviso de Troca de Sala</title>
          <style>
            body { font-family: 'Arial', sans-serif; text-align: center; padding: 40px; margin: 0; color: #1e293b; }
            .container { border: 10px solid #ef4444; border-radius: 20px; padding: 60px 40px; height: calc(100vh - 120px); box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; }
            h1 { font-size: 80px; color: #ef4444; margin: 0; text-transform: uppercase; letter-spacing: -2px; }
            .aula-lbl { font-size: 35px; color: #64748b; margin-top: 30px; letter-spacing: 2px; }
            .aula-nome { font-size: 45px; font-weight: bold; margin: 15px 0 40px 0; color: #334155; text-transform: uppercase; }
            .info-box { background: #f8fafc; border: 4px dashed #cbd5e1; border-radius: 16px; padding: 40px; margin: 0; }
            .label { font-size: 25px; color: #64748b; margin-bottom: 10px; text-transform: uppercase; font-weight: bold; }
            .destaque { font-size: 80px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1; }
            .periodos { margin-top: 30px; font-size: 22px; color: #fff; background: #64748b; display: inline-block; padding: 10px 20px; border-radius: 12px; font-weight: bold; }
            @media print { .container { border: 10px solid #000; } h1 { color: #000; } }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Atenção</h1>
            
            <div class="aula-lbl">AULA</div>
            <div class="aula-nome">${nomeAula}</div>
            
            <div class="info-box">
              <div class="label">Foi transferida para a sala</div>
              <div class="destaque">${formTroca.sala || '______'}</div>
              <div class="label" style="margin-top: 20px; font-size: 35px;">Prédio ${formTroca.predio || predioAtual}</div>
            </div>
            
            <div>
              <div class="periodos">PERÍODOS: ${aulaSelecionadaParaTroca.periodosStr} (${aulaSelecionadaParaTroca.horarioStr})</div>
            </div>
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
  if (loading) return <div className="empty-st">Carregando matriz de horários da CDN...</div>;
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
          <select value={day} onChange={e => setDay(e.target.value)}>
            {ALL_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
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
                <div key={p.code} className={`tl-phd ${p.isAgora ? 'now' : ''}`}>
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