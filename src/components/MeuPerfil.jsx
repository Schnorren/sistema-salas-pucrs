import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
export default function MeuPerfil({ session, onClose }) {
    const [nome, setNome] = useState('');
    const [senha, setSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);

    const [loading, setLoading] = useState(false);
    const [mensagem, setMensagem] = useState(null);

    useEffect(() => {
        if (session?.user) {
            const meta = session.user.user_metadata;
            setNome(meta?.nome || meta?.name || meta?.full_name || '');
        }
    }, [session]);

    const handleSalvar = async (e) => {
        e.preventDefault();
        setMensagem(null);
        if (mostrarSenha) {
            if (!senha) return setMensagem({ tipo: 'erro', texto: 'Digite a nova senha ou feche a alteração de senha.' });
            if (senha !== confirmarSenha) return setMensagem({ tipo: 'erro', texto: 'As senhas não coincidem.' });
            if (senha.length < 6) return setMensagem({ tipo: 'erro', texto: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }

        setLoading(true);

        try {
            const updates = {
                data: { nome: nome.trim() }
            };

            if (mostrarSenha && senha) {
                updates.password = senha;
            }

            const { error } = await supabase.auth.updateUser(updates);
            if (error) throw error;
            setMensagem({ tipo: 'sucesso', texto: 'Perfil atualizado com sucesso!' });

            setTimeout(() => {
                if (onClose) onClose();
            }, 1200);

        } catch (error) {
            console.error("Erro ao atualizar perfil:", error);
            setMensagem({ tipo: 'erro', texto: error.message || 'Erro ao atualizar os dados.' });
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '24px', color: 'var(--text)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', height: '100%', overflowY: 'auto' }}>

            <div style={{ width: '100%', maxWidth: '450px', background: 'var(--surface, #1e293b)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', marginTop: '20px' }}>

                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px auto', border: '2px solid rgba(59, 130, 246, 0.3)' }}>
                        👤
                    </div>
                    <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>Meu Perfil</h2>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted)' }}>Gerencie suas informações de acesso.</p>
                </div>

                {mensagem && (
                    <div style={{
                        padding: '12px', marginBottom: '24px', borderRadius: '6px', fontSize: '14px', textAlign: 'center', fontWeight: 'bold',
                        background: mensagem.tipo === 'sucesso' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: mensagem.tipo === 'sucesso' ? '#10b981' : '#ef4444',
                        border: `1px solid ${mensagem.tipo === 'sucesso' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                    }}>
                        {mensagem.texto}
                    </div>
                )}

                <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', display: 'block', color: '#94a3b8' }}>E-MAIL INSTITUCIONAL (LOGIN)</label>
                        <input
                            type="email"
                            value={session?.user?.email || ''}
                            disabled
                            style={{
                                width: '100%', padding: '12px', borderRadius: '6px',
                                background: 'rgba(0,0,0,0.2)', color: 'var(--muted)',
                                border: '1px solid var(--border)', outline: 'none', cursor: 'not-allowed'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', display: 'block', color: '#e2e8f0' }}>NOME COMPLETO</label>
                        <input
                            type="text"
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            placeholder="Como você quer ser chamado?"
                            required
                            style={{
                                width: '100%', padding: '12px', borderRadius: '6px',
                                background: 'rgba(255,255,255,0.05)', color: '#fff',
                                border: '1px solid var(--border)', outline: 'none', transition: 'border-color 0.2s'
                            }}
                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '10px 0' }}></div>
                    {!mostrarSenha ? (
                        <button
                            type="button"
                            onClick={() => setMostrarSenha(true)}
                            style={{
                                background: 'transparent', border: '1px dashed var(--border)', color: '#94a3b8',
                                padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = '#60a5fa'; e.currentTarget.style.color = '#60a5fa'; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#94a3b8'; }}
                        >
                            🔑 Trocar minha senha de acesso
                        </button>
                    ) : (
                        <div style={{ background: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24', margin: 0 }}>🔒 NOVA SENHA</label>
                                <button
                                    type="button"
                                    onClick={() => { setMostrarSenha(false); setSenha(''); setConfirmarSenha(''); setMensagem(null); }}
                                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                >
                                    Cancelar
                                </button>
                            </div>

                            <input
                                type="password"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="Digite a nova senha"
                                autoFocus
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '6px',
                                    background: 'rgba(255,255,255,0.05)', color: '#fff',
                                    border: '1px solid var(--border)', outline: 'none', marginBottom: '12px'
                                }}
                            />

                            <input
                                type="password"
                                value={confirmarSenha}
                                onChange={e => setConfirmarSenha(e.target.value)}
                                placeholder="Confirme a nova senha"
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '6px',
                                    background: 'rgba(255,255,255,0.05)', color: '#fff',
                                    border: '1px solid var(--border)', outline: 'none'
                                }}
                            />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                style={{
                                    flex: 1, padding: '14px', background: 'transparent', color: '#94a3b8',
                                    border: '1px solid #475569', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                                }}
                            >
                                Voltar
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                flex: 2, padding: '14px', background: loading ? '#64748b' : '#3b82f6',
                                color: '#fff', border: 'none', borderRadius: '6px',
                                cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px'
                            }}
                        >
                            {loading ? 'Salvando...' : 'Salvar Perfil'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}