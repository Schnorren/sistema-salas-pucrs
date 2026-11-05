import SeletorPredio from '../SeletorPredio';
import Icone from './Icone';
import { useMomentoAtual } from '../../hooks/useMomentoAtual';
import { PERIODS } from '../../../backend_core/utils/timeHelpers';

// Topo do celular: uma linha só — PUCRS, prédio e o período atual. A lupa abre
// a busca em tela cheia. Relógio, data e AO VIVO ficam só no computador (o
// celular já mostra a hora); tema, perfil e Sair estão no menu "Mais".
// O SeletorPredio precisa estar montado nos dois layouts: é ele que fixa o
// prédio ativo de quem não é admin.
export default function TopoCelular({ session, acesso, onBuscar }) {
    const { periodo } = useMomentoAtual();
    const inicio = PERIODS.find(p => p.code === periodo)?.lb;

    return (
        <header className="cel-topo">
            <span className="cel-logo">PUCRS</span>
            <span className="cel-sep" />
            <SeletorPredio acesso={acesso} session={session} />
            <div className="cel-topo-dir">
                <span className={`cel-periodo${periodo ? '' : ' fora'}`} title={periodo ? `Período atual: ${periodo}` : 'Fora do horário de aula'}>
                    <i />{periodo ? `${periodo} · ${inicio}` : 'Sem aula'}
                </span>
                <button type="button" className="cel-icone" onClick={onBuscar} aria-label="Buscar sala, disciplina ou contato">
                    <Icone nome="lupa" />
                </button>
            </div>
        </header>
    );
}
