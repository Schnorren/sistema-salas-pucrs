import React, { useEffect, useState } from 'react';
import { useAvisos } from '../hooks/useAvisos';
import ModalNovoAviso from './ModalNovoAviso';
import ModalConcluirAviso from './ModalConcluirAviso';

const pillStyle = {
    fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
    background: 'var(--bg, #f4f4f4)',
    color: 'var(--text-secondary, #666)',
    border: '1px solid var(--border, #ccc)', whiteSpace: 'nowrap', fontWeight: 'bold'
};

const prioStyle = {
    ALTA:  { color: '#dc3545', border: '1px solid #dc3545' },
    NORMAL:{ color: '#fd7e14', border: '1px solid #fd7e14' },
    BAIXA: { color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #ccc)' },
};

export default function MuralAvisos({ session }) {
    const userId = session?.user?.id;
    const { avisos, loading, error, fetchAvisosAtivos, criarAviso, concluirAviso } = useAvisos();
    const [isModalNovoAvisoOpen, setIsModalNovoAvisoOpen] = useState(false);
    const [avisoSelecionadoParaConcluir, setAvisoSelecionadoParaConcluir] = useState(null);

    useEffect(() => { fetchAvisosAtivos(); }, [fetchAvisosAtivos]);

    const autorizacoesChaves = avisos.filter(a => a.tipo === 'CHAVE');
    const avisosGerais = avisos.filter(a => a.tipo === 'GERAL');

    const handleSalvarNovo = async (dados) => {
        const sucesso = await criarAviso(dados, userId);
        if (sucesso) setIsModalNovoAvisoOpen(false);
    };

    const handleConfirmarConclusao = async (obs) => {
        if (!avisoSelecionadoParaConcluir) return;
        const sucesso = await concluirAviso(avisoSelecionadoParaConcluir.id, obs, userId);
        if (sucesso) setAvisoSelecionadoParaConcluir(null);
    };

    if (loading && avisos.length === 0) return <p style={{ padding: 24, color: 'var(--text-secondary, #666)' }}>Carregando mural...</p>;
    if (error) return <p style={{ padding: 24, color: '#dc3545' }}>{error}</p>;

    return (
        <div style={{ padding: '24px', background: 'var(--bg, #f5f5f3)', minHeight: '100%', color: 'var(--text, #333)' }}>

            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Mural de Operações</h2>
                <button onClick={() => setIsModalNovoAvisoOpen(true)} style={{
                    padding: '8px 16px', background: 'var(--primary, #004a99)', color: '#fff',
                    border: 'none', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Novo registro
                </button>
            </div>

            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border, #ccc)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface, #fff)', border: '1px solid var(--border, #ccc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🔑</div>
                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>Autorizações de Chaves</h3>
                        <span style={{ ...pillStyle, background: 'var(--surface, #fff)' }}>{autorizacoesChaves.length}</span>
                    </div>

                    {autorizacoesChaves.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary, #666)', background: 'var(--surface, #fff)', borderRadius: '8px', border: '1px dashed var(--border, #ccc)' }}>
                            Nenhuma autorização pendente.
                        </div>
                    ) : autorizacoesChaves.map(aviso => (
                        <div key={aviso.id} style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #ccc)', borderLeft: '4px solid var(--primary, #004a99)', borderRadius: '6px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '10px' }}>{aviso.aluno_nome}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                                <span style={pillStyle}>{aviso.sala_id}</span>
                                <span style={pillStyle}>{aviso.disciplina}</span>
                                <span style={pillStyle}>{aviso.data_prevista}</span>
                                <span style={{ ...pillStyle, background: 'var(--primary, #004a99)', color: '#fff', border: 'none' }}>Período {aviso.periodo}</span>
                            </div>
                            <button onClick={() => setAvisoSelecionadoParaConcluir(aviso)} style={{ padding: '8px 12px', background: 'transparent', color: 'var(--primary, #004a99)', border: '1px solid var(--primary, #004a99)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'all 0.2s' }}>
                                Entregar chave
                            </button>
                        </div>
                    ))}
                </div>

                
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border, #ccc)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface, #fff)', border: '1px solid var(--border, #ccc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>⚠️</div>
                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>Avisos e Intercorrências</h3>
                        <span style={{ ...pillStyle, background: 'var(--surface, #fff)' }}>{avisosGerais.length}</span>
                    </div>

                    {avisosGerais.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary, #666)', background: 'var(--surface, #fff)', borderRadius: '8px', border: '1px dashed var(--border, #ccc)' }}>
                            Nenhum aviso ativo.
                        </div>
                    ) : avisosGerais.map(aviso => {
                        const prio = aviso.prioridade || 'NORMAL';
                        const borderColor = prio === 'ALTA' ? '#dc3545' : prio === 'BAIXA' ? 'var(--border, #ccc)' : '#fd7e14';
                        
                        return (
                            <div key={aviso.id} style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #ccc)', borderLeft: `4px solid ${borderColor}`, borderRadius: '6px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '15px', fontWeight: 'bold' }}>{aviso.titulo}</span>
                                    <span style={{ ...pillStyle, ...prioStyle[prio], background: 'transparent', marginLeft: '8px' }}>
                                        {prio.charAt(0) + prio.slice(1).toLowerCase()}
                                    </span>
                                </div>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #666)', lineHeight: '1.5', marginBottom: '12px', whiteSpace: 'pre-wrap', margin: '0 0 12px 0' }}>{aviso.descricao}</p>
                                <button onClick={() => setAvisoSelecionadoParaConcluir(aviso)} style={{ padding: '8px 12px', background: 'var(--bg, #f4f4f4)', color: 'var(--text, #333)', border: '1px solid var(--border, #ccc)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                    Marcar como resolvido
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isModalNovoAvisoOpen && <ModalNovoAviso onClose={() => setIsModalNovoAvisoOpen(false)} onSave={handleSalvarNovo} />}
            {avisoSelecionadoParaConcluir && <ModalConcluirAviso aviso={avisoSelecionadoParaConcluir} onClose={() => setAvisoSelecionadoParaConcluir(null)} onConfirm={handleConfirmarConclusao} />}
        </div>
    );
}