import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { ROTAS } from '../../rotas';
import Icone from './Icone';

// Barra de baixo do celular: as mesmas abas do computador, na mesma ordem
// (Planta, Linha do tempo, Próximas, Avisos) + "Mais", que guarda o resto
// (Contatos, Empréstimos, Gestão, perfil, tema e Sair). Os números são os
// mesmos das abas do computador.
export default function BarraInferior({ canViewAvisos, totalTrocas, totalAvisos }) {
    const location = useLocation();
    const naBarra = [ROTAS.planta, ROTAS.linhaDoTempo, ROTAS.proximasAulas, ROTAS.avisos]
        .some(rota => matchPath({ path: rota, end: true }, location.pathname));

    const item = (to, rotulo, icone, badge, end) => (
        <NavLink to={to} end={end} className={to === ROTAS.mais && !naBarra ? 'active' : undefined}>
            <span className="ic">
                <Icone nome={icone} tamanho={22} />
                {badge?.n > 0 && <span className="badge" style={{ background: badge.cor }}>{badge.n}</span>}
            </span>
            {rotulo}
        </NavLink>
    );

    return (
        <nav className="cel-barra" aria-label="Telas">
            {item(ROTAS.planta, 'Planta', 'planta', null, true)}
            {item(ROTAS.linhaDoTempo, 'Linha do tempo', 'linha', { n: totalTrocas, cor: '#ea580c' })}
            {item(ROTAS.proximasAulas, 'Próximas', 'relogio')}
            {canViewAvisos && item(ROTAS.avisos, 'Avisos', 'sino', { n: totalAvisos, cor: '#dc2626' })}
            {item(ROTAS.mais, 'Mais', 'mais')}
        </nav>
    );
}
