import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function ModalHistoricoAvisos({ onClose }) {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [abaAtiva, setAbaAtiva] = useState('CHAVE');

    useEffect(() => {
        async function fetchHistorico() {
            try {
                const { data, error } = await supabase
                    .from('avisos')
                    .select('*')
                    .eq('status', 'CONCLUIDO')
                    .order('concluido_em', { ascending: false })
                    .limit(200);

                if (error) throw error;
                setHistorico(data || []);
            } catch (error) {
                console.error("Erro ao buscar histórico:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchHistorico();
    }, []);

    const formatarDataHora = (isoString) => {
        if (!isoString) return '--';
        const data = new Date(isoString);
        return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const dadosFiltrados = historico.filter(h => h.tipo === abaAtiva);

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
            <div style={{ background: '#0f172a', padding: '0', borderRadius: '12px', width: '900px', maxWidth: '95%', maxHeight: '85vh', border: '1px solid #334155', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
                
                {/* Cabeçalho */}
                <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #1e293b', background: '#1e293b', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', color: '#f8fafc', fontSize: '18px' }}>Auditoria de Operações</h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Registros encerrados no sistema.</p>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#64748b', lineHeight: 1 }}>✕</button>
                    </div>

                    <div style={{ display: 'flex', gap: '24px' }}>
                        <button 
                            onClick={() => setAbaAtiva('CHAVE')}
                            style={{ 
                                background: 'transparent', border: 'none', padding: '10px 0', cursor: 'pointer',
                                color: abaAtiva === 'CHAVE' ? '#60a5fa' : '#64748b',
                                borderBottom: abaAtiva === 'CHAVE' ? '2px solid #3b82f6' : '2px solid transparent',
                                fontSize: '14px', fontWeight: 'bold', transition: 'all 0.2s'
                            }}
                        >
                            🔑 Autorizações de Chaves
                        </button>
                        <button 
                            onClick={() => setAbaAtiva('GERAL')}
                            style={{ 
                                background: 'transparent', border: 'none', padding: '10px 0', cursor: 'pointer',
                                color: abaAtiva === 'GERAL' ? '#fbbf24' : '#64748b',
                                borderBottom: abaAtiva === 'GERAL' ? '2px solid #f59e0b' : '2px solid transparent',
                                fontSize: '14px', fontWeight: 'bold', transition: 'all 0.2s'
                            }}
                        >
                            ⚠️ Avisos e Intercorrências
                        </button>
                    </div>
                </div>

                {/* Corpo da Tabela */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <p style={{ color: '#94a3b8', textAlign: 'center' }}>Carregando registros...</p>
                    ) : dadosFiltrados.length === 0 ? (
                        <p style={{ color: '#94a3b8', textAlign: 'center' }}>Nenhum registro encontrado nesta categoria.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                                    <th style={{ padding: '12px 8px', fontWeight: 'bold' }}>Referência</th>
                                    <th style={{ padding: '12px 8px', fontWeight: 'bold' }}>Concluído Em</th>
                                    {abaAtiva === 'GERAL' && <th style={{ padding: '12px 8px', fontWeight: 'bold' }}>Observação Final</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {dadosFiltrados.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                                        <td style={{ padding: '12px 8px', color: '#f8fafc' }}>
                                            {item.tipo === 'CHAVE' ? `Sala ${item.sala_id} - ${item.aluno_nome}` : item.titulo}
                                        </td>
                                        <td style={{ padding: '12px 8px' }}>
                                            {formatarDataHora(item.concluido_em)}
                                        </td>
                                        {abaAtiva === 'GERAL' && (
                                            <td style={{ padding: '12px 8px', fontStyle: item.obs_conclusao ? 'normal' : 'italic', color: item.obs_conclusao ? '#cbd5e1' : '#64748b' }}>
                                                {item.obs_conclusao || 'Nenhuma observação'}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}