import { useState, useCallback } from 'react';

// 🔥 Cache global para evitar refetching ao trocar de abas
const cacheStorage = {
    equipe: {},
    perfis: {},
    modulos: {}
};

export const useEquipe = (session, predioId) => {
    const [equipe, setEquipe] = useState(cacheStorage.equipe[predioId] || []);
    const [perfis, setPerfis] = useState(cacheStorage.perfis[predioId] || []);
    const [modulos, setModulos] = useState(cacheStorage.modulos[predioId] || []);
    const [loading, setLoading] = useState(false);

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'x-predio-id': predioId || ''
    }), [session, predioId]);

    const carregarDados = useCallback(async (forcarAtualizacao = false) => {
        if (!predioId) return;
        
        // Se já tem no cache e não pedimos pra forçar, pula o fetch!
        if (!forcarAtualizacao && cacheStorage.equipe[predioId]) {
            return;
        }

        setLoading(true);
        try {
            const [resEquipe, resPerfis, resModulos] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/equipe`, { headers: getHeaders() }),
                fetch(`${import.meta.env.VITE_API_URL}/api/equipe/perfis`, { headers: getHeaders() }),
                fetch(`${import.meta.env.VITE_API_URL}/api/equipe/modulos`, { headers: getHeaders() })
            ]);

            if (resEquipe.ok && resPerfis.ok && resModulos.ok) {
                const dataEquipe = await resEquipe.json();
                const dataPerfis = await resPerfis.json();
                const dataModulos = await resModulos.json();

                // Salva no cache
                cacheStorage.equipe[predioId] = dataEquipe;
                cacheStorage.perfis[predioId] = dataPerfis;
                cacheStorage.modulos[predioId] = dataModulos;

                // Atualiza os estados
                setEquipe(dataEquipe);
                setPerfis(dataPerfis);
                setModulos(dataModulos);
            }
        } catch (err) {
            console.error("Erro fatal ao carregar equipe:", err);
        } finally {
            setLoading(false);
        }
    }, [predioId, getHeaders]);

    const atualizarMembro = async (dados) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/equipe/membro`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            
            await carregarDados(true); // 🔥 Força atualização no cache após editar
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const convidarMembro = async (dados) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/equipe/convidar`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            
            await carregarDados(true); // 🔥 Força atualização no cache
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    return {
        equipe, perfis, modulos, loading,
        carregarDados, atualizarMembro, convidarMembro
    };
};