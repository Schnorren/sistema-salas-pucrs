import React, { useState, useEffect } from 'react';

export default function AdminPanel({ session, acesso }) {
    const [aba, setAba] = useState('usuarios');
    const [perfis, setPerfis] = useState([]);
    const [predios, setPredios] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (acesso.nivel !== 99) return;

        const carregarDados = async () => {
            setLoading(true);
            try {
                const headers = {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'x-predio-id': acesso.predioId || ''
                };

                const resPerfis = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/perfis`, { headers });
                if (resPerfis.ok) {
                    const dadosPerfis = await resPerfis.json();
                    setPerfis(dadosPerfis);
                }

                const resPredios = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/predios`, { headers });
                if (resPredios.ok) {
                    const dadosPredios = await resPredios.json();
                    setPredios(dadosPredios);
                }

            } catch (err) {
                console.error("Erro ao carregar painel admin:", err);
            } finally {
                setLoading(false);
            }
        };

        carregarDados();
    }, [acesso, session]);

    if (acesso.nivel !== 99) {
        return <div className="empty-st" style={{color: 'var(--red)'}}>Acesso Negado. Esta área é restrita a Coordenadores Globais.</div>;
    }

    return (
        <div className="view active" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px' }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '24px', color: 'var(--text)', marginBottom: '8px' }}>Painel Administrativo</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Gerencie permissões, crie novos níveis de acesso e cadastre os prédios da PUCRS.</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                {['usuarios', 'perfis', 'predios'].map(t => (
                    <button 
                        key={t}
                        onClick={() => setAba(t)}
                        style={{ 
                            padding: '12px 24px', background: 'transparent', border: 'none', 
                            borderBottom: aba === t ? '2px solid #3b82f6' : '2px solid transparent',
                            color: aba === t ? '#3b82f6' : 'var(--muted)',
                            cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', textTransform: 'capitalize'
                        }}
                    >
                        {t === 'usuarios' ? '👥 Usuários & Acessos' : t === 'perfis' ? '🛡️ Níveis de Perfil' : '🏢 Prédios'}
                    </button>
                ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div className="empty-st">Carregando dados do servidor...</div>
                ) : (
                    <>
                        {aba === 'usuarios' && (
                            <div className="bar-card">
                                <h3>Usuários do Sistema</h3>
                                <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px' }}>Em breve: Lista de usuários e atribuição de papéis.</p>
                            </div>
                        )}

                        {aba === 'perfis' && (
                            <div className="bar-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <h3>Cargos e Níveis (RBAC)</h3>
                                    <button className="btn-primary" style={{ background: '#22c55e' }}>+ Novo Perfil</button>
                                </div>
                                <table className="heat-tbl" style={{ width: '100%', textAlign: 'left' }}>
                                    <thead>
                                        <tr>
                                            <th>Nome do Cargo</th>
                                            <th>Nível de Poder</th>
                                            <th>Descrição Operacional</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {perfis.map(p => (
                                            <tr key={p.id}>
                                                <td style={{ fontWeight: 'bold' }}>{p.nome}</td>
                                                <td><span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Nível {p.nivel}</span></td>
                                                <td style={{ color: 'var(--muted)' }}>
                                                    {p.nivel === 99 ? 'Acesso total. Gestão de sistema e usuários.' : 
                                                     p.nivel >= 3 ? 'Gestão local. Pode atualizar a grade do próprio prédio.' :
                                                     p.nivel >= 2 ? 'Operação. Pode entregar chaves e gerenciar avisos.' : 'Apenas visualização do painel.'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {aba === 'predios' && (
                            <div className="bar-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <h3>Unidades (Tenants)</h3>
                                    <button className="btn-primary" style={{ background: '#3b82f6' }}>+ Novo Prédio</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    {predios.map(p => (
                                        <div key={p.id} style={{ padding: '16px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                            <h4 style={{ margin: 0, fontSize: '16px' }}>{p.nome}</h4>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}