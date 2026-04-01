import React, { useState } from 'react';

export default function ModalConcluirAviso({ aviso, onClose, onConfirm }) {
    const [obs, setObs] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(obs);
    };

    const tituloResumo = aviso.tipo === 'CHAVE' 
        ? `Entrega de Chave: ${aviso.sala_id} para ${aviso.aluno_nome}` 
        : `Fechamento de Aviso: ${aviso.titulo}`;

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
            <div style={{ background: 'var(--surface, #fff)', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', border: '1px solid var(--border, #ccc)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: 'var(--text, #333)', fontSize: '16px' }}>Concluir Operação</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #666)', marginBottom: '20px' }}>{tituloResumo}</p>

                <form onSubmit={handleSubmit}>
                    <textarea 
                        placeholder="Adicione uma observação (Opcional). Ex: Aluno apresentou ID, Chamado técnico aberto..." 
                        rows="3" 
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        style={{ 
                            width: '100%', padding: '10px', marginBottom: '20px', boxSizing: 'border-box',
                            border: '1px solid var(--border, #ccc)', borderRadius: '8px',
                            background: 'var(--bg, #f4f4f4)', color: 'var(--text, #333)',
                            fontFamily: 'inherit', resize: 'vertical'
                        }} 
                    />
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '9px 16px', border: '1px solid var(--border, #ccc)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', color: 'var(--text, #333)' }}>
                            Cancelar
                        </button>
                        <button type="submit" style={{ padding: '9px 16px', background: 'var(--primary, #004a99)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                            Confirmar Conclusão
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}