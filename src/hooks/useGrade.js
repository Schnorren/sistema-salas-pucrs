import { useState, useCallback, useEffect } from 'react';
if (!window.__GRADE_CACHE) {
    window.__GRADE_CACHE = {};
}

export const useGrade = (predioId) => {
    const [dados, setDados] = useState(window.__GRADE_CACHE[predioId] || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const carregarGrade = useCallback(async (forcar = false) => {
        if (!predioId) return;
        if (!forcar && window.__GRADE_CACHE[predioId]) {
            setDados(window.__GRADE_CACHE[predioId]);
            return;
        }

        setLoading(true);
        try {

            const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/grades/grade_predio_${predioId}.json?t=${new Date().getTime()}`;
            const res = await fetch(url);

            if (!res.ok) {
                throw new Error("Grade não encontrada para este prédio.");
            }

            const json = await res.json();
            window.__GRADE_CACHE[predioId] = json;
            setDados(json);
            setError(null);
        } catch (err) {
            console.error("Erro ao baixar grade estática:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [predioId]);
    useEffect(() => {
        carregarGrade();
    }, [carregarGrade]);

    return { dados, loading, error, refresh: () => carregarGrade(true) };
};