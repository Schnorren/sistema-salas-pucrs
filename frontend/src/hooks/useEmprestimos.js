import { useState, useCallback } from 'react';

const cacheStorage = {
    categorias: {},
    ativos: {},
    historico: {}
};

export const useEmprestimos = (session, predioId) => {
    const [categorias, setCategorias] = useState(cacheStorage.categorias[predioId] || []);
    const [itensDisponiveis, setItensDisponiveis] = useState([]);
    const [emprestimosAtivos, setEmprestimosAtivos] = useState(cacheStorage.ativos[predioId] || []);
    const [historico, setHistorico] = useState(cacheStorage.historico[predioId] || []);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'x-predio-id': predioId || ''
    }), [session, predioId]);

    const carregarCategorias = useCallback(async () => {
        if (!predioId) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao buscar categorias');
            const data = await res.json();
            cacheStorage.categorias[predioId] = data;
            setCategorias(data);
        } catch (err) {
            console.error(err);
        }
    }, [predioId, getHeaders]);

    const carregarItensDisponiveis = useCallback(async (categoriaId) => {
        if (!categoriaId) return setItensDisponiveis([]);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias/${categoriaId}/itens`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao buscar itens');
            setItensDisponiveis(await res.json());
        } catch (err) {
            console.error(err);
        }
    }, [getHeaders]);

    const carregarAtivos = useCallback(async (isSilent = false) => {
        if (!predioId) return;

        if (!isSilent && !cacheStorage.ativos[predioId]) {
            setLoading(true);
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/ativos`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao buscar empréstimos ativos');
            const data = await res.json();
            cacheStorage.ativos[predioId] = data;
            setEmprestimosAtivos(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [predioId, getHeaders]);

    const carregarHistorico = useCallback(async (isSilent = false) => {
        if (!predioId) return;

        if (!isSilent && !cacheStorage.historico[predioId]) {
            setLoading(true);
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/historico`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao buscar histórico');
            const data = await res.json();
            cacheStorage.historico[predioId] = data;
            setHistorico(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [predioId, getHeaders]);

    const consultarAluno = async (matricula) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/aluno/${matricula}`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Falha ao consultar aluno');
            return await res.json();
        } catch (err) {
            alert(err.message);
            return null;
        }
    };

    const registrarRetirada = async (dados) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/retirar`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });
            if (!res.ok) throw new Error('Falha ao registrar empréstimo');

            await carregarAtivos(true);
            await carregarHistorico(true);
            if (dados.categoriaId) await carregarItensDisponiveis(dados.categoriaId);

            return true;
        } catch (err) {
            alert(err.message);
            return false;
        }
    };

    const registrarDevolucao = async (emprestimoId) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/devolver/${emprestimoId}`, {
                method: 'POST',
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Falha ao registrar devolução');

            await carregarAtivos(true);
            await carregarHistorico(true);

            return true;
        } catch (err) {
            alert(err.message);
            return false;
        }
    };

    return {
        categorias, itensDisponiveis, emprestimosAtivos, historico, loading, error,
        carregarCategorias, carregarItensDisponiveis, carregarAtivos, carregarHistorico,
        consultarAluno, registrarRetirada, registrarDevolucao
    };
};