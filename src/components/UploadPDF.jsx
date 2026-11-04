import { useEffect, useRef, useState } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { useGrade } from '../hooks/useGrade';
import { FileUp, CircleCheck, TriangleAlert } from 'lucide-react';

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

function formatarTempo(totalSegundos) {
    const min = Math.floor(totalSegundos / 60);
    const seg = String(totalSegundos % 60).padStart(2, '0');
    return `${min}:${seg}`;
}

export default function UploadPDF({ session, acesso, onUploadSuccess }) {
    const { predioAtivo } = usePredio();
    const { toast } = useUI();

    const [fase, setFase] = useState('idle'); // idle | executando | sucesso | erro
    const [etapa, setEtapa] = useState(0);
    const [progresso, setProgresso] = useState(0);
    const [segundos, setSegundos] = useState(0);
    const [arquivo, setArquivo] = useState(null);
    const [resultado, setResultado] = useState(null);
    const [erroMsg, setErroMsg] = useState('');

    const timersRef = useRef([]);
    const { dados: gradeAtual, refresh: recarregarGrade } = useGrade(predioAtivo || acesso?.predioId || '');
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
                    else reject(new Error(corpo.error || 'Erro no servidor ou permissão negada'));
                };
                xhr.onerror = () => reject(new Error('Falha de conexão ao enviar o arquivo.'));
                xhr.send(formData);
            });

            limparTimers();
            avancarEtapa(3);
            setProgresso(100);
            if (window.__GRADE_CACHE) {
                window.__GRADE_CACHE[idParaUpload] = null;
            }
            setResultado(data);

            // Pausa breve para o usuário ver todas as etapas concluídas
            timersRef.current.push(setTimeout(() => {
                setFase('sucesso');
                toast.success(`Sucesso! ${data.registrosInseridos} aulas inseridas na base.`);
                recarregarGrade();
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

    const [sobre, setSobre] = useState(false);
    const publicadaEm = gradeAtual?.atualizado_em
        ? new Date(gradeAtual.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
        : null;
    const soltar = (ev) => {
        ev.preventDefault();
        setSobre(false);
        const file = ev.dataTransfer?.files?.[0];
        if (file && fase !== 'executando') handleUpload({ target: { files: [file], value: null } });
    };

    return (
        <div className="pg" style={{ maxWidth: 1200 }}>
            <div className="pg-hd">
                <div><h1 className="t-pg">Atualizar grade</h1><p className="sub">Importe o PDF da agenda semanal exportado do Espaço Físico</p></div>
            </div>
            <div className="up-grid">
                <section className="card"><div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {fase === 'idle' && (
                        <label
                            className={`drop ${sobre ? 'sobre' : ''}`} htmlFor="up-arq"
                            onDragOver={(ev) => { ev.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={soltar}
                        >
                            <FileUp size={28} />
                            <b style={{ fontSize: 15 }}>Arraste o PDF aqui ou clique para escolher</b>
                            <span className="sub" style={{ margin: 0 }}>A grade nova substitui a atual do prédio inteiro. As trocas de sala da semana são mantidas.</span>
                            <input id="up-arq" type="file" accept=".pdf,application/pdf" hidden onChange={handleUpload} />
                        </label>
                    )}

                    {fase !== 'idle' && arquivo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span className="chip contorno"><FileUp size={13} />{arquivo.nome} · {formatarTamanho(arquivo.tamanho)}</span>
                            <span className="sub" style={{ margin: 0 }}>{formatarTempo(segundos)}</span>
                            {fase === 'sucesso' && <span className="chip livre">publicada</span>}
                            {fase === 'erro' && <span className="chip alta">falhou</span>}
                        </div>
                    )}

                    {fase !== 'idle' && (
                        <>
                            <div className="up-barra" role="progressbar" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progresso}%` }} /></div>
                            <ol className="etapas">
                                {ETAPAS.map((et, i) => {
                                    const st = fase === 'sucesso' || i < etapa ? 'ok' : (fase === 'executando' && i === etapa ? 'ativa' : '');
                                    return (
                                        <li key={et.label} className={`etapa ${st}`}>
                                            <i>{st === 'ok' ? '✓' : i + 1}</i>
                                            <span>{et.label}{st === 'ativa' && <><br /><small>{et.hint}</small></>}</span>
                                            <span className="sub" style={{ margin: 0 }}>{st === 'ok' ? 'feito' : st === 'ativa' ? 'em andamento…' : ''}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        </>
                    )}

                    {fase === 'sucesso' && (
                        <div className="alerta-box info"><CircleCheck size={16} /><span><b>Grade atualizada.</b> {resultado?.registrosInseridos} aulas importadas em {formatarTempo(segundos)}. Todas as telas já usam a nova versão.</span></div>
                    )}
                    {fase === 'erro' && (
                        <div className="alerta-box erro"><TriangleAlert size={16} /><span><b>A importação falhou.</b> {erroMsg} A grade anterior continua publicada.</span></div>
                    )}
                    {(fase === 'sucesso' || fase === 'erro') && (
                        <div className="acoes-linha"><button className="btn pri" onClick={resetar}>{fase === 'erro' ? 'Tentar de novo' : 'Importar outro PDF'}</button></div>
                    )}
                </div></section>

                <div className="coluna-pilha">
                    <section className="card">
                        <div className="card-hd"><b>Grade publicada agora</b>{gradeAtual && <span className="chip livre" style={{ marginLeft: 'auto' }}>no ar</span>}</div>
                        <div className="card-bd">
                            {gradeAtual ? (
                                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: 0, fontSize: 13.5 }}>
                                    <dt className="sub" style={{ margin: 0 }}>Publicada em</dt><dd style={{ margin: 0, fontWeight: 600 }}>{publicadaEm || '—'}</dd>
                                    <dt className="sub" style={{ margin: 0 }}>Aulas</dt><dd style={{ margin: 0, fontWeight: 600 }}>{gradeAtual.grade?.length ?? 0} períodos ocupados</dd>
                                    <dt className="sub" style={{ margin: 0 }}>Salas</dt><dd style={{ margin: 0, fontWeight: 600 }}>{gradeAtual.salas?.length ?? 0}</dd>
                                </dl>
                            ) : <p className="sub">Este prédio ainda não tem grade publicada.</p>}
                        </div>
                    </section>
                    <section className="card">
                        <div className="card-hd"><b>Antes de importar</b></div>
                        <div className="card-bd">
                            <ul className="lista-hist">
                                <li><span>Exporte a <b>agenda semanal</b> do prédio no Espaço Físico, em PDF.</span></li>
                                <li><span>A extração pode levar até 1 minuto na primeira importação do dia (o extrator "acorda").</span></li>
                                <li><span>Trocas de sala ficam salvas; se a aula de origem sumir da grade nova, a troca deixa de aparecer.</span></li>
                            </ul>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
