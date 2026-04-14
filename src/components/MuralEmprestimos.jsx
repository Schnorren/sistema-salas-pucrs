import React, { useState, useEffect, useRef } from 'react';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { usePredio } from '../contexts/PredioContext';

export default function MuralEmprestimos({ session }) {
    const { predioAtivo } = usePredio();
    const {
        categorias, itensDisponiveis, emprestimosAtivos, historico, loading,
        carregarCategorias, carregarItensDisponiveis, carregarAtivos, carregarHistorico,
        consultarAluno, registrarRetirada, registrarDevolucao, alterarStatusManutencao
    } = useEmprestimos(session, predioAtivo);

    const [step, setStep] = useState(1);

    const [inputMatricula, setInputMatricula] = useState('');
    const [inputItem, setInputItem] = useState('');
    const [nomeAluno, setNomeAluno] = useState('');
    const [buscandoAluno, setBuscandoAluno] = useState(false);

    const [alunoAnalisado, setAlunoAnalisado] = useState(null);
    const [itemSelecionado, setItemSelecionado] = useState(null);

    const [categoriaSel, setCategoriaSel] = useState('');
    const [abaAtiva, setAbaAtiva] = useState('ativos');

    const inputMatriculaRef = useRef(null);
    const inputItemRef = useRef(null);
    const inputNomeRef = useRef(null);
    const [agora, setAgora] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setAgora(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (predioAtivo) {
            setCategoriaSel('');
            carregarCategorias();
            carregarAtivos(true);
            resetFlow();
        }
    }, [predioAtivo, carregarCategorias, carregarAtivos]);

    useEffect(() => {
        if (categorias.length > 0) {
            setCategoriaSel(prev => {
                if (!prev) return categorias[0].id;
                const isValid = categorias.some(c => c.id === prev);
                return isValid ? prev : categorias[0].id;
            });
        } else {
            setCategoriaSel('');
        }
    }, [categorias]);

    useEffect(() => {
        const pertenceAoPredioAtual = categorias.some(c => c.id === categoriaSel);

        if (categoriaSel && pertenceAoPredioAtual) {
            carregarItensDisponiveis(categoriaSel);
        } else {
            carregarItensDisponiveis(null);
        }
    }, [categoriaSel, categorias, carregarItensDisponiveis]);

    useEffect(() => {
        if (abaAtiva === 'historico') carregarHistorico(true);
        else carregarAtivos(true);
    }, [abaAtiva, carregarHistorico, carregarAtivos]);

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
    });

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
                emprestimoAtivo: {
                    id: emprestimoLocal.id,
                    nomeItem: emprestimoLocal.nomeItem
                }
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

    const processarEscolhaItem = (item) => {
        if (item.status === 'MANUTENCAO') {
            return alert("Este item está em manutenção e não pode ser emprestado.");
        }
        if (nomeAluno) executarRetirada(item, nomeAluno);
        else {
            setItemSelecionado(item);
            setStep(3);
        }
    };

    const handleBiparItem = (e) => {
        e.preventDefault();
        const termo = inputItem.trim().toLowerCase();

        const itemEncontrado = itensDisponiveis.find(i =>
            i.patrimonio.toLowerCase() === termo ||
            i.nome_item.toLowerCase().includes(termo)
        );

        if (itemEncontrado) processarEscolhaItem(itemEncontrado);
        else {
            alert("Item não encontrado, está em manutenção ou já está emprestado.");
            setInputItem('');
        }
    };

    const handleSalvarNomeENovoEmprestimo = (e) => {
        e.preventDefault();
        if (!nomeAluno.trim()) return;
        executarRetirada(itemSelecionado, nomeAluno.trim());
    };

    const executarRetirada = (item, nome) => {
        resetFlow();
        registrarRetirada({
            categoriaId: item.categoria_id,
            itemId: item.id,
            matricula: alunoAnalisado.matricula,
            nomeAluno: nome,
            documento: 'Crachá Retido'
        });
    };

    const handleConfirmarDevolucao = () => {
        const idParaDevolver = alunoAnalisado.emprestimoAtivo.id;
        resetFlow();
        registrarDevolucao(idParaDevolver);
    };

    const handleDevolucaoDireta = (emprestimoId, nomeItem) => {
        if (window.confirm(`Confirma a devolução do item: ${nomeItem}?`)) {
            registrarDevolucao(emprestimoId);
        }
    };

    const handleEnviarManutencao = async (item) => {
        const motivo = window.prompt(`Qual o motivo da manutenção para o item: ${item.nome_item}?`);
        if (!motivo) return;
        await alterarStatusManutencao(item.id, 'MANUTENCAO', motivo);
    };

    const handleLiberarManutencao = async (item) => {
        if (window.confirm(`Deseja liberar "${item.nome_item}" para empréstimo novamente?`)) {
            await alterarStatusManutencao(item.id, 'DISPONIVEL', null);
        }
    };

    const calcularTempoAtivo = (dataIso) => {
        if (!dataIso) return '--';
        const diffMs = Math.max(0, agora - new Date(dataIso));
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 60) return `${diffMin} min`;
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        return `${h}h ${m}m`;
    };

    const calcularDuracaoTotal = (inicioIso, fimIso) => {
        if (!inicioIso || !fimIso) return '--';
        const diffMs = new Date(fimIso) - new Date(inicioIso);
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 60) return `${diffMin} min`;
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        return `${h}h ${m}m`;
    };

    const itensProntos = itensDisponiveis.filter(i => i.status === 'DISPONIVEL');
    const itensQuebrados = itensDisponiveis.filter(i => i.status === 'MANUTENCAO');
    const emprestimosOrdenados = [...emprestimosAtivos].sort((a, b) => new Date(b.dataRetirada) - new Date(a.dataRetirada));

    if (!predioAtivo) return <div className="empty-st">Selecione um prédio primeiro.</div>;

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', gap: '24px', color: 'var(--text)' }}>
            <input type="hidden" id="cat-sel-hidden" value={categoriaSel} />
            <div style={{ width: '450px', background: 'var(--surface, #1e293b)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '20px', background: step === 4 ? '#f59e0b' : step === 3 ? '#8b5cf6' : step === 2 ? '#059669' : '#2563eb', color: '#fff', textAlign: 'center', transition: 'all 0.3s' }}>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>
                        {step === 1 && "PASSO 1: Bipar Crachá"}
                        {step === 2 && "PASSO 2: Bipar Jogo"}
                        {step === 3 && "PASSO 3: Registrar Nome"}
                        {step === 4 && "DEVOLUÇÃO DE ITEM"}
                    </h3>
                </div>

                <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    {step > 1 && (
                        <button onClick={resetFlow} style={{ position: 'absolute', top: '10px', right: '10px', padding: '6px 12px', background: 'transparent', color: '#f87171', border: '1px solid #f87171', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', zIndex: 10 }}>
                            CANCELAR
                        </button>
                    )}

                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <form onSubmit={handleBiparMatricula} style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                                <div style={{ fontSize: '48px', opacity: 0.5 }}>💳</div>
                                <input
                                    ref={inputMatriculaRef}
                                    type="text"
                                    value={inputMatricula}
                                    onChange={e => setInputMatricula(e.target.value)}
                                    disabled={buscandoAluno}
                                    placeholder={buscandoAluno ? "Consultando..." : "Bipe o crachá do aluno..."}
                                    style={{
                                        width: '100%', padding: '16px', fontSize: '20px', textAlign: 'center', borderRadius: '8px',
                                        background: buscandoAluno ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                                        color: '#fff', border: '2px dashed #3b82f6', outline: 'none',
                                        opacity: buscandoAluno ? 0.6 : 1
                                    }}
                                />
                            </form>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', fontWeight: 'bold' }}>GERENCIAR ESTOQUE (MANUTENÇÃO)</div>

                                {categorias.length > 1 && (
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '5px' }}>
                                        {categorias.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => setCategoriaSel(c.id)}
                                                style={{ padding: '8px 16px', background: categoriaSel === c.id ? '#3b82f6' : 'rgba(255,255,255,0.05)', color: categoriaSel === c.id ? '#fff' : 'var(--muted)', border: '1px solid ' + (categoriaSel === c.id ? '#3b82f6' : 'var(--border)'), borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                            >
                                                {c.nome}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {itensDisponiveis.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>Nenhum item nesta categoria.</div>}

                                    {itensProntos.map(item => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#e2e8f0' }}>{item.nome_item}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Cód: {item.patrimonio}</div>
                                            </div>
                                            <button
                                                onClick={() => handleEnviarManutencao(item)}
                                                title="Reportar defeito ou enviar para manutenção"
                                                style={{
                                                    background: 'transparent', color: '#94a3b8', border: 'none',
                                                    padding: '6px', cursor: 'pointer', fontSize: '16px',
                                                    transition: 'all 0.2s', borderRadius: '4px'
                                                }}
                                                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
                                            >
                                                🔧
                                            </button>
                                        </div>
                                    ))}

                                    {itensQuebrados.map(item => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245, 158, 11, 0.05)', border: '1px dashed #f59e0b', borderRadius: '6px', padding: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fbbf24' }}>⚠️ {item.nome_item}</div>
                                                <div style={{ fontSize: '11px', color: '#fcd34d' }}>{item.observacoes || 'Em manutenção'}</div>
                                            </div>
                                            <button
                                                onClick={() => handleLiberarManutencao(item)}
                                                title="Marcar como consertado"
                                                style={{
                                                    background: 'transparent', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)',
                                                    borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                ✓ Liberar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && alunoAnalisado && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: '10px' }}>
                            <div style={{ marginBottom: '24px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>ALUNO IDENTIFICADO</div>
                                <div style={{ fontSize: '20px', fontWeight: '900', color: '#fff', marginTop: '4px' }}>👤 {nomeAluno || 'Novo Cadastro (Pendente)'}</div>
                                <div style={{ fontSize: '14px', color: '#60a5fa', marginTop: '2px', fontWeight: 'bold' }}>Matrícula: {alunoAnalisado.matricula}</div>
                            </div>

                            <form onSubmit={handleBiparItem} style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '12px', color: '#10b981', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>BIPE O ITEM PARA EMPRESTAR</label>
                                <input
                                    ref={inputItemRef}
                                    type="text" value={inputItem} onChange={e => setInputItem(e.target.value)}
                                    placeholder="Bipe o código de barras..."
                                    style={{ width: '100%', padding: '16px', borderRadius: '8px', background: 'rgba(5, 150, 105, 0.1)', color: '#fff', border: '2px dashed #10b981', fontSize: '18px', textAlign: 'center', outline: 'none' }}
                                />
                            </form>
                            {categorias.length > 1 && (
                                <>
                                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', fontWeight: 'bold' }}>OU ESCOLHA MANUALMENTE</div>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '5px' }}>
                                        {categorias.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setCategoriaSel(c.id); inputItemRef.current?.focus(); }}
                                                style={{ padding: '8px 16px', background: categoriaSel === c.id ? '#3b82f6' : 'rgba(255,255,255,0.05)', color: categoriaSel === c.id ? '#fff' : 'var(--muted)', border: '1px solid ' + (categoriaSel === c.id ? '#3b82f6' : 'var(--border)'), borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                            >
                                                {c.nome}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', overflowY: 'auto', maxHeight: '200px', paddingRight: '4px' }}>
                                {itensProntos.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => processarEscolhaItem(item)}
                                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                    >
                                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '4px' }}>{item.nome_item}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Cód: {item.patrimonio}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && itemSelecionado && (
                        <form onSubmit={handleSalvarNomeENovoEmprestimo} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', paddingTop: '10px' }}>
                            <div style={{ textAlign: 'center', marginBottom: '30px', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
                                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📦</div>
                                <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Item Selecionado</div>
                                <div style={{ color: '#fbbf24', fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>{itemSelecionado.nome_item}</div>
                            </div>

                            <label style={{ fontSize: '13px', color: '#8b5cf6', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
                                ALUNO NOVO! DIGITE O NOME PARA REGISTRAR:
                            </label>
                            <input
                                ref={inputNomeRef}
                                type="text" value={nomeAluno} onChange={e => setNomeAluno(e.target.value)}
                                placeholder="Ex: João da Silva..."
                                style={{ width: '100%', padding: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '2px solid #8b5cf6', fontSize: '16px', textAlign: 'center', marginBottom: '20px', outline: 'none' }}
                            />

                            <button type="submit" style={{ width: '100%', padding: '16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>
                                Confirmar e Emprestar
                            </button>
                        </form>
                    )}

                    {step === 4 && alunoAnalisado && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', paddingTop: '10px' }}>

                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '30px', textAlign: 'center', width: '100%' }}>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>👤 {alunoAnalisado.nomeCadastrado}</div>
                                <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px' }}>Matrícula: {alunoAnalisado.matricula}</div>

                                <div style={{ fontSize: '50px', marginBottom: '10px' }}>📦</div>
                                <h3 style={{ color: '#fbbf24', margin: '0 0 10px 0' }}>Item a Devolver:</h3>
                                <p style={{ fontSize: '24px', fontWeight: '900', color: '#fde68a', margin: '0 0 30px 0' }}>
                                    {alunoAnalisado.emprestimoAtivo.nomeItem}
                                </p>
                                <button onClick={handleConfirmarDevolucao} style={{ width: '100%', padding: '16px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
                                    ✓ APERTE ENTER OU CLIQUE
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface, #1e293b)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => setAbaAtiva('ativos')} style={{ flex: 1, padding: '16px', background: abaAtiva === 'ativos' ? 'rgba(255,255,255,0.05)' : 'transparent', color: abaAtiva === 'ativos' ? '#60a5fa' : 'var(--muted)', border: 'none', borderBottom: abaAtiva === 'ativos' ? '2px solid #60a5fa' : '2px solid transparent', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>Em Andamento ({emprestimosOrdenados.length})</button>
                    <button onClick={() => setAbaAtiva('historico')} style={{ flex: 1, padding: '16px', background: abaAtiva === 'historico' ? 'rgba(255,255,255,0.05)' : 'transparent', color: abaAtiva === 'historico' ? '#60a5fa' : 'var(--muted)', border: 'none', borderBottom: abaAtiva === 'historico' ? '2px solid #60a5fa' : '2px solid transparent', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>Histórico Recente</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {loading && emprestimosOrdenados.length === 0 && historico.length === 0 ? (
                        <div style={{ color: 'var(--muted)' }}>Carregando dados...</div>
                    ) : abaAtiva === 'ativos' ? (
                        emprestimosOrdenados.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '15px' }}>Nenhum item emprestado no momento.</div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                {emprestimosOrdenados.map(emp => (
                                    <div key={emp.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderLeft: '4px solid #f59e0b', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>

                                        <div style={{ fontSize: '18px', fontWeight: '900', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            👤 <span style={{ textTransform: 'capitalize' }}>{emp.nomeAluno}</span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                                            Matrícula: {emp.matricula}
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fbbf24' }}>📦 {emp.nomeItem}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Cód: {emp.patrimonio}</div>
                                        </div>

                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>🕒 {new Date(emp.dataRetirada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                                                ⏳ {calcularTempoAtivo(emp.dataRetirada)}
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => handleDevolucaoDireta(emp.id, emp.nomeItem)}
                                            style={{
                                                width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                                                border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s'
                                            }}
                                            onMouseOver={(e) => { e.target.style.background = '#ef4444'; e.target.style.color = '#fff'; }}
                                            onMouseOut={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.1)'; e.target.style.color = '#ef4444'; }}
                                        >
                                            ⬇️ Receber Devolução
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        historico.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '15px' }}>Nenhum histórico encontrado.</div>
                        ) : (
                            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                                        <th style={{ padding: '14px 12px' }}>Aluno</th>
                                        <th style={{ padding: '14px 12px' }}>Item Devolvido</th>
                                        <th style={{ padding: '14px 12px' }}>Período do Empréstimo</th>
                                        <th style={{ padding: '14px 12px' }}>Duração</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historico.map(h => (
                                        <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '14px 12px' }}>
                                                <strong style={{ color: '#fff', fontSize: '15px' }}>{h.nomeAluno}</strong><br />
                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Matrícula: {h.matricula}</span>
                                            </td>
                                            <td style={{ padding: '14px 12px', color: '#fbbf24', fontWeight: 'bold' }}>📦 {h.nomeItem}</td>
                                            <td style={{ padding: '14px 12px', color: '#94a3b8', fontSize: '13px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>↑</span>
                                                    {new Date(h.dataRetirada).toLocaleDateString('pt-BR')} às {new Date(h.dataRetirada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>↓</span>
                                                    {new Date(h.dataDevolucao).toLocaleDateString('pt-BR')} às {new Date(h.dataDevolucao).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td style={{ padding: '14px 12px' }}>
                                                <span style={{ background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                                                    ⏳ {calcularDuracaoTotal(h.dataRetirada, h.dataDevolucao)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}