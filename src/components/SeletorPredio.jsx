import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Building2, Check } from 'lucide-react';
import { usePredio } from '../contexts/PredioContext';

// "Prédio 15 - Living 360" -> ['Prédio 15', 'Living 360']
const partesDoNome = (nome) => {
  const [a, ...resto] = String(nome || '').split(/\s+[-–·]\s+/);
  return [a || 'Prédio', resto.join(' · ')];
};

export default function SeletorPredio({ acesso, session }) {
  const [listaPredios, setListaPredios] = useState([]);
  const [aberto, setAberto] = useState(false);
  const { predioAtivo, setPredioAtivo } = usePredio();
  const ref = useRef(null);

  useEffect(() => {
    if (!acesso.isGlobal) {
      setPredioAtivo(acesso.predioId);
      return;
    }
    const fetchPredios = async () => {
      // API autenticada (não o Supabase direto com anon key)
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/predios`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setListaPredios(data);
        setPredioAtivo(prev => prev || data[0].id);
      }
    };
    fetchPredios();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acesso]); // predioAtivo/setPredioAtivo fora de propósito (evita loop)

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  if (!acesso.isGlobal) {
    const [titulo, sub] = partesDoNome(acesso.predioNome);
    return (
      <div className="predio-wrap">
        <div className="predio-btn" title={acesso.predioNome}><span><b>{titulo}</b>{sub && <small>{sub}</small>}</span></div>
      </div>
    );
  }

  const atual = listaPredios.find(p => p.id === predioAtivo);
  const [titulo, sub] = partesDoNome(atual?.nome || 'Escolher prédio');
  const ordenados = [...listaPredios].sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true }));

  return (
    <div className="predio-wrap" ref={ref}>
      <button className="predio-btn" onClick={() => setAberto(!aberto)} aria-haspopup="true" aria-expanded={aberto} title="Trocar o prédio ativo (administrador)">
        <span><b>{titulo}</b>{sub && <small>{sub}</small>}</span><ChevronDown size={14} />
      </button>
      {aberto && (
        <div className="menu" style={{ left: 0, maxHeight: '70vh', overflow: 'auto' }}>
          <div className="menu-grupo">Prédio ativo · você é administrador</div>
          {ordenados.map(p => (
            <button key={p.id} className={`mi ${p.id === predioAtivo ? 'active' : ''}`} onClick={() => { setPredioAtivo(p.id); setAberto(false); }}>
              <Building2 size={16} /><span style={{ flex: 1 }}>{p.nome}</span>{p.id === predioAtivo && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
