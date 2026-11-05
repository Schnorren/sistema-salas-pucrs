import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { avisarGradeRepublicada, useGrade } from '../hooks/useGrade';
import { useSalasPredio } from '../hooks/useSalasPredio';
import { ROTAS } from '../rotas';
import DecisaoSalasNovas from './DecisaoSalasNovas';
import { TAMANHO_MAX_PDF, TAMANHO_MAX_PDF_TEXTO } from '../../backend_core/utils/limites';

// Etapas exibidas durante a importação. O backend processa tudo numa única
// requisição (sem eventos de progresso), então só o envio tem progresso real;
// as etapas do servidor avançam por estimativa de tempo e são todas
// concluídas de fato quando a resposta chega.
const ETAPAS = [
    { label: 'Enviando arquivo', hint: 'Transferindo o PDF para o servidor…' },
    { label: 'Extraindo aulas do PDF', hint: 'O extrator lê todas as tabelas de horários do PDF. Na primeira importação do dia ele pode levar até 1 minuto para iniciar.' },
    { label: 'Atualizando banco de dados', hint: 'Substituindo a grade antiga pelas aulas do novo arquivo…' },
    { label: 'Publicando nova grade', hint: 'Gerando o arquivo público que alimenta a grade de todos os usuários…' },
];

// Estimativas (ms) para animar a passagem pelas etapas do servidor.
const TEMPO_ESTIMADO_EXTRACAO = 25000;
const TEMPO_ESTIMADO_GRAVACAO = 10000;

// Teto de progresso (%) por etapa — a barra se aproxima do teto, mas só
// fecha 100% quando o servidor responde de verdade.
const TETO_PROGRESSO = [15, 75, 90, 97];

function formatarTamanho(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// "05/11/2026 às 08:12" (Brasília) a partir do atualizado_em do JSON publicado
function dataDePublicacao(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || !Number.isFinite(d.getTime())) return null;
    const fmt = (o) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ...o });
    return `${fmt({ day: '2-digit', month: '2-digit', year: 'numeric' })} às ${fmt({ hour: '2-digit', minute: '2-digit' })}`;
}

// Resumo do que mudou em relação à grade anterior (backend: compararGrades)
function ResumoComparacao({ comparacao, primeiraImportacao }) {
    if (!comparacao || primeiraImportacao) return null;
    if (comparacao.iguais) {
        return <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 0' }}>Nenhuma mudança em relação à grade anterior (mesma agenda).</p>;
    }
    const partes = [
        comparacao.novos && `${comparacao.novos} período(s) novo(s)`,
        comparacao.removidos && `${comparacao.removidos} removido(s)`,
        comparacao.alterados && `${comparacao.alterados} com outra atividade`,
    ].filter(Boolean);
    const extra = comparacao.totalSalasAfetadas - comparacao.salasAfetadas.length;
    // Mais da metade da grade mudou: provável PDF de outra semana/prédio
    const muitaMudanca = comparacao.antes > 0 && (comparacao.novos + comparacao.removidos + comparacao.alterados) > comparacao.antes / 2;
    return (
        <p style={{ fontSize: '12px', color: muitaMudanca ? 'var(--amber)' : 'var(--text2)', margin: '6px 0 0' }}>
            Em relação à grade anterior: {partes.join(', ')}.<br />
            Salas afetadas: {comparacao.salasAfetadas.join(', ')}{extra > 0 ? ` e mais ${extra}` : ''}.
            {muitaMudanca && <><br /><b>Mais da metade da grade mudou — confira se o PDF é da semana e do prédio certos.</b></>}
        </p>
    );
}

function formatarTempo(totalSegundos) {
    const min = Math.floor(totalSegundos / 60);
    const seg = String(totalSegundos % 60).padStart(2, '0');
    return `${min}:${seg}`;
}

export default function UploadCSV({ session, acesso, onUploadSuccess }) {
    const { predioAtivo } = usePredio();
    const { toast } = useUI();

    const [fase, setFase] = useState('idle'); // idle | executando | sucesso | erro
    const [etapa, setEtapa] = useState(0);
    const [progresso, setProgresso] = useState(0);
    const [segundos, setSegundos] = useState(0);
    const [arquivo, setArquivo] = useState(null);
    const [resultado, setResultado] = useState(null);
    const [erroMsg, setErroMsg] = useState('');
    // Salas novas da importação aguardando "exibir / manter oculta"
    const [decisao, setDecisao] = useState(null);
    const { pendentes, recarregar: recarregarSalas, salvarVisibilidade, salvando } = useSalasPredio(session, acesso);
    // JSON publicado (o Dashboard já o carregou): data da última publicação
    const { dados: gradePublicada } = useGrade(predioAtivo || acesso?.predioId || '');
    const ultimaPublicacao = dataDePublicacao(gradePublicada?.atualizado_em);

    const timersRef = useRef([]);
    const etapaRef = useRef(0);
    const uploadPctRef = useRef(0);

    const limparTimers = () => {
        timersRef.current.forEach(clearInterval);
        timersRef.current = [];
    };

    useEffect(() => limparTimers, []);

    const avancarEtapa = (n) => {
        etapaRef.current = n;
        setEtapa(n);
    };

    const resetar = () => {
        limparTimers();
        avancarEtapa(0);
        setProgresso(0);
        setSegundos(0);
        setArquivo(null);
        setResultado(null);
        setErroMsg('');
        setFase('idle');
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validação de tipo antes de enviar — alguns browsers ignoram o atributo accept
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'pdf') {
            toast.error('Apenas arquivos .pdf são aceitos.');
            e.target.value = null;
            return;
        }

        // Acima disso a Vercel recusa o envio com uma resposta que nem é JSON
        if (file.size > TAMANHO_MAX_PDF) {
            toast.error(`O PDF passa do limite de ${TAMANHO_MAX_PDF_TEXTO}. Exporte só a agenda da semana.`);
            e.target.value = null;
            return;
        }

        const idParaUpload = predioAtivo || acesso?.predioId;
        if (!idParaUpload) {
            toast.error('Selecione um prédio no menu superior antes de fazer o upload.');
            e.target.value = null;
            return;
        }

        setArquivo({ nome: file.name, tamanho: file.size });
        setResultado(null);
        setErroMsg('');
        avancarEtapa(0);
        setProgresso(0);
        setSegundos(0);
        uploadPctRef.current = 0;
        setFase('executando');

        timersRef.current.push(setInterval(() => setSegundos(s => s + 1), 1000));
        timersRef.current.push(setInterval(() => {
            setProgresso(p => {
                const teto = etapaRef.current === 0
                    ? (uploadPctRef.current * TETO_PROGRESSO[0]) / 100
                    : TETO_PROGRESSO[etapaRef.current];
                return p >= teto ? p : Math.min(teto, p + (teto - p) * 0.06 + 0.05);
            });
        }, 250));

        const formData = new FormData();
        formData.append('arquivo', file);

        try {
            // XMLHttpRequest no lugar de fetch para ter progresso real do upload
            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${import.meta.env.VITE_API_URL}/api/grade/importar-pdf`);
                xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`);
                xhr.setRequestHeader('x-predio-id', idParaUpload);

                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) {
                        uploadPctRef.current = Math.round((ev.loaded / ev.total) * 100);
                    }
                };
                xhr.upload.onload = () => {
                    // Arquivo entregue: daqui em diante o servidor trabalha sozinho,
                    // então as próximas etapas avançam por estimativa de tempo.
                    avancarEtapa(1);
                    timersRef.current.push(setTimeout(() => avancarEtapa(2), TEMPO_ESTIMADO_EXTRACAO));
                    timersRef.current.push(setTimeout(() => avancarEtapa(3), TEMPO_ESTIMADO_EXTRACAO + TEMPO_ESTIMADO_GRAVACAO));
                };
                xhr.onload = () => {
                    let corpo = {};
                    try { corpo = JSON.parse(xhr.responseText); } catch { /* resposta sem JSON cai no erro genérico */ }
                    if (xhr.status >= 200 && xhr.status < 300) resolve(corpo);
                    else reject(new Error(corpo.error || (xhr.status === 413
                        ? `O PDF passa do limite de ${TAMANHO_MAX_PDF_TEXTO}.`
                        : 'Erro no servidor ou permissão negada')));
                };
                xhr.onerror = () => reject(new Error('Falha de conexão ao enviar o arquivo.'));
                xhr.send(formData);
            });

            limparTimers();
            avancarEtapa(3);
            setProgresso(100);
            avisarGradeRepublicada(idParaUpload);
            recarregarSalas();
            setResultado(data);

            // Pausa breve para o usuário ver todas as etapas concluídas
            timersRef.current.push(setTimeout(() => {
                setFase('sucesso');
                toast.success(`Sucesso! ${data.registrosInseridos} aulas inseridas na base.`);
                if (data.salasParaDecidir?.length) {
                    setDecisao({ salas: data.salasParaDecidir, primeiraImportacao: !!data.primeiraImportacao });
                }
                if (onUploadSuccess) onUploadSuccess();
            }, 600));

        } catch (error) {
            limparTimers();
            setErroMsg(error.message);
            setFase('erro');
            toast.error(error.message);
        } finally {
            e.target.value = null;
        }
    };

    const salvarDecisao = async ({ exibir, ocultar }) => {
        try {
            await salvarVisibilidade({ exibir, ocultar });
            setDecisao(null);
            if (exibir.length + ocultar.length === 1) {
                toast.success(exibir.length ? `Sala ${exibir[0]} adicionada ao sistema.` : `Sala ${ocultar[0]} mantida oculta.`);
            } else {
                toast.success(`Escolha salva: ${exibir.length} ${exibir.length === 1 ? 'sala exibida' : 'salas exibidas'}, ${ocultar.length} ${ocultar.length === 1 ? 'oculta' : 'ocultas'}.`);
            }
        } catch (err) {
            toast.error(err.message || 'Não foi possível salvar a escolha das salas.');
        }
    };

    const modalDecisao = decisao && (
        <DecisaoSalasNovas
            salas={decisao.salas}
            primeiraImportacao={decisao.primeiraImportacao}
            salvando={salvando}
            onSalvar={salvarDecisao}
            onFechar={() => setDecisao(null)}
        />
    );

    const avisoPendentes = !decisao && pendentes.length > 0 && (
        <div style={{ margin: '18px auto 0', maxWidth: '460px', padding: '10px 14px', borderRadius: '8px', background: 'var(--blue-b)', color: 'var(--blue)', fontSize: '12px', lineHeight: 1.5 }}>
            {pendentes.length === 1
                ? <>A sala <b>{pendentes[0].numero}</b> ainda aguarda decisão e não aparece no sistema. </>
                : <><b>{pendentes.length} salas</b> ainda aguardam decisão e não aparecem no sistema. </>}
            <Link to={ROTAS.salasPredio} style={{ color: 'inherit', fontWeight: 'bold' }}>Revisar em Salas do Prédio</Link>
        </div>
    );

    if (fase === 'executando') {
        const concluido = progresso >= 100;
        return (
            <div className="bar-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <h2>Atualizando a grade…</h2>
                <div className="up-file" style={{ marginTop: '14px' }}>
                    📄 {arquivo?.nome} <span style={{ color: 'var(--muted)' }}>({formatarTamanho(arquivo?.tamanho || 0)})</span>
                </div>
                <div className="up-steps">
                    {ETAPAS.map((et, i) => {
                        const feita = concluido || i < etapa;
                        const ativa = !feita && i === etapa;
                        return (
                            <div key={et.label} className={`up-step${ativa ? ' ativa' : ''}${feita ? ' feita' : ''}`}>
                                <span className="up-ico">
                                    {feita ? '✓' : ativa ? <span className="up-spin" /> : <span className="up-dot" />}
                                </span>
                                {et.label}
                            </div>
                        );
                    })}
                </div>
                <div className="up-bar">
                    <div className="up-bar-fill" style={{ width: `${progresso}%` }} />
                </div>
                <div className="up-timer">{Math.round(progresso)}% · {formatarTempo(segundos)}</div>
                <p className="up-hint">{concluido ? 'Tudo pronto!' : ETAPAS[etapa].hint}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '14px' }}>
                    Não feche esta página até a atualização terminar.
                </p>
            </div>
        );
    }

    if (fase === 'sucesso') {
        return (
            <div className="bar-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '34px', marginBottom: '6px' }}>✅</div>
                <h2 style={{ color: 'var(--green)' }}>Grade atualizada!</h2>
                <p style={{ color: 'var(--text2)', marginTop: '8px' }}>
                    <b>{resultado?.registrosInseridos}</b> aulas importadas em {formatarTempo(segundos)}.
                </p>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 0' }}>
                    A nova grade já está publicada e visível para todos os usuários do prédio.
                </p>
                <ResumoComparacao comparacao={resultado?.comparacao} primeiraImportacao={resultado?.primeiraImportacao} />
                <div style={{ height: '20px' }} />
                <button className="btn-primary" onClick={resetar}>
                    Importar outro arquivo
                </button>
                {avisoPendentes}
                {modalDecisao}
            </div>
        );
    }

    if (fase === 'erro') {
        return (
            <div className="bar-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '34px', marginBottom: '6px' }}>⚠️</div>
                <h2 style={{ color: 'var(--red)' }}>Falha na atualização</h2>
                <div className="sp-error" style={{ maxWidth: '400px', margin: '14px auto' }}>{erroMsg}</div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '20px' }}>
                    Verifique o arquivo e tente novamente.
                </p>
                <button className="btn-primary" onClick={resetar}>
                    Tentar novamente
                </button>
            </div>
        );
    }

    return (
        <div className="bar-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <h2>Atualização de Grade</h2>
            <p style={{ color: 'var(--text2)', marginBottom: ultimaPublicacao ? '6px' : '20px' }}>
                Selecione o arquivo da agenda gerado pelo sistema central em formato <b>.pdf</b>
            </p>
            {ultimaPublicacao && (
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '20px' }}>
                    Grade atual publicada em {ultimaPublicacao}.
                </p>
            )}

            <input
                type="file"
                accept=".pdf"
                id="pdfUpload"
                hidden
                onChange={handleUpload}
            />

            <button
                className="btn-primary"
                onClick={() => document.getElementById('pdfUpload').click()}
            >
                Selecionar Arquivo PDF
            </button>
            {avisoPendentes}
        </div>
    );
}
