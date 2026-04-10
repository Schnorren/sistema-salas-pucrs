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
        // 🔥 MAGIA 1: Pega os dados do item antes dele sumir da tela
        const itemAlvo = itensDisponiveis.find(i => i.id === dados.itemId);

        // 🔥 MAGIA 2: UI OTIMISTA - Atualiza a tela ANTES de enviar pro banco
        const novoEmprestimoFake = {
            id: `temp-${Date.now()}`, // ID provisório até o banco responder
            itemId: dados.itemId,
            nomeItem: itemAlvo?.nome_item || 'Item',
            patrimonio: itemAlvo?.patrimonio || '---',
            matricula: dados.matricula,
            nomeAluno: dados.nomeAluno,
            dataRetirada: new Date().toISOString()
        };

        // Tira o card da lista do meio e joga pra lista da direita INSTANTANEAMENTE
        setItensDisponiveis(prev => prev.filter(i => i.id !== dados.itemId));
        setEmprestimosAtivos(prev => [novoEmprestimoFake, ...prev]);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/retirar`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });

            if (!res.ok) throw new Error('Falha no Servidor');

            // Tudo certo! O banco salvou. Agora atualizamos os IDs verdadeiros em background
            Promise.all([carregarAtivos(true), carregarHistorico(true)]).catch(console.log);
            return true;

        } catch (err) {
            // 🔙 ROLLBACK: Deu erro? (Ex: Sem internet). Nós desfazemos a animação.
            setItensDisponiveis(prev => [...prev, itemAlvo]);
            setEmprestimosAtivos(prev => prev.filter(e => e.id !== novoEmprestimoFake.id));
            alert("Erro na rede. O empréstimo foi desfeito.");
            return false;
        }
    };

    const registrarDevolucao = async (emprestimoId) => {
        const emprestimoAlvo = emprestimosAtivos.find(e => e.id === emprestimoId);
        setEmprestimosAtivos(prev => prev.filter(e => e.id !== emprestimoId));

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/devolver/${emprestimoId}`, {
                method: 'POST',
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Falha no Servidor');

            // 🔥 AGORA ELE ATUALIZA O ESTOQUE TAMBÉM!
            // Pega o ID da categoria que está selecionada na tela naquele momento
            const categoriaAtiva = document.getElementById('cat-sel-hidden')?.value;

            Promise.all([
                carregarAtivos(true),
                carregarHistorico(true),
                categoriaAtiva ? carregarItensDisponiveis(categoriaAtiva) : Promise.resolve()
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

            // Atualiza a lista na tela automaticamente
            if (categorias.length > 0) {
                // Força o recarregamento da categoria atual
                carregarItensDisponiveis(document.getElementById('cat-sel-hidden')?.value);
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