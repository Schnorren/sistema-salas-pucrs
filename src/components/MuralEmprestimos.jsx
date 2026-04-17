import React, { useState, useEffect, useRef } from 'react';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { STATUS_ITEM } from '../utils/constants';


const calcularDuracaoTotal = (inicioIso, fimIso) => {
    if (!inicioIso || !fimIso) return '--';
    const diffMs = new Date(fimIso) - new Date(inicioIso);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin} min`;
    return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
};

const TempoDecorrido = ({ dataIso }) => {
    const [tempo, setTempo] = useState('--');

    useEffect(() => {
        if (!dataIso) return;
        const calcular = () => {
            const diffMin = Math.floor(Math.max(0, new Date() - new Date(dataIso)) / 60000);
            if (diffMin < 60) return `${diffMin} min`;
            return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
        };

        setTempo(calcular());
        const timer = setInterval(() => setTempo(calcular()), 30000);
        return () => clearInterval(timer);
    }, [dataIso]);

    return <>{tempo}</>;
};


const EmprestimoWizard = ({
    categorias, itensDisponiveis, emprestimosAtivos,
    consultarAluno, registrarRetirada, registrarDevolucao, alterarStatusManutencao,
    categoriaSel, setCategoriaSel
}) => {
    const { toast, showPrompt, showConfirm } = useUI();
    const [step, setStep] = useState(1);
    const [inputMatricula, setInputMatricula] = useState('');
    const [inputItem, setInputItem] = useState('');
    const [nomeAluno, setNomeAluno] = useState('');
    const [buscandoAluno, setBuscandoAluno] = useState(false);
    const [alunoAnalisado, setAlunoAnalisado] = useState(null);
    const [itemSelecionado, setItemSelecionado] = useState(null);

    const inputMatriculaRef = useRef(null);
    const inputItemRef = useRef(null);
    const inputNomeRef = useRef(null);

    useEffect(() => {
        if (step === 1 && inputMatriculaRef.current) inputMatriculaRef.current.focus();
        if (step === 2 && inputItemRef.current) inputItemRef.current.focus();
        if (step === 3 && inputNomeRef.current) inputNomeRef.current.focus();
    }, [step]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (step === 4 && e.key === 'Enter') {
                e.preventDefault();
                handleConfirmarDevolucao();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, alunoAnalisado]);

    const resetFlow = () => {
        setStep(1);
        setInputMatricula('');
        setInputItem('');
        setNomeAluno('');
        setAlunoAnalisado(null);
        setItemSelecionado(null);
        setBuscandoAluno(false);
    };

    const handleBiparMatricula = async (e) => {
        e.preventDefault();
        const mat = inputMatricula.trim();
        if (!mat) return;

        const emprestimoLocal = emprestimosAtivos.find(emp => emp.matricula === mat);
        if (emprestimoLocal) {
            setAlunoAnalisado({
                matricula: mat,
                nomeCadastrado: emprestimoLocal.nomeAluno,
                emprestimoAtivo: { id: emprestimoLocal.id, nomeItem: emprestimoLocal.nomeItem }
            });
            setStep(4);
            return;
        }

        setBuscandoAluno(true);
        const dadosAluno = await consultarAluno(mat);
        setBuscandoAluno(false);

        setAlunoAnalisado(dadosAluno || { matricula: mat, nomeCadastrado: null });
        setNomeAluno(dadosAluno?.nomeCadastrado || '');
        setStep(2);
    };

    const handleBiparItem = (e) => {
        e.preventDefault();
        const termo = inputItem.trim().toLowerCase();
        const itemEncontrado = itensDisponiveis.find(i =>
            i.patrimonio.toLowerCase() === termo || i.nome_item.toLowerCase().includes(termo)
        );

        if (itemEncontrado) processarEscolhaItem(itemEncontrado);
        else {
            toast.error("Item não encontrado ou não disponível nesta categoria.");
            setInputItem('');
        }
    };

    const processarEscolhaItem = (item) => {
        if (item.status === STATUS_ITEM.MANUTENCAO) return toast.error("Este item está em manutenção.");
        if (nomeAluno) executarRetirada(item, nomeAluno);
        else {
            setItemSelecionado(item);
            setStep(3);
        }
    };

    const handleSalvarNome = (e) => {
        e.preventDefault();
        if (!nomeAluno.trim()) return;
        executarRetirada(itemSelecionado, nomeAluno.trim());
    };

    const executarRetirada = (item, nome) => {
        resetFlow();
        registrarRetirada({ categoriaId: item.categoria_id, itemId: item.id, matricula: alunoAnalisado.matricula, nomeAluno: nome, documento: 'Crachá Retido' });
        toast.success(`Empréstimo de "${item.nome_item}" registrado!`);
    };

    const handleConfirmarDevolucao = async () => {
        const idParaDevolver = alunoAnalisado.emprestimoAtivo.id;
        resetFlow();
        await registrarDevolucao(idParaDevolver);
        toast.success('Devolução registrada com sucesso!');
    };

    const handleEnviarManutencao = async (item) => {
        const motivo = await showPrompt(`Motivo da manutenção para o item: ${item.nome_item}`, '🔧 Enviar para Manutenção');
        if (motivo) {
            await alterarStatusManutencao(item.id, STATUS_ITEM.MANUTENCAO, motivo);
            toast.success('Item enviado para manutenção.');
        }
    };

    const handleLiberarManutencao = async (item) => {
        const confirmado = await showConfirm(`Liberar "${item.nome_item}" para empréstimo?`, 'Liberação');
        if (confirmado) {
            await alterarStatusManutencao(item.id, STATUS_ITEM.DISPONIVEL, null);
            toast.success('Item liberado!');
        }
    };

    const itensProntos = itensDisponiveis.filter(i => i.status === STATUS_ITEM.DISPONIVEL);
    const itensQuebrados = itensDisponiveis.filter(i => i.status === STATUS_ITEM.MANUTENCAO);

    return (
        <div className="wizard-panel">
            <div className={`wizard-header step-${step}`}>
                <h3>
                    {step === 1 && "PASSO 1: Bipar Crachá"}
                    {step === 2 && "PASSO 2: Bipar Jogo"}
                    {step === 3 && "PASSO 3: Registrar Nome"}
                    {step === 4 && "DEVOLUÇÃO DE ITEM"}
                </h3>
            </div>

            <div className="wizard-content">
                {step > 1 && <button onClick={resetFlow} className="btn-cancelar-flow">CANCELAR</button>}

                {step === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <form onSubmit={handleBiparMatricula} style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '48px', opacity: 0.5, marginBottom: '16px' }}>💳</div>
                            <input
                                ref={inputMatriculaRef} type="text" value={inputMatricula} 
                                onChange={e => setInputMatricula(e.target.value)} disabled={buscandoAluno}
                                placeholder={buscandoAluno ? "Consultando..." : "Bipe o crachá do aluno..."}
                                className="input-bipar matricula"
                                style={{ opacity: buscandoAluno ? 0.6 : 1 }}
                            />
                        </form>

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', fontWeight: 'bold' }}>GERENCIAR ESTOQUE</div>
                            
                            {categorias.length > 1 && (
                                <div className="categorias-scroll">
                                    {categorias.map(c => (
                                        <button key={c.id} onClick={() => setCategoriaSel(c.id)} className={`btn-categoria ${categoriaSel === c.id ? 'ativa' : ''}`}>
                                            {c.nome}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {itensDisponiveis.length === 0 && <div className="empty-st" style={{padding: '20px'}}>Nenhum item nesta categoria.</div>}
                                
                                {itensProntos.map(item => (
                                    <div key={item.id} className="item-card-mini">
                                        <div>
                                            <div className="nome">{item.nome_item}</div>
                                            <div className="cod">Cód: {item.patrimonio}</div>
                                        </div>
                                        <button onClick={() => handleEnviarManutencao(item)} title="Enviar para manutenção" className="btn-icon-action">🔧</button>
                                    </div>
                                ))}

                                {itensQuebrados.map(item => (
                                    <div key={item.id} className="item-card-mini manutencao">
                                        <div>
                                            <div className="nome">⚠️ {item.nome_item}</div>
                                            <div className="cod">{item.observacoes || 'Manutenção'}</div>
                                        </div>
                                        <button onClick={() => handleLiberarManutencao(item)} className="btn-liberar">✓ Liberar</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && alunoAnalisado && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="card-aluno-identificado">
                            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '4px' }}>ALUNO IDENTIFICADO</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)' }}>👤 {nomeAluno || 'Novo Cadastro'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--blue)', fontFamily: 'var(--mono)', marginTop: '4px' }}>Matrícula: {alunoAnalisado.matricula}</div>
                        </div>

                        <form onSubmit={handleBiparItem} style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--green)', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>BIPE O ITEM</label>
                            <input ref={inputItemRef} type="text" value={inputItem} onChange={e => setInputItem(e.target.value)} placeholder="Código de barras..." className="input-bipar item" />
                        </form>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', overflowY: 'auto', maxHeight: '200px' }}>
                            {itensProntos.map(item => (
                                <div key={item.id} onClick={() => processarEscolhaItem(item)} className="item-card-mini" style={{ padding: '12px' }}>
                                    <div>
                                        <div className="nome">{item.nome_item}</div>
                                        <div className="cod">Cód: {item.patrimonio}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && itemSelecionado && (
                    <form onSubmit={handleSalvarNome} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                        <div className="card-aluno-identificado" style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📦</div>
                            <div style={{ color: 'var(--amber)', fontSize: '20px', fontWeight: 'bold' }}>{itemSelecionado.nome_item}</div>
                        </div>

                        <label style={{ fontSize: '13px', color: 'var(--purple)', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>NOME DO NOVO ALUNO:</label>
                        <input ref={inputNomeRef} type="text" value={nomeAluno} onChange={e => setNomeAluno(e.target.value)} placeholder="Ex: João da Silva..." className="input-bipar nome" style={{ marginBottom: '20px' }} />

                        <button type="submit" className="btn-action-primary">Confirmar e Emprestar</button>
                    </form>
                )}

                {step === 4 && alunoAnalisado && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <div className="card-aluno-identificado destaque-devolucao">
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text)' }}>👤 {alunoAnalisado.nomeCadastrado}</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: '4px 0 24px 0' }}>Matrícula: {alunoAnalisado.matricula}</div>
                            
                            <div style={{ fontSize: '50px', marginBottom: '10px' }}>📦</div>
                            <h3 style={{ color: 'var(--amber)', margin: '0 0 10px 0' }}>Item a Devolver:</h3>
                            <p style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text)', margin: '0 0 30px 0' }}>{alunoAnalisado.emprestimoAtivo.nomeItem}</p>
                            
                            <button onClick={handleConfirmarDevolucao} className="btn-action-primary large">✓ APERTE ENTER OU CLIQUE</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


const PainelRegistros = ({ abaAtiva, setAbaAtiva, emprestimosAtivos, historico, loading, registrarDevolucao }) => {
    const { toast, showConfirm } = useUI();

    const handleDevolucaoDireta = async (emprestimoId, nomeItem) => {
        const confirmado = await showConfirm(`Confirma a devolução do item: ${nomeItem}?`, '⬇️ Receber Devolução');
        if (confirmado) {
            await registrarDevolucao(emprestimoId);
            toast.success('Devolução concluída!');
        }
    };

    const emprestimosOrdenados = [...emprestimosAtivos].sort((a, b) => new Date(b.dataRetirada) - new Date(a.dataRetirada));

    return (
        <div className="registros-panel">
            <div className="abas-container">
                <button onClick={() => setAbaAtiva('ativos')} className={`aba-btn ${abaAtiva === 'ativos' ? 'ativa' : ''}`}>Em Andamento ({emprestimosOrdenados.length})</button>
                <button onClick={() => setAbaAtiva('historico')} className={`aba-btn ${abaAtiva === 'historico' ? 'ativa' : ''}`}>Histórico Recente</button>
            </div>

            <div className="registros-content">
                {loading && emprestimosOrdenados.length === 0 && historico.length === 0 ? (
                    <div className="empty-st">Carregando dados...</div>
                ) : abaAtiva === 'ativos' ? (
                    emprestimosOrdenados.length === 0 ? (
                        <div className="empty-st" style={{ border: '1px dashed var(--border)', borderRadius: '8px' }}>Nenhum item emprestado no momento.</div>
                    ) : (
                        <div className="grid-emprestimos">
                            {emprestimosOrdenados.map(emp => (
                                <div key={emp.id} className="emprestimo-card">
                                    <div className="emp-aluno">👤 {emp.nomeAluno}</div>
                                    <div className="emp-mat">Matrícula: {emp.matricula}</div>
                                    <div style={{ flex: 1 }}>
                                        <div className="emp-item">📦 {emp.nomeItem}</div>
                                        <div className="emp-cod">Cód: {emp.patrimonio}</div>
                                    </div>
                                    <div className="emp-footer">
                                        <span>🕒 {new Date(emp.dataRetirada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="tag-tempo"><TempoDecorrido dataIso={emp.dataRetirada} /></span>
                                    </div>
                                    <button onClick={() => handleDevolucaoDireta(emp.id, emp.nomeItem)} className="btn-devolver">⬇️ Receber Devolução</button>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    historico.length === 0 ? (
                        <div className="empty-st" style={{ border: '1px dashed var(--border)', borderRadius: '8px' }}>Nenhum histórico encontrado.</div>
                    ) : (
                        <table className="table-historico">
                            <thead>
                                <tr>
                                    <th>Aluno</th>
                                    <th>Item Devolvido</th>
                                    <th>Período</th>
                                    <th>Duração</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historico.map(h => (
                                    <tr key={h.id}>
                                        <td>
                                            <div className="th-aluno-nome">{h.nomeAluno}</div>
                                            <div className="th-aluno-mat">Matrícula: {h.matricula}</div>
                                        </td>
                                        <td className="th-item">📦 {h.nomeItem}</td>
                                        <td>
                                            <div className="th-data">
                                                <span className="th-data-up">↑</span> {new Date(h.dataRetirada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="th-data" style={{ marginTop: '6px' }}>
                                                {h.dataDevolucao ? (
                                                    <><span className="th-data-down">↓</span> {new Date(h.dataDevolucao).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                                                ) : (
                                                    <span className="tag-status pendente">⏳ Pendente</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            {h.dataDevolucao ? (
                                                <span className="tag-status concluido">⏳ {calcularDuracaoTotal(h.dataRetirada, h.dataDevolucao)}</span>
                                            ) : (
                                                <span className="tag-status em-uso">🟢 Em Uso</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>
        </div>
    );
};


export default function MuralEmprestimos({ session }) {
    const { predioAtivo } = usePredio();
    
    const [categoriaSel, setCategoriaSel] = useState('');
    const [abaAtiva, setAbaAtiva] = useState('ativos');

    const hookData = useEmprestimos(session, predioAtivo, categoriaSel);

    useEffect(() => {
        if (hookData.categorias.length > 0 && !categoriaSel) {
            setCategoriaSel(hookData.categorias[0].id);
        }
    }, [hookData.categorias, categoriaSel]);

    if (!predioAtivo) return <div className="empty-st">Selecione um prédio primeiro.</div>;

    return (
        <div className="mural-container">
            <EmprestimoWizard 
                {...hookData}
                categoriaSel={categoriaSel}
                setCategoriaSel={setCategoriaSel}
            />
            <PainelRegistros 
                abaAtiva={abaAtiva}
                setAbaAtiva={setAbaAtiva}
                emprestimosAtivos={hookData.emprestimosAtivos}
                historico={hookData.historico}
                loading={hookData.loading}
                registrarDevolucao={hookData.registrarDevolucao}
            />
        </div>
    );
}