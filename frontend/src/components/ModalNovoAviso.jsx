import React, { useState } from 'react';

const inputStyle = {
    width: '100%', padding: '9px 12px',
    border: '1px solid var(--border, #ccc)', borderRadius: '8px',
    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
    background: 'var(--surface, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box'
};

const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 'bold',
    color: 'var(--text-secondary, #666)', marginBottom: '5px',
    textTransform: 'uppercase', letterSpacing: '0.04em'
};

export default function ModalNovoAviso({ onClose, onSave }) {
    const [tipo, setTipo] = useState('CHAVE');
    const [formData, setFormData] = useState({});
    const periodosDisponiveis = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','P'];

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handlePeriodoToggle = (letra) => {
        let selecionados = formData.periodo ? formData.periodo.split('') : [];
        selecionados = selecionados.includes(letra)
            ? selecionados.filter(p => p !== letra)
            : [...selecionados, letra];
        selecionados.sort();
        setFormData({ ...formData, periodo: selecionados.join('') });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (tipo === 'CHAVE' && (!formData.periodo || formData.periodo.length === 0)) {
            alert("Selecione pelo menos um período.");
            return;
        }
        onSave({ ...formData, tipo });
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div style={{
                background: 'var(--surface, #fff)', borderRadius: '12px',
                border: '1px solid var(--border, #ccc)', width: '520px', maxWidth: '92%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
                
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border, #ccc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: 'var(--text, #333)' }}>Novo registro</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-secondary, #666)', lineHeight: 1 }}>✕</button>
                </div>

                
                <div style={{ padding: '16px 24px 0' }}>
                    <div style={{ display: 'flex', gap: '6px', background: 'var(--bg, #f4f4f4)', borderRadius: '8px', padding: '4px' }}>
                        {[['CHAVE', 'Autorizar chave'], ['GERAL', 'Aviso geral']].map(([val, label]) => (
                            <button key={val} onClick={() => setTipo(val)} style={{
                                flex: 1, padding: '8px', border: tipo === val ? '1px solid var(--border, #ccc)' : 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                                background: tipo === val ? 'var(--surface, #fff)' : 'transparent',
                                color: tipo === val ? 'var(--primary, #004a99)' : 'var(--text-secondary, #666)', 
                                transition: 'all 0.2s'
                            }}>{label}</button>
                        ))}
                    </div>
                </div>

                
                <form onSubmit={handleSubmit}>
                    <div style={{ padding: '20px 24px' }}>
                        {tipo === 'CHAVE' && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>Nome do aluno</label>
                                        <input name="aluno_nome" placeholder="Ex: João Silva" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Sala</label>
                                        <input name="sala_id" placeholder="Ex: 302, Lab 4" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                    <div>
                                        <label style={labelStyle}>Disciplina / Motivo</label>
                                        <input name="disciplina" placeholder="Ex: Cálculo I" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Data prevista</label>
                                        <input type="date" name="data_prevista" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Períodos autorizados</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                        {periodosDisponiveis.map(letra => {
                                            const sel = formData.periodo?.includes(letra);
                                            return (
                                                <button key={letra} type="button" onClick={() => handlePeriodoToggle(letra)} style={{
                                                    width: '34px', height: '34px', borderRadius: '6px', cursor: 'pointer',
                                                    fontSize: '13px', fontWeight: 'bold', transition: 'all 0.15s',
                                                    border: sel ? 'none' : '1px solid var(--border, #ccc)',
                                                    background: sel ? 'var(--primary, #004a99)' : 'var(--bg, #f4f4f4)',
                                                    color: sel ? '#fff' : 'var(--text, #333)'
                                                }}>{letra}</button>
                                            );
                                        })}
                                    </div>
                                    <p style={{ fontSize: '12px', color: 'var(--text-secondary, #666)', marginTop: '8px' }}>
                                        Selecionados: <span style={{ color: 'var(--primary, #004a99)', fontWeight: 'bold' }}>{formData.periodo || 'Nenhum'}</span>
                                    </p>
                                </div>
                            </>
                        )}

                        {tipo === 'GERAL' && (
                            <>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={labelStyle}>Título do aviso</label>
                                    <input name="titulo" placeholder="Ex: Projetor da sala 302 com defeito" required onChange={handleChange} style={inputStyle} />
                                </div>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={labelStyle}>Prioridade</label>
                                    <select name="prioridade" required onChange={handleChange} style={inputStyle}>
                                        <option value="NORMAL">Normal</option>
                                        <option value="ALTA">Alta</option>
                                        <option value="BAIXA">Baixa</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Descrição</label>
                                    <textarea name="descricao" placeholder="Descreva o problema ou recado..." required rows="4" onChange={handleChange} style={{ ...inputStyle, resize: 'vertical' }} />
                                </div>
                            </>
                        )}
                    </div>

                    
                    <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border, #ccc)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '9px 16px', border: '1px solid var(--border, #ccc)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', color: 'var(--text, #333)' }}>
                            Cancelar
                        </button>
                        <button type="submit" style={{ padding: '9px 18px', border: 'none', borderRadius: '8px', background: 'var(--primary, #004a99)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                            Salvar registro
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}