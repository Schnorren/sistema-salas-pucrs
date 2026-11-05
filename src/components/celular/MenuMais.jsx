import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROTAS } from '../../rotas';
import { sairDaConta } from '../../utils/sessao';
import Icone from './Icone';

// Telas de gestão arrumadas para o celular; as demais abrem como no
// computador, marcadas "computador" (decisão de 05/11: não esconder nada).
const FEITAS_PARA_CELULAR = new Set([ROTAS.salasLivres, ROTAS.salasPredio]);

const MarcaComputador = () => (
    <span className="cel-tag-pc" title="Esta tela foi feita para o computador"><Icone nome="computador" tamanho={12} />computador</span>
);

const Item = ({ to, children, computador }) => (
    <Link to={to} className="cel-mais-item">
        {children}
        <span className="dir">{computador && <MarcaComputador />}<Icone nome="seta" tamanho={16} /></span>
    </Link>
);

// Menu "Mais" (só no celular): tudo o que não coube na barra de baixo —
// Contatos, Empréstimos, o menu Gestão inteiro, perfil, tema e Sair. Cada
// item aparece com a MESMA regra de permissão das abas do computador
// (itensGestao vem pronto do Dashboard).
export default function MenuMais({ session, acesso, itensGestao, canViewEmprestimos, escuro, onAlternarTema }) {
    const [saindo, setSaindo] = useState(false);
    const nome = session?.user?.user_metadata?.nome || session?.user?.email?.split('@')[0] || 'Usuário';

    const sair = async () => {
        setSaindo(true);
        if (!(await sairDaConta())) setSaindo(false);
    };

    return (
        <div className="cel-mais">
            <Link to={ROTAS.perfil} className="cel-perfil">
                <span className="cel-perfil-ini">{nome.charAt(0).toUpperCase()}</span>
                <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block' }}>{nome}</b>
                    <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {acesso?.perfilNome || 'Sem perfil'} · {session?.user?.email}
                    </span>
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}><Icone nome="seta" /></span>
            </Link>

            <div className="cel-mais-grupo">Telas</div>
            <div className="cel-mais-lista">
                <Item to={ROTAS.contatos}>Contatos</Item>
                {canViewEmprestimos && <Item to={ROTAS.emprestimos} computador>Empréstimos</Item>}
            </div>

            {itensGestao.length > 0 && (
                <>
                    <div className="cel-mais-grupo">Gestão</div>
                    <div className="cel-mais-lista">
                        {itensGestao.map(({ to, rotulo }) => (
                            <Item key={to} to={to} computador={!FEITAS_PARA_CELULAR.has(to)}>{rotulo}</Item>
                        ))}
                    </div>
                </>
            )}

            <div className="cel-mais-grupo">Este aparelho</div>
            <div className="cel-mais-lista">
                <button type="button" className="cel-mais-item" onClick={onAlternarTema} role="switch" aria-checked={escuro}>
                    Tema escuro
                    <span className="dir"><span className={`cel-chave${escuro ? ' ligada' : ''}`} /></span>
                </button>
                <button type="button" className="cel-mais-item sair" onClick={sair} disabled={saindo}>
                    {saindo ? 'Saindo...' : 'Sair'}
                </button>
            </div>
        </div>
    );
}
