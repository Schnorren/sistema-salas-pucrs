import { useState, useCallback, useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext'; // 📍 Importamos o contexto!

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
            if (!res.ok) throw new Error("Erro ao buscar avisos");
            const data = await res.json();
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

    const criarAviso = async (dadosAviso) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dadosAviso)
            });
            if (!res.ok) throw new Error("Erro ao criar aviso");
            await fetchAvisosAtivos();
            return true;
        } catch (err) {
            console.error("Erro criarAviso:", err);
            alert("Não foi possível salvar o registro.");
            return false;
        }
    };

    const concluirAviso = async (id, observacao) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}/concluir`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({ obs: observacao })
            });
            if (!res.ok) throw new Error("Erro ao concluir aviso");
            await fetchAvisosAtivos();
            return true;
        } catch (err) {
            console.error("Erro concluirAviso:", err);
            alert("Não foi possível concluir o registro.");
            return false;
        }
    };

    const adicionarComentario = async (id, descricao_atual, nota, userEmail) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}/comentar`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({ descricao_atual, nota, user_email: userEmail })
            });
            if (!res.ok) throw new Error("Erro ao comentar aviso");
            await fetchAvisosAtivos();
            return true;
        } catch (err) {
            console.error("Erro adicionarComentario:", err);
            alert("Não foi possível salvar o comentário.");
            return false;
        }
    };

    const excluirAviso = async (id) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (!res.ok) throw new Error("Erro ao deletar aviso");
            await fetchAvisosAtivos();
            return true;
        } catch (err) {
            console.error("Erro excluirAviso:", err);
            alert("Não foi possível deletar o registro.");
            return false;
        }
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