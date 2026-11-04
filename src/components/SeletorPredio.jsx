import { useState, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';

export default function SeletorPredio({ acesso, session }) {
    const [listaPredios, setListaPredios] = useState([]);
    const { predioAtivo, setPredioAtivo } = usePredio();

    useEffect(() => {
        if (!acesso.isGlobal) {
            setPredioAtivo(acesso.predioId);
            return;
        }

        const fetchPredios = async () => {
            // Usa a API autenticada em vez do Supabase direto com anon key
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/predios`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                }
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
    }, [acesso]); // predioAtivo e setPredioAtivo intencionalmente excluídos para evitar loop

    if (!acesso.isGlobal) {
        return <span className="seletor-estatico"> · {acesso.predioNome}</span>;
    }

    return (
        <span className="seletor-interativo" style={{ marginLeft: '8px' }}>
             · 
            <select
                value={predioAtivo || ''}
                onChange={(e) => setPredioAtivo(e.target.value)}
                style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'inherit',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    marginLeft: '8px',
                    cursor: 'pointer'
                }}
            >
                {listaPredios.map(predio => (
                    <option key={predio.id} value={predio.id} style={{ color: '#000' }}>
                        {predio.nome}
                    </option>
                ))}
            </select>
        </span>
    );
}
