import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Painel lateral (substitui os modais centrais do layout antigo). Esc ou clique
// no fundo fecham; o foco vai para o 1º campo marcado com data-autofocus (ou o
// 1º input) e volta para quem abriu ao fechar.
export default function Gaveta({ titulo, sub, onFechar, children, rodape, larga = false, bloquearFechar = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const anterior = document.activeElement;
    const alvo = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('input:not([disabled]),textarea,select');
    setTimeout(() => alvo?.focus(), 30);
    return () => { if (anterior && typeof anterior.focus === 'function') anterior.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !bloquearFechar) { e.stopPropagation(); onFechar?.(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar, bloquearFechar]);

  return (
    <>
      <div className="gv-fundo" onClick={() => !bloquearFechar && onFechar?.()} />
      <aside ref={ref} className={`gaveta ${larga ? 'larga' : ''}`} role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}>
        <div className="gv-hd">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{titulo}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar" disabled={bloquearFechar}><X size={18} /></button>
        </div>
        <div className="gv-bd">{children}</div>
        {rodape && <div className="gv-pe">{rodape}</div>}
      </aside>
    </>
  );
}
