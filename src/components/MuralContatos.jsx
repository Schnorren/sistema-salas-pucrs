import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Phone, Mail, MessageCircle, MapPin, Clock, Pencil, Plus, Trash2, GraduationCap } from 'lucide-react';
import { useContatos } from '../hooks/useContatos';
import { useUI } from '../contexts/UIContext';
import { buscarNoDiretorio, normalizarTexto } from '../utils/contatosBusca';
import ModalEditarContato from './ModalEditarContato';
import ModalCursosContato from './ModalCursosContato';
import Copiar from './ui/Copiar';
import { Carregando, Erro } from './ui/Estado';

// Só dígitos, com DDI do Brasil — formato que o wa.me espera.
function linkWhatsapp(numero) {
    const digitos = String(numero || '').replace(/\D/g, '');
    return digitos.length < 10 ? null : `https://wa.me/55${digitos}`;
}
const telHref = (t) => `tel:${String(t).replace(/\D/g, '')}`;
const TIPO = { escola: 'Escola', local: 'Local', unidade: 'Unidade', servico: 'Serviço' };

// Diretório institucional (global, sem prédio): lista à esquerda, detalhe à
// direita. A busca é client-side e usa a MESMA regra da busca global
// (utils/contatosBusca.js).
export default function MuralContatos({ session, acesso, canEditContatos, contatoFocado }) {
    const { showConfirm, toast } = useUI();
    const {
        diretorio, loading, error,
        isSalvando, isExcluindo, isMexendoEmCursos,
        criarContato, atualizarContato, excluirContato, adicionarCurso, removerCurso
    } = useContatos(session, acesso);

    const [busca, setBusca] = useState('');
    const [selId, setSelId] = useState(null);
    const [filhoFoco, setFilhoFoco] = useState(null);
    const [contatoEmEdicao, setContatoEmEdicao] = useState(null); // { modo, contato, paiId, tipo }
    const [contatoDeCursos, setContatoDeCursos] = useState(null);
    const detRef = useRef(null);

    const grupos = useMemo(() => [
        { rotulo: 'Prédios e locais', itens: diretorio.locais || [] },
        { rotulo: 'Escolas da PUCRS', itens: diretorio.escolas || [] },
    ], [diretorio]);
    const raizes = useMemo(() => [...(diretorio.locais || []), ...(diretorio.escolas || [])], [diretorio]);

    // Vem da busca global (/contatos?id=) como { id, n }: o n muda a cada clique
    useEffect(() => {
        if (contatoFocado?.id) { setSelId(contatoFocado.id); setBusca(''); } // eslint-disable-line react-hooks/set-state-in-effect
    }, [contatoFocado]);
    useEffect(() => { detRef.current?.scrollTo({ top: 0 }); }, [selId]);

    const termo = normalizarTexto(busca);
    const buscando = termo.length >= 2;
    const resultados = useMemo(() => (buscando ? buscarNoDiretorio(diretorio, busca, 40) : []), [diretorio, busca, buscando]);
    const idsDosResultados = useMemo(() => new Set(resultados.map(r => r.contatoId)), [resultados]);

    const sel = raizes.find(r => r.id === selId) || raizes[0] || null;

    const salvar = async (dados) => {
        try {
            if (contatoEmEdicao?.modo === 'editar') { await atualizarContato(contatoEmEdicao.contato.id, dados); toast.success('Contato atualizado.'); }
            else { await criarContato(dados); toast.success('Contato criado.'); }
            setContatoEmEdicao(null);
        } catch (err) { toast.error(err.message || 'Não foi possível salvar o contato.'); }
    };
    const excluir = async (contato) => {
        const n = (contato.filhos || []).length;
        const ok = await showConfirm(`Excluir "${contato.nome}" permanentemente?${n ? ` Isso também remove os ${n} itens vinculados.` : ''}`, 'Excluir contato', { confirmar: 'Excluir', perigo: true });
        if (!ok) return;
        try { await excluirContato(contato.id); toast.success('Contato excluído.'); } catch (err) { toast.error(err.message || 'Não foi possível excluir o contato.'); }
    };

    if (loading && raizes.length === 0) return <Carregando texto="Carregando o diretório…" />;
    if (error) return <Erro texto={error} />;

    const escolher = (id, filhoId = null) => { setSelId(id); setFilhoFoco(filhoId); };

    return (
        <div className="contatos">
            <aside className="ct-lista" aria-label="Diretório">
                <div className="ct-busca">
                    <div className="campo-busca" style={{ minWidth: 0 }}>
                        <Search size={16} />
                        <input className="inp" autoFocus placeholder="Escola, curso, setor ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no diretório" />
                    </div>
                    {canEditContatos && <button className="btn sm" onClick={() => setContatoEmEdicao({ modo: 'criar', tipo: 'escola' })} disabled={isSalvando}><Plus size={14} />Novo contato</button>}
                </div>
                <div className="ct-itens">
                    {buscando && (
                        resultados.length === 0
                            ? <div className="vazio" style={{ margin: 14 }}>Nada encontrado para “{busca}”.</div>
                            : <>
                                <div className="ct-grupo">{resultados.length} resultado{resultados.length > 1 ? 's' : ''}</div>
                                {resultados.map(r => (
                                    <button key={r.chave} className="ct-item" aria-current={sel?.id === r.contatoId} onClick={() => escolher(r.contatoId, r.tipo === 'contato' && r.subtitulo ? r.chave.replace('contato-', '') : null)}>
                                        <b>{r.titulo}</b>
                                        <small>{r.tipo === 'curso' ? `Curso → ${r.subtitulo}` : r.subtitulo || ''}{r.telefone ? ` · ${r.telefone}` : ''}</small>
                                    </button>
                                ))}
                            </>
                    )}
                    {!buscando && grupos.map(g => g.itens.length > 0 && (
                        <div key={g.rotulo}>
                            <div className="ct-grupo">{g.rotulo}</div>
                            {g.itens.map(c => (
                                <button key={c.id} className="ct-item" aria-current={sel?.id === c.id} onClick={() => escolher(c.id)}>
                                    <b>{c.nome}</b>
                                    <small>{[(c.telefones || [])[0], (c.filhos || []).length ? `${c.filhos.length} ${c.tipo === 'escola' ? 'unidades' : 'serviços'}` : null, (c.cursos || []).length ? `${c.cursos.length} cursos` : null].filter(Boolean).join(' · ')}</small>
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </aside>

            <section className="ct-det" ref={detRef}>
                {!sel ? <div className="vazio">Nenhum contato cadastrado.</div> : (
                    <Detalhe
                        contato={sel} filhoFoco={filhoFoco} destacar={buscando && idsDosResultados.has(sel.id) ? termo : ''}
                        canEdit={canEditContatos} isExcluindo={isExcluindo}
                        onEditar={(c) => setContatoEmEdicao({ modo: 'editar', contato: c })}
                        onNovoFilho={() => setContatoEmEdicao({ modo: 'criar', paiId: sel.id, tipo: sel.tipo === 'escola' ? 'unidade' : 'servico' })}
                        onExcluir={excluir}
                        onCursos={() => setContatoDeCursos(sel)}
                    />
                )}
            </section>

            {contatoEmEdicao && (
                <ModalEditarContato
                    modo={contatoEmEdicao.modo} contato={contatoEmEdicao.contato} paiId={contatoEmEdicao.paiId}
                    tipoInicial={contatoEmEdicao.tipo} raizes={raizes} isPending={isSalvando}
                    onClose={() => setContatoEmEdicao(null)} onSave={salvar}
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

function Campos({ contato }) {
    const tels = contato.telefones || [];
    const mails = contato.emails || [];
    const wpp = linkWhatsapp(contato.whatsapp);
    return (
        <div className="ct-info">
            {tels.length > 0 && <div className="ct-campo"><Phone size={16} /><div style={{ minWidth: 0 }}><span className="rot">Telefone</span><div className="val">{tels.map(t => <div key={t}><Copiar valor={t} href={telHref(t)} /></div>)}</div></div></div>}
            {mails.length > 0 && <div className="ct-campo"><Mail size={16} /><div style={{ minWidth: 0 }}><span className="rot">E-mail</span><div className="val">{mails.map(m => <div key={m}><Copiar valor={m} href={`mailto:${m}`} /></div>)}</div></div></div>}
            {wpp && <div className="ct-campo"><MessageCircle size={16} /><div style={{ minWidth: 0 }}><span className="rot">WhatsApp</span><div className="val"><Copiar valor={contato.whatsapp} /><div><a className="btn fant sm" style={{ paddingLeft: 0 }} href={wpp} target="_blank" rel="noreferrer">Abrir conversa</a></div></div></div></div>}
            {contato.endereco && <div className="ct-campo"><MapPin size={16} /><div style={{ minWidth: 0 }}><span className="rot">Endereço</span><div className="val">{contato.endereco}</div></div></div>}
            {contato.horarios && <div className="ct-campo"><Clock size={16} /><div style={{ minWidth: 0 }}><span className="rot">Horário</span><div className="val">{contato.horarios}</div></div></div>}
        </div>
    );
}

function Detalhe({ contato, filhoFoco, destacar, canEdit, isExcluindo, onEditar, onNovoFilho, onExcluir, onCursos }) {
    const filhos = contato.filhos || [];
    const cursos = contato.cursos || [];
    const refs = useRef({});
    useEffect(() => { if (filhoFoco) refs.current[filhoFoco]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [filhoFoco, contato.id]);
    const rotuloFilhos = contato.tipo === 'escola' ? 'Unidades de atendimento' : 'Serviços e espaços';
    return (
        <div className="ct-det-in">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                    <span className="chip contorno">{TIPO[contato.tipo] || contato.tipo}</span>
                    <h1 className="ct-tit">{contato.nome}</h1>
                    {contato.descricao && <p className="sub" style={{ fontSize: 14, marginTop: 6, maxWidth: '70ch', whiteSpace: 'pre-wrap' }}>{contato.descricao}</p>}
                </div>
                {canEdit && (
                    <div className="acoes-linha">
                        <button className="btn" onClick={() => onEditar(contato)}><Pencil size={15} />Editar</button>
                        <button className="btn" onClick={onNovoFilho}><Plus size={15} />{contato.tipo === 'escola' ? 'Unidade' : 'Serviço'}</button>
                        {contato.tipo === 'escola' && <button className="btn" onClick={onCursos}><GraduationCap size={15} />Cursos</button>}
                        <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => onExcluir(contato)} disabled={isExcluindo} aria-label="Excluir contato" title="Excluir"><Trash2 size={16} /></button>
                    </div>
                )}
            </div>

            <Campos contato={contato} />

            {filhos.length > 0 && (
                <section>
                    <div className="sec-hd"><h2 className="t-sec">{rotuloFilhos}</h2><span className="cont">{filhos.length}</span></div>
                    <div className="sub-lista">
                        {filhos.map(f => (
                            <div key={f.id} ref={el => { refs.current[f.id] = el; }} className={`sub-item ${filhoFoco === f.id ? 'foco' : ''}`}>
                                <b>{f.referencia && <span className="ref" title="Número no mapa do prédio">{f.referencia}</span>}{f.nome}</b>
                                <small>{[f.descricao, f.endereco, f.horarios].filter(Boolean).join(' · ')}</small>
                                {canEdit && (
                                    <div className="acoes-linha" style={{ gridColumn: 1 }}>
                                        <button className="btn fant sm" style={{ paddingLeft: 0 }} onClick={() => onEditar(f)}><Pencil size={13} />Editar</button>
                                        <button className="btn fant sm" style={{ color: 'var(--alta)' }} onClick={() => onExcluir(f)} disabled={isExcluindo}><Trash2 size={13} />Excluir</button>
                                    </div>
                                )}
                                <div className="contato-rapido">
                                    {(f.telefones || []).map(t => <Copiar key={t} valor={t} href={telHref(t)} />)}
                                    {(f.emails || []).map(m => <small key={m}>{m}</small>)}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {cursos.length > 0 && (
                <section>
                    <div className="sec-hd"><h2 className="t-sec">Cursos desta Escola</h2><span className="cont">{cursos.length}</span><span className="dica">quem ligar sobre estes cursos, transfira para cá</span></div>
                    <div className="cursos">
                        {cursos.map(c => <span key={c.id} className="chip contorno" style={destacar && normalizarTexto(c.nome).includes(destacar) ? { borderColor: 'var(--acao-texto)', background: 'var(--acao-suave)', color: 'var(--text)' } : undefined}>{c.nome}</span>)}
                    </div>
                </section>
            )}
        </div>
    );
}
