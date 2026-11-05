import { useEffect, useRef } from 'react';
import { PERIODS } from '../../../backend_core/utils/timeHelpers';
import { segmentosDaLinha, resumoDaLinha } from '../../utils/miniGrade';

const INICIOS = PERIODS.map(p => p.lb);
// Largura de cada período na mini-grade + espaço entre eles (src/celular.css:
// --col e --gap de .cel-mg-rolagem). Usado para abrir já no período atual.
const COLUNA_PX = 34;
const ESPACO_PX = 4;

// Faixa dos 16 períodos de uma sala: uma célula por período, com a letra
// dentro. Azul = aula, roxo = interno, vermelho = troca de sala, contorno
// dourado = período atual. Períodos da mesma aula ficam colados, separados
// por uma linha fina; aulas diferentes ficam separadas por um espaço.
export function Faixa({ slots, trocas }) {
    const celulas = [];
    segmentosDaLinha(slots, trocas).forEach(seg => {
        for (let i = seg.ini; i <= seg.fim; i++) {
            const anterior = celulas[celulas.length - 1];
            celulas.push({ i, tipo: seg.tipo, chave: seg.chave, cont: !!seg.chave && anterior?.chave === seg.chave });
        }
    });
    return (
        <div className="cel-faixa" aria-hidden="true">
            {celulas.map(c => (
                <i key={c.i} className={`${c.tipo === 'livre' ? '' : c.tipo}${c.cont ? ' cont' : ''}${slots[c.i].isAgora ? ' agora' : ''}`}>
                    {slots[c.i].periodo}
                </i>
            ))}
        </div>
    );
}

const Resumo = ({ resumo }) => {
    switch (resumo.tipo) {
        case 'agora':
            return (
                <>
                    <em>agora</em> {resumo.bloco.nome}
                    {resumo.troca && <strong> → P.{resumo.troca.predio_destino} · {resumo.troca.sala_destino}</strong>}
                </>
            );
        case 'livre': return <>livre agora · {resumo.inicio} {resumo.bloco.nome}</>;
        case 'livreResto': return <>livre o resto do dia</>;
        case 'dia': return <>{resumo.total} {resumo.total > 1 ? 'aulas' : 'aula'} · a 1ª às {resumo.inicio} · {resumo.bloco.nome}</>;
        default: return <>sem aulas neste dia</>;
    }
};

// Linha do tempo no celular: salas × 16 períodos, rolando para os lados (a
// coluna da sala fica parada). Abre já no período atual. Embaixo de cada
// sala, o que acontece agora ou a próxima aula. Tocar abre a agenda da sala.
//   linhas   = dataProcessed.timeline da Timeline (já filtrada)
//   periodos = dataProcessed.periodosCabecalho
export default function MiniGrade({ linhas, periodos, trocas, onAbrirSala }) {
    const idxAgora = periodos.findIndex(p => p.isAgora);
    const rolagem = useRef(null);

    // Período atual como segunda coluna visível (dá contexto do anterior);
    // outro dia ou fora do horário: começo do dia.
    useEffect(() => {
        if (rolagem.current) rolagem.current.scrollLeft = idxAgora > 0 ? (idxAgora - 1) * (COLUNA_PX + ESPACO_PX) : 0;
    }, [idxAgora]);

    return (
        <div className="cel-mg-rolagem" ref={rolagem}>
            <div className="cel-mg-tabela">
                <div className="cel-mg-cab" aria-hidden="true">
                    <span className="cel-mg-fixa" />
                    <div>
                        <div className="cel-mg-turnos">
                            <span style={{ gridColumn: '1 / 7' }}>manhã</span>
                            <span style={{ gridColumn: '7 / 13' }}>tarde</span>
                            <span style={{ gridColumn: '13 / 17' }}>noite</span>
                        </div>
                        <div className="cel-mg-horas">
                            {periodos.map(p => (
                                <span key={p.code} className={p.isAgora ? 'agora' : undefined}><b>{p.code}</b>{p.label}</span>
                            ))}
                        </div>
                    </div>
                </div>
                {linhas.map(linha => {
                    const resumo = resumoDaLinha(linha.slots, trocas, idxAgora, INICIOS);
                    return (
                        <button key={linha.sala} type="button" className="cel-mg-linha" onClick={() => onAbrirSala(linha.sala)} aria-label={`Sala ${linha.sala}: ver o dia`}>
                            <span className={`cel-mg-sala${linha.temAulaAgora ? ' agora' : ''}`}>{linha.sala}</span>
                            <Faixa slots={linha.slots} trocas={trocas} />
                            <span className="cel-mg-txt"><Resumo resumo={resumo} /></span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
