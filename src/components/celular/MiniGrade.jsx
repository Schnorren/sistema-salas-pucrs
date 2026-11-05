import { useEffect, useRef } from 'react';
import { segmentosDaLinha, blocosDaFaixa } from '../../utils/miniGrade';

// Largura de cada período na mini-grade + espaço entre eles (src/celular.css:
// --col e --gap de .cel-mg-rolagem). Usado para abrir já no período atual.
const COLUNA_PX = 56;
const ESPACO_PX = 4;

// Turno a partir do período (índice 0–15): a tarde começa no F (6) e a noite
// no L (12). Os blocos da tarde/noite são deslocados para abrir um espaço
// entre os turnos (src/celular.css, .t2/.t3).
const turno = (i) => (i >= 12 ? ' t3' : i >= 6 ? ' t2' : '');

// Faixa compacta dos 16 períodos (agenda da sala): uma célula por período,
// com a letra dentro. Azul = aula, roxo = interno, vermelho = troca de sala,
// contorno dourado = período atual.
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

// Faixa da mini-grade: cada aula é um bloco com as letras dos períodos no alto
// (divisória fina entre eles), o nome da disciplina e, se houver, a troca de
// sala. Tocar na aula abre os detalhes dela (como clicar na grade do computador).
function FaixaComNomes({ slots, trocas, onAbrirAula }) {
    return (
        <div className="cel-mg-faixa">
            {blocosDaFaixa(slots, trocas).map(b => {
                const coluna = { gridColumn: `${b.ini + 1} / span ${b.fim - b.ini + 1}` };
                if (b.livre) {
                    return (
                        <span key={b.ini} aria-hidden="true" className={`cel-mg-vazio${slots[b.ini].isAgora ? ' agora' : ''}${turno(b.ini)}`} style={coluna}>
                            {b.periodo}
                        </span>
                    );
                }
                return (
                    <button
                        key={b.ini}
                        type="button"
                        className={`cel-mg-aula ${b.tipo}${b.continua ? ' cont' : ''}${b.idxAgora >= 0 ? ' agora' : ''}${turno(b.ini)}`}
                        style={coluna}
                        onClick={(e) => { e.stopPropagation(); onAbrirAula(b.chave); }}
                        aria-label={`${b.nome}, períodos ${b.periodos.join(' ')}${b.troca ? `, trocada para o prédio ${b.troca.predio_destino}, sala ${b.troca.sala_destino}` : ''}`}
                    >
                        <span className="pers" style={{ gridTemplateColumns: `repeat(${b.periodos.length}, var(--col))` }}>
                            {b.periodos.map((p, i) => <span key={p} className={i === b.idxAgora ? 'agora' : undefined}>{p}</span>)}
                        </span>
                        {b.troca && <span className="troca-faixa">🔁 P.{b.troca.predio_destino} · {b.troca.sala_destino}</span>}
                        <span className="nome">{b.nome}</span>
                    </button>
                );
            })}
        </div>
    );
}

// Linha do tempo no celular: salas × 16 períodos com o nome de cada aula,
// rolando para os lados (a coluna da sala fica parada). Abre já no período
// atual. Tocar numa aula abre os detalhes; tocar na sala (ou num horário
// livre) abre a agenda do dia da sala.
//   linhas   = dataProcessed.timeline da Timeline (já filtrada)
//   periodos = dataProcessed.periodosCabecalho
export default function MiniGrade({ linhas, periodos, trocas, onAbrirSala, onAbrirAula }) {
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
                            {/* O rótulo fica parado na tela enquanto o turno dele está à vista */}
                            <span style={{ gridColumn: '1 / 7' }}><span>manhã</span></span>
                            <span style={{ gridColumn: '7 / 13' }}><span>tarde</span></span>
                            <span style={{ gridColumn: '13 / 17' }}><span>noite</span></span>
                        </div>
                        <div className="cel-mg-horas">
                            {periodos.map(p => (
                                <span key={p.code} className={p.isAgora ? 'agora' : undefined}><b>{p.code}</b>{p.label}</span>
                            ))}
                        </div>
                    </div>
                </div>
                {linhas.map(linha => (
                    <div key={linha.sala} className="cel-mg-linha" onClick={() => onAbrirSala(linha.sala)}>
                        <button type="button" className={`cel-mg-sala${linha.temAulaAgora ? ' agora' : ''}`} onClick={(e) => { e.stopPropagation(); onAbrirSala(linha.sala); }} aria-label={`Sala ${linha.sala}: ver o dia`}>
                            {linha.sala}
                        </button>
                        <FaixaComNomes slots={linha.slots} trocas={trocas} onAbrirAula={onAbrirAula} />
                    </div>
                ))}
            </div>
        </div>
    );
}
