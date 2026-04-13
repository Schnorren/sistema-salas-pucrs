import { useState, useCallback, useEffect, useRef } from 'react';
if (!window.__EMPRESTIMOS_CACHE) {
    window.__EMPRESTIMOS_CACHE = {
        categorias: {},
        itens: {}, 
        ativos: {},
        historico: {},
        promises: {}
    };
}

export const useEmprestimos = (session, predioId) => {
    const cache = window.__EMPRESTIMOS_CACHE;

    const [categorias, setCategorias] = useState(cache.categorias[predioId] || []);
    const [itensDisponiveis, setItensDisponiveis] = useState([]);
    const [emprestimosAtivos, setEmprestimosAtivos] = useState(cache.ativos[predioId] || []);
    const [historico, setHistorico] = useState(cache.historico[predioId] || []);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const currentFetchItens = useRef(0);
    const currentFetchAtivos = useRef(0);
    const currentFetchHistorico = useRef(0);

    const token = session?.access_token;

    useEffect(() => {
        if (predioId) {
            setCategorias(cache.categorias[predioId] || []);
            setEmprestimosAtivos(cache.ativos[predioId] || []);
            setHistorico(cache.historico[predioId] || []);
            setItensDisponiveis([]);
        }
    }, [predioId, cache]);

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || ''
    }), [token, predioId]);
    const carregarCategorias = useCallback(async (forcar = false) => {
        if (!predioId) return;

        if (cache.categorias[predioId] && !forcar) {
            setCategorias(cache.categorias[predioId]);
            return;
        }

        const promiseKey = `cat-${predioId}`;
        if (cache.promises[promiseKey] && !forcar) return cache.promises[promiseKey];

        const promise = fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                cache.categorias[predioId] = data;
                setCategorias(data);
                delete cache.promises[promiseKey];
            })
            .catch(console.error);

        cache.promises[promiseKey] = promise;
        return promise;
    }, [predioId, getHeaders, cache]);
    const carregarItensDisponiveis = useCallback(async (categoriaId, forcar = false) => {
        const fetchId = ++currentFetchItens.current;
        if (!categoriaId) return setItensDisponiveis([]);

        if (cache.itens[categoriaId] && !forcar) {
            if (fetchId === currentFetchItens.current) {
                setItensDisponiveis(cache.itens[categoriaId]);
            }
            return;
        }

        const promiseKey = `item-${categoriaId}`;
        if (cache.promises[promiseKey] && !forcar) return cache.promises[promiseKey];

        const promise = fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias/${categoriaId}/itens`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (fetchId === currentFetchItens.current) {
                    cache.itens[categoriaId] = data;
                    setItensDisponiveis(data);
                }
                delete cache.promises[promiseKey];
            })
            .catch(console.error);

        cache.promises[promiseKey] = promise;
        return promise;
    }, [getHeaders, cache]);
    const carregarAtivos = useCallback(async (isSilent = false, forcar = false) => {
        if (!predioId) return;

        const fetchId = ++currentFetchAtivos.current;

        if (!isSilent) {
            if (cache.ativos[predioId]) {
                setEmprestimosAtivos(cache.ativos[predioId]);
            } else {
                setLoading(true);
            }
        }

        const promiseKey = `ativos-${predioId}`;
        if (cache.promises[promiseKey] && !forcar) return cache.promises[promiseKey];

        const promise = fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/ativos`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (fetchId === currentFetchAtivos.current) {
                    cache.ativos[predioId] = data;
                    setEmprestimosAtivos(data);
                }
            })
            .catch(err => {
                if (fetchId === currentFetchAtivos.current) setError(err.message);
            })
            .finally(() => {
                if (fetchId === currentFetchAtivos.current) setLoading(false);
                delete cache.promises[promiseKey];
            });

        cache.promises[promiseKey] = promise;
        return promise;
    }, [predioId, getHeaders, cache]);

    const carregarHistorico = useCallback(async (isSilent = false, forcar = false) => {
        if (!predioId) return;

        const fetchId = ++currentFetchHistorico.current;

        if (!isSilent) {
            if (cache.historico[predioId]) {
                setHistorico(cache.historico[predioId]);
            } else {
                setLoading(true);
            }
        }

        const promiseKey = `hist-${predioId}`;
        if (cache.promises[promiseKey] && !forcar) return cache.promises[promiseKey];

        const promise = fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/historico`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (fetchId === currentFetchHistorico.current) {
                    cache.historico[predioId] = data;
                    setHistorico(data);
                }
            })
            .catch(err => setError(err.message))
            .finally(() => {
                if (fetchId === currentFetchHistorico.current) setLoading(false);
                delete cache.promises[promiseKey];
            });

        cache.promises[promiseKey] = promise;
        return promise;
    }, [predioId, getHeaders, cache]);
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
        currentFetchItens.current++;
        currentFetchAtivos.current++;

        const itemAlvo = itensDisponiveis.find(i => i.id === dados.itemId);
        const novoEmprestimoFake = {
            id: `temp-${Date.now()}`,
            itemId: dados.itemId,
            nomeItem: itemAlvo?.nome_item || 'Item',
            patrimonio: itemAlvo?.patrimonio || '---',
            matricula: dados.matricula,
            nomeAluno: dados.nomeAluno,
            dataRetirada: new Date().toISOString()
        };
        setItensDisponiveis(prev => prev.filter(i => i.id !== dados.itemId));
        setEmprestimosAtivos(prev => [novoEmprestimoFake, ...prev]);
        cache.ativos[predioId] = [novoEmprestimoFake, ...(cache.ativos[predioId] || [])];
        if (cache.itens[dados.categoriaId]) {
            cache.itens[dados.categoriaId] = cache.itens[dados.categoriaId].filter(i => i.id !== dados.itemId);
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/retirar`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });

            if (!res.ok) throw new Error('Falha no Servidor');
            Promise.all([carregarAtivos(true, true), carregarHistorico(true, true)]).catch(console.log);
            return true;

        } catch (err) {
            setItensDisponiveis(prev => [...prev, itemAlvo]);
            setEmprestimosAtivos(prev => prev.filter(e => e.id !== novoEmprestimoFake.id));
            alert("Erro na rede. O empréstimo foi desfeito.");
            return false;
        }
    };

    const registrarDevolucao = async (emprestimoId) => {
        currentFetchAtivos.current++;
        currentFetchHistorico.current++;

        const emprestimoAlvo = emprestimosAtivos.find(e => e.id === emprestimoId);
        setEmprestimosAtivos(prev => prev.filter(e => e.id !== emprestimoId));
        if (cache.ativos[predioId]) {
            cache.ativos[predioId] = cache.ativos[predioId].filter(e => e.id !== emprestimoId);
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/devolver/${emprestimoId}`, {
                method: 'POST',
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Falha no Servidor');

            const categoriaAtiva = document.getElementById('cat-sel-hidden')?.value;
            Promise.all([
                carregarAtivos(true, true),
                carregarHistorico(true, true),
                categoriaAtiva ? carregarItensDisponiveis(categoriaAtiva, true) : Promise.resolve() 
            ]).catch(console.log);

            return true;
        } catch (err) {
            setEmprestimosAtivos(prev => [emprestimoAlvo, ...prev]);
            alert("Erro ao devolver. Tente novamente.");
            return false;
        }
    };

    const alterarStatusManutencao = async (itemId, status, observacao = null) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/itens/${itemId}/manutencao`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ status, observacoes: observacao })
            });
            if (!res.ok) throw new Error('Falha ao atualizar status do item');

            if (categorias.length > 0) {
                carregarItensDisponiveis(document.getElementById('cat-sel-hidden')?.value, true); 
            }
            return true;
        } catch (err) {
            alert(err.message);
            return false;
        }
    };

    return {
        categorias, itensDisponiveis, emprestimosAtivos, historico, loading, error,
        carregarCategorias, carregarItensDisponiveis, carregarAtivos, carregarHistorico,
        consultarAluno, registrarRetirada, registrarDevolucao, alterarStatusManutencao
    };
};