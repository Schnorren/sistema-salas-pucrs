import { useEffect, useState } from 'react';
import { LoaderCircle, TriangleAlert, Building2 } from 'lucide-react';

// Estados de tela inteira (carregando / erro / sem prédio / vazio), no lugar
// das frases soltas ".empty-st" do layout antigo.
export function Carregando({ texto = 'Carregando…' }) {
  return <div className="estado"><LoaderCircle size={22} className="girando" /><span>{texto}</span></div>;
}

export function Erro({ titulo = 'Não foi possível carregar', texto, acao }) {
  return (
    <div className="estado erro">
      <TriangleAlert size={24} />
      <b>{titulo}</b>
      {texto && <span>{texto}</span>}
      {acao}
    </div>
  );
}

export function SemPredio() {
  return (
    <div className="estado">
      <Building2 size={24} />
      <b>Escolha um prédio</b>
      <span>Use o seletor de prédio no topo da tela.</span>
    </div>
  );
}

// Tooltip único da aplicação: qualquer elemento com data-tt="texto" mostra o
// balão ao passar o mouse (gráficos, faixas de disponibilidade, mapa de calor).
export function TooltipGlobal() {
  const [tt, setTt] = useState(null);
  useEffect(() => {
    const sobre = (e) => {
      const el = e.target.closest?.('[data-tt]');
      setTt(el ? { texto: el.getAttribute('data-tt'), x: e.clientX, y: e.clientY } : null);
    };
    const move = (e) => setTt((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
    document.addEventListener('mouseover', sobre);
    document.addEventListener('mousemove', move);
    return () => { document.removeEventListener('mouseover', sobre); document.removeEventListener('mousemove', move); };
  }, []);
  if (!tt) return null;
  const x = Math.min(tt.x + 14, window.innerWidth - 290);
  const y = tt.y + 60 > window.innerHeight ? tt.y - 50 : tt.y + 16;
  return <div className="tt-flut" style={{ left: x, top: y }}>{tt.texto}</div>;
}
