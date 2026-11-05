import React, { useState, useEffect, useCallback } from 'react';
import { useUI } from '../contexts/UIContext';
import AuditoriaAdmin from './AuditoriaAdmin';
import { SENHA_MIN, validarSenha } from '../../backend_core/utils/senha';
import { lerResposta } from '../utils/api';
import { agruparPontosPorPredio } from '../utils/relatorioEmprestimos';

const MODULO_REDE = 'relatorio_emprestimos_rede';
const NOVO_USUARIO = { email: '', nome: '', predioId: '', perfilId: '', permissoes: [], pontosRede: [], pontosBalcao: [], modo: 'convite', senha: '' };
const estiloCampo = { width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' };
const estiloRotulo = { display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' };
const chaveNome = (nome) => String(nome || '').trim().toLocaleLowerCase('pt-BR');

// Pontos que um login do relatório da rede vê (ex.: a coordenação da
// recepção). Atalho: marcar todos os pontos de mesmo nome ("Recepção").
function PontosDaRede({ pontos, selecionados, onMudar }) {
    const marcados = new Set(selecionados);
    const alternar = (ids, ligar) => {
        const novo = new Set(marcados);
        ids.forEach(id => (ligar ? novo.add(id) : novo.delete(id)));
        onMudar([...novo]);
    };
    const porNome = new Map();
    for (const p of pontos) {
        const k = chaveNome(p.nome);
        porNome.set(k, { nome: p.nome, ids: [...(porNome.get(k)?.ids || []), p.id] });
    }
    const atalhos = [...porNome.values()].filter(g => g.ids.length > 1);

    return (
        <div style={{ background: 'var(--panel2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text)', marginBottom: '4px', fontWeight: 'bold' }}>
                Pontos no Relatório da Rede ({marcados.size} de {pontos.length})
            </label>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px' }}>
                O relatório é anônimo e mostra só estes pontos. Ponto novo (de um prédio novo) não entra sozinho: marque aqui.
            </p>
            {atalhos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {atalhos.map(g => {
                        const todos = g.ids.every(id => marcados.has(id));
                        return (
                            <button key={g.nome} type="button" className="exp-btn" onClick={() => alternar(g.ids, !todos)}
                                title={todos ? `Desmarcar todos os pontos "${g.nome}"` : `Marcar os pontos "${g.nome}" de todos os prédios`}>
                                {todos ? '✓ ' : '+ '}Todos "{g.nome}" ({g.ids.length})
                            </button>
                        );
                    })}
                </div>
            )}
            {pontos.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Nenhum ponto de empréstimo cadastrado.</div>
            ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {agruparPontosPorPredio(pontos).map(g => (
                        <div key={g.predioId}>
                            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>{g.predioNome}</div>
                            {g.pontos.map(p => (
                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', padding: '2px 0' }}>
                                    <input type="checkbox" checked={marcados.has(p.id)} onChange={e => alternar([p.id], e.target.checked)} style={{ cursor: 'pointer' }} />
                                    {p.nome}{!p.ativo && <span style={{ color: 'var(--muted)', fontSize: '11px' }}> (inativo)</span>}
                                </label>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Pontos do balcão que a conta nova opera (só os do prédio escolhido)
function PontosDoBalcao({ predioId, pontos, selecionados, onMudar }) {
    const marcados = new Set(selecionados);
    const alternar = (id, ligar) => {
        const novo = new Set(marcados);
        if (ligar) novo.add(id); else novo.delete(id);
        onMudar([...novo]);
    };
    return (
        <div style={{ background: 'var(--panel2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text)', marginBottom: '8px', fontWeight: 'bold' }}>Pontos do Balcão de Empréstimos</label>
            {!predioId ? (
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Escolha o prédio para ver os pontos de empréstimo dele.</div>
            ) : pontos.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Este prédio ainda não tem ponto de empréstimo ativo.</div>
            ) : pontos.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', padding: '2px 0' }}>
                    <input type="checkbox" checked={marcados.has(p.id)} onChange={e => alternar(p.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                    {p.nome}
                </label>
            ))}
        </div>
    );
}

export default function AdminPanel({ session, acesso }) {
    const { toast } = useUI();
    const [aba, setAba] = useState('usuarios');
    const [perfis, setPerfis] = useState([]);
    const [predios, setPredios] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [modulosSistema, setModulosSistema] = useState([]);
    const [pontosEmprestimo, setPontosEmprestimo] = useState([]);
    const [loading, setLoading] = useState(true);

    const [busca, setBusca] = useState('');
    const [modal, setModal] = useState({ aberto: false, tipo: null, dados: null });
    const [formLoading, setFormLoading] = useState(false);

    const token = session?.access_token;
    const meuId = session?.user?.id;

    const isAdmin = acesso?.permissoes?.includes('admin');

    const carregarDados = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const base = import.meta.env.VITE_API_URL;

            const [resModulos, resPerfis, resPredios, resUsuarios, resPontos] = await Promise.all([
                fetch(`${base}/api/admin/modulos`,  { headers }),
                fetch(`${base}/api/admin/perfis`,   { headers }),
                fetch(`${base}/api/admin/predios`,  { headers }),
                fetch(`${base}/api/admin/usuarios`, { headers }),
                fetch(`${base}/api/admin/pontos-emprestimo`, { headers }),
            ]);

            if (resModulos.ok)  setModulosSistema(await resModulos.json());
            if (resPontos.ok)   setPontosEmprestimo(await resPontos.json());
            if (resPerfis.ok)   setPerfis(await resPerfis.json());
            if (resPredios.ok)  setPredios(await resPredios.json());
            if (resUsuarios.ok) setUsuarios(await resUsuarios.json());

        } catch {
            toast.error('Erro ao carregar dados do painel administrativo.');
        } finally {
            setLoading(false);
        }
    }, [token, isAdmin, toast]);

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

        const parseRes = lerResposta;

        try {
            if (modal.tipo === 'novo_predio') {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/predios`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ nome: modal.dados.nome })
                });
                await parseRes(res);
            }

            if (modal.tipo === 'novo_perfil') {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/perfis`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ nome: modal.dados.nome })
                });
                await parseRes(res);
            }

            let mensagem = 'Salvo com sucesso!';
            if (modal.tipo === 'novo_usuario') {
                const d = modal.dados;
                const problemaSenha = d.modo === 'senha' ? validarSenha(d.senha || '') : null;
                if (problemaSenha) throw new Error(problemaSenha);
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/usuarios`, {
                    method: 'POST', headers,
                    body: JSON.stringify({
                        email: d.email, nome: d.nome, predioId: d.predioId || null, perfilId: d.perfilId || null,
                        permissoes: d.permissoes || [], pontosRede: d.pontosRede || [], pontosBalcao: d.pontosBalcao || [],
                        modo: d.modo, senha: d.modo === 'senha' ? d.senha : undefined,
                    })
                });
                mensagem = (await parseRes(res))?.message || 'Conta criada.';
            }

            if (modal.tipo === 'editar_usuario') {
                const problemaSenha = modal.dados.senha ? validarSenha(modal.dados.senha) : null;
                if (problemaSenha) throw new Error(problemaSenha);
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/usuarios`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        usuarioId: modal.dados.id,
                        nome: modal.dados.nome,
                        predioId: modal.dados.predioId,
                        perfilId: modal.dados.perfilId,
                        senha: modal.dados.senha,
                        permissoes: modal.dados.permissoes || [],
                        pontosRede: modal.dados.pontosRede || []
                    })
                });
                await parseRes(res);
            }

            toast.success(mensagem);
            setModal({ aberto: false, tipo: null, dados: null });
            carregarDados();

        } catch (err) {
            toast.error(err.message || 'Erro ao salvar. Tente novamente.');
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
                {['usuarios', 'perfis', 'predios', 'auditoria'].map(t => (
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
                        {t === 'usuarios' ? 'Usuários & Permissões' : t === 'perfis' ? 'Cargos (Rótulos)' : t === 'predios' ? 'Prédios' : 'Auditoria'}
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
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button className="btn-primary" style={{ background: '#22c55e', height: 'fit-content' }}
                                        onClick={() => setModal({ aberto: true, tipo: 'novo_usuario', dados: { ...NOVO_USUARIO } })}>
                                        Novo Usuário
                                    </button>
                                    <input
                                        type="text"
                                        placeholder="Buscar por nome ou e-mail..."
                                        value={busca}
                                        onChange={(e) => setBusca(e.target.value)}
                                        style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', width: '300px', outline: 'none' }}
                                    />
                                    </div>
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
                                                                            {perm === MODULO_REDE && ` · ${(u.pontosRede || []).length} ponto${(u.pontosRede || []).length === 1 ? '' : 's'}`}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Sem acessos configurados</span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {u.id === meuId ? (
                                                            <span style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 'bold' }}>Seu Perfil</span>
                                                        ) : (
                                                            <button
                                                                className="exp-btn"
                                                                onClick={() => setModal({ aberto: true, tipo: 'editar_usuario', dados: { ...u, permissoes: u.permissoes || [], pontosRede: u.pontosRede || [] } })}
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

                        {aba === 'auditoria' && (
                            <AuditoriaAdmin token={token} predios={predios} modulos={modulosSistema} />
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
                    <div style={{ background: 'var(--surface)', padding: '30px', borderRadius: '12px', width: '450px', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
                            {modal.tipo === 'novo_predio' && 'Cadastrar Novo Prédio'}
                            {modal.tipo === 'novo_perfil' && 'Criar Novo Cargo'}
                            {modal.tipo === 'editar_usuario' && 'Editar Acessos do Usuário'}
                            {modal.tipo === 'novo_usuario' && 'Criar Novo Usuário'}
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

                            {(modal.tipo === 'editar_usuario' || modal.tipo === 'novo_usuario') && (
                                <>
                                    {modal.tipo === 'novo_usuario' && (
                                        <div>
                                            <label style={estiloRotulo}>E-mail</label>
                                            <input type="email" required autoComplete="off" value={modal.dados?.email || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, email: e.target.value } })} style={estiloCampo} placeholder="nome@pucrs.br" />
                                        </div>
                                    )}

                                    <div>
                                        <label style={estiloRotulo}>Nome Completo</label>
                                        <input type="text" value={modal.dados?.nome || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, nome: e.target.value } })} style={estiloCampo} />
                                    </div>

                                    {modal.tipo === 'novo_usuario' && (
                                        <div>
                                            <label style={estiloRotulo}>Como a pessoa entra</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                                                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                                                    <input type="radio" name="modo" checked={modal.dados?.modo !== 'senha'} onChange={() => setModal({ ...modal, dados: { ...modal.dados, modo: 'convite' } })} />
                                                    <span>Convite por e-mail <small style={{ color: 'var(--muted)' }}>— a pessoa define a senha pelo link</small></span>
                                                </label>
                                                <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                                                    <input type="radio" name="modo" checked={modal.dados?.modo === 'senha'} onChange={() => setModal({ ...modal, dados: { ...modal.dados, modo: 'senha' } })} />
                                                    <span>Definir a senha agora <small style={{ color: 'var(--muted)' }}>— nenhum e-mail sai; você passa a senha para a pessoa</small></span>
                                                </label>
                                            </div>
                                        </div>
                                    )}

                                    {(modal.tipo === 'editar_usuario' || modal.dados?.modo === 'senha') && (
                                        <div>
                                            <label style={estiloRotulo}>
                                                {modal.tipo === 'novo_usuario'
                                                    ? `Senha (mínimo ${SENHA_MIN} caracteres)`
                                                    : `Nova Senha (deixe vazio para manter atual · mínimo ${SENHA_MIN} caracteres)`}
                                            </label>
                                            {/* new-password: sem isso o navegador pode autopreencher a senha salva do PRÓPRIO admin e trocar a do usuário editado por ela */}
                                            <input type="password" autoComplete="new-password" required={modal.tipo === 'novo_usuario'} minLength={modal.tipo === 'novo_usuario' ? SENHA_MIN : undefined}
                                                value={modal.dados?.senha || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, senha: e.target.value } })} style={estiloCampo} placeholder="••••••••" />
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Prédio Vinculado</label>
                                            <select value={modal.dados?.predioId || ''} onChange={e => setModal({ ...modal, dados: { ...modal.dados, predioId: e.target.value, pontosBalcao: [] } })} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}>
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

                                    {modal.dados?.permissoes?.includes(MODULO_REDE) && !modal.dados?.permissoes?.includes('admin') && (
                                        <>
                                            <PontosDaRede
                                                pontos={pontosEmprestimo}
                                                selecionados={modal.dados?.pontosRede || []}
                                                onMudar={(ids) => setModal(m => ({ ...m, dados: { ...m.dados, pontosRede: ids } }))}
                                            />
                                            {modal.dados?.predioId && (
                                                <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>
                                                    Com prédio vinculado, este login também usa o sistema desse prédio (conforme os módulos marcados).
                                                    Para quem só acompanha o relatório da rede, deixe o prédio em "Nenhum".
                                                </p>
                                            )}
                                        </>
                                    )}

                                    {/* Conta nova com Empréstimos: em quais pontos do prédio ela atende
                                        (depois, edita-se na Gestão de Equipe do prédio) */}
                                    {modal.tipo === 'novo_usuario' && modal.dados?.permissoes?.includes('emprestimos') && (
                                        <PontosDoBalcao
                                            predioId={modal.dados?.predioId}
                                            pontos={pontosEmprestimo.filter(p => p.predioId === modal.dados?.predioId && p.ativo)}
                                            selecionados={modal.dados?.pontosBalcao || []}
                                            onMudar={(ids) => setModal(m => ({ ...m, dados: { ...m.dados, pontosBalcao: ids } }))}
                                        />
                                    )}

                                    {modal.tipo === 'novo_usuario' && !modal.dados?.predioId
                                        && !modal.dados?.permissoes?.some(p => p === 'admin' || p === MODULO_REDE) && (
                                        <p style={{ fontSize: '11px', color: 'var(--amber, #f59e0b)', margin: 0 }}>
                                            Sem prédio, a conta só acessa algo com Administração ou o Relatório da Rede. Escolha o prédio da pessoa.
                                        </p>
                                    )}
                                </>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setModal({ aberto: false, tipo: null, dados: null })} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" disabled={formLoading} style={{ flex: 1, padding: '10px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {formLoading ? 'Salvando...'
                                        : modal.tipo === 'novo_usuario' ? (modal.dados?.modo === 'senha' ? 'Criar Conta' : 'Enviar Convite')
                                        : 'Salvar Dados'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}