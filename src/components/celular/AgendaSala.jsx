import { PERIODS, PERIOD_END_TIMES } from '../../../backend_core/utils/timeHelpers';
import { itensDaAgenda } from '../../utils/miniGrade';
import { periodosAfetadosPelaTroca } from '../../utils/aulasDoDia';
import { Faixa } from './MiniGrade';
import Icone from './Icone';

const inicio = (i) => PERIODS[i].lb;
const fim = (i) => PERIOD_END_TIMES[PERIODS[i].code];
const faixaDePeriodos = (ini, f) => (ini === f ? PERIODS[ini].code : `${PERIODS[ini].code}–${PERIODS[f].code}`);

// O dia de uma sala em lista, como a agenda do celular (aberta tocando a sala
// na mini-grade). Tocar numa aula abre os detalhes, com "Trocar de sala".
//   linha = a linha da sala em dataProcessed.timeline da Timeline
export default function AgendaSala({ linha, rotuloDia, trocas, onVoltar, onAbrirAula }) {
    const itens = itensDaAgenda(linha.slots);
    const ocupados = linha.slots.filter(s => s.ocupado).length;

    return (
        <div>
            <div className="cel-ag-cab">
                <button type="button" className="cel-icone" onClick={onVoltar} aria-label="Voltar para todas as salas"><Icone nome="voltar" /></button>
                <b>Sala {linha.sala}</b>
            </div>
            <div className="cel-ag-sub">{rotuloDia} · {ocupados} de {PERIODS.length} períodos com aula</div>
            <div className="cel-ag-faixa">
                <Faixa slots={linha.slots} trocas={trocas} />
            </div>

            {itens.map(item => {
                if (item.livre) {
                    return (
                        <div key={`livre-${item.ini}`} className="cel-ag livre">
                            <div className="cel-ag-hora">{inicio(item.ini)}<br />{fim(item.fim)}</div>
                            <div className="cel-ag-card"><span className="cel-ag-per">{faixaDePeriodos(item.ini, item.fim)}</span> · livre</div>
                        </div>
                    );
                }
                const agora = linha.slots.slice(item.ini, item.fim + 1).some(s => s.isAgora);
                const registro = trocas?.[item.chave];
                const afetados = registro ? periodosAfetadosPelaTroca(registro, item.periodos) : [];
                const classe = registro ? 'trocada' : agora ? 'agora' : item.tipo === 'Interno' ? 'interno' : '';
                return (
                    <div key={item.chave} className={`cel-ag ${classe}`}>
                        <div className="cel-ag-hora">{inicio(item.ini)}<br />{fim(item.fim)}</div>
                        <button type="button" className="cel-ag-card" onClick={() => onAbrirAula(item.chave)}>
                            <div className="cel-ag-topo">
                                <span className="cel-ag-per">{item.periodos.join(' ')}</span>
                                {agora && <span className="cel-tag-agora">agora</span>}
                            </div>
                            <div className="cel-ag-nome">{item.nome}</div>
                            <div className="cel-ag-meta">{item.codCred ? `${item.codCred} · ` : ''}{item.tipo}</div>
                            {registro && (
                                <div className="cel-ag-troca">🔁 {afetados.join(' ')} → prédio {registro.predio_destino} · sala {registro.sala_destino}</div>
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
