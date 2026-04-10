import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { usePredio } from '../contexts/PredioContext';

export default function SeletorPredio({ acesso }) {
    const [listaPredios, setListaPredios] = useState([]);
    const { predioAtivo, setPredioAtivo } = usePredio();

    useEffect(() => {
        if (!acesso.isGlobal) {
            setPredioAtivo(acesso.predioId);
            return;
        }

        const fetchPredios = async () => {
            const { data, error } = await supabase
                .from('predios')
                .select('id, nome')
                .order('nome');
                
            if (data && !error) {
                setListaPredios(data);
                if (!predioAtivo && data.length > 0) {
                    setPredioAtivo(data[0].id);
                }
            }
        };

        fetchPredios();
    }, [acesso, predioAtivo, setPredioAtivo]);

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