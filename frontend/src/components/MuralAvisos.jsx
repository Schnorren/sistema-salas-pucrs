import React, { useEffect, useState } from 'react';
import { useAvisos } from '../hooks/useAvisos';
import ModalNovoAviso from './ModalNovoAviso';
import ModalConcluirAviso from './ModalConcluirAviso';
import ModalHistoricoAvisos from './ModalHistoricoAvisos';

const pillStyle = {
    fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.05)', 
    color: '#9ca3af', 
    border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', fontWeight: 'bold'
};

const prioStyle = {
    ALTA:  { color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)' },
    NORMAL:{ color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.1)' },
    BAIXA: { color: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.3)', background: 'rgba(255,255,255,0.05)' },
};

const pesoPrioridade = { ALTA: 1, NORMAL: 2, BAIXA: 3 };

export default function MuralAvisos({ session }) {
    const userId = session?.user?.id;
    // Puxando a nova função excluirAviso do hook
    const { avisos, loading, error, fetchAvisosAtivos, criarAviso, concluirAviso, excluirAviso } = useAvisos();
    
    const [isModalNovoAvisoOpen, setIsModalNovoAvisoOpen] = useState(false);
    const [avisoSelecionadoParaConcluir, setAvisoSelecionadoParaConcluir] = useState(null);
    const [isModalHistoricoOpen, setIsModalHistoricoOpen] = useState(false); 

    useEffect(() => { fetchAvisosAtivos(); }, [fetchAvisosAtivos]);

    const autorizacoesChaves = avisos
        .filter(a => a.tipo === 'CHAVE')
        .sort((a, b) => {
            const dataA = a.data_prevista || '9999-12-31'; 
            const dataB = b.data_prevista || '9999-12-31';
            if (dataA !== dataB) return dataA.localeCompare(dataB);
            const perA = a.periodo || '';
            const perB = b.periodo || '';
            return perA.localeCompare(perB);
        });

    const avisosGerais = avisos
        .filter(a => a.tipo === 'GERAL')
        .sort((a, b) => pesoPrioridade[a.prioridade || 'NORMAL'] - pesoPrioridade[b.prioridade || 'NORMAL']);

    const handleSalvarNovo = async (dados) => {
        const sucesso = await criarAviso(dados, userId);
        if (sucesso) setIsModalNovoAvisoOpen(false);
    };

    const handleConfirmarConclusao = async (obs) => {
        if (!avisoSelecionadoParaConcluir) return;
        const sucesso = await concluirAviso(avisoSelecionadoParaConcluir.id, obs, userId);
        if (sucesso) setAvisoSelecionadoParaConcluir(null);
    };

    // NOVA FUNÇÃO: Lida com o clique na lixeira
    const handleExcluir = async (id) => {
        if (window.confirm("Tem certeza que deseja apagar este registro permanentemente? (Ele NÃO irá para o histórico de auditoria).")) {
            await excluirAviso(id);
        }
    };

    if (loading && avisos.length === 0) return <p style={{ padding: 24, color: '#9ca3af' }}>Carregando mural...</p>;
    if (error) return <p style={{ padding: 24, color: '#ef4444' }}>{error}</p>;

    return (
        <div style={{ padding: '24px', background: 'transparent', minHeight: '100%', color: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Mural de Operações</h2>
                <button onClick={() => setIsModalNovoAvisoOpen(true)} style={{
                    padding: '8px 16px', background: '#3b82f6', color: '#fff',
                    border: 'none', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'background 0.2s'
                }} onMouseOver={e => e.currentTarget.style.background = '#2563eb'} onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}>
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Novo registro
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flex: 1 }}>
                
                {/* Coluna 1: Chaves */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🔑</div>
                        <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0, color: '#e2e8f0' }}>Autorizações de Chaves</h3>
                        <span style={{ ...pillStyle, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>{autorizacoesChaves.length}</span>
                    </div>

                    {autorizacoesChaves.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            Nenhuma autorização pendente.
                        </div>
                    ) : autorizacoesChaves.map(aviso => (
                        <div key={aviso.id} style={{ background: '#1e293b', border: '1px solid #334155', borderLeft: '4px solid #3b82f6', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                            
                            {/* Header do Card com botão Excluir */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>{aviso.aluno_nome}</div>
                                <button onClick={() => handleExcluir(aviso.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '14px', padding: '4px' }} onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.5} title="Excluir Permanentemente">🗑️</button>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                <span style={pillStyle}>{aviso.sala_id}</span>
                                <span style={pillStyle}>{aviso.disciplina}</span>
                                <span style={pillStyle}>{aviso.data_prevista.split('-').reverse().join('/')}</span>
                                <span style={{ ...pillStyle, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>Per. {aviso.periodo}</span>
                            </div>
                            <button onClick={() => setAvisoSelecionadoParaConcluir(aviso)} style={{ padding: '8px 16px', background: 'transparent', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'all 0.2s' }} onMouseOver={e => {e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}} onMouseOut={e => {e.currentTarget.style.background = 'transparent'}}>
                                ✓ Entregar chave
                            </button>
                        </div>
                    ))}
                </div>

                {/* Coluna 2: Avisos Gerais */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>⚠️</div>
                        <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0, color: '#e2e8f0' }}>Avisos e Intercorrências</h3>
                        <span style={{ ...pillStyle, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>{avisosGerais.length}</span>
                    </div>

                    {avisosGerais.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            Nenhum aviso ativo.
                        </div>
                    ) : avisosGerais.map(aviso => {
                        const prio = aviso.prioridade || 'NORMAL';
                        const borderLeftColor = prio === 'ALTA' ? '#ef4444' : prio === 'BAIXA' ? '#64748b' : '#f59e0b';
                        
                        return (
                            <div key={aviso.id} style={{ background: '#1e293b', border: '1px solid #334155', borderLeft: `4px solid ${borderLeftColor}`, borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                
                                {/* Header do Card com botão Excluir */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>{aviso.titulo}</span>
                                        <span style={{ ...pillStyle, ...prioStyle[prio] }}>
                                            {prio.charAt(0) + prio.slice(1).toLowerCase()}
                                        </span>
                                    </div>
                                    <button onClick={() => handleExcluir(aviso.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '14px', padding: '4px' }} onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.5} title="Excluir Permanentemente">🗑️</button>
                                </div>
                                
                                <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '16px', whiteSpace: 'pre-wrap', margin: '0 0 16px 0' }}>{aviso.descricao}</p>
                                <button onClick={() => setAvisoSelecionadoParaConcluir(aviso)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'all 0.2s' }} onMouseOver={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}} onMouseOut={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}}>
                                    ✓ Marcar como resolvido
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={{ marginTop: '40px', paddingBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                <button 
                    onClick={() => setIsModalHistoricoOpen(true)} 
                    style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', 
                        color: '#64748b', fontSize: '13px', padding: '8px 16px', borderRadius: '6px',
                        cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px'
                    }} 
                    onMouseOver={e => {e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}} 
                    onMouseOut={e => {e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}}
                >
                    <span>📋</span> Visualizar histórico de auditoria (Registros encerrados)
                </button>
            </div>

            {isModalNovoAvisoOpen && <ModalNovoAviso onClose={() => setIsModalNovoAvisoOpen(false)} onSave={handleSalvarNovo} />}
            {avisoSelecionadoParaConcluir && <ModalConcluirAviso aviso={avisoSelecionadoParaConcluir} onClose={() => setAvisoSelecionadoParaConcluir(null)} onConfirm={handleConfirmarConclusao} />}
            {isModalHistoricoOpen && <ModalHistoricoAvisos onClose={() => setIsModalHistoricoOpen(false)} />}
        </div>
    );
}