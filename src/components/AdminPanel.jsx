import React, { useState, useEffect, useCallback } from 'react';

export default function AdminPanel({ session, acesso }) {
    const [aba, setAba] = useState('usuarios');
    const [perfis, setPerfis] = useState([]);
    const [predios, setPredios] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [modulosSistema, setModulosSistema] = useState([]);
    const [loading, setLoading] = useState(true);

    const [busca, setBusca] = useState('');
    const [modal, setModal] = useState({ aberto: false, tipo: null, dados: null });
    const [formLoading, setFormLoading] = useState(false);

    const token = session?.access_token;
    const meuIdId = session?.user?.id;

    const isAdmin = acesso?.permissoes?.includes('admin');

    const carregarDados = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${token}` };

            const resModulos = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/modulos`, { headers });
            if (resModulos.ok) setModulosSistema(await resModulos.json());

            const resPerfis = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/perfis`, { headers });
            if (resPerfis.ok) setPerfis(await resPerfis.json());

            const resPredios = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/predios`, { headers });
            if (resPredios.ok) setPredios(await resPredios.json());

            const resUsuarios = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/usuarios`, { headers });
            if (resUsuarios.ok) setUsuarios(await resUsuarios.json());

        } catch (err) {
            console.error("Erro ao carregar painel admin:", err);
        } finally {
            setLoading(false);
        }
    }, [token, isAdmin]);

    useEffect(() => {
        carregarDados();
    }, [carregarDados]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormLoading(true);

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        try {
            if (modal.tipo === 'novo_predio') {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/predios`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ nome: modal.dados.nome })
                });
                if (!res.ok) throw new Error('Falha ao criar prédio');
            }

            if (modal.tipo === 'novo_perfil') {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/perfis`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ nome: modal.dados.nome })
                });
                if (!res.ok) throw new Error('Falha ao criar cargo');
            }

            if (modal.tipo === 'editar_usuario') {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/usuarios`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        usuarioId: modal.dados.id,
                        nome: modal.dados.nome,
                        predioId: modal.dados.predioId,
                        perfilId: modal.dados.perfilId,
                        senha: modal.dados.senha,
                        permissoes: modal.dados.permissoes || []
                    })
                });
                if (!res.ok) throw new Error('Falha ao atualizar usuário');
            }

            setModal({ aberto: false, tipo: null, dados: null });
            carregarDados();

        } catch (err) {
            alert(`Erro: ${err.message}`);
        } finally {
            setFormLoading(false);
        }
    };

    if (!isAdmin) {
        return <div className="empty-st" style={{ color: 'var(--red)' }}>Acesso Negado. Você não possui o módulo de Administração liberado.</div>;
    }

    const prediosOrdenados = [...predios].sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true }));

    const usuariosFiltrados = usuarios
        .filter(u =>
            (u.nome && u.nome.toLowerCase().includes(busca.toLowerCase())) ||
            (u.email && u.email.toLowerCase().includes(busca.toLowerCase()))
        )
        .sort((a, b) => {
            const predioA = a.predioNome || 'ZZZ';
            const predioB = b.predioNome || 'ZZZ';
            if (predioA !== predioB) return predioA.localeCompare(predioB, undefined, { numeric: true });

            const nomeA = a.nome || a.email;
            const nomeB = b.nome || b.email;
            return nomeA.localeCompare(nomeB);
        });

    return (
        <div className="view active" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', position: 'relative' }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '24px', color: 'var(--text)', marginBottom: '8px' }}>Painel Administrativo</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Gerencie módulos, cargos e cadastre os prédios da PUCRS.</p>
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
                        {t === 'usuarios' ? 'Usuários & Permissões' : t === 'perfis' ? 'Cargos (Rótulos)' : 'Prédios'}
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3>Controle de Usuários</h3>
                                    <input
                                        type="text"
                                        placeholder="Buscar por nome ou e-mail..."
                                        value={busca}
                                        onChange={(e) => setBusca(e.target.value)}
                                        style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', width: '300px', outline: 'none' }}
                                    />
                                </div>

                                {usuariosFiltrados.length === 0 ? (
                                    <div className="empty-st" style={{ padding: '20px' }}>Nenhum usuário encontrado na busca.</div>
                                ) : (
                                    <table className="heat-tbl" style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: 'left' }}>Usuário / E-mail</th>
                                                <th style={{ textAlign: 'center' }}>Prédio (Tenant)</th>
                                                <th style={{ textAlign: 'center' }}>Cargo (Organizacional)</th>
                                                <th style={{ textAlign: 'left' }}>Módulos Habilitados</th>
                                                <th style={{ textAlign: 'center' }}>Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {usuariosFiltrados.map(u => (
                                                <tr key={u.id}>
                                                    <td style={{ textAlign: 'left' }}>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{u.nome || 'Sem Nome'}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{u.email}</div>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>{u.predioNome || 'Sem Prédio'}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                                            {u.perfilNome || 'Sem Cargo'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'left' }}>
                                                        {u.permissoes && u.permissoes.length > 0 ? (
                                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                {u.permissoes.map(perm => {
                                                                    const mod = modulosSistema.find(m => m.id === perm);
                                                                    const isGlobal = perm === 'admin';
                                                                    return (
                                                                        <span key={perm} style={{
                                                                            background: isGlobal ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg)',
                                                                            color: isGlobal ? '#22c55e' : 'var(--muted)',
                                                                            border: `1px solid ${isGlobal ? 'rgba(34, 197, 94, 0.3)' : 'var(--border)'}`,
                                                                            padding: '2px 6px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '11px',
                                                                            fontWeight: isGlobal ? 'bold' : 'normal'
                                                                        }}>
                                                                            {mod ? mod.nome : perm}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Sem acessos configurados</span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {u.id === meuIdId ? (
                                                            <span style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 'bold' }}>Seu Perfil</span>
                                                        ) : (
                                                            <button
                                                                className="exp-btn"
                                                                onClick={() => setModal({ aberto: true, tipo: 'editar_usuario', dados: { ...u, permissoes: u.permissoes || [] } })}
                                                            >
                                                                Editar Acesso
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {aba === 'perfis' && (
                            <div className="bar-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <div>
                                        <h3>Cargos Organizacionais</h3>
                                        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>Cargos servem apenas para identificação da função do funcionário.</p>
                                    </div>
                                    <button className="btn-primary" style={{ background: '#22c55e', height: 'fit-content' }} onClick={() => setModal({ aberto: true, tipo: 'novo_perfil', dados: { nome: '' } })}>Novo Cargo</button>
                                </div>
                                <table className="heat-tbl" style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'center' }}>Nome do Cargo (Rótulo)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {perfis.map(p => (
                                            <tr key={p.id}>
                                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{p.nome}</td>
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
                                    <button className="btn-primary" style={{ background: '#3b82f6' }} onClick={() => setModal({ aberto: true, tipo: 'novo_predio', dados: { nome: '' } })}>Novo Prédio</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    {prediosOrdenados.map(p => (
                                        <div key={p.id} style={{ padding: '16px', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                            <h4 style={{ margin: 0, fontSize: '16px', textAlign: 'center' }}>{p.nome}</h4>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {modal.aberto && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: 'var(--surface)', padding: '30px', borderRadius: '12px', width: '450px', border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
                            {modal.tipo === 'novo_predio' && 'Cadastrar Novo Prédio'}
                            {modal.tipo === 'novo_perfil' && 'Criar Novo Cargo'}
                            {modal.tipo === 'editar_usuario' && 'Editar Acessos do Usuário'}
                        </h3>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {modal.tipo === 'novo_predio' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Nome do Prédio</label>
                                    <input type="text" required value={modal.dados?.nome || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, nome: e.target.value } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} placeholder="Ex: Prédio 15" />
                                </div>
                            )}

                            {modal.tipo === 'novo_perfil' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Nome do Cargo</label>
                                    <input type="text" required value={modal.dados?.nome || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, nome: e.target.value } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} placeholder="Ex: Assistente Administrativo" />
                                </div>
                            )}

                            {modal.tipo === 'editar_usuario' && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Nome Completo</label>
                                        <input type="text" value={modal.dados?.nome || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, nome: e.target.value } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Nova Senha (deixe vazio para manter atual)</label>
                                        <input type="password" value={modal.dados?.senha || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, senha: e.target.value } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} placeholder="••••••••" />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Prédio Vinculado</label>
                                            <select value={modal.dados?.predioId || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, predioId: e.target.value } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}>
                                                <option value="">-- Nenhum --</option>
                                                {prediosOrdenados.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Cargo (Rótulo)</label>
                                            <select value={modal.dados?.perfilId || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, perfilId: e.target.value } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}>
                                                <option value="">-- Sem Cargo --</option>
                                                {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '10px', background: 'var(--panel2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text)', marginBottom: '12px', fontWeight: 'bold' }}>Módulos Habilitados (Permissões)</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            {modulosSistema.map(mod => {
                                                const isChecked = modal.dados?.permissoes?.includes(mod.id);
                                                return (
                                                    <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: isChecked ? (mod.id === 'admin' ? '#22c55e' : '#3b82f6') : 'var(--text)', fontWeight: mod.id === 'admin' && isChecked ? 'bold' : 'normal' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked || false}
                                                            onChange={(e) => {
                                                                const atuais = modal.dados?.permissoes || [];
                                                                const novasPermissoes = e.target.checked
                                                                    ? [...atuais, mod.id]
                                                                    : atuais.filter(p => p !== mod.id);
                                                                setModal({ ...modal, dados: { ...modal.dados, permissoes: novasPermissoes } });
                                                            }}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        {mod.nome}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setModal({ aberto: false, tipo: null, dados: null })} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" disabled={formLoading} style={{ flex: 1, padding: '10px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {formLoading ? 'Salvando...' : 'Salvar Dados'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}