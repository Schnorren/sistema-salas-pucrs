import React, { useState, useEffect, useRef } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useEquipe } from '../hooks/useEquipe';

export default function GestaoEquipe({ session, acesso }) {
    const { predioAtivo } = usePredio();
    
    const { 
        equipe, perfis, modulos, loading, 
        carregarDados, atualizarMembro, convidarMembro 
    } = useEquipe(session, predioAtivo || acesso?.predioId);
    
    const [nomeBusca, setNomeBusca] = useState('');
    const [emailBusca, setEmailBusca] = useState('');
    const [cargoSelecionado, setCargoSelecionado] = useState('');
    const [permissoesEditadas, setPermissoesEditadas] = useState([]);
    const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);
    const [buscaCargo, setBuscaCargo] = useState('');
    const [dropdownAberto, setDropdownAberto] = useState(false);
    const dropdownRef = useRef(null);
    const [termoBuscaTabela, setTermoBuscaTabela] = useState('');
    const [ordenacao, setOrdenacao] = useState('email_asc');

    const modoEdicao = !!usuarioSelecionado;

    useEffect(() => {
        carregarDados(true);
    }, [carregarDados]);

    useEffect(() => {
        const handleClickFora = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownAberto(false);
            }
        };
        document.addEventListener('mousedown', handleClickFora);
        return () => document.removeEventListener('mousedown', handleClickFora);
    }, []);


    useEffect(() => {
        if (modoEdicao && usuarioSelecionado?.perfil_id === cargoSelecionado) {
            return;
        }

        setPermissoesEditadas([]);
    }, [cargoSelecionado, modoEdicao, usuarioSelecionado]);

    const handleSelecionar = (user) => {
        setUsuarioSelecionado(user);
        setNomeBusca(user.nome || ''); 
        setEmailBusca(user.email);
        setCargoSelecionado(user.perfil_id || '');
        setBuscaCargo(user.perfil_nome || ''); 
        setPermissoesEditadas(user.permissoes || []);
        setDropdownAberto(false);
    };

    const resetarFormulario = () => {
        setUsuarioSelecionado(null);
        setNomeBusca(''); 
        setEmailBusca('');
        setCargoSelecionado('');
        setBuscaCargo('');
        setPermissoesEditadas([]);
        setDropdownAberto(false);
    };

    const togglePermissao = (modId) => {
        setPermissoesEditadas(prev =>
            prev.includes(modId) ? prev.filter(p => p !== modId) : [...prev, modId]
        );
    };

    const handleSalvar = async () => {
        if (!emailBusca) return alert("Preencha o e-mail do funcionário.");
        if (!cargoSelecionado) return alert("Selecione um cargo para o funcionário.");

        const payload = {
            nome: nomeBusca.trim(),
            email: emailBusca.trim(),
            perfil_id: cargoSelecionado,
            permissoes: permissoesEditadas
        };

        if (modoEdicao) {
            const res = await atualizarMembro(payload);
            if (res.success) {
                alert("Permissões atualizadas com sucesso!");
                resetarFormulario();
            } else alert("Erro ao atualizar: " + res.error);
        } else {
            const confirmacao = window.confirm(`Deseja enviar um convite de acesso para ${payload.email}?`);
            if (!confirmacao) return;

            const res = await convidarMembro(payload);
            if (res.success) {
                alert("Convite enviado com sucesso! O usuário aparecerá na lista.");
                resetarFormulario();
            } else alert("Erro ao convidar: " + res.error);
        }
    };
    
    const perfisFiltradosDropdown = perfis.filter(p => p.nome.toLowerCase().includes(buscaCargo.toLowerCase()));

    let equipeProcessada = equipe.filter(u => 
        u.email.toLowerCase().includes(termoBuscaTabela.toLowerCase()) || 
        (u.nome && u.nome.toLowerCase().includes(termoBuscaTabela.toLowerCase())) ||
        (u.perfil_nome && u.perfil_nome.toLowerCase().includes(termoBuscaTabela.toLowerCase()))
    );

    equipeProcessada.sort((a, b) => {
        if (ordenacao === 'email_asc') return a.email.localeCompare(b.email);
        if (ordenacao === 'email_desc') return b.email.localeCompare(a.email);
        if (ordenacao === 'nome_asc') return (a.nome || 'Z').localeCompare(b.nome || 'Z');
        if (ordenacao === 'cargo_asc') return (a.perfil_nome || 'Z').localeCompare(b.perfil_nome || 'Z');
        return 0;
    });

    return (
        <div style={{ padding: '24px', color: 'var(--text)', display: 'flex', gap: '24px', height: '100%' }}>
            <div style={{ width: '420px', background: 'var(--surface, #1e293b)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ marginTop: 0, color: modoEdicao ? '#f59e0b' : '#60a5fa' }}>
                    {modoEdicao ? 'Editando Acessos' : 'Convidar Novo Membro'}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' }}>
                    {modoEdicao 
                        ? 'Selecione os cards abaixo para liberar ou revogar acessos.' 
                        : 'Digite o e-mail institucional e escolha quais módulos o membro poderá ver.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>E-MAIL INSTITUCIONAL</label>
                        <input
                            type="email"
                            value={emailBusca}
                            onChange={e => setEmailBusca(e.target.value)}
                            placeholder="usuario@pucrs.br"
                            disabled={modoEdicao} 
                            style={{ 
                                width: '100%', padding: '12px', borderRadius: '6px', 
                                background: modoEdicao ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.05)', 
                                color: modoEdicao ? 'var(--muted)' : '#fff', 
                                border: '1px solid var(--border)', outline: 'none',
                                cursor: modoEdicao ? 'not-allowed' : 'text'
                            }}
                        />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>NOME COMPLETO</label>
                        <input
                            type="text"
                            value={nomeBusca}
                            onChange={e => setNomeBusca(e.target.value)}
                            placeholder="Ex: João da Silva"
                            style={{ 
                                width: '100%', padding: '12px', borderRadius: '6px', 
                                background: 'rgba(255,255,255,0.05)', 
                                color: '#fff', border: '1px solid var(--border)', outline: 'none'
                            }}
                        />
                    </div>
                    <div style={{ gridColumn: 'span 2', position: 'relative' }} ref={dropdownRef}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>CARGO (RÓTULO)</label>
                        <input
                            type="text"
                            value={buscaCargo}
                            onChange={(e) => {
                                setBuscaCargo(e.target.value);
                                setDropdownAberto(true);
                                setCargoSelecionado(''); 
                            }}
                            onFocus={() => setDropdownAberto(true)}
                            placeholder="Buscar ou selecionar cargo..."
                            style={{ 
                                width: '100%', padding: '12px', borderRadius: '6px', 
                                background: 'rgba(255,255,255,0.05)', color: '#fff', 
                                border: '1px solid var(--border)', outline: 'none'
                            }}
                        />
                        {dropdownAberto && (
                            <div style={{ 
                                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                                background: '#1e293b', border: '1px solid var(--border)', borderRadius: '6px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)', zIndex: 50, maxHeight: '200px', overflowY: 'auto'
                            }}>
                                {perfisFiltradosDropdown.length === 0 ? (
                                    <div style={{ padding: '12px', color: 'var(--muted)', fontSize: '13px' }}>Nenhum cargo encontrado.</div>
                                ) : (
                                    perfisFiltradosDropdown.map(p => (
                                        <div 
                                            key={p.id}
                                            onClick={() => {
                                                setCargoSelecionado(p.id);
                                                setBuscaCargo(p.nome);
                                                setDropdownAberto(false);
                                            }}
                                            style={{
                                                padding: '12px', cursor: 'pointer', fontSize: '14px', color: '#e2e8f0',
                                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {p.nome}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '12px', display: 'block' }}>MÓDULOS DE ACESSO (PERMISSÕES)</label>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', overflowY: 'auto', flex: 1, paddingBottom: '10px' }}>
                    {modulos.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: '12px' }}>Carregando módulos...</div> : 
                    modulos.map(mod => {
                        const ativo = permissoesEditadas.includes(mod.id);
                        return (
                            <div
                                key={mod.id}
                                onClick={() => togglePermissao(mod.id)}
                                style={{
                                    padding: '16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px',
                                    border: `2px solid ${ativo ? '#3b82f6' : 'var(--border)'}`,
                                    background: ativo ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                                    transition: 'all 0.2s', position: 'relative'
                                }}
                            >
                                {ativo && <div style={{ position: 'absolute', top: '8px', right: '8px', color: '#3b82f6', fontSize: '14px', fontWeight: 'bold' }}>✓</div>}
                                <span style={{ fontSize: '24px' }}>{mod.icone}</span>
                                <span style={{ fontSize: '13px', fontWeight: ativo ? 'bold' : 'normal', color: ativo ? '#fff' : 'var(--muted)' }}>
                                    {mod.nome}
                                </span>
                                <span style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.3' }}>
                                    {mod.descricao}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    {modoEdicao && (
                        <button onClick={resetarFormulario} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#f87171', border: '1px solid #f87171', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Cancelar
                        </button>
                    )}
                    <button onClick={handleSalvar} style={{ flex: 2, padding: '12px', background: modoEdicao ? '#f59e0b' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        {modoEdicao ? 'Salvar Permissões' : 'Convidar ao Sistema'}
                    </button>
                </div>
            </div>
            
            <div style={{ flex: 1, background: 'var(--surface, #1e293b)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Equipe Registrada</h3>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <input 
                        type="text" 
                        placeholder="Pesquisar por nome, e-mail ou cargo..." 
                        value={termoBuscaTabela}
                        onChange={(e) => setTermoBuscaTabela(e.target.value)}
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--border)', outline: 'none' }}
                    />
                    <select 
                        value={ordenacao} 
                        onChange={(e) => setOrdenacao(e.target.value)}
                        style={{ padding: '10px', borderRadius: '6px', background: '#334155', color: '#fff', border: '1px solid var(--border)', outline: 'none', cursor: 'pointer' }}
                    >
                        <option value="email_asc">Ordenar: E-mail (A-Z)</option>
                        <option value="email_desc">Ordenar: E-mail (Z-A)</option>
                        <option value="nome_asc">Ordenar: Nome (A-Z)</option>
                        <option value="cargo_asc">Ordenar: Cargo (A-Z)</option>
                    </select>
                </div>

                {loading && equipe.length === 0 ? <p style={{ color: 'var(--muted)' }}>Buscando dados no servidor...</p> : (
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                                    <th style={{ padding: '12px' }}>Nome / E-mail</th>
                                    <th style={{ padding: '12px' }}>Cargo (Rótulo)</th>
                                    <th style={{ padding: '12px' }}>Módulos Habilitados</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {equipeProcessada.length === 0 ? (
                                    <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Nenhum membro encontrado com este filtro.</td></tr>
                                ) : (
                                    equipeProcessada.map(user => {
                                        const isSelecionado = usuarioSelecionado?.user_id === user.user_id;
                                        const temPermissao = (user.permissoes || []).length > 0;

                                        return (
                                            <tr key={user.user_id} style={{ 
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                background: isSelecionado ? 'rgba(245, 158, 11, 0.05)' : 'transparent'
                                            }}>
                                                <td style={{ padding: '12px' }}>
                                                    <div style={{ fontWeight: 'bold', color: isSelecionado ? '#fcd34d' : '#e2e8f0', marginBottom: '4px' }}>
                                                        {user.nome || 'Nome não registrado'}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>{user.email}</div>
                                                </td>
                                                <td style={{ padding: '12px', color: '#cbd5e1' }}>{user.perfil_nome || 'Sem Cargo'}</td>
                                                <td style={{ padding: '12px' }}>
                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {!temPermissao ? (
                                                            <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                                                                Apenas visualização de salas
                                                            </span>
                                                        ) : (
                                                            user.permissoes.map(p => (
                                                                <span key={p} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                                                    {p.toUpperCase()}
                                                                </span>
                                                            ))
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleSelecionar(user)}
                                                        style={{ 
                                                            background: isSelecionado ? '#f59e0b' : 'rgba(255,255,255,0.05)', 
                                                            color: isSelecionado ? '#fff' : '#e2e8f0', 
                                                            border: isSelecionado ? 'none' : '1px solid rgba(255,255,255,0.1)', 
                                                            padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
                                                            fontWeight: isSelecionado ? 'bold' : 'normal',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {isSelecionado ? 'Editando...' : 'Editar'}
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}