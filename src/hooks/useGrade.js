import { useState, useCallback, useEffect, useRef } from 'react';
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
    // Dado e erro guardados JUNTO do prédio a que pertencem. Antes, ao trocar
    // de prédio (admin), as telas mostravam a grade do prédio anterior enquanto
    // o novo carregava — e, se a carga do novo falhasse (prédio sem grade
    // publicada), a busca do topo e o badge seguiam com a grade antiga.
    const [estado, setEstado] = useState(() => ({ predioId, dados: window.__GRADE_CACHE[predioId] || null, error: null }));
    const [loading, setLoading] = useState(false);
    // Só a requisição mais recente pode mexer no estado (troca rápida A → B)
    const requisicaoAtual = useRef(0);

    const doPredio = estado.predioId === predioId;
    const dados = doPredio ? estado.dados : (window.__GRADE_CACHE[predioId] || null);
    const error = doPredio ? estado.error : null;

    const carregarGrade = useCallback(async (forcar = false) => {
        if (!predioId) return;
        const id = ++requisicaoAtual.current;
        if (!forcar && window.__GRADE_CACHE[predioId]) {
            setEstado({ predioId, dados: window.__GRADE_CACHE[predioId], error: null });
            setLoading(false);
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
            if (id === requisicaoAtual.current) setEstado({ predioId, dados: json, error: null });
        } catch (err) {
            if (id === requisicaoAtual.current) setEstado({ predioId, dados: null, error: err.message });
        } finally {
            if (id === requisicaoAtual.current) setLoading(false);
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
