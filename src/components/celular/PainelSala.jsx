import PainelInferior from './PainelInferior';
import Icone from './Icone';
import { periodosAfetadosPelaTroca, horarioDosPeriodos } from '../../utils/aulasDoDia';

const dataBR = (iso) => (typeof iso === 'string' && iso.includes('-') ? iso.split('-').reverse().join('/') : '');

const Bloco = ({ rotulo, bloco, agora }) => (
    <div className={`cel-bloco${agora ? ' agora' : ''}`}>
        <div className="cel-bloco-rot">{rotulo} · {bloco.periodos.join(' ')} · {bloco.inicio} às {bloco.fim}</div>
        <div className="cel-bloco-nome">{bloco.nomeAula || bloco.nome}</div>
        <div className="cel-bloco-meta">{bloco.codCred ? `${bloco.codCred} · ` : ''}{bloco.tipo}</div>
    </div>
);

// Painel da sala na Planta (celular): o que o balcão precisa para confirmar a
// aula com o professor — a aula do período, a próxima, a troca de sala e as
// autorizações de chave. O mesmo conteúdo do resultado de sala da busca do topo.
//   situacao = situacaoDaSala() de utils/aulasDoDia
//   chaves   = autorizações de chave da sala, ou null sem a permissão de avisos
//   onTrocar(chave, { editar }) = abre a aula na Linha do tempo (editar: já no formulário)
export default function PainelSala({ sala, dia, periodo, ehAgora, situacao, chaves, canEditGrade, onFechar, onVerDia, onTrocar }) {
    const { atual, troca, proxima } = situacao;
    const status = troca ? 'trocada' : atual ? 'ocupada' : 'livre';
    const rotuloStatus = { trocada: 'Trocada', ocupada: ehAgora ? 'Ocupada agora' : 'Ocupada', livre: ehAgora ? 'Livre agora' : 'Livre' }[status];
    const afetados = troca ? periodosAfetadosPelaTroca(troca, atual.periodos) : [];

    return (
        <PainelInferior rotulo={`Sala ${sala}`} onFechar={onFechar}>
            <div className="cel-folha-topo">
                <div className="cel-sala-num">Sala {sala}</div>
                <span className={`cel-pill ${status}`} style={{ marginTop: '5px' }}>{rotuloStatus}</span>
                <button type="button" className="cel-folha-fechar" onClick={onFechar} aria-label="Fechar"><Icone nome="fechar" tamanho={16} /></button>
            </div>
            <div className="cel-sub">
                {dia}{ehAgora ? ', hoje' : ''} · {periodo ? `${ehAgora ? 'agora é o ' : ''}período ${periodo}` : 'fora do horário de aula'}
            </div>

            {atual && <Bloco rotulo={ehAgora ? 'Agora' : `No período ${periodo}`} bloco={atual} agora />}
            {troca && (
                <div className="cel-troca">
                    <b>🔁 Trocada para o prédio {troca.predio_destino} · sala {troca.sala_destino}</b><br />
                    Períodos <b style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{afetados.join(' ')}</b> · {horarioDosPeriodos(afetados)}
                    {troca.motivo && <div style={{ color: 'var(--text2)' }}>Motivo: {troca.motivo}</div>}
                </div>
            )}
            {proxima && <div style={{ marginTop: '8px' }}><Bloco rotulo={atual ? 'Depois' : 'Próxima aula'} bloco={proxima} /></div>}
            {!atual && !proxima && (
                <div className="cel-bloco" style={{ color: 'var(--text2)' }}>{ehAgora ? 'Sem mais aulas hoje nesta sala.' : 'Sem aulas neste dia depois deste período.'}</div>
            )}

            {Array.isArray(chaves) && (
                <div style={{ marginTop: '8px' }}>
                    {chaves.length === 0 ? (
                        <div className="cel-bloco" style={{ color: 'var(--text2)', fontSize: '13px' }}>🔑 Sem autorização de chave pendente para a {sala}</div>
                    ) : chaves.map(c => (
                        <div key={c.id} className="cel-bloco">
                            <div className="cel-bloco-rot">🔑 Autorização de chave</div>
                            <div className="cel-bloco-nome" style={{ fontSize: '14px' }}>{c.aluno_nome}</div>
                            <div className="cel-bloco-meta">
                                {[c.disciplina, c.periodo && `Per. ${c.periodo}`, dataBR(c.data_prevista)].filter(Boolean).join(' · ')}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className={`cel-acoes${canEditGrade && atual ? '' : ' uma'}`}>
                <button type="button" className="cel-botao" onClick={onVerDia}>Ver o dia da sala</button>
                {canEditGrade && atual && (
                    <button type="button" className="cel-botao primario" onClick={() => onTrocar(atual.chave, { editar: !troca })}>
                        {troca ? 'Ver a troca' : '🔁 Trocar de sala'}
                    </button>
                )}
            </div>
        </PainelInferior>
    );
}
