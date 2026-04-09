import React, { useState } from 'react';

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

export default function ModalNovoAviso({ onClose, onSave }) {
    const [tipo, setTipo] = useState('CHAVE');
    const [formData, setFormData] = useState({});
    const periodosDisponiveis = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'P'];

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
                border: '1px solid #334155', width: '550px', maxWidth: '95%',
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
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={labelStyle}>Nome do Aluno</label>
                                        <input name="aluno_nome" placeholder="Ex: João Silva" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Sala</label>
                                        <input name="sala_id" placeholder="Ex: 302, Lab 4" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Disciplina / Motivo</label>
                                        <input name="disciplina" placeholder="Ex: Cálculo I" required onChange={handleChange} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Data Prevista</label>
                                        <input type="date" name="data_prevista" required onChange={handleChange} style={{ ...inputStyle, colorScheme: 'dark' }} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Períodos Autorizados (Clique para selecionar)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                        {periodosDisponiveis.map(letra => {
                                            const sel = formData.periodo?.includes(letra);
                                            return (
                                                <button key={letra} type="button" onClick={() => handlePeriodoToggle(letra)} style={{
                                                    width: '38px', height: '38px', borderRadius: '6px', cursor: 'pointer',
                                                    fontSize: '14px', fontWeight: 'bold', transition: 'all 0.1s',
                                                    border: sel ? '1px solid #3b82f6' : '1px solid #334155',
                                                    background: sel ? '#3b82f6' : '#0f172a',
                                                    color: sel ? '#fff' : '#cbd5e1'
                                                }}>{letra}</button>
                                            );
                                        })}
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#64748b', marginTop: '12px' }}>
                                        Períodos Salvos: <span style={{ color: '#60a5fa', fontWeight: 'bold', marginLeft: '4px' }}>{formData.periodo || 'Nenhum'}</span>
                                    </p>
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
                        <button type="submit" style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                            Salvar Registro
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}