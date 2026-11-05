import { useState, useCallback, useEffect } from 'react';
if (!window.__GRADE_CACHE) {
    window.__GRADE_CACHE = {};
}

// Avisa todas as instâncias montadas de useGrade que o JSON do prédio foi
// republicado (importação de PDF, mudança de salas visíveis). Sem isso, telas
// que ficam montadas (o Dashboard: busca do topo, badge de trocas) seguiam
// com a grade antiga até recarregar a página.
const EVENTO_REPUBLICADA = 'grade:republicada';
export const avisarGradeRepublicada = (predioId) => {
    if (window.__GRADE_CACHE) window.__GRADE_CACHE[predioId] = null;
    window.dispatchEvent(new CustomEvent(EVENTO_REPUBLICADA, { detail: predioId }));
};

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
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [predioId]);
    useEffect(() => {
        carregarGrade();
    }, [carregarGrade]);

    useEffect(() => {
        const aoRepublicar = (e) => { if (e.detail === predioId) carregarGrade(true); };
        window.addEventListener(EVENTO_REPUBLICADA, aoRepublicar);
        return () => window.removeEventListener(EVENTO_REPUBLICADA, aoRepublicar);
    }, [carregarGrade, predioId]);

    return { dados, loading, error, refresh: () => carregarGrade(true) };
};