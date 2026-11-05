import { PERIODS } from '../../../backend_core/utils/timeHelpers';
import { segmentosDaLinha, resumoDaLinha } from '../../utils/miniGrade';

const INICIOS = PERIODS.map(p => p.lb);

// Faixa dos 16 períodos de uma sala: azul = aula, roxo = interno, vermelho =
// troca de sala, contorno dourado = período atual.
export function Faixa({ slots, trocas }) {
    return (
        <div className="cel-mg-cols cel-faixa" aria-hidden="true">
            {segmentosDaLinha(slots, trocas).map(seg => (
                <i
                    key={seg.ini}
                    className={`${seg.tipo === 'livre' ? '' : seg.tipo}${seg.agora ? ' agora' : ''}`}
                    style={{ gridColumn: `${seg.ini + 1} / span ${seg.fim - seg.ini + 1}` }}
                />
            ))}
        </div>
    );
}

// Letras dos períodos (A … P), com o período atual destacado.
export function ReguaPeriodos({ periodos }) {
    return (
        <div className="cel-mg-cols cel-mg-regua" aria-hidden="true">
            {periodos.map(p => <span key={p.code} className={p.isAgora ? 'agora' : undefined}>{p.code}</span>)}
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

// Linha do tempo no celular: as salas × 16 períodos numa tela só, sem texto nas
// células (a grade do computador pede rolagem lateral). Embaixo de cada sala,
// o que acontece agora ou a próxima aula. Tocar abre a agenda da sala.
//   linhas   = dataProcessed.timeline da Timeline (já filtrada)
//   periodos = dataProcessed.periodosCabecalho
export default function MiniGrade({ linhas, periodos, trocas, onAbrirSala }) {
    const idxAgora = periodos.findIndex(p => p.isAgora);
    return (
        <div>
            <div className="cel-mg">
                <span />
                <div className="cel-mg-cols cel-mg-turnos" aria-hidden="true">
                    <span style={{ gridColumn: '1 / 7' }}>manhã</span>
                    <span style={{ gridColumn: '7 / 13' }}>tarde</span>
                    <span style={{ gridColumn: '13 / 17' }}>noite</span>
                </div>
                <span />
                <ReguaPeriodos periodos={periodos} />
            </div>
            {linhas.map(linha => {
                const resumo = resumoDaLinha(linha.slots, trocas, idxAgora, INICIOS);
                return (
                    <button key={linha.sala} type="button" className="cel-mg cel-mg-linha" onClick={() => onAbrirSala(linha.sala)} aria-label={`Sala ${linha.sala}: ver o dia`}>
                        <span className={`cel-mg-sala${linha.temAulaAgora ? ' agora' : ''}`}>{linha.sala}</span>
                        <Faixa slots={linha.slots} trocas={trocas} />
                        <span className="cel-mg-txt"><Resumo resumo={resumo} /></span>
                    </button>
                );
            })}
        </div>
    );
}
