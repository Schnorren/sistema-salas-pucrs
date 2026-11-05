import React, { useState } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { useGestaoEmprestimos } from '../hooks/useGestaoEmprestimos';
import { STATUS_ITEM } from '../utils/constants';
import { rotuloDataHora, hojeSP, ROTULO_OCORRENCIA } from '../../backend_core/utils/emprestimoRegras';

// Gestão de Empréstimos (módulo gestao_emprestimos): pontos de empréstimo do
// prédio, categorias e itens de cada um, limite por aluno, alunos suspensos e
// ocorrências. Quem opera cada ponto é definido na Gestão de Equipe.

const dataBR = (aaaaMmDd) => (aaaaMmDd ? aaaaMmDd.split('-').reverse().join('/') : '');

const ROTULO_STATUS = {
    [STATUS_ITEM.DISPONIVEL]: ['livre', 'var(--green)'],
    [STATUS_ITEM.EMPRESTADO]: ['emprestado', 'var(--amber)'],
    [STATUS_ITEM.MANUTENCAO]: ['manutenção', 'var(--amber)'],
    [STATUS_ITEM.PERDIDO]: ['não devolvido', 'var(--red)'],
};

const estilos = {
    pagina: { padding: '24px', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' },
    caixa: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' },
    botao: { padding: '8px 14px', borderRadius: '6px', border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' },
    botaoSec: { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '12px' },
    input: { width: '100%', padding: '9px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--panel2)', color: 'var(--text)', fontSize: '13px', boxSizing: 'border-box' },
    rotulo: { fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', margin: '10px 0 4px' },
    th: { textAlign: 'left', padding: '8px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid var(--border)' },
    td: { padding: '8px', fontSize: '13px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
};

// Formulário em janela (ponto, categoria ou item)
const Editor = ({ editor, pontos, salvando, onSalvar, onFechar }) => {
    const [dados, setDados] = useState(editor.dados);
    const campo = (nome) => ({ value: dados[nome] ?? '', onChange: (e) => setDados(d => ({ ...d, [nome]: e.target.value })) });
    const categorias = pontos.flatMap(p => p.categorias.map(c => ({ ...c, pontoNome: p.nome })));
    const titulo = { ponto: 'ponto de empréstimo', categoria: 'categoria', item: 'item' }[editor.tipo];

    const enviar = (e) => {
        e.preventDefault();
        onSalvar(editor.tipo, { ...dados, limite: dados.limite != null ? Number(dados.limite) : undefined });
    };

    return (
        <div data-ui-modal="" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <form onSubmit={enviar} style={{ ...estilos.caixa, width: '420px', maxWidth: '92vw' }}>
                <h3 style={{ margin: '0 0 4px' }}>{dados.id ? 'Editar' : 'Novo'} {titulo}</h3>

                <label style={estilos.rotulo}>NOME</label>
                <input autoFocus style={estilos.input} {...campo('nome')}
                    placeholder={editor.tipo === 'ponto' ? 'Ex.: Recepção, Secretaria' : editor.tipo === 'categoria' ? 'Ex.: Sinuca, Carregadores' : 'Ex.: Bolas de sinuca 1'} />

                {editor.tipo === 'ponto' && (
                    <>
                        <label style={estilos.rotulo}>ITENS POR ALUNO AO MESMO TEMPO</label>
                        <input type="number" min="1" max="20" style={{ ...estilos.input, width: '100px' }} {...campo('limite')} />
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                            Vale só para este ponto. Quem opera o ponto é definido em Gestão de Equipe.
                        </div>
                    </>
                )}

                {editor.tipo === 'categoria' && (
                    <>
                        <label style={estilos.rotulo}>PONTO DE EMPRÉSTIMO</label>
                        <select style={estilos.input} {...campo('pontoId')}>
                            {pontos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </>
                )}

                {editor.tipo === 'item' && (
                    <>
                        <label style={estilos.rotulo}>CÓDIGO (OPCIONAL)</label>
                        <input style={estilos.input} {...campo('codigo')} placeholder="Etiqueta/patrimônio. Vazio = gerado automaticamente" />
                        <label style={estilos.rotulo}>CATEGORIA</label>
                        <select style={estilos.input} {...campo('categoriaId')}>
                            {categorias.map(c => <option key={c.id} value={c.id}>{c.pontoNome} · {c.nome}</option>)}
                        </select>
                        {!dados.id && (
                            <>
                                <label style={estilos.rotulo}>OBSERVAÇÕES (OPCIONAL)</label>
                                <input style={estilos.input} {...campo('observacoes')} placeholder="Ex.: 2 raquetes + 1 bolinha" />
                            </>
                        )}
                    </>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
                    <button type="button" style={estilos.botaoSec} onClick={onFechar}>Cancelar</button>
                    <button type="submit" style={{ ...estilos.botao, opacity: salvando ? 0.6 : 1 }} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                </div>
            </form>
        </div>
    );
};

const AbaAcervo = ({ pontos, carregando, salvando, abrir, alternarAtivo }) => {
    if (carregando) return <div className="empty-st">Carregando acervo...</div>;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <button style={estilos.botao} onClick={() => abrir('ponto', { nome: '', limite: 1 })}>+ Novo ponto de empréstimo</button>
            </div>
            {pontos.length === 0 && <div className="empty-st">Nenhum ponto de empréstimo neste prédio ainda.</div>}
            {pontos.map(p => (
                <div key={p.id} style={{ ...estilos.caixa, opacity: p.ativo ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>📍 {p.nome}{!p.ativo && ' (inativo)'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Até {p.limite} item(ns) por aluno ao mesmo tempo</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={estilos.botaoSec} onClick={() => abrir('ponto', { id: p.id, nome: p.nome, limite: p.limite, ativo: p.ativo })}>Editar</button>
                            <button style={estilos.botaoSec} disabled={salvando} onClick={() => alternarAtivo('ponto', p)}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
                            <button style={estilos.botao} onClick={() => abrir('categoria', { nome: '', pontoId: p.id })}>+ Categoria</button>
                        </div>
                    </div>

                    {p.categorias.length === 0 && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>Sem categorias. Crie uma para cadastrar itens.</div>}
                    {p.categorias.map(c => (
                        <div key={c.id} style={{ marginTop: '14px', opacity: c.ativo ? 1 : 0.6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text2)' }}>{c.nome}{!c.ativo && ' (inativa)'}</div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button style={estilos.botaoSec} onClick={() => abrir('categoria', { id: c.id, nome: c.nome, pontoId: p.id, ativo: c.ativo })}>Editar</button>
                                    <button style={estilos.botaoSec} disabled={salvando} onClick={() => alternarAtivo('categoria', { ...c, pontoId: p.id })}>{c.ativo ? 'Desativar' : 'Reativar'}</button>
                                    <button style={estilos.botao} onClick={() => abrir('item', { nome: '', codigo: '', categoriaId: c.id, observacoes: '' })}>+ Item</button>
                                </div>
                            </div>
                            {c.itens.length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>Nenhum item.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px' }}>
                                    <thead>
                                        <tr><th style={estilos.th}>Item</th><th style={estilos.th}>Código</th><th style={estilos.th}>Situação</th><th style={estilos.th}>Uso</th><th style={estilos.th}></th></tr>
                                    </thead>
                                    <tbody>
                                        {c.itens.map(i => {
                                            const [rotulo, cor] = ROTULO_STATUS[i.status] || [i.status, 'var(--muted)'];
                                            return (
                                                <tr key={i.id} style={{ opacity: i.ativo ? 1 : 0.5 }}>
                                                    <td style={estilos.td}><b>{i.nome}</b>{!i.ativo && ' (baixa)'}{i.observacoes && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{i.observacoes}</div>}</td>
                                                    <td style={{ ...estilos.td, fontFamily: 'var(--mono)', fontSize: '12px' }}>{i.codigo}</td>
                                                    <td style={{ ...estilos.td, color: cor, fontWeight: 'bold' }}>
                                                        {rotulo}
                                                        {i.emprestimo && <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'normal' }}>com {i.emprestimo.nomeAluno} desde {rotuloDataHora(i.emprestimo.dataRetirada)}</div>}
                                                    </td>
                                                    <td style={{ ...estilos.td, fontSize: '12px', color: 'var(--muted)' }}>{i.usos}x{i.ultimoUso && <div>último: {rotuloDataHora(i.ultimoUso)}</div>}</td>
                                                    <td style={{ ...estilos.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <button style={estilos.botaoSec} onClick={() => abrir('item', { id: i.id, nome: i.nome, codigo: i.codigo, categoriaId: c.id, ativo: i.ativo })}>Editar</button>{' '}
                                                        <button style={estilos.botaoSec} disabled={salvando || i.status === STATUS_ITEM.EMPRESTADO}
                                                            title={i.status === STATUS_ITEM.EMPRESTADO ? 'Registre a devolução antes' : ''}
                                                            onClick={() => alternarAtivo('item', { ...i, categoriaId: c.id })}>{i.ativo ? 'Dar baixa' : 'Reativar'}</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

const AbaSuspensos = ({ bloqueios, salvandoBloqueio, criarBloqueio, removerBloqueio, inicial }) => {
    const { toast, showConfirm } = useUI();
    const [form, setForm] = useState({ matricula: inicial?.matricula || '', motivo: inicial?.motivo || '', ate: '' });

    const enviar = async (e) => {
        e.preventDefault();
        try {
            await criarBloqueio({ matricula: form.matricula, motivo: form.motivo, ate: form.ate || null });
            toast.success('Aluno suspenso dos empréstimos deste prédio.');
            setForm({ matricula: '', motivo: '', ate: '' });
        } catch (err) {
            toast.error(err.message);
        }
    };
    const liberar = async (b) => {
        if (!await showConfirm(`Liberar ${b.nome || b.matricula} para voltar a pegar itens?`, 'Liberar aluno')) return;
        try {
            await removerBloqueio(b.id);
            toast.success('Suspensão removida.');
        } catch (err) {
            toast.error(err.message);
        }
    };

    return (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <form onSubmit={enviar} style={{ ...estilos.caixa, width: '320px' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px' }}>Suspender aluno</h3>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Vale para todos os pontos do prédio. O aluno ainda pode devolver o que estiver com ele.</div>
                <label style={estilos.rotulo}>MATRÍCULA</label>
                <input style={estilos.input} value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))} placeholder="Bipe o crachá ou digite" />
                <label style={estilos.rotulo}>MOTIVO</label>
                <input style={estilos.input} value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ex.: perdeu a bolinha 2 vezes" />
                <label style={estilos.rotulo}>ATÉ (VAZIO = ATÉ LIBERAR)</label>
                <input type="date" min={hojeSP()} style={estilos.input} value={form.ate} onChange={e => setForm(f => ({ ...f, ate: e.target.value }))} />
                <button type="submit" style={{ ...estilos.botao, marginTop: '14px', width: '100%', background: 'var(--red)' }} disabled={salvandoBloqueio}>Suspender</button>
            </form>

            <div style={{ ...estilos.caixa, flex: 1, minWidth: '320px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>Suspensos agora ({bloqueios.length})</h3>
                {bloqueios.length === 0 ? <div className="empty-st">Nenhum aluno suspenso.</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr><th style={estilos.th}>Aluno</th><th style={estilos.th}>Motivo</th><th style={estilos.th}>Até</th><th style={estilos.th}></th></tr></thead>
                        <tbody>
                            {bloqueios.map(b => (
                                <tr key={b.id}>
                                    <td style={estilos.td}><b>{b.nome || '—'}</b><div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{b.matricula}</div></td>
                                    <td style={estilos.td}>{b.motivo}<div style={{ fontSize: '11px', color: 'var(--muted)' }}>por {String(b.criado_por || '').split('@')[0]} em {rotuloDataHora(b.criado_em)}</div></td>
                                    <td style={estilos.td}>{b.ate ? dataBR(b.ate) : 'até liberar'}</td>
                                    <td style={{ ...estilos.td, textAlign: 'right' }}><button style={estilos.botaoSec} disabled={salvandoBloqueio} onClick={() => liberar(b)}>Liberar</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const AbaOcorrencias = ({ ocorrencias, onSuspender }) => (
    <div style={estilos.caixa}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Registradas no balcão ("devolveu com problema" e "não devolveu"). Últimas 100.</div>
        {ocorrencias.length === 0 ? <div className="empty-st">Nenhuma ocorrência registrada.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={estilos.th}>Quando</th><th style={estilos.th}>Aluno</th><th style={estilos.th}>Item</th><th style={estilos.th}>Ocorrência</th><th style={estilos.th}></th></tr></thead>
                <tbody>
                    {ocorrencias.map(o => (
                        <tr key={o.id}>
                            <td style={{ ...estilos.td, whiteSpace: 'nowrap' }}>{rotuloDataHora(o.data)}</td>
                            <td style={estilos.td}><b>{o.nomeAluno}</b><div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{o.matricula}</div></td>
                            <td style={estilos.td}>{o.nomeItem}{o.ponto && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{o.ponto}</div>}</td>
                            <td style={estilos.td}><b style={{ color: o.tipo === 'NAO_DEVOLVIDO' ? 'var(--red)' : 'var(--amber)' }}>{ROTULO_OCORRENCIA[o.tipo] || o.tipo}</b>{o.obs && <div style={{ fontSize: '12px' }}>{o.obs}</div>}</td>
                            <td style={{ ...estilos.td, textAlign: 'right' }}>
                                {o.suspenso ? <span style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 'bold' }}>suspenso</span>
                                    : <button style={estilos.botaoSec} onClick={() => onSuspender(o)}>Suspender</button>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
);

export default function GestaoEmprestimos({ session, acesso }) {
    const { predioAtivo } = usePredio();
    const { toast, showConfirm } = useUI();
    const g = useGestaoEmprestimos(session, predioAtivo || acesso?.predioId);
    const [aba, setAba] = useState('acervo');
    const [editor, setEditor] = useState(null);
    const [suspenderInicial, setSuspenderInicial] = useState(null);

    const abrir = (tipo, dados) => setEditor({ tipo, dados });

    const salvar = async (tipo, dados) => {
        const fn = { ponto: g.salvarPonto, categoria: g.salvarCategoria, item: g.salvarItem }[tipo];
        try {
            await fn(dados);
            toast.success('Salvo!');
            setEditor(null);
        } catch (err) {
            toast.error(err.message);
        }
    };

    // Desativar ponto/categoria ou dar baixa em item (o histórico continua)
    const alternarAtivo = async (tipo, obj) => {
        const ativar = !obj.ativo;
        const nome = obj.nome;
        const aviso = ativar ? `Reativar "${nome}"?`
            : tipo === 'item' ? `Dar baixa em "${nome}"? Ele sai do balcão; o histórico continua.`
                : `Desativar "${nome}"? Ele some do balcão; o histórico continua.`;
        if (!await showConfirm(aviso, ativar ? 'Reativar' : 'Confirmar')) return;
        const dados = tipo === 'ponto' ? { id: obj.id, nome, limite: obj.limite, ativo: ativar }
            : tipo === 'categoria' ? { id: obj.id, nome, pontoId: obj.pontoId, ativo: ativar }
                : { id: obj.id, nome, codigo: obj.codigo, categoriaId: obj.categoriaId, ativo: ativar };
        salvar(tipo, dados);
    };

    const abaBtn = (id, rotulo) => (
        <button onClick={() => setAba(id)} style={{ ...estilos.botaoSec, ...(aba === id ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : {}) }}>{rotulo}</button>
    );

    if (g.erro) return <div className="empty-st" style={{ color: 'var(--red)' }}>Erro ao carregar: {g.erro}</div>;

    return (
        <div style={estilos.pagina}>
            <div>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Gestão de Empréstimos</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>Pontos de empréstimo, acervo, limite por aluno e suspensões. Quem atende cada ponto se define em Gestão de Equipe.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                {abaBtn('acervo', 'Acervo')}
                {abaBtn('suspensos', `Alunos suspensos (${g.bloqueios.length})`)}
                {abaBtn('ocorrencias', `Ocorrências (${g.ocorrencias.length})`)}
            </div>

            {aba === 'acervo' && <AbaAcervo pontos={g.pontos} carregando={g.carregando} salvando={g.salvando} abrir={abrir} alternarAtivo={alternarAtivo} />}
            {aba === 'suspensos' && (
                <AbaSuspensos key={suspenderInicial?.matricula || 'novo'} bloqueios={g.bloqueios} salvandoBloqueio={g.salvandoBloqueio}
                    criarBloqueio={g.criarBloqueio} removerBloqueio={g.removerBloqueio} inicial={suspenderInicial} />
            )}
            {aba === 'ocorrencias' && (
                <AbaOcorrencias ocorrencias={g.ocorrencias} onSuspender={(o) => {
                    setSuspenderInicial({ matricula: o.matricula, motivo: `${ROTULO_OCORRENCIA[o.tipo] || 'Ocorrência'}: ${o.nomeItem || ''}`.trim() });
                    setAba('suspensos');
                }} />
            )}

            {editor && <Editor key={JSON.stringify(editor)} editor={editor} pontos={g.pontos} salvando={g.salvando} onSalvar={salvar} onFechar={() => setEditor(null)} />}
        </div>
    );
}
