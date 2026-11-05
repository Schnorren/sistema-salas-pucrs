import { forwardRef, useEffect } from 'react';
import Icone from './Icone';

// Busca em tela cheia do celular. Fica sempre montada (escondida) para que o
// Dashboard possa dar foco no campo DENTRO do toque que a abre — só assim o
// iPhone abre o teclado. teclado: 'numero' (Consultar sala, na Planta) ou
// 'texto' (lupa do topo). Os resultados (children) são os mesmos do dropdown
// da busca do computador.
const BuscaCelular = forwardRef(function BuscaCelular({ aberta, teclado, valor, onMudar, onFechar, children }, ref) {
    useEffect(() => {
        if (!aberta) return;
        const aoTeclar = (e) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [aberta, onFechar]);

    const numero = teclado === 'numero';
    return (
        <div
            className="cel-busca"
            role="dialog" aria-modal="true" aria-label="Buscar" aria-hidden={!aberta}
            style={aberta ? undefined : { opacity: 0, pointerEvents: 'none', transform: 'translateY(100%)' }}
        >
            <div className="cel-busca-topo">
                <button type="button" className="cel-icone" onClick={onFechar} aria-label="Voltar" tabIndex={aberta ? 0 : -1}>
                    <Icone nome="voltar" />
                </button>
                <div className="cel-busca-campo">
                    <input
                        ref={ref}
                        type="search"
                        inputMode={numero ? 'numeric' : 'search'}
                        enterKeyHint="search"
                        autoComplete="off"
                        tabIndex={aberta ? 0 : -1}
                        aria-label={numero ? 'Número da sala' : 'Buscar sala, disciplina ou contato'}
                        placeholder={numero ? 'Número da sala, ex.: 205' : 'Sala, disciplina ou contato'}
                        value={valor}
                        onChange={(e) => onMudar(e.target.value)}
                    />
                    {valor && (
                        <button type="button" className="cel-limpar" onClick={() => onMudar('')} aria-label="Limpar busca" tabIndex={aberta ? 0 : -1}>×</button>
                    )}
                </div>
            </div>
            <div className="cel-busca-lista">{aberta && children}</div>
        </div>
    );
});

export default BuscaCelular;
