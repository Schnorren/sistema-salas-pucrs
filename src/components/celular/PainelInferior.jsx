import { useEffect } from 'react';

// Painel que sobe de baixo (celular): o que no computador aparece passando o
// mouse ou numa janela no meio da tela. Fecha tocando fora, no X de quem o usa
// ou com Esc (teclado externo).
export default function PainelInferior({ rotulo, onFechar, children }) {
    useEffect(() => {
        const aoTeclar = (e) => {
            if (e.key === 'Escape' && !document.querySelector('[data-ui-modal]')) onFechar();
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [onFechar]);

    return (
        <div className="cel-folha-fundo" onClick={onFechar}>
            <div className="cel-folha" role="dialog" aria-modal="true" aria-label={rotulo} onClick={(e) => e.stopPropagation()}>
                <div className="cel-folha-alca" />
                {children}
            </div>
        </div>
    );
}
