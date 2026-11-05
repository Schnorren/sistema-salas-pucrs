import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useContatos } from '../hooks/useContatos';
import { useUI } from '../contexts/UIContext';
import { buscarNoDiretorio, normalizarTexto } from '../utils/contatosBusca';
import ModalEditarContato from './ModalEditarContato';
import ModalCursosContato from './ModalCursosContato';
import { useCelular } from '../hooks/useCelular';
import Icone from './celular/Icone';

const pillStyle = {
    fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
    border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', fontWeight: 'bold'
};

const cardStyle = {
    background: '#1e293b', border: '1px solid #334155', borderLeft: '4px solid #3b82f6',
    borderRadius: '8px', padding: '16px', marginBottom: '16px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

const linkStyle = {
    color: '#60a5fa', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold'
};

const botaoIconeStyle = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    opacity: 0.5, fontSize: '13px', padding: '2px 4px', lineHeight: 1
};

// Só dígitos, com DDI do Brasil — formato que o wa.me espera.
function linkWhatsapp(numero) {
    const digitos = String(numero || '').replace(/\D/g, '');
    if (digitos.length < 10) return null;
    return `https://wa.me/55${digitos}`;
}

// No celular (useCelular), cada contato ganha os botões Ligar, WhatsApp e
// E-mail no topo da ficha (um toque abre o discador/app).
export default function MuralContatos({ session, acesso, canEditContatos, contatoFocado }) {
    const { showConfirm, toast } = useUI();
    const celular = useCelular();
    const {
        diretorio, loading, error,
        isSalvando, isExcluindo, isMexendoEmCursos,
        criarContato, atualizarContato, excluirContato, adicionarCurso, removerCurso
    } = useContatos(session, acesso);

    const [busca, setBusca] = useState('');
    const [expandidos, setExpandidos] = useState({});
    const [contatoEmEdicao, setContatoEmEdicao] = useState(null); // { modo, contato, paiId, tipo }
    const [contatoDeCursos, setContatoDeCursos] = useState(null);
    const refsCards = useRef({});

    const raizes = useMemo(
        () => [...(diretorio.escolas || []), ...(diretorio.locais || [])],
        [diretorio]
    );

    // Vem da busca global do Dashboard como { id, n } — o `n` muda a cada clique
    // para que reabrir o mesmo contato volte a rolar até ele.
    const focoId = contatoFocado?.id || null;

    // Card em foco começa aberto, mas o clique do usuário no toggle prevalece
    // (por isso a expansão é derivada, e não gravada por um efeito).
    const estaExpandido = (id) => (id in expandidos ? expandidos[id] : id === focoId);

    useEffect(() => {
        if (!contatoFocado) return;
        refsCards.current[contatoFocado.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [contatoFocado, raizes]);

    const resultados = useMemo(() => buscarNoDiretorio(diretorio, busca, 50), [diretorio, busca]);
    const buscando = normalizarTexto(busca).length >= 2;

    const copiar = async (texto) => {
        try {
            await navigator.clipboard.writeText(texto);
            toast.success(`Copiado: ${texto}`);
        } catch {
            toast.error('Não foi possível copiar.');
        }
    };

    const handleSalvarContato = async (dados) => {
        try {
            if (contatoEmEdicao?.modo === 'editar') {
                await atualizarContato(contatoEmEdicao.contato.id, dados);
                toast.success('Contato atualizado.');
            } else {
                await criarContato(dados);
                toast.success('Contato criado.');
            }
            setContatoEmEdicao(null);
        } catch (err) {
            toast.error(err.message || 'Não foi possível salvar o contato.');
        }
    };

    const handleExcluir = async (contato) => {
        const temFilhos = (contato.filhos || []).length > 0;
        const aviso = temFilhos
            ? ` Isso também remove os ${contato.filhos.length} itens vinculados a ele.`
            : '';
        const confirmado = await showConfirm(
            `Excluir "${contato.nome}" permanentemente?${aviso}`, 'Excluir contato'
        );
        if (!confirmado) return;
        try {
            await excluirContato(contato.id);
            toast.success('Contato excluído.');
        } catch (err) {
            toast.error(err.message || 'Não foi possível excluir o contato.');
        }
    };

    if (loading && raizes.length === 0) {
        return <p style={{ padding: 24, color: '#9ca3af' }}>Carregando contatos...</p>;
    }
    if (error) return <p style={{ padding: 24, color: '#ef4444' }}>{error}</p>;

    // --- blocos de render reaproveitados -------------------------------------

    const renderContato = (contato) => {
        const telefones = contato.telefones || [];
        const emails = contato.emails || [];
        const wpp = linkWhatsapp(contato.whatsapp);

        const acoes = [
            telefones[0] && { classe: 'ligar', href: `tel:${telefones[0].replace(/\D/g, '')}`, icone: 'telefone', rotulo: 'Ligar' },
            wpp && { href: wpp, icone: 'conversa', rotulo: 'WhatsApp', externo: true },
            emails[0] && { href: `mailto:${emails[0]}`, icone: 'email', rotulo: 'E-mail' },
        ].filter(Boolean);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {celular && acoes.length > 0 && (
                    <div className="cel-contato-acoes" style={{ gridTemplateColumns: `repeat(${acoes.length}, minmax(0, 1fr))` }}>
                        {acoes.map(a => (
                            <a key={a.rotulo} href={a.href} className={a.classe} {...(a.externo ? { target: '_blank', rel: 'noreferrer' } : {})}>
                                <Icone nome={a.icone} tamanho={18} />{a.rotulo}
                            </a>
                        ))}
                    </div>
                )}
                {contato.descricao && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>{contato.descricao}</div>
                )}
                {contato.endereco && (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>📍 {contato.endereco}</div>
                )}

                {telefones.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>☎️</span>
                        {telefones.map(tel => (
                            <span key={tel} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <a href={`tel:${tel.replace(/\D/g, '')}`} style={linkStyle}>{tel}</a>
                                <button onClick={() => copiar(tel)} style={botaoIconeStyle} title="Copiar telefone"
                                    onMouseOver={e => e.currentTarget.style.opacity = 1}
                                    onMouseOut={e => e.currentTarget.style.opacity = 0.5}>⧉</button>
                            </span>
                        ))}
                    </div>
                )}

                {emails.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>✉️</span>
                        {emails.map(mail => (
                            <span key={mail} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <a href={`mailto:${mail}`} style={{ ...linkStyle, fontWeight: 'normal' }}>{mail}</a>
                                <button onClick={() => copiar(mail)} style={botaoIconeStyle} title="Copiar e-mail"
                                    onMouseOver={e => e.currentTarget.style.opacity = 1}
                                    onMouseOut={e => e.currentTarget.style.opacity = 0.5}>⧉</button>
                            </span>
                        ))}
                    </div>
                )}

                {wpp && (
                    <div>
                        <a href={wpp} target="_blank" rel="noreferrer"
                            style={{ ...linkStyle, color: '#4ade80' }}>💬 WhatsApp {contato.whatsapp}</a>
                    </div>
                )}

                {contato.horarios && (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>🕒 {contato.horarios}</div>
                )}
            </div>
        );
    };

    const renderFilho = (filho) => (
        <div key={filho.id} style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px', padding: '12px', marginTop: '10px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#e2e8f0' }}>
                    {filho.referencia && <span style={{ ...pillStyle, marginRight: '8px' }}>{filho.referencia}</span>}
                    {filho.nome}
                </div>
                {canEditContatos && (
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                        <button onClick={() => setContatoEmEdicao({ modo: 'editar', contato: filho })}
                            style={botaoIconeStyle} title="Editar"
                            onMouseOver={e => e.currentTarget.style.opacity = 1}
                            onMouseOut={e => e.currentTarget.style.opacity = 0.5}>✏️</button>
                        <button onClick={() => handleExcluir(filho)} disabled={isExcluindo}
                            style={botaoIconeStyle} title="Excluir"
                            onMouseOver={e => e.currentTarget.style.opacity = 1}
                            onMouseOut={e => e.currentTarget.style.opacity = 0.5}>🗑️</button>
                    </div>
                )}
            </div>
            {renderContato(filho)}
        </div>
    );

    const renderCard = (raiz) => {
        const expandido = estaExpandido(raiz.id);
        const filhos = raiz.filhos || [];
        const cursos = raiz.cursos || [];
        const tipoFilho = raiz.tipo === 'escola' ? 'unidade' : 'servico';
        const rotuloFilhos = raiz.tipo === 'escola' ? 'unidades de atendimento' : 'serviços e espaços';

        return (
            <div key={raiz.id} ref={el => { refsCards.current[raiz.id] = el; }} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>{raiz.nome}</div>
                    {canEditContatos && (
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                            <button onClick={() => setContatoEmEdicao({ modo: 'editar', contato: raiz })}
                                style={botaoIconeStyle} title="Editar contato"
                                onMouseOver={e => e.currentTarget.style.opacity = 1}
                                onMouseOut={e => e.currentTarget.style.opacity = 0.5}>✏️</button>
                            <button onClick={() => handleExcluir(raiz)} disabled={isExcluindo}
                                style={botaoIconeStyle} title="Excluir contato"
                                onMouseOver={e => e.currentTarget.style.opacity = 1}
                                onMouseOut={e => e.currentTarget.style.opacity = 0.5}>🗑️</button>
                        </div>
                    )}
                </div>

                {renderContato(raiz)}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
                    {(filhos.length > 0 || cursos.length > 0) && (
                        <button onClick={() => setExpandidos(p => ({ ...p, [raiz.id]: !expandido }))}
                            style={{
                                ...pillStyle, cursor: 'pointer',
                                background: expandido ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                                color: expandido ? '#60a5fa' : '#9ca3af'
                            }}>
                            {expandido ? '▾' : '▸'} {filhos.length > 0 ? `${filhos.length} ${rotuloFilhos}` : ''}
                            {filhos.length > 0 && cursos.length > 0 ? ' · ' : ''}
                            {cursos.length > 0 ? `${cursos.length} cursos` : ''}
                        </button>
                    )}
                    {canEditContatos && (
                        <>
                            <button onClick={() => setContatoEmEdicao({ modo: 'criar', paiId: raiz.id, tipo: tipoFilho })}
                                style={{ ...pillStyle, cursor: 'pointer' }}>+ item</button>
                            <button onClick={() => setContatoDeCursos(raiz)}
                                style={{ ...pillStyle, cursor: 'pointer' }}>Gerenciar cursos</button>
                        </>
                    )}
                </div>

                {expandido && (
                    <div style={{ marginTop: '8px' }}>
                        {filhos.map(renderFilho)}

                        {cursos.length > 0 && (
                            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' }}>
                                    CURSOS ATENDIDOS
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {cursos.map(curso => (
                                        <span key={curso.id} style={{ ...pillStyle, fontWeight: 'normal' }}>{curso.nome}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: celular ? '12px' : '24px', background: 'transparent', minHeight: '100%', color: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Contatos PUCRS</h2>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
                        Escolas, unidades de atendimento e serviços. Busque pelo nome do curso para saber a quem transferir.
                    </p>
                </div>
                {canEditContatos && (
                    <button onClick={() => setContatoEmEdicao({ modo: 'criar', tipo: 'escola' })} disabled={isSalvando} style={{
                        padding: '8px 16px', background: '#3b82f6', color: '#fff',
                        border: 'none', borderRadius: '8px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'
                    }} onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
                        onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}>
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Novo contato
                    </button>
                )}
            </div>

            <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por curso, Escola, serviço, telefone ou e-mail..."
                style={{
                    width: '100%', padding: '12px 16px', border: '1px solid #334155',
                    borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                    background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box', marginBottom: '20px'
                }}
            />

            {buscando ? (
                <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                        {resultados.length} resultado(s) para “{busca}”
                    </div>
                    {resultados.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            Nada encontrado.
                        </div>
                    ) : resultados.map(r => (
                        <div key={r.chave} style={{ ...cardStyle, padding: '12px 16px', marginBottom: '10px', borderLeftColor: r.tipo === 'curso' ? '#a78bfa' : '#3b82f6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>
                                        {r.tipo === 'curso' && <span style={{ ...pillStyle, marginRight: '8px', color: '#a78bfa' }}>CURSO</span>}
                                        {r.titulo}
                                    </div>
                                    {r.subtitulo && (
                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>→ {r.subtitulo}</div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {r.telefone && (
                                        <>
                                            <a href={`tel:${r.telefone.replace(/\D/g, '')}`} style={linkStyle}>{r.telefone}</a>
                                            <button onClick={() => copiar(r.telefone)} style={botaoIconeStyle} title="Copiar telefone"
                                                onMouseOver={e => e.currentTarget.style.opacity = 1}
                                                onMouseOut={e => e.currentTarget.style.opacity = 0.5}>⧉</button>
                                        </>
                                    )}
                                    <button onClick={() => {
                                        setBusca('');
                                        setExpandidos(p => ({ ...p, [r.contatoId]: true }));
                                        // O card só existe no DOM depois de sair da view de busca.
                                        setTimeout(() => refsCards.current[r.contatoId]
                                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
                                    }} style={{ ...pillStyle, cursor: 'pointer' }}>Ver ficha</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: '0 24px', alignItems: 'start' }}>
                    {raizes.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            Nenhum contato cadastrado.
                        </div>
                    ) : raizes.map(renderCard)}
                </div>
            )}

            {contatoEmEdicao && (
                <ModalEditarContato
                    modo={contatoEmEdicao.modo}
                    contato={contatoEmEdicao.contato}
                    paiId={contatoEmEdicao.paiId}
                    tipoInicial={contatoEmEdicao.tipo}
                    raizes={raizes}
                    isPending={isSalvando}
                    onClose={() => setContatoEmEdicao(null)}
                    onSave={handleSalvarContato}
                />
            )}

            {contatoDeCursos && (
                <ModalCursosContato
                    contato={raizes.find(r => r.id === contatoDeCursos.id) || contatoDeCursos}
                    isPending={isMexendoEmCursos}
                    onClose={() => setContatoDeCursos(null)}
                    onAdicionar={(nome) => adicionarCurso(contatoDeCursos.id, nome)}
                    onRemover={(cursoId) => removerCurso(cursoId)}
                />
            )}
        </div>
    );
}
