import { useState, useCallback, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';

async function parseResponse(res) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json;
}

export const useAvisos = (session, acesso) => {
    const [avisos, setAvisos] = useState({ chaves: [], gerais: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { predioAtivo } = usePredio();

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'x-predio-id': predioAtivo || acesso?.predioId || ''
    }), [session, acesso, predioAtivo]);

    const fetchAvisosAtivos = useCallback(async () => {
        if (!predioAtivo && !acesso?.predioId) return;

        setLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos`, { headers: getHeaders() });
            const data = await parseResponse(res);
            setAvisos(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [getHeaders, predioAtivo, acesso]);

    useEffect(() => {
        fetchAvisosAtivos();
    }, [fetchAvisosAtivos, predioAtivo]);

    // Todas as mutações relançam o erro para o componente tratar via toast
    const criarAviso = async (dadosAviso) => {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(dadosAviso)
        });
        await parseResponse(res);
        await fetchAvisosAtivos();
    };

    const concluirAviso = async (id, observacao) => {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}/concluir`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ obs: observacao })
        });
        await parseResponse(res);
        await fetchAvisosAtivos();
    };

    const adicionarComentario = async (id, descricao_atual, nota, userEmail) => {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}/comentar`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ descricao_atual, nota, user_email: userEmail })
        });
        await parseResponse(res);
        await fetchAvisosAtivos();
    };

    const excluirAviso = async (id) => {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        await parseResponse(res);
        await fetchAvisosAtivos();
    };

    return {
        avisos,
        loading,
        error,
        fetchAvisosAtivos,
        criarAviso,
        concluirAviso,
        excluirAviso,
        adicionarComentario
    };
};
