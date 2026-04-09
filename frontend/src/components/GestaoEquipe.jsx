import React, { useState, useEffect, useCallback } from 'react';
import { usePredio } from '../contexts/PredioContext';

const MODULOS_DISPONIVEIS = [
    { id: 'avisos', label: 'Mural de Avisos', icon: '⚠️' },
    { id: 'emprestimos', label: 'Módulo de Empréstimos', icon: '📦' },
    { id: 'relatorios', label: 'Análise, Relatórios e Salas Livres', icon: '📊' },
    { id: 'equipe', label: 'Gestão de Equipe e Permissões', icon: '👥' }
];

export default function GestaoEquipe({ session, acesso }) {
    const { predioAtivo } = usePredio();
    const [equipe, setEquipe] = useState([]);
    const [perfis, setPerfis] = useState([]);
    const [loading, setLoading] = useState(true);

    const [emailBusca, setEmailBusca] = useState('');
    const [cargoSelecionado, setCargoSelecionado] = useState('');
    const [permissoesEditadas, setPermissoesEditadas] = useState([]);
    const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'x-predio-id': predioAtivo || acesso?.predioId || ''
    }), [session, predioAtivo, acesso]);

    const carregarDados = useCallback(async () => {
        if (!predioAtivo) return;
        setLoading(true);
        try {
            const [resEquipe, resPerfis] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/equipe`, { headers: getHeaders() }),
                fetch(`${import.meta.env.VITE_API_URL}/api/equipe/perfis`, { headers: getHeaders() })
            ]);

            if (resEquipe.ok && resPerfis.ok) {
                setEquipe(await resEquipe.json());
                setPerfis(await resPerfis.json());
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [predioAtivo, getHeaders]);

    useEffect(() => {
        carregarDados();
    }, [carregarDados]);

    const handleSelecionar = (user) => {
        setUsuarioSelecionado(user);
        setEmailBusca(user.email);
        setCargoSelecionado(user.perfil_id || '');
        setPermissoesEditadas(user.permissoes || []);
    };

    const togglePermissao = (modId) => {
        setPermissoesEditadas(prev =>
            prev.includes(modId) ? prev.filter(p => p !== modId) : [...prev, modId]
        );
    };

    const handleSalvar = async () => {
        if (!emailBusca) return alert("Digite ou selecione um e-mail.");
        if (!cargoSelecionado) return alert("Selecione um cargo para o funcionário.");

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/equipe/membro`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    email: emailBusca,
                    perfil_id: cargoSelecionado,
                    permissoes: permissoesEditadas
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error);

            alert("Cadastro atualizado com sucesso!");
            setUsuarioSelecionado(null);
            setEmailBusca('');
            setCargoSelecionado('');
            setPermissoesEditadas([]);
            carregarDados();
        } catch (err) {
            alert("Erro: " + err.message);
        }
    };

    return (
        <div style={{ padding: '24px', color: 'var(--text)', display: 'flex', gap: '24px', height: '100%' }}>
            <div style={{ width: '380px', background: 'var(--surface, #1e293b)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ marginTop: 0, color: '#60a5fa' }}>Editar Cadastro</h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' }}>
                    Selecione um usuário ao lado para alterar seu cargo e autorizações.
                </p>

                <label style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>E-mail do Funcionário</label>
                <input
                    type="email"
                    value={emailBusca}
                    onChange={e => setEmailBusca(e.target.value)}
                    placeholder="recepcao@pucrs.br"
                    disabled={!!usuarioSelecionado}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'inherit', border: '1px solid var(--border)', marginBottom: '16px' }}
                />

                <label style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Cargo / Função *</label>
                <select
                    value={cargoSelecionado}
                    onChange={e => setCargoSelecionado(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'inherit', border: '1px solid var(--border)', marginBottom: '24px' }}
                >
                    <option value="">Selecione o cargo...</option>
                    {perfis.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                </select>

                <label style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Módulos Autorizados</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                    {MODULOS_DISPONIVEIS.map(mod => {
                        const ativo = permissoesEditadas.includes(mod.id);
                        return (
                            <div
                                key={mod.id}
                                onClick={() => togglePermissao(mod.id)}
                                style={{
                                    padding: '12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                                    border: `1px solid ${ativo ? '#3b82f6' : 'var(--border)'}`,
                                    background: ativo ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span style={{ fontSize: '18px' }}>{mod.icon}</span>
                                <span style={{ flex: 1, fontSize: '14px', fontWeight: ativo ? 'bold' : 'normal', color: ativo ? '#fff' : 'var(--muted)' }}>
                                    {mod.label}
                                </span>
                                {ativo && <span style={{ color: '#3b82f6' }}>✓</span>}
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                    {usuarioSelecionado && (
                        <button onClick={() => { setUsuarioSelecionado(null); setEmailBusca(''); setCargoSelecionado(''); setPermissoesEditadas([]); }} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#9ca3af', border: '1px solid #475569', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Cancelar
                        </button>
                    )}
                    <button onClick={handleSalvar} style={{ flex: 2, padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Salvar Dados
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, background: 'var(--surface, #1e293b)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Equipe do Prédio Ativo</h3>
                {loading ? <p>Carregando equipe...</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                                <th style={{ padding: '12px' }}>E-mail</th>
                                <th style={{ padding: '12px' }}>Cargo</th>
                                <th style={{ padding: '12px' }}>Acessos Liberados</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {equipe.map(user => (
                                <tr key={user.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '12px', fontWeight: '500' }}>{user.email}</td>
                                    <td style={{ padding: '12px', color: '#94a3b8' }}>{user.perfil_nome}</td>
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {(user.permissoes || []).length === 0 ? <span style={{ color: '#64748b', fontSize: '12px' }}>Nenhum</span> :
                                                user.permissoes.map(p => (
                                                    <span key={p} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                                        {p.toUpperCase()}
                                                    </span>
                                                ))
                                            }
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleSelecionar(user)}
                                            style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                        >
                                            Editar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}