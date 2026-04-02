import React, { useState } from 'react';

export default function ModalComentarAviso({ aviso, onClose, onConfirm }) {
    const [nota, setNota] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (nota.trim().length > 0) {
            onConfirm(nota);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
            <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', width: '450px', maxWidth: '90%', border: '1px solid #334155', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '18px' }}>Adicionar Nota</h3>
                <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '20px' }}>
                    Atualizando o aviso: <strong style={{color: '#e2e8f0'}}>{aviso.titulo}</strong>
                </p>

                <form onSubmit={handleSubmit}>
                    <textarea 
                        placeholder="Ex: Fui até a sala, mas a porta estava trancada. Aguardando manutenção..." 
                        rows="4" 
                        required
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        style={{ 
                            width: '100%', padding: '12px', marginBottom: '24px', boxSizing: 'border-box',
                            border: '1px solid #334155', borderRadius: '8px',
                            background: '#0f172a', color: '#f1f5f9',
                            fontFamily: 'inherit', resize: 'vertical', outline: 'none', fontSize: '14px'
                        }} 
                    />
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 18px', border: '1px solid #475569', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                            Cancelar
                        </button>
                        <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                            Salvar Nota
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}