import React, { useState, useMemo } from 'react';
import { useUI } from '../contexts/UIContext';
import { normalizarTexto } from '../utils/contatosBusca';

const inputStyle = {
    width: '100%', padding: '10px 14px',
    border: '1px solid #334155', borderRadius: '6px',
    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
    background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box'
};

const overlayStyle = {
    position: 'fixed',
    top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99999
};

// Gerencia o índice curso -> Escola. A lista costuma ter 30-50 itens por
// Escola, então tem filtro próprio para achar o que remover.
export default function ModalCursosContato({ contato, isPending, onClose, onAdicionar, onRemover }) {
    const { showConfirm, toast } = useUI();
    const [novoCurso, setNovoCurso] = useState('');
    const [filtro, setFiltro] = useState('');

    const cursos = useMemo(() => contato?.cursos || [], [contato]);

    const visiveis = useMemo(() => {
        const alvo = normalizarTexto(filtro);
        if (!alvo) return cursos;
        return cursos.filter(c => normalizarTexto(c.nome).includes(alvo));
    }, [cursos, filtro]);

    const handleAdicionar = async (e) => {
        e.preventDefault();
        const nome = novoCurso.trim();
        if (!nome) return;
        try {
            await onAdicionar(nome);
            setNovoCurso('');
            toast.success('Curso adicionado.');
        } catch (err) {
            toast.error(err.message || 'Não foi possível adicionar o curso.');
        }
    };

    const handleRemover = async (curso) => {
        const confirmado = await showConfirm(`Remover "${curso.nome}" deste contato?`, 'Remover curso');
        if (!confirmado) return;
        try {
            await onRemover(curso.id);
            toast.success('Curso removido.');
        } catch (err) {
            toast.error(err.message || 'Não foi possível remover o curso.');
        }
    };

    return (
        <div style={overlayStyle}>
            <div style={{
                background: '#1e293b', borderRadius: '12px',
                border: '1px solid #334155', width: '600px', maxWidth: '95%',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                        <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Cursos atendidos</h2>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>{contato?.nome}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b', lineHeight: 1 }}>✕</button>
                </div>

                <div style={{ padding: '20px 24px 0' }}>
                    <form onSubmit={handleAdicionar} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input
                            value={novoCurso}
                            onChange={e => setNovoCurso(e.target.value)}
                            placeholder="Nome do curso a adicionar"
                            maxLength={200}
                            style={inputStyle}
                        />
                        <button type="submit" disabled={isPending || !novoCurso.trim()} style={{
                            padding: '10px 20px', border: 'none', borderRadius: '6px',
                            background: isPending || !novoCurso.trim() ? '#1d4ed8' : '#3b82f6',
                            color: '#fff', cursor: isPending || !novoCurso.trim() ? 'not-allowed' : 'pointer',
                            fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap'
                        }}>{isPending ? '...' : 'Adicionar'}</button>
                    </form>

                    <input
                        value={filtro}
                        onChange={e => setFiltro(e.target.value)}
                        placeholder={`Filtrar entre ${cursos.length} cursos...`}
                        style={{ ...inputStyle, marginBottom: '16px' }}
                    />
                </div>

                <div style={{ padding: '0 24px 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {visiveis.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            {cursos.length === 0 ? 'Nenhum curso vinculado a este contato.' : 'Nenhum curso corresponde ao filtro.'}
                        </div>
                    ) : visiveis.map(curso => (
                        <div key={curso.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                            padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{curso.nome}</span>
                            <button onClick={() => handleRemover(curso)} disabled={isPending} style={{
                                background: 'transparent', border: 'none',
                                cursor: isPending ? 'not-allowed' : 'pointer',
                                opacity: isPending ? 0.3 : 0.5, fontSize: '13px', padding: '4px', flexShrink: 0
                            }} onMouseOver={e => { if (!isPending) e.currentTarget.style.opacity = 1; }}
                                onMouseOut={e => { e.currentTarget.style.opacity = isPending ? 0.3 : 0.5; }}
                                title="Remover curso">🗑️</button>
                        </div>
                    ))}
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.1)', borderRadius: '0 0 12px 12px' }}>
                    <button type="button" onClick={onClose} style={{ padding: '10px 18px', border: '1px solid #475569', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
