import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEmprestimos, usePontosEmprestimo } from '../hooks/useEmprestimos';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { STATUS_ITEM, STATUS_EMPRESTIMO } from '../utils/constants';
import { lerBalcao, salvarBalcao, lerPontoSalvo, salvarPontoSalvo } from '../utils/balcao';
import { somLigado, definirSom, tocarSom } from '../utils/somBalcao';
import {
    formatarDuracao, minutosEntre, rotuloDataHora, resolverItemPorTermo, normalizarNome, normalizarMatricula,
    preverDevolucao, previsaoDaCategoria, restanteParaDesfazerMs, podeDesfazer,
    RESULTADOS_DEVOLUCAO, ROTULO_OCORRENCIA, JANELA_DESFAZER_MIN,
} from '../../backend_core/utils/emprestimoRegras';

// Balcão de empréstimos (passos como sempre): 1 crachá → 2 item → 3 nome (aluno
// novo) | devolução. Regras de negócio no backend (RPCs) e em emprestimoRegras.

// Relógio que re-renderiza de tempos em tempos ("há 25 min", "Desfazer (8 min)")
const useAgora = (ms = 30000) => {
    const [agora, setAgora] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setAgora(new Date()), ms);
        return () => clearInterval(t);
    }, [ms]);
    return agora;
};

const modalAberto = () => !!document.querySelector('[data-ui-modal]');
const primeiroNome = (nome) => String(nome || '').split(' ')[0];
const dataBR = (aaaaMmDd) => (aaaaMmDd ? aaaaMmDd.split('-').reverse().join('/') : '');
const duracao = (inicio, fim) => formatarDuracao(minutosEntre(inicio, fim));

const agruparPorCategoria = (itens) => {
    const grupos = new Map();
    for (const item of itens) {
        if (!grupos.has(item.categoria_id)) {
            grupos.set(item.categoria_id, { id: item.categoria_id, nome: item.categoria_nome || 'Sem categoria', itens: [] });
        }
        grupos.get(item.categoria_id).itens.push(item);
    }
    return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

const motivoIndisponivel = (item) => {
    if (item.status === STATUS_ITEM.EMPRESTADO) {
        return `"${item.nome_item}" está com ${primeiroNome(item.emprestimo?.nomeAluno) || 'outro aluno'}.`;
    }
    if (item.status === STATUS_ITEM.MANUTENCAO) return `"${item.nome_item}" está em manutenção.`;
    if (item.status === STATUS_ITEM.PERDIDO) return `"${item.nome_item}" foi registrado como não devolvido.`;
    return `"${item.nome_item}" não está disponível.`;
};

// "com João há 25 min · costuma voltar em ~20 min"
const LinhaComQuem = ({ emprestimo, medianaMin, agora }) => {
    if (!emprestimo) return null;
    const previsao = preverDevolucao({ desde: emprestimo.dataRetirada, medianaMin }, agora);
    return (
        <span>
            com {primeiroNome(emprestimo.nomeAluno)} há {formatarDuracao(previsao?.decorrido)}
            {previsao?.texto && <span className={`previsao ${previsao.estado}`}> · {previsao.texto}</span>}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Faixa do topo: nome deste computador, ponto de empréstimo e som
// ---------------------------------------------------------------------------
const FaixaBalcao = ({ pontos, pontoId, onTrocarPonto }) => {
    const { showPrompt, toast } = useUI();
    const [nome, setNome] = useState(lerBalcao);
    const [som, setSom] = useState(somLigado);

    // Os PCs da recepção usam o mesmo login: o nome do computador vai junto de
    // cada retirada/devolução (header x-balcao). Ver utils/balcao.js.
    const alterarNome = async () => {
        const novo = await showPrompt('Como este computador deve aparecer no histórico? Ex.: Balcão 1', 'Nome deste computador');
        if (!novo) return;
        salvarBalcao(novo);
        setNome(lerBalcao());
        toast.success(`Este computador agora é "${lerBalcao()}".`);
    };
    const alternarSom = () => {
        const ligado = !som;
        definirSom(ligado);
        setSom(ligado);
        if (ligado) tocarSom('ok');
    };
    const atual = pontos.find(p => p.id === pontoId);

    return (
        <div className="faixa-balcao">
            <span>🖥️ Este computador: <b>{nome || 'sem nome'}</b>{' '}
                <button type="button" className="link-balcao" onClick={alterarNome}>{nome ? 'alterar' : 'dar nome'}</button>
            </span>
            {pontos.length > 1 ? (
                <select className="select-ponto" value={pontoId} onChange={e => onTrocarPonto(e.target.value)} title="Ponto de empréstimo deste computador">
                    {pontos.map(p => <option key={p.id} value={p.id}>📍 {p.nome}</option>)}
                </select>
            ) : atual && <span>📍 {atual.nome}</span>}
            <button type="button" className="link-balcao" onClick={alternarSom} title={som ? 'Desligar o som deste computador' : 'Ligar o som deste computador'}>
                {som ? '🔊 som' : '🔇 sem som'}
            </button>
        </div>
    );
};

// Última ação, com o "Desfazer" válido por JANELA_DESFAZER_MIN (espelho das RPCs)
const FaixaDesfazer = ({ acao, onDesfazer, onFechar, ocupado }) => {
    const agora = useAgora(15000);
    if (!acao) return null;
    const restante = restanteParaDesfazerMs(acao.quando, agora);
    if (!restante) return null;
    return (
        <div className="faixa-desfazer">
            <span>✓ {acao.texto}</span>
            <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {acao.id && (
                    <button type="button" className="btn-desfazer" onClick={() => onDesfazer(acao)} disabled={ocupado}>
                        ↩ Desfazer ({Math.min(JANELA_DESFAZER_MIN, Math.ceil(restante / 60000))} min)
                    </button>
                )}
                <button type="button" className="link-balcao" onClick={onFechar} title="Fechar">✕</button>
            </span>
        </div>
    );
};

// Ocorrências e bloqueio do aluno (penalidade = alerta + bloqueio manual)
const AlertasAluno = ({ aluno }) => {
    if (!aluno) return null;
    const ultima = aluno.ocorrencias?.ultimas?.[0];
    return (
        <>
            {aluno.bloqueio && (
                <div className="alerta-balcao erro">
                    ⛔ <b>Suspenso dos empréstimos{aluno.bloqueio.ate ? ` até ${dataBR(aluno.bloqueio.ate)}` : ''}</b> — {aluno.bloqueio.motivo}
                </div>
            )}
            {aluno.ocorrencias?.total > 0 && ultima && (
                <div className="alerta-balcao aviso">
                    ⚠ <b>{aluno.ocorrencias.total} ocorrência{aluno.ocorrencias.total > 1 ? 's' : ''}</b> — última em {rotuloDataHora(ultima.data)}: {ROTULO_OCORRENCIA[ultima.tipo] || ultima.tipo}
                    {ultima.nomeItem ? ` (${ultima.nomeItem})` : ''}{ultima.obs ? `: ${ultima.obs}` : ''}
                </div>
            )}
            {aluno.ativosOutrosPontos > 0 && (
                <div className="alerta-balcao info">ℹ Também está com {aluno.ativosOutrosPontos} item(ns) de outro ponto deste prédio.</div>
            )}
        </>
    );
};

const CartaoAluno = ({ aluno, nome, onCorrigirNome, corrigindo, children }) => (
    <div className="card-aluno-identificado">
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '4px' }}>ALUNO IDENTIFICADO</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            👤 {nome || 'Novo cadastro'}
            {nome && onCorrigirNome && (
                <button type="button" className="link-balcao" onClick={onCorrigirNome} disabled={corrigindo} title="Corrigir o nome deste aluno">✎ corrigir</button>
            )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--blue)', fontFamily: 'var(--mono)', marginTop: '4px' }}>Matrícula: {aluno.matricula}</div>
        {children}
    </div>
);

// ---------------------------------------------------------------------------
// Wizard (coluna da esquerda)
// ---------------------------------------------------------------------------
const PASSOS = { CRACHA: 1, ITEM: 2, NOME: 3, DEVOLUCAO: 4, SUSPENSO: 5 };

const EmprestimoWizard = ({
    itens, carregandoPainel, ponto, consultarAluno, alterarStatus, corrigirNome,
    retirando, devolvendo, alterandoStatus, corrigindoNome, acoes,
}) => {
    const { toast, showPrompt, showConfirm } = useUI();
    const agora = useAgora(30000);
    const [step, setStep] = useState(PASSOS.CRACHA);
    const [inputCracha, setInputCracha] = useState('');
    const [inputBusca, setInputBusca] = useState('');
    const [inputProximo, setInputProximo] = useState('');
    const [nomeAluno, setNomeAluno] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [aluno, setAluno] = useState(null);
    const [itemSelecionado, setItemSelecionado] = useState(null);

    const refCracha = useRef(null);
    const refBusca = useRef(null);
    const refNome = useRef(null);
    const refProximo = useRef(null);
    const ultimaInteracao = useRef('mouse');

    const refDoPasso = useCallback((p) => (
        p === PASSOS.CRACHA ? refCracha : p === PASSOS.ITEM ? refBusca : p === PASSOS.NOME ? refNome : refProximo
    ), []);

    const resetFlow = useCallback(() => {
        setStep(PASSOS.CRACHA);
        setInputCracha('');
        setInputBusca('');
        setInputProximo('');
        setNomeAluno('');
        setAluno(null);
        setItemSelecionado(null);
        setBuscando(false);
    }, []);

    // O leitor de crachá "digita" onde estiver o foco. Depois de um clique, toast
    // ou modal, o foco volta sozinho ao campo do passo — sem roubar de outro campo
    // de texto (busca do topo, histórico) nem de quem navega com Tab.
    useEffect(() => {
        const reforcar = () => {
            if (modalAberto()) return;
            const ativo = document.activeElement;
            if (ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName)) return;
            if (ativo && ativo !== document.body && ultimaInteracao.current === 'teclado') return;
            const alvo = refDoPasso(step).current;
            if (alvo && !alvo.disabled) alvo.focus();
        };
        const marcarMouse = () => { ultimaInteracao.current = 'mouse'; };
        const marcarTeclado = (e) => { if (e.key === 'Tab') ultimaInteracao.current = 'teclado'; };
        reforcar();
        const timer = setInterval(reforcar, 800);
        window.addEventListener('focus', reforcar);
        window.addEventListener('pointerdown', marcarMouse, true);
        window.addEventListener('keydown', marcarTeclado, true);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', reforcar);
            window.removeEventListener('pointerdown', marcarMouse, true);
            window.removeEventListener('keydown', marcarTeclado, true);
        };
    }, [step, refDoPasso]);

    // Esc cancela o atendimento em qualquer passo
    useEffect(() => {
        const aoTeclar = (e) => {
            if (e.key === 'Escape' && step !== PASSOS.CRACHA && !modalAberto()) resetFlow();
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [step, resetFlow]);

    const processarCracha = async (valor) => {
        const matricula = normalizarMatricula(valor);
        if (!matricula || buscando) return;
        setBuscando(true);
        let dados;
        try {
            dados = await consultarAluno(matricula);
        } catch (err) {
            // Falha na consulta NÃO pode virar "aluno novo": permanece onde está
            tocarSom('erro');
            toast.error(`Não foi possível consultar a matrícula: ${err.message || 'verifique a conexão.'}`);
            return;
        } finally {
            setBuscando(false);
        }
        setInputCracha('');
        setInputProximo('');
        setInputBusca('');
        setItemSelecionado(null);
        setAluno(dados);
        setNomeAluno(dados.nome || '');
        if (dados.ativos.length) {
            tocarSom('bip');
            setStep(PASSOS.DEVOLUCAO);
        } else if (dados.bloqueio) {
            tocarSom('erro');
            setStep(PASSOS.SUSPENSO);
        } else {
            tocarSom('bip');
            setStep(PASSOS.ITEM);
        }
    };

    const handleCracha = (e) => { e.preventDefault(); processarCracha(inputCracha); };

    // Na devolução o campo continua ativo: Enter vazio confirma (como sempre);
    // um crachá bipado ali abre o atendimento do PRÓXIMO aluno — antes, o Enter
    // do leitor confirmava a devolução do aluno anterior por engano.
    const handleProximo = (e) => {
        e.preventDefault();
        if (inputProximo.trim()) { processarCracha(inputProximo); return; }
        if (step === PASSOS.DEVOLUCAO && aluno?.ativos?.length === 1) devolverItem(aluno.ativos[0]);
    };

    const devolverItem = async (emp, resultado = RESULTADOS_DEVOLUCAO.OK, obs = null) => {
        if (devolvendo) return; // segurar Enter (key repeat) dispararia N devoluções
        const ok = await acoes.registrarDevolucao({ ...emp, nomeAluno: aluno?.nome }, resultado, obs);
        if (!ok) return;
        const restantes = aluno.ativos.filter(a => a.id !== emp.id);
        if (!restantes.length) { resetFlow(); return; }
        setAluno(a => ({
            ...a,
            ativos: restantes,
            restantes: Math.min(a.limite, a.restantes + 1),
            ocorrencias: resultado === RESULTADOS_DEVOLUCAO.OK ? a.ocorrencias : { ...a.ocorrencias, total: a.ocorrencias.total + 1 },
        }));
    };

    const devolverComProblema = async (emp) => {
        const obs = await showPrompt(`O que aconteceu com "${emp.nomeItem}"? Ex.: voltou sem a bolinha. O item vai para manutenção.`, '⚠ Devolveu com problema');
        if (obs) devolverItem(emp, RESULTADOS_DEVOLUCAO.COM_PROBLEMA, obs);
    };

    const naoDevolveu = async (emp) => {
        const obs = await showPrompt(`Registrar que "${emp.nomeItem}" NÃO foi devolvido. Ele sai da lista até ser encontrado. Observação:`, '✖ Não devolveu');
        if (obs) devolverItem(emp, RESULTADOS_DEVOLUCAO.NAO_DEVOLVIDO, obs);
    };

    const handleCorrigirNome = async () => {
        if (!aluno) return;
        const novo = await showPrompt(`Nome correto do aluno da matrícula ${aluno.matricula}:`, '✎ Corrigir nome');
        if (!novo) return;
        try {
            const r = await corrigirNome({ matricula: aluno.matricula, nome: novo });
            setAluno(a => ({ ...a, nome: r.nome }));
            setNomeAluno(r.nome);
            toast.success(`Nome corrigido para "${r.nome}".`);
        } catch (err) {
            toast.error(`Erro ao corrigir o nome: ${err.message}`);
        }
    };

    const executarRetirada = async (item, nome) => {
        if (retirando) return;
        const ok = await acoes.registrarRetirada(item, aluno, nome);
        if (ok) resetFlow();
    };

    const escolherItem = (item) => {
        if (retirando) return; // duplo clique no card dispararia duas retiradas
        if (item.status !== STATUS_ITEM.DISPONIVEL) {
            tocarSom('erro');
            toast.error(motivoIndisponivel(item));
            return;
        }
        if (nomeAluno) executarRetirada(item, nomeAluno);
        else {
            setItemSelecionado(item);
            setStep(PASSOS.NOME);
        }
    };

    const handleBusca = (e) => {
        e.preventDefault();
        const termo = inputBusca.trim();
        // Termo vazio casaria com qualquer nome — Enter acidental emprestaria o 1º item
        if (!termo) return;
        // Código exato primeiro; por nome só se UM item casar (ver emprestimoRegras)
        const { item, ambiguos } = resolverItemPorTermo(itens, termo);
        if (item) { escolherItem(item); return; }
        tocarSom('erro');
        toast.error(ambiguos.length > 1
            ? `Mais de um item com "${termo}" no nome — clique no item certo.`
            : `Nenhum item com "${termo}" neste ponto.`);
        setInputBusca('');
    };

    const handleSalvarNome = (e) => {
        e.preventDefault();
        const nome = normalizarNome(nomeAluno);
        if (nome.length < 2) return;
        executarRetirada(itemSelecionado, nome);
    };

    const enviarManutencao = async (item) => {
        const motivo = await showPrompt(`Motivo da manutenção para o item: ${item.nome_item}`, '🔧 Enviar para Manutenção');
        if (!motivo) return;
        try {
            await alterarStatus({ itemId: item.id, status: STATUS_ITEM.MANUTENCAO, observacoes: motivo });
            toast.success('Item enviado para manutenção.');
        } catch (err) {
            toast.error(`Erro ao enviar para manutenção: ${err.message || 'Tente novamente.'}`);
        }
    };

    const liberarItem = async (item) => {
        const pergunta = item.status === STATUS_ITEM.PERDIDO
            ? `"${item.nome_item}" foi encontrado? Ele volta a ficar disponível.`
            : `Liberar "${item.nome_item}" para empréstimo?`;
        if (!await showConfirm(pergunta, 'Liberação')) return;
        try {
            await alterarStatus({ itemId: item.id, status: STATUS_ITEM.DISPONIVEL });
            toast.success('Item liberado!');
        } catch (err) {
            toast.error(`Erro ao liberar item: ${err.message || 'Tente novamente.'}`);
        }
    };

    const grupos = useMemo(() => agruparPorCategoria(itens), [itens]);
    const temLivre = itens.some(i => i.status === STATUS_ITEM.DISPONIVEL);
    const titulo = {
        [PASSOS.CRACHA]: 'PASSO 1: Bipar Crachá',
        [PASSOS.ITEM]: 'PASSO 2: Escolher Item',
        [PASSOS.NOME]: 'PASSO 3: Registrar Nome',
        [PASSOS.DEVOLUCAO]: aluno?.ativos?.length > 1 ? 'DEVOLUÇÃO — ESCOLHA O ITEM' : 'DEVOLUÇÃO DE ITEM',
        [PASSOS.SUSPENSO]: 'ALUNO SUSPENSO',
    }[step];

    return (
        <>
            <div className={`wizard-header step-${step}`}>
                <h3>{titulo}</h3>
            </div>

            <div className="wizard-content">
                {step > PASSOS.CRACHA && <button onClick={resetFlow} className="btn-cancelar-flow" title="Esc">CANCELAR</button>}

                {step === PASSOS.CRACHA && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                        <form onSubmit={handleCracha} style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '48px', opacity: 0.5, marginBottom: '16px' }}>💳</div>
                            <input
                                ref={refCracha} type="text" value={inputCracha}
                                onChange={e => setInputCracha(e.target.value)} disabled={buscando}
                                placeholder={buscando ? 'Consultando...' : 'Bipe o crachá do aluno...'}
                                className="input-bipar matricula" style={{ opacity: buscando ? 0.6 : 1 }}
                            />
                        </form>

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', fontWeight: 'bold' }}>
                                GERENCIAR ESTOQUE{ponto ? ` · ${ponto.nome.toUpperCase()}` : ''}
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {carregandoPainel && <div className="empty-st" style={{ padding: '20px' }}>Carregando acervo...</div>}
                                {!carregandoPainel && itens.length === 0 && <div className="empty-st" style={{ padding: '20px' }}>Nenhum item neste ponto. Cadastre em Gestão → Gestão de Empréstimos.</div>}
                                {grupos.map(grupo => {
                                    const previsao = previsaoDaCategoria(grupo.itens, agora);
                                    return (
                                        <React.Fragment key={grupo.id}>
                                            {grupos.length > 1 && (
                                                <div className="grupo-categoria-titulo">
                                                    {grupo.nome}{previsao && <span> · nenhum livre, {previsao.texto}</span>}
                                                </div>
                                            )}
                                            {grupo.itens.map(item => {
                                                if (item.status === STATUS_ITEM.DISPONIVEL) {
                                                    return (
                                                        <div key={item.id} className="item-card-mini">
                                                            <div>
                                                                <div className="nome">{item.nome_item}</div>
                                                                <div className="cod">Cód: {item.patrimonio} · livre</div>
                                                            </div>
                                                            <button onClick={() => enviarManutencao(item)} disabled={alterandoStatus} title="Enviar para manutenção" className="btn-icon-action">🔧</button>
                                                        </div>
                                                    );
                                                }
                                                if (item.status === STATUS_ITEM.EMPRESTADO) {
                                                    return (
                                                        <div key={item.id} className="item-card-mini emprestado"
                                                            onClick={() => item.emprestimo && acoes.confirmarDevolucao({ ...item.emprestimo, nomeItem: item.nome_item })}
                                                            title="Clique para receber a devolução">
                                                            <div>
                                                                <div className="nome">{item.nome_item}</div>
                                                                <div className="cod"><LinhaComQuem emprestimo={item.emprestimo} medianaMin={item.mediana_min} agora={agora} /></div>
                                                            </div>
                                                            <span className="cod">⬇️</span>
                                                        </div>
                                                    );
                                                }
                                                const perdido = item.status === STATUS_ITEM.PERDIDO;
                                                return (
                                                    <div key={item.id} className={`item-card-mini ${perdido ? 'perdido' : 'manutencao'}`}>
                                                        <div>
                                                            <div className="nome">{perdido ? '✖' : '⚠️'} {item.nome_item}</div>
                                                            <div className="cod">{item.observacoes || (perdido ? 'Não devolvido' : 'Manutenção')}</div>
                                                        </div>
                                                        <button onClick={() => liberarItem(item)} disabled={alterandoStatus} className="btn-liberar">
                                                            {perdido ? '✓ Encontrado' : '✓ Liberar'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {step === PASSOS.ITEM && aluno && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                        <CartaoAluno aluno={aluno} nome={nomeAluno} onCorrigirNome={handleCorrigirNome} corrigindo={corrigindoNome}>
                            {aluno.limite > 1 && (
                                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                                    Pode levar mais {aluno.restantes} item(ns) neste ponto (limite: {aluno.limite}).
                                </div>
                            )}
                        </CartaoAluno>
                        <AlertasAluno aluno={aluno} />

                        <form onSubmit={handleBusca} style={{ marginBottom: '16px' }}>
                            <input ref={refBusca} type="text" value={inputBusca} onChange={e => setInputBusca(e.target.value)}
                                placeholder="Clique no item abaixo (ou digite o nome/código)" className="input-bipar item" style={{ fontSize: '14px', padding: '10px' }} />
                        </form>

                        {!temLivre && <div className="alerta-balcao info">Nenhum item livre agora neste ponto.</div>}
                        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {grupos.map(grupo => {
                                const previsao = previsaoDaCategoria(grupo.itens, agora);
                                return (
                                    <React.Fragment key={grupo.id}>
                                        {grupos.length > 1 && (
                                            <div className="grupo-categoria-titulo">
                                                {grupo.nome}{previsao && <span> · nenhum livre, {previsao.texto}</span>}
                                            </div>
                                        )}
                                        <div className="grade-escolha">
                                            {grupo.itens.map(item => {
                                                const livre = item.status === STATUS_ITEM.DISPONIVEL;
                                                return (
                                                    <button type="button" key={item.id} onClick={() => escolherItem(item)}
                                                        className={`item-escolha ${livre ? 'livre' : 'ocupado'}`} disabled={retirando || !livre}
                                                        title={livre ? 'Emprestar este item' : motivoIndisponivel(item)}>
                                                        <span className="nome">{item.nome_item}</span>
                                                        <span className="estado">
                                                            {livre && '✓ livre'}
                                                            {item.status === STATUS_ITEM.EMPRESTADO && <LinhaComQuem emprestimo={item.emprestimo} medianaMin={item.mediana_min} agora={agora} />}
                                                            {item.status === STATUS_ITEM.MANUTENCAO && '⚠ em manutenção'}
                                                            {item.status === STATUS_ITEM.PERDIDO && '✖ não devolvido'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                )}

                {step === PASSOS.NOME && itemSelecionado && (
                    <form onSubmit={handleSalvarNome} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                        <div className="card-aluno-identificado" style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📦</div>
                            <div style={{ color: 'var(--amber)', fontSize: '20px', fontWeight: 'bold' }}>{itemSelecionado.nome_item}</div>
                            <div style={{ fontSize: '12px', color: 'var(--blue)', fontFamily: 'var(--mono)', marginTop: '6px' }}>Matrícula: {aluno?.matricula}</div>
                        </div>

                        <label style={{ fontSize: '13px', color: 'var(--purple)', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>NOME DO NOVO ALUNO:</label>
                        <input ref={refNome} type="text" value={nomeAluno} onChange={e => setNomeAluno(e.target.value)} placeholder="Ex: João da Silva..." className="input-bipar nome" style={{ marginBottom: '8px' }} />
                        <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginBottom: '16px', minHeight: '14px' }}>
                            {normalizarNome(nomeAluno) && normalizarNome(nomeAluno) !== nomeAluno.trim() ? `Será salvo como: ${normalizarNome(nomeAluno)}` : ''}
                        </div>

                        <button type="submit" disabled={retirando || normalizarNome(nomeAluno).length < 2} className="btn-action-primary">{retirando ? '⏳ Registrando...' : 'Confirmar e Emprestar'}</button>
                    </form>
                )}

                {(step === PASSOS.DEVOLUCAO || step === PASSOS.SUSPENSO) && aluno && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                        {aluno.ativos.length === 1 && step === PASSOS.DEVOLUCAO ? (
                            <div className="card-aluno-identificado destaque-devolucao">
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                    👤 {aluno.nome || 'Aluno'}
                                    {aluno.nome && <button type="button" className="link-balcao" onClick={handleCorrigirNome} disabled={corrigindoNome}>✎ corrigir</button>}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: '4px 0 18px 0' }}>Matrícula: {aluno.matricula}</div>
                                <div style={{ fontSize: '50px', marginBottom: '10px' }}>📦</div>
                                <h3 style={{ color: 'var(--amber)', margin: '0 0 10px 0' }}>Item a Devolver:</h3>
                                <p style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text)', margin: '0 0 6px 0' }}>{aluno.ativos[0].nomeItem}</p>
                                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 18px 0' }}>retirado {rotuloDataHora(aluno.ativos[0].dataRetirada)} · há {duracao(aluno.ativos[0].dataRetirada, agora)} · devolva o crachá ao aluno</p>
                                <button onClick={() => devolverItem(aluno.ativos[0])} disabled={devolvendo} className="btn-action-primary large">{devolvendo ? '⏳ Registrando...' : '✓ APERTE ENTER OU CLIQUE'}</button>
                                <div className="acoes-secundarias">
                                    <button type="button" onClick={() => devolverComProblema(aluno.ativos[0])} disabled={devolvendo}>⚠ devolveu com problema</button>
                                    <button type="button" onClick={() => naoDevolveu(aluno.ativos[0])} disabled={devolvendo}>✖ não devolveu</button>
                                </div>
                            </div>
                        ) : (
                            <CartaoAluno aluno={aluno} nome={aluno.nome} onCorrigirNome={handleCorrigirNome} corrigindo={corrigindoNome} />
                        )}

                        <AlertasAluno aluno={aluno} />

                        {aluno.ativos.length > 1 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
                                {aluno.ativos.map(emp => (
                                    <div key={emp.id} className="linha-devolucao">
                                        <div>
                                            <div className="nome">📦 {emp.nomeItem}</div>
                                            <div className="cod">retirado {rotuloDataHora(emp.dataRetirada)} · há {duracao(emp.dataRetirada, agora)}</div>
                                            <div className="acoes-secundarias" style={{ justifyContent: 'flex-start', marginTop: '4px' }}>
                                                <button type="button" onClick={() => devolverComProblema(emp)} disabled={devolvendo}>⚠ com problema</button>
                                                <button type="button" onClick={() => naoDevolveu(emp)} disabled={devolvendo}>✖ não devolveu</button>
                                            </div>
                                        </div>
                                        <button type="button" className="btn-liberar" onClick={() => devolverItem(emp)} disabled={devolvendo}>✓ Devolver</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {step === PASSOS.SUSPENSO && (
                            <div className="empty-st" style={{ padding: '10px' }}>Este aluno não pode retirar itens enquanto estiver suspenso.</div>
                        )}

                        {step === PASSOS.DEVOLUCAO && !aluno.bloqueio && aluno.restantes > 0 && (
                            <button type="button" className="btn-outro-item" onClick={() => setStep(PASSOS.ITEM)}>
                                + Pegar outro item (pode levar mais {aluno.restantes})
                            </button>
                        )}

                        <form onSubmit={handleProximo} style={{ marginTop: 'auto', paddingTop: '16px' }}>
                            <input ref={refProximo} type="text" value={inputProximo} onChange={e => setInputProximo(e.target.value)}
                                disabled={buscando}
                                placeholder={step === PASSOS.DEVOLUCAO && aluno.ativos.length === 1 ? 'Enter devolve · ou bipe o próximo crachá' : 'Bipe o próximo crachá...'}
                                className="input-bipar matricula" style={{ fontSize: '13px', padding: '10px' }} />
                        </form>
                    </div>
                )}
            </div>
        </>
    );
};

// ---------------------------------------------------------------------------
// Painel da direita: em andamento + histórico
// ---------------------------------------------------------------------------
const TagHistorico = ({ h }) => {
    if (h.status === STATUS_EMPRESTIMO.CANCELADO) return <span className="tag-status desfeito">↩ Desfeito</span>;
    if (h.status === STATUS_EMPRESTIMO.EXTRAVIADO) return <span className="tag-status perdido">✖ Não devolvido</span>;
    if (h.status === STATUS_EMPRESTIMO.ATIVO) return <span className="tag-status em-uso">🟢 Em Uso</span>;
    return (
        <>
            <span className="tag-status concluido">⏳ {duracao(h.dataRetirada, h.dataDevolucao)}</span>
            {h.ocorrencia && <span className="tag-status problema" title={h.obs || ''}>⚠ Com problema</span>}
        </>
    );
};

const PainelRegistros = ({ ativos, historico, carregandoHistorico, historicoTemMais, carregandoMaisHistorico, carregarMaisHistorico, onBuscar, acoes, devolvendo, desfazendo }) => {
    const agora = useAgora(30000);
    const [abaAtiva, setAbaAtiva] = useState('ativos');
    const [busca, setBusca] = useState('');

    // Busca no servidor (nome, matrícula, item), sem disparar a cada tecla
    useEffect(() => {
        const t = setTimeout(() => onBuscar(busca.trim()), 350);
        return () => clearTimeout(t);
    }, [busca, onBuscar]);

    const ordenados = [...ativos].sort((a, b) => new Date(b.dataRetirada) - new Date(a.dataRetirada));

    return (
        <div className="registros-panel">
            <div className="abas-container">
                <button onClick={() => setAbaAtiva('ativos')} className={`aba-btn ${abaAtiva === 'ativos' ? 'ativa' : ''}`}>Em Andamento ({ordenados.length})</button>
                <button onClick={() => setAbaAtiva('historico')} className={`aba-btn ${abaAtiva === 'historico' ? 'ativa' : ''}`}>Histórico</button>
            </div>

            <div className="registros-content">
                {abaAtiva === 'ativos' ? (
                    ordenados.length === 0 ? (
                        <div className="empty-st" style={{ border: '1px dashed var(--border)', borderRadius: '8px' }}>Nenhum item emprestado no momento.</div>
                    ) : (
                        <div className="grid-emprestimos">
                            {ordenados.map(emp => {
                                const previsao = preverDevolucao({ desde: emp.dataRetirada, medianaMin: emp.mediana_min }, agora);
                                return (
                                    <div key={emp.id} className={`emprestimo-card ${previsao?.estado === 'passou' ? 'passou' : ''}`}>
                                        <div className="emp-aluno">👤 {normalizarNome(emp.nomeAluno) || emp.nomeAluno}</div>
                                        <div className="emp-mat">Matrícula: {emp.matricula}</div>
                                        <div style={{ flex: 1 }}>
                                            <div className="emp-item">📦 {emp.nomeItem}</div>
                                            <div className="emp-cod">Cód: {emp.patrimonio}</div>
                                            {previsao?.texto && <div className={`previsao ${previsao.estado}`} style={{ fontSize: '11px', marginTop: '6px' }}>{previsao.texto}</div>}
                                        </div>
                                        <div className="emp-footer">
                                            <span>🕒 {rotuloDataHora(emp.dataRetirada)}{emp.balcao && <span style={{ opacity: 0.7 }}> · {emp.balcao}</span>}</span>
                                            <span className="tag-tempo">{formatarDuracao(previsao?.decorrido)}</span>
                                        </div>
                                        <button onClick={() => acoes.confirmarDevolucao(emp)} disabled={devolvendo} className="btn-devolver">⬇️ Receber Devolução</button>
                                        <div className="acoes-secundarias" style={{ marginTop: '8px' }}>
                                            <button type="button" onClick={() => acoes.perguntarProblema(emp)} disabled={devolvendo}>⚠ com problema</button>
                                            <button type="button" onClick={() => acoes.perguntarNaoDevolvido(emp)} disabled={devolvendo}>✖ não devolveu</button>
                                            {podeDesfazer(emp.dataRetirada, agora) && (
                                                <button type="button" onClick={() => acoes.desfazer({ tipo: 'retirada', id: emp.id })} disabled={desfazendo}>↩ desfazer</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    <>
                        <input type="search" value={busca} onChange={e => setBusca(e.target.value)} className="input-historico-busca"
                            placeholder="🔎 Buscar por aluno, matrícula ou item..." />
                        {carregandoHistorico ? (
                            <div className="empty-st">Carregando histórico...</div>
                        ) : historico.length === 0 ? (
                            <div className="empty-st" style={{ border: '1px dashed var(--border)', borderRadius: '8px' }}>{busca ? 'Nada encontrado para essa busca.' : 'Nenhum histórico encontrado.'}</div>
                        ) : (
                            <>
                                <table className="table-historico">
                                    <thead>
                                        <tr>
                                            <th>Aluno</th>
                                            <th>Item</th>
                                            <th>Período</th>
                                            <th>Duração</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historico.map(h => {
                                            const encerrou = h.dataDevolucao || h.encerradoEm;
                                            const desfazivel = (h.status === STATUS_EMPRESTIMO.CONCLUIDO || h.status === STATUS_EMPRESTIMO.EXTRAVIADO) && podeDesfazer(encerrou, agora);
                                            return (
                                                <tr key={h.id} style={h.status === STATUS_EMPRESTIMO.CANCELADO ? { opacity: 0.55 } : undefined}>
                                                    <td>
                                                        <div className="th-aluno-nome">{normalizarNome(h.nomeAluno) || h.nomeAluno}</div>
                                                        <div className="th-aluno-mat">Matrícula: {h.matricula}</div>
                                                    </td>
                                                    <td className="th-item">📦 {h.nomeItem}</td>
                                                    <td>
                                                        <div className="th-data"><span className="th-data-up">↑</span> {rotuloDataHora(h.dataRetirada)}</div>
                                                        <div className="th-data" style={{ marginTop: '6px' }}>
                                                            {h.dataDevolucao ? (
                                                                <><span className="th-data-down">↓</span> {rotuloDataHora(h.dataDevolucao)}</>
                                                            ) : h.status === STATUS_EMPRESTIMO.ATIVO ? (
                                                                <span className="tag-status pendente">⏳ Pendente</span>
                                                            ) : null}
                                                        </div>
                                                        {(h.balcaoRetirada || h.balcaoDevolucao) && (
                                                            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>
                                                                {h.balcaoRetirada && <>↑ {h.balcaoRetirada}</>}
                                                                {h.balcaoDevolucao && <> ↓ {h.balcaoDevolucao}</>}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                                            <TagHistorico h={h} />
                                                            {desfazivel && (
                                                                <button type="button" className="link-balcao" onClick={() => acoes.desfazer({ tipo: 'devolucao', id: h.id })} disabled={desfazendo}>
                                                                    ↩ desfazer devolução
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {historicoTemMais && (
                                    <button type="button" className="btn-ver-mais" onClick={carregarMaisHistorico} disabled={carregandoMaisHistorico}>
                                        {carregandoMaisHistorico ? 'Carregando...' : 'Carregar mais ▼'}
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
export default function MuralEmprestimos({ session, acesso }) {
    const { predioAtivo } = usePredio();
    const predioId = predioAtivo || acesso?.predioId;
    const { toast, showConfirm, showPrompt } = useUI();
    const { pontos, carregando: carregandoPontos, erro: erroPontos } = usePontosEmprestimo(session, predioId);

    // Ponto deste computador: o escolhido agora, senão o salvo neste PC, senão o 1º
    const [pontoEscolhido, setPontoEscolhido] = useState('');
    const ids = pontos.map(p => p.id);
    const salvo = lerPontoSalvo(predioId);
    const pontoId = ids.includes(pontoEscolhido) ? pontoEscolhido : ids.includes(salvo) ? salvo : (ids[0] || '');

    const [buscaHistorico, setBuscaHistorico] = useState('');
    const [ultimaAcao, setUltimaAcao] = useState(null);
    const dados = useEmprestimos(session, predioId, pontoId, buscaHistorico);
    const { devolver, retirar, cancelar, reabrir } = dados;

    const trocarPonto = (id) => {
        setPontoEscolhido(id);
        salvarPontoSalvo(predioId, id);
        setUltimaAcao(null);
    };

    // Ações usadas pelos dois lados (wizard e painel). Retornam true se deu certo.
    const registrarRetirada = async (item, aluno, nome) => {
        try {
            const resp = await retirar({ itemId: item.id, matricula: aluno.matricula, nomeAluno: nome });
            const texto = `"${item.nome_item}" emprestado para ${primeiroNome(normalizarNome(nome))}`;
            tocarSom('ok');
            setUltimaAcao({ tipo: 'retirada', id: resp?.data?.id, texto, quando: new Date().toISOString() });
            toast.success(`${texto}!`);
            return true;
        } catch (err) {
            tocarSom('erro');
            toast.error(`Erro ao registrar empréstimo: ${err.message || 'Tente novamente.'}`);
            return false;
        }
    };

    const registrarDevolucao = async (emp, resultado = RESULTADOS_DEVOLUCAO.OK, obs = null) => {
        try {
            await devolver({ id: emp.id, resultado, obs });
            const texto = resultado === RESULTADOS_DEVOLUCAO.OK
                ? `Devolução de "${emp.nomeItem}" registrada`
                : resultado === RESULTADOS_DEVOLUCAO.COM_PROBLEMA
                    ? `"${emp.nomeItem}" devolvido com problema — foi para manutenção`
                    : `"${emp.nomeItem}" registrado como não devolvido`;
            tocarSom('ok');
            setUltimaAcao({ tipo: 'devolucao', id: emp.id, texto, quando: new Date().toISOString() });
            toast.success(texto);
            return true;
        } catch (err) {
            tocarSom('erro');
            toast.error(`Erro ao registrar devolução: ${err.message || 'Tente novamente.'}`);
            return false;
        }
    };

    const acoes = {
        registrarRetirada,
        registrarDevolucao,
        confirmarDevolucao: async (emp) => {
            if (dados.devolvendo) return;
            const quem = emp.nomeAluno ? ` de ${primeiroNome(emp.nomeAluno)}` : '';
            if (await showConfirm(`Confirma a devolução de "${emp.nomeItem}"${quem}? Devolva o crachá ao aluno.`, '⬇️ Receber Devolução')) {
                registrarDevolucao(emp);
            }
        },
        perguntarProblema: async (emp) => {
            const obs = await showPrompt(`O que aconteceu com "${emp.nomeItem}"? Ex.: voltou sem a bolinha. O item vai para manutenção.`, '⚠ Devolveu com problema');
            if (obs) registrarDevolucao(emp, RESULTADOS_DEVOLUCAO.COM_PROBLEMA, obs);
        },
        perguntarNaoDevolvido: async (emp) => {
            const obs = await showPrompt(`Registrar que "${emp.nomeItem}" NÃO foi devolvido por ${primeiroNome(emp.nomeAluno) || 'o aluno'}. Ele sai da lista até ser encontrado. Observação:`, '✖ Não devolveu');
            if (obs) registrarDevolucao(emp, RESULTADOS_DEVOLUCAO.NAO_DEVOLVIDO, obs);
        },
        desfazer: async (acao) => {
            if (!acao?.id) return;
            try {
                if (acao.tipo === 'retirada') await cancelar({ id: acao.id, motivo: 'Desfeito no balcão' });
                else await reabrir(acao.id);
                tocarSom('ok');
                toast.success(acao.tipo === 'retirada' ? 'Empréstimo desfeito.' : 'Devolução desfeita — o item voltou para o aluno.');
                setUltimaAcao(u => (u?.id === acao.id ? null : u));
            } catch (err) {
                tocarSom('erro');
                toast.error(err.message || 'Não foi possível desfazer.');
            }
        },
    };

    const onBuscarHistorico = useCallback((termo) => setBuscaHistorico(termo), []);

    if (!predioId) return <div className="empty-st">Selecione um prédio primeiro.</div>;
    if (carregandoPontos) return <div className="empty-st">Carregando pontos de empréstimo...</div>;
    if (erroPontos) return <div className="empty-st" style={{ color: 'var(--red)' }}>Erro ao carregar os pontos de empréstimo: {erroPontos}</div>;
    if (!pontos.length) {
        return (
            <div className="empty-st">
                Nenhum ponto de empréstimo liberado para você neste prédio.<br />
                Peça à coordenação para liberar em Gestão → Gestão de Equipe (ou cadastrar o ponto em Gestão de Empréstimos).
            </div>
        );
    }

    return (
        <div className="mural-container">
            <div className="wizard-panel">
                <FaixaBalcao pontos={pontos} pontoId={pontoId} onTrocarPonto={trocarPonto} />
                {/* key: o relógio da faixa nasce junto com a ação (senão o "Desfazer (N min)" começa atrasado) */}
                <FaixaDesfazer key={ultimaAcao?.quando || 'nenhuma'} acao={ultimaAcao} onDesfazer={acoes.desfazer} onFechar={() => setUltimaAcao(null)}
                    ocupado={dados.cancelando || dados.reabrindo} />
                {/* key: trocar de ponto zera o atendimento em andamento */}
                <EmprestimoWizard key={pontoId}
                    itens={dados.itens} carregandoPainel={dados.carregandoPainel} ponto={dados.ponto}
                    consultarAluno={dados.consultarAluno} alterarStatus={dados.alterarStatus}
                    corrigirNome={dados.corrigirNome}
                    retirando={dados.retirando} devolvendo={dados.devolvendo} alterandoStatus={dados.alterandoStatus}
                    corrigindoNome={dados.corrigindoNome} acoes={acoes}
                />
            </div>
            <PainelRegistros
                ativos={dados.ativos}
                historico={dados.historico}
                carregandoHistorico={dados.carregandoHistorico}
                historicoTemMais={dados.historicoTemMais}
                carregandoMaisHistorico={dados.carregandoMaisHistorico}
                carregarMaisHistorico={dados.carregarMaisHistorico}
                onBuscar={onBuscarHistorico}
                acoes={acoes}
                devolvendo={dados.devolvendo}
                desfazendo={dados.cancelando || dados.reabrindo}
            />
        </div>
    );
}
