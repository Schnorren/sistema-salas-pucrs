import { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';
import { useEquipe } from '../hooks/useEquipe';
import { useUI } from '../contexts/UIContext';
import { normalizar } from '../utils/blocos';
import Gaveta from './ui/Gaveta';
import { Carregando, Erro } from './ui/Estado';

const iniciais = (n) => String(n || '?').split(/[\s.@]+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

// Equipe do prédio ativo: quem acessa e o que pode fazer. Convidar e editar
// ficam num painel lateral; o servidor sanitiza as permissões (gestor que não é
// admin nunca concede "admin").
export default function GestaoEquipe({ session, acesso }) {
    const { predioAtivo } = usePredio();
    const { toast, showConfirm } = useUI();
    const { equipe, perfis, modulos, loading, error, carregarDados, atualizarMembro, convidarMembro, removerMembro } =
        useEquipe(session, predioAtivo || acesso?.predioId);

    const [busca, setBusca] = useState('');
    const [ordem, setOrdem] = useState('nome');
    const [painel, setPainel] = useState(null); // null | { modo: 'convidar' } | { modo: 'editar', user }
    const meuEmail = session?.user?.email?.toLowerCase();

    useEffect(() => { carregarDados(); }, [carregarDados]);

    const lista = useMemo(() => {
        const t = normalizar(busca);
        const l = equipe.filter(u => !t || normalizar(`${u.email} ${u.nome || ''} ${u.perfil_nome || ''}`).includes(t));
        const cmp = {
            nome: (a, b) => (a.nome || a.email).localeCompare(b.nome || b.email),
            email: (a, b) => a.email.localeCompare(b.email),
            cargo: (a, b) => (a.perfil_nome || 'zz').localeCompare(b.perfil_nome || 'zz') || (a.nome || '').localeCompare(b.nome || ''),
        }[ordem];
        return [...l].sort(cmp);
    }, [equipe, busca, ordem]);
    const nomeModulo = useMemo(() => Object.fromEntries(modulos.map(m => [m.id, m.nome])), [modulos]);

    const revogar = async (user) => {
        const ok = await showConfirm(`${user.nome || user.email} perde o acesso a este prédio.`, 'Revogar acesso', { confirmar: 'Revogar', perigo: true });
        if (!ok) return;
        try { await removerMembro(user.email); toast.success('Acesso revogado.'); }
        catch (err) { toast.error(`Erro ao revogar acesso: ${err.message}`); }
    };

    const salvar = async (payload, modo) => {
        if (modo === 'editar') {
            await atualizarMembro(payload);
            toast.success('Permissões atualizadas.');
            setPainel(null);
            return;
        }
        if (!(await showConfirm(`Enviar um convite de acesso para ${payload.email}?`, 'Confirmar convite', { confirmar: 'Enviar convite' }))) return;
        // A mensagem vem do servidor: convite novo e reconvite de quem já tem
        // cadastro são fluxos diferentes e o gestor precisa saber qual foi.
        const resposta = await convidarMembro(payload);
        toast.success(resposta?.message || 'Convite enviado. A pessoa aparece na lista.');
        setPainel(null);
    };

    return (
        <div className="pg">
            <div className="pg-hd">
                <div><h1 className="t-pg">Equipe</h1><p className="sub">Quem acessa este prédio e o que cada pessoa pode fazer</p></div>
                <div className="pg-acoes">
                    <div className="campo-busca"><Search size={16} /><input className="inp" placeholder="Nome, e-mail ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar na equipe" /></div>
                    <select className="inp" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar">
                        <option value="nome">Ordenar por nome</option>
                        <option value="email">Ordenar por e-mail</option>
                        <option value="cargo">Ordenar por cargo</option>
                    </select>
                    <button className="btn pri" onClick={() => setPainel({ modo: 'convidar' })}><UserPlus size={16} />Convidar pessoa</button>
                </div>
            </div>

            {loading && equipe.length === 0 ? <Carregando texto="Carregando a equipe…" /> : error ? <Erro texto={String(error)} /> : (
                <div className="tabela-wrap">
                    <table className="dados">
                        <thead><tr><th>Pessoa</th><th>Cargo</th><th>Módulos</th><th className="dir">Ações</th></tr></thead>
                        <tbody>
                            {lista.length === 0 && <tr><td colSpan={4}><div className="vazio" style={{ margin: 6 }}>Ninguém encontrado.</div></td></tr>}
                            {lista.map(u => {
                                const voce = u.email?.toLowerCase() === meuEmail;
                                const ehAdmin = (u.permissoes || []).includes('admin');
                                return (
                                    <tr key={u.email} className={painel?.user?.email === u.email ? 'sel' : ''}>
                                        <td><div className="pessoa"><span className="avatar">{iniciais(u.nome || u.email)}</span><div style={{ minWidth: 0 }}><b>{u.nome || 'Nome não registrado'}{voce && <span className="sub" style={{ fontWeight: 400 }}> · você</span>}</b><small>{u.email}</small></div></div></td>
                                        <td>{u.perfil_nome || <span className="sub">sem cargo</span>}</td>
                                        <td>
                                            <div className="mods">
                                                {ehAdmin ? <span className="chip admin">Administrador · todos os prédios</span>
                                                    : (u.permissoes || []).length ? u.permissoes.map(p => <span key={p} className="chip contorno">{nomeModulo[p] || p}</span>)
                                                        : <span className="sub" style={{ margin: 0 }}>nenhum módulo</span>}
                                            </div>
                                        </td>
                                        <td className="dir" style={{ whiteSpace: 'nowrap' }}>
                                            {!voce && <>
                                                <button className="btn sm" onClick={() => setPainel({ modo: 'editar', user: u })}>Editar</button>{' '}
                                                <button className="btn sm fant" style={{ color: 'var(--alta)' }} onClick={() => revogar(u)}>Revogar</button>
                                            </>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {painel && (
                <GavetaMembro
                    key={painel.user?.email || 'novo'}
                    modo={painel.modo} user={painel.user} perfis={perfis} modulos={modulos}
                    podeAdmin={(acesso?.permissoes || []).includes('admin')}
                    onFechar={() => setPainel(null)}
                    onSalvar={salvar}
                />
            )}
        </div>
    );
}

function GavetaMembro({ modo, user, perfis, modulos, podeAdmin, onFechar, onSalvar }) {
    const { toast } = useUI();
    const editando = modo === 'editar';
    const [email, setEmail] = useState(user?.email || '');
    const [nome, setNome] = useState(user?.nome || '');
    const [cargo, setCargo] = useState(user?.perfil_id || '');
    const [perms, setPerms] = useState(user?.permissoes || []);
    const [salvando, setSalvando] = useState(false);
    // "admin" só aparece para quem é admin (o servidor também barra)
    const visiveis = modulos.filter(m => m.id !== 'admin' || podeAdmin);

    const toggle = (id) => setPerms(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
    const submit = async (e) => {
        e.preventDefault();
        if (!email.trim()) { toast.error('Preencha o e-mail.'); return; }
        if (!cargo) { toast.error('Escolha um cargo.'); return; }
        setSalvando(true);
        try { await onSalvar({ nome: nome.trim(), email: email.trim(), perfil_id: cargo, permissoes: perms }, modo); }
        catch (err) { toast.error(`${editando ? 'Erro ao atualizar' : 'Erro ao convidar'}: ${err.message}`); }
        finally { setSalvando(false); }
    };

    return (
        <Gaveta
            titulo={editando ? 'Editar acessos' : 'Convidar pessoa'}
            sub={editando ? user.email : 'Ela recebe um e-mail com o link para criar a senha.'}
            onFechar={onFechar} bloquearFechar={salvando}
            rodape={<><span className="esp" /><button type="button" className="btn" onClick={onFechar} disabled={salvando}>Cancelar</button><button type="submit" form="form-membro" className="btn pri" disabled={salvando}>{salvando ? 'Salvando…' : editando ? 'Salvar acessos' : 'Enviar convite'}</button></>}
        >
            <form id="form-membro" onSubmit={submit} style={{ display: 'contents' }}>
                {!editando && <div className="campo"><label htmlFor="eq-email">E-mail institucional</label><input id="eq-email" data-autofocus className="inp" type="email" required placeholder="nome.sobrenome@pucrs.br" value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
                <div className="linha-campos">
                    <div className="campo"><label htmlFor="eq-nome">Nome completo</label><input id="eq-nome" data-autofocus={editando || undefined} className="inp" placeholder="Ex.: Joana Pires" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
                    <div className="campo"><label htmlFor="eq-cargo">Cargo</label>
                        <select id="eq-cargo" className="inp" style={{ width: '100%' }} value={cargo} onChange={(e) => setCargo(e.target.value)} required>
                            <option value="">Escolha…</option>
                            {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>
                </div>
                <div className="campo">
                    <span className="rot">Módulos de acesso <span className="dica">· o cargo é só um rótulo; o acesso vem daqui</span></span>
                    {visiveis.length === 0 ? <span className="dica">Carregando módulos…</span> : (
                        <div className="mod-lista">
                            {visiveis.map(m => {
                                const on = perms.includes(m.id);
                                return (
                                    <label key={m.id} className={`mod ${on ? 'on' : ''}`} htmlFor={`m-${m.id}`}>
                                        <b>{m.nome}</b>
                                        <small>{m.descricao || ' '}</small>
                                        <span className="sw"><input id={`m-${m.id}`} type="checkbox" checked={on} onChange={() => toggle(m.id)} /><span /></span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            </form>
        </Gaveta>
    );
}
