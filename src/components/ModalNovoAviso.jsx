import React, { useState, useMemo } from 'react';
import { useUI } from '../contexts/UIContext';
import { getDataSaoPaulo } from '../../backend_core/utils/timeHelpers';
import { useGrade } from '../hooks/useGrade';
import { buscarAulasPorNome, diaDaData } from '../utils/aulasDoDia';

const inputStyle = {
    width: '100%', padding: '10px 14px',
    border: '1px solid #334155', borderRadius: '6px',
    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
    background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box'
};

const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 'bold',
    color: '#94a3b8', marginBottom: '6px',
    textTransform: 'uppercase', letterSpacing: '0.05em'
};

export default function ModalNovoAviso({ onClose, onSave, isPending, predioId }) {
    const { toast } = useUI();
    const [tipo, setTipo] = useState('CHAVE');
    const [formData, setFormData] = useState({});
    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    // Autorização de chave: começa pela AULA (busca na grade do prédio) e depois
    // diz quem retira e até quando vale.
    const { dados: grade } = useGrade(predioId || '');
    const [busca, setBusca] = useState('');
    const [escolhidas, setEscolhidas] = useState({}); // chave -> bloco
    const [vigencia, setVigencia] = useState('DATA');
    const hoje = (() => { const d = getDataSaoPaulo(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');

    const resultados = useMemo(() => buscarAulasPorNome(grade?.grade, busca).slice(0, 60), [grade, busca]);
    const grupos = useMemo(() => {
        const m = new Map();
        for (const b of resultados) m.set(b.nomeAula, [...(m.get(b.nomeAula) || []), b]);
        return [...m.entries()];
    }, [resultados]);
    const lista = Object.values(escolhidas);
    const alternar = (b) => setEscolhidas(e => {
        const n = { ...e };
        if (n[b.chave]) delete n[b.chave]; else n[b.chave] = b;
        return n;
    });
    const alternarGrupo = (blocos) => setEscolhidas(e => {
        const n = { ...e };
        const todas = blocos.every(b => n[b.chave]);
        blocos.forEach(b => { if (todas) delete n[b.chave]; else n[b.chave] = b; });
        return n;
    });

    const inicio = vigencia === 'DATA' ? dataInicio : (dataInicio || hoje);
    const diasDasAulas = [...new Set(lista.map(b => b.dia))];
    const diaDaDataEscolhida = diaDaData(inicio);
    const diaConfere = vigencia !== 'DATA' || !inicio || diasDasAulas.every(d => d === diaDaDataEscolhida);

    const resumo = lista.length && formData.aluno_nome?.trim() ? (() => {
        const quando = diasDasAulas.map(d => d.toLowerCase()).join(' e ');
        const salas = [...new Set(lista.map(b => b.sala))].join(', ');
        const ate = vigencia === 'DATA' ? (inicio ? `em ${inicio.split('-').reverse().join('/')}` : '')
            : vigencia === 'PERIODO' ? (dataFim ? `toda semana (${quando}) até ${dataFim.split('-').reverse().join('/')}` : '')
            : `toda semana (${quando}), por tempo indeterminado`;
        return ate ? `${formData.aluno_nome.trim()} poderá retirar a chave da sala ${salas} ${ate}.` : '';
    })() : '';

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isPending) return;

        // Envia só os campos do tipo ativo — alternar entre as abas não pode
        // vazar campos de CHAVE num aviso GERAL (e vice-versa).
        if (tipo === 'CHAVE') {
            if (lista.length === 0) { toast.error('Busque e marque pelo menos uma aula.'); return; }
            if (!inicio) { toast.error('Informe a data.'); return; }
            if (vigencia === 'PERIODO' && (!dataFim || dataFim < inicio)) { toast.error('Informe uma data final igual ou posterior à inicial.'); return; }
            if (!diaConfere) { toast.error(`A data cai numa ${diaDaDataEscolhida?.toLowerCase()}, mas a aula escolhida é de ${diasDasAulas.join(' / ').toLowerCase()}.`); return; }
            onSave({
                tipo,
                aluno_nome: formData.aluno_nome,
                aulas: lista.map(b => ({ chave: b.chave, nome_aula: b.nomeAula, periodos: b.periodos.join('') })),
                vigencia,
                data_inicio: inicio,
                data_fim: vigencia === 'PERIODO' ? dataFim : undefined,
                descricao: formData.obs
            });
            return;
        }
        onSave({
            tipo,
            titulo: formData.titulo,
            prioridade: formData.prioridade || 'NORMAL',
            descricao: formData.descricao
        });
    };

    const overlayStyle = {
        position: 'fixed',
        top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999
    };

    return (
        <div style={overlayStyle}>
            <div style={{
                background: '#1e293b', borderRadius: '12px',
                border: '1px solid #334155', width: '640px', maxWidth: '95%', maxHeight: '92vh', overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Novo Registro</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b', lineHeight: 1 }}>✕</button>
                </div>

                <div style={{ padding: '20px 24px 0' }}>
                    <div style={{ display: 'flex', gap: '8px', background: '#0f172a', borderRadius: '8px', padding: '4px', border: '1px solid #1e293b' }}>
                        {[['CHAVE', 'Autorização de Chave'], ['GERAL', 'Aviso / Intercorrência']].map(([val, label]) => (
                            <button key={val} type="button" onClick={() => setTipo(val)} style={{
                                flex: 1, padding: '10px', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                                background: tipo === val ? '#3b82f6' : 'transparent',
                                color: tipo === val ? '#ffffff' : '#94a3b8',
                                transition: 'all 0.2s'
                            }}>{label}</button>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ padding: '24px' }}>
                        {tipo === 'CHAVE' && (
                            <>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={labelStyle}>1. Qual aula?</label>
                                    <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite o nome da aula, o código ou a sala…" style={inputStyle} />
                                    {busca.trim() && (
                                        <div style={{ marginTop: '8px', maxHeight: '220px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '6px', background: '#0f172a' }}>
                                            {grupos.length === 0 ? (
                                                <p style={{ fontSize: '13px', color: '#64748b', margin: 0, padding: '10px 12px' }}>Nenhuma aula encontrada na grade deste prédio.</p>
                                            ) : grupos.map(([nome, blocos]) => (
                                                <div key={nome} style={{ borderBottom: '1px solid #1e293b' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 12px 2px' }}>
                                                        <b style={{ fontSize: '13px', color: '#f1f5f9' }}>{nome}</b>
                                                        {blocos.length > 1 && <button type="button" onClick={() => alternarGrupo(blocos)} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>marcar todas ({blocos.length})</button>}
                                                    </div>
                                                    {blocos.map(b => (
                                                        <label key={b.chave} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 12px', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                                                            <input type="checkbox" checked={!!escolhidas[b.chave]} onChange={() => alternar(b)} />
                                                            <span>Sala <b>{b.sala}</b> · {b.dia} · <b>{b.periodos.join('')}</b> <span style={{ color: '#64748b' }}>({b.inicio}–{b.fim})</span></span>
                                                        </label>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {lista.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                            {lista.map(b => (
                                                <span key={b.chave} style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#bfdbfe', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    {b.nomeAula} · {b.sala} · {b.dia} · {b.periodos.join('')}
                                                    <button type="button" aria-label="Remover aula" onClick={() => alternar(b)} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0 }}>✕</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={labelStyle}>2. Quem vai retirar a chave?</label>
                                    <input name="aluno_nome" placeholder="Ex: Julia Machado (professora substituta)" required onChange={handleChange} style={inputStyle} />
                                    <input name="obs" placeholder="Observação (opcional) — Ex: assume no lugar da Profa. X, licença maternidade" maxLength={500} onChange={handleChange} style={{ ...inputStyle, marginTop: '8px' }} />
                                </div>

                                <div>
                                    <label style={labelStyle}>3. Até quando vale?</label>
                                    {[['DATA', 'Só em uma data'], ['PERIODO', 'Toda semana, de uma data até outra'], ['INDETERMINADO', 'Por tempo indeterminado (até eu encerrar)']].map(([v, rotulo]) => (
                                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', padding: '3px 0', cursor: 'pointer' }}>
                                            <input type="radio" name="vigencia" checked={vigencia === v} onChange={() => setVigencia(v)} /> {rotulo}
                                        </label>
                                    ))}
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{vigencia === 'DATA' ? 'Data' : 'A partir de'}</span>
                                        <input type="date" value={inicio} min={vigencia === 'DATA' ? undefined : hoje} onChange={e => setDataInicio(e.target.value)} required style={{ ...inputStyle, width: 'auto', colorScheme: 'dark' }} />
                                        {vigencia === 'PERIODO' && (<>
                                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>até</span>
                                            <input type="date" value={dataFim} min={inicio || undefined} onChange={e => setDataFim(e.target.value)} required style={{ ...inputStyle, width: 'auto', colorScheme: 'dark' }} />
                                        </>)}
                                    </div>
                                    {!diaConfere && <p style={{ fontSize: '12px', color: '#f87171', margin: '8px 0 0' }}>Essa data cai numa {diaDaDataEscolhida?.toLowerCase()}, mas a aula é de {diasDasAulas.join(' / ').toLowerCase()}.</p>}
                                    {resumo && <p style={{ fontSize: '13px', color: '#86efac', margin: '12px 0 0' }}>🔑 {resumo}</p>}
                                </div>
                            </>
                        )}

                        {tipo === 'GERAL' && (
                            <>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={labelStyle}>Título do Aviso</label>
                                    <input name="titulo" placeholder="Ex: Projetor da sala 302 com defeito" required onChange={handleChange} style={inputStyle} />
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={labelStyle}>Nível de Prioridade</label>
                                    <select name="prioridade" required onChange={handleChange} style={inputStyle}>
                                        <option value="NORMAL">Normal</option>
                                        <option value="ALTA">Alta (Urgente)</option>
                                        <option value="BAIXA">Baixa</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Descrição Completa</label>
                                    <textarea name="descricao" placeholder="Descreva o problema ou recado com detalhes..." required rows="4" onChange={handleChange} style={{ ...inputStyle, resize: 'vertical' }} />
                                </div>
                            </>
                        )}
                    </div>

                    <div style={{ padding: '16px 24px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'rgba(0,0,0,0.1)', borderRadius: '0 0 12px 12px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 18px', border: '1px solid #475569', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={isPending} style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', background: isPending ? '#1d4ed8' : '#3b82f6', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                            {isPending ? 'Salvando...' : 'Salvar Registro'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}