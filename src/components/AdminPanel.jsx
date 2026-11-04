import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { useUI } from '../contexts/UIContext';
import { normalizar } from '../utils/blocos';
import Gaveta from './ui/Gaveta';
import { Seg } from './ui/Seg';
import { Carregando, Erro } from './ui/Estado';

const iniciais = (n) => String(n || '?').split(/[\s.@]+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const parseRes = async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json;
};

// Painel admin (só "admin"): usuários de todos os prédios, cargos e prédios.
export default function AdminPanel({ session, acesso }) {
    const { toast } = useUI();
    const [aba, setAba] = useState('usuarios');
    const [perfis, setPerfis] = useState([]);
    const [predios, setPredios] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [modulos, setModulos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [filtroPredio, setFiltroPredio] = useState('');
    const [painel, setPainel] = useState(null); // { tipo: 'usuario'|'perfil'|'predio', dados }
    const [salvando, setSalvando] = useState(false);

    const token = session?.access_token;
    const meuId = session?.user?.id;
    const isAdmin = acesso?.permissoes?.includes('admin');

    const carregarDados = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const base = import.meta.env.VITE_API_URL;
            const [rM, rP, rPr, rU] = await Promise.all(['modulos', 'perfis', 'predios', 'usuarios'].map(r => fetch(`${base}/api/admin/${r}`, { headers })));
            if (rM.ok) setModulos(await rM.json());
            if (rP.ok) setPerfis(await rP.json());
            if (rPr.ok) setPredios(await rPr.json());
            if (rU.ok) setUsuarios(await rU.json());
        } catch {
            toast.error('Erro ao carregar os dados do painel.');
        } finally {
            setLoading(false);
        }
    }, [token, isAdmin, toast]);

    useEffect(() => { carregarDados(); }, [carregarDados]);

    const salvar = async (tipo, dados) => {
        setSalvando(true);
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        const base = import.meta.env.VITE_API_URL;
        try {
            if (tipo === 'predio') await parseRes(await fetch(`${base}/api/admin/predios`, { method: 'POST', headers, body: JSON.stringify({ nome: dados.nome }) }));
            if (tipo === 'perfil') await parseRes(await fetch(`${base}/api/admin/perfis`, { method: 'POST', headers, body: JSON.stringify({ nome: dados.nome }) }));
            if (tipo === 'usuario') {
                await parseRes(await fetch(`${base}/api/admin/usuarios`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({ usuarioId: dados.id, nome: dados.nome, predioId: dados.predioId, perfilId: dados.perfilId, senha: dados.senha, permissoes: dados.permissoes || [] })
                }));
            }
            toast.success('Salvo.');
            setPainel(null);
            carregarDados();
        } catch (err) {
            toast.error(err.message || 'Erro ao salvar. Tente de novo.');
        } finally {
            setSalvando(false);
        }
    };

    const prediosOrdenados = useMemo(() => [...predios].sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true })), [predios]);
    const nomeModulo = useMemo(() => Object.fromEntries(modulos.map(m => [m.id, m.nome])), [modulos]);
    const usuariosFiltrados = useMemo(() => {
        const t = normalizar(busca);
        return usuarios
            .filter(u => !t || normalizar(`${u.nome || ''} ${u.email || ''}`).includes(t))
            .filter(u => !filtroPredio || (filtroPredio === '__sem' ? !u.predioId && !(u.permissoes || []).includes('admin') : u.predioId === filtroPredio))
            .sort((a, b) => (a.predioNome || 'ZZZ').localeCompare(b.predioNome || 'ZZZ', undefined, { numeric: true }) || (a.nome || a.email).localeCompare(b.nome || b.email));
    }, [usuarios, busca, filtroPredio]);

    if (!isAdmin) return <Erro titulo="Acesso negado" texto="Esta área é só para administradores." />;

    return (
        <div className="pg">
            <div className="pg-hd">
                <div><h1 className="t-pg">Painel admin</h1><p className="sub">Usuários de todos os prédios, cargos e cadastro de prédios</p></div>
                <div className="pg-acoes">
                    {aba === 'perfis' && <button className="btn pri" onClick={() => setPainel({ tipo: 'perfil', dados: { nome: '' } })}><Plus size={16} />Novo cargo</button>}
                    {aba === 'predios' && <button className="btn pri" onClick={() => setPainel({ tipo: 'predio', dados: { nome: '' } })}><Plus size={16} />Novo prédio</button>}
                </div>
            </div>
            <div><Seg rotulo="Seção" valor={aba} onChange={setAba} opcoes={[['usuarios', `Usuários (${usuarios.length})`], ['perfis', 'Cargos'], ['predios', 'Prédios']]} /></div>

            {loading ? <Carregando texto="Carregando o painel…" /> : (
                <>
                    {aba === 'usuarios' && (
                        <>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <div className="campo-busca"><Search size={16} /><input className="inp" placeholder="Nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" /></div>
                                <select className="inp" value={filtroPredio} onChange={(e) => setFiltroPredio(e.target.value)} aria-label="Filtrar por prédio">
                                    <option value="">Todos os prédios</option>
                                    {prediosOrdenados.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                    <option value="__sem">Sem prédio (aguardando liberação)</option>
                                </select>
                            </div>
                            <div className="tabela-wrap">
                                <table className="dados">
                                    <thead><tr><th>Usuário</th><th>Prédio</th><th>Cargo</th><th>Módulos</th><th className="dir">Ação</th></tr></thead>
                                    <tbody>
                                        {usuariosFiltrados.length === 0 && <tr><td colSpan={5}><div className="vazio" style={{ margin: 6 }}>Nenhum usuário encontrado.</div></td></tr>}
                                        {usuariosFiltrados.map(u => {
                                            const ehAdmin = (u.permissoes || []).includes('admin');
                                            return (
                                                <tr key={u.id}>
                                                    <td><div className="pessoa"><span className="avatar">{iniciais(u.nome || u.email)}</span><div style={{ minWidth: 0 }}><b>{u.nome || 'Sem nome'}</b><small>{u.email}</small></div></div></td>
                                                    <td>{u.predioNome || (ehAdmin ? <span className="sub">todos</span> : <span className="chip media">sem prédio</span>)}</td>
                                                    <td>{u.perfilNome || <span className="sub">sem cargo</span>}</td>
                                                    <td><div className="mods">{ehAdmin ? <span className="chip admin">Administrador</span> : (u.permissoes || []).length ? u.permissoes.map(p => <span key={p} className="chip contorno">{nomeModulo[p] || p}</span>) : <span className="sub" style={{ margin: 0 }}>nenhum</span>}</div></td>
                                                    <td className="dir">{u.id === meuId ? <span className="sub">você</span> : <button className="btn sm" onClick={() => setPainel({ tipo: 'usuario', dados: { ...u, permissoes: u.permissoes || [] } })}>Editar</button>}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    {aba === 'perfis' && (
                        <>
                            <div className="tabela-wrap" style={{ maxWidth: 640 }}>
                                <table className="dados">
                                    <thead><tr><th>Cargo</th><th className="dir">Pessoas</th></tr></thead>
                                    <tbody>{perfis.map(p => <tr key={p.id}><td><b>{p.nome}</b></td><td className="dir num">{usuarios.filter(u => u.perfilId === p.id).length}</td></tr>)}</tbody>
                                </table>
                            </div>
                            <p className="sub">Cargos são só rótulos de função. Quem dá acesso são os módulos.</p>
                        </>
                    )}
                    {aba === 'predios' && (
                        <div className="predios">
                            {prediosOrdenados.map(p => {
                                const [t, ...resto] = p.nome.split(/\s+[-–·]\s+/);
                                return (
                                    <div key={p.id} className="card predio-card">
                                        <h3>{t}</h3>
                                        <span className="sub">{resto.join(' · ') || ' '}</span>
                                        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '12px 0 0', fontSize: 13 }}>
                                            <dt className="sub" style={{ margin: 0 }}>Pessoas</dt><dd style={{ margin: 0, fontWeight: 600 }}>{usuarios.filter(u => u.predioId === p.id).length}</dd>
                                        </dl>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {painel?.tipo === 'usuario' && <GavetaUsuario dados={painel.dados} predios={prediosOrdenados} perfis={perfis} modulos={modulos} salvando={salvando} onFechar={() => setPainel(null)} onSalvar={(d) => salvar('usuario', d)} />}
            {(painel?.tipo === 'perfil' || painel?.tipo === 'predio') && (
                <GavetaNome
                    titulo={painel.tipo === 'perfil' ? 'Novo cargo' : 'Novo prédio'}
                    rotulo={painel.tipo === 'perfil' ? 'Nome do cargo' : 'Nome do prédio'}
                    exemplo={painel.tipo === 'perfil' ? 'Ex.: Atendente' : 'Ex.: Prédio 32 - Escola Politécnica'}
                    salvando={salvando} onFechar={() => setPainel(null)} onSalvar={(nome) => salvar(painel.tipo, { nome })}
                />
            )}
        </div>
    );
}

function GavetaNome({ titulo, rotulo, exemplo, salvando, onFechar, onSalvar }) {
    const [nome, setNome] = useState('');
    return (
        <Gaveta titulo={titulo} onFechar={onFechar} bloquearFechar={salvando}
            rodape={<><span className="esp" /><button className="btn" onClick={onFechar}>Cancelar</button><button type="submit" form="form-nome" className="btn pri" disabled={salvando || !nome.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
            <form id="form-nome" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) onSalvar(nome.trim()); }} className="campo">
                <label htmlFor="nm">{rotulo}</label>
                <input id="nm" data-autofocus className="inp" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder={exemplo} />
            </form>
        </Gaveta>
    );
}

function GavetaUsuario({ dados, predios, perfis, modulos, salvando, onFechar, onSalvar }) {
    const [f, setF] = useState(dados);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const toggle = (id) => setF(x => ({ ...x, permissoes: x.permissoes.includes(id) ? x.permissoes.filter(p => p !== id) : [...x.permissoes, id] }));
    return (
        <Gaveta titulo="Editar acessos do usuário" sub={dados.email} onFechar={onFechar} bloquearFechar={salvando}
            rodape={<><span className="esp" /><button className="btn" onClick={onFechar} disabled={salvando}>Cancelar</button><button type="submit" form="form-usuario" className="btn pri" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
            <form id="form-usuario" onSubmit={(e) => { e.preventDefault(); onSalvar(f); }} style={{ display: 'contents' }}>
                <div className="campo"><label htmlFor="ad-nome">Nome completo</label><input id="ad-nome" data-autofocus className="inp" value={f.nome || ''} onChange={set('nome')} /></div>
                <div className="linha-campos">
                    <div className="campo"><label htmlFor="ad-predio">Prédio</label>
                        <select id="ad-predio" className="inp" style={{ width: '100%' }} value={f.predioId || ''} onChange={set('predioId')}>
                            <option value="">Nenhum</option>
                            {predios.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>
                    <div className="campo"><label htmlFor="ad-cargo">Cargo</label>
                        <select id="ad-cargo" className="inp" style={{ width: '100%' }} value={f.perfilId || ''} onChange={set('perfilId')}>
                            <option value="">Sem cargo</option>
                            {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>
                </div>
                <div className="campo"><label htmlFor="ad-senha">Nova senha <span className="dica">deixe vazio para manter a atual</span></label><input id="ad-senha" className="inp" type="password" autoComplete="new-password" value={f.senha || ''} onChange={set('senha')} /></div>
                <div className="campo">
                    <span className="rot">Módulos <span className="dica">· "Administrador" dá acesso a todos os prédios</span></span>
                    <div className="mod-lista">
                        {modulos.map(m => {
                            const on = f.permissoes.includes(m.id);
                            return (
                                <label key={m.id} className={`mod ${on ? 'on' : ''}`} htmlFor={`am-${m.id}`}>
                                    <b>{m.nome}</b><small>{m.descricao || ' '}</small>
                                    <span className="sw"><input id={`am-${m.id}`} type="checkbox" checked={on} onChange={() => toggle(m.id)} /><span /></span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            </form>
        </Gaveta>
    );
}
