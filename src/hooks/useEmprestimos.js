import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

export const useEmprestimos = (session, predioId) => {
    const [categorias, setCategorias] = useState([]);
    const [itensDisponiveis, setItensDisponiveis] = useState([]);
    const [emprestimosAtivos, setEmprestimosAtivos] = useState([]);
    const [historico, setHistorico] = useState([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const token = session?.access_token;

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || ''
    }), [token, predioId]);

    const carregarCategorias = useCallback(async () => {
        if (!predioId) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias?t=${Date.now()}`, { headers: getHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('Erro ao carregar categorias');
            const data = await res.json();
            setCategorias([...data]);
        } catch (err) { console.error(err); }
    }, [predioId, getHeaders]);

    const carregarItensDisponiveis = useCallback(async (categoriaId) => {
        if (!categoriaId) return setItensDisponiveis([]);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias/${categoriaId}/itens?t=${Date.now()}`, { headers: getHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('Erro ao carregar itens');
            const data = await res.json();
            setItensDisponiveis([...data]);
        } catch (err) { console.error(err); }
    }, [getHeaders]);

    const carregarAtivos = useCallback(async (isSilent = false) => {
        if (!predioId) return;
        if (!isSilent) setLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/ativos?t=${Date.now()}`, { headers: getHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('Erro ao carregar ativos');
            const data = await res.json();
            setEmprestimosAtivos([...data]);
        } catch (err) {
            setError(err.message);
        } finally {
            if (!isSilent) setLoading(false);
        }
    }, [predioId, getHeaders]);

    const carregarHistorico = useCallback(async (isSilent = false) => {
        if (!predioId) return;
        if (!isSilent) setLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/historico?t=${Date.now()}`, { headers: getHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('Erro ao carregar historico');
            const data = await res.json();
            setHistorico([...data]);
        } catch (err) {
            setError(err.message);
        } finally {
            if (!isSilent) setLoading(false);
        }
    }, [predioId, getHeaders]);

    const actionsRef = useRef({ carregarItensDisponiveis, carregarAtivos, carregarHistorico });
    useEffect(() => {
        actionsRef.current = { carregarItensDisponiveis, carregarAtivos, carregarHistorico };
    }, [carregarItensDisponiveis, carregarAtivos, carregarHistorico]);

    useEffect(() => {
        if (!predioId) return;

        const channel = supabase.channel(`emprestimos_${predioId}`);

        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimo_itens' }, (payload) => {
            console.log('🔔 [WEBSOCKET] Item alterado no banco:', payload);
            const currentCategoriaId = document.getElementById('cat-sel-hidden')?.value;
            if (currentCategoriaId) {
                actionsRef.current.carregarItensDisponiveis(currentCategoriaId);
            }
        });

        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimos_registro' }, (payload) => {
            console.log('🔔 [WEBSOCKET] Empréstimo/Devolução realizada:', payload);
            actionsRef.current.carregarAtivos(true);
            actionsRef.current.carregarHistorico(true);
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') console.log(`🔌 WebSocket conectado para o prédio ${predioId}`);
        });

        return () => { supabase.removeChannel(channel); };
    }, [predioId]);

    useEffect(() => {
        if (predioId) {
            setItensDisponiveis([]);
            carregarCategorias();
            carregarAtivos(false);
            carregarHistorico(true);
        }
    }, [predioId, carregarCategorias, carregarAtivos, carregarHistorico]);

    const consultarAluno = async (matricula) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/aluno/${matricula}?t=${Date.now()}`, { headers: getHeaders(), cache: 'no-store' });
            if (!res.ok) throw new Error('Falha ao consultar aluno');
            return await res.json();
        } catch (err) {
            alert(err.message);
            return null;
        }
    };

    const registrarRetirada = async (dados) => {
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

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/retirar`, {
                method: 'POST', headers: getHeaders(), body: JSON.stringify(dados)
            });

            if (!res.ok) throw new Error('Falha no Servidor');

            carregarAtivos(true);
            carregarHistorico(true);
            return true;

        } catch (err) {
            if (itemAlvo) setItensDisponiveis(prev => [...prev, itemAlvo]);
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
                method: 'POST', headers: getHeaders()
            });
            if (!res.ok) throw new Error('Falha no Servidor');

            const categoriaAtiva = document.getElementById('cat-sel-hidden')?.value;
            carregarAtivos(true);
            carregarHistorico(true);
            if (categoriaAtiva) carregarItensDisponiveis(categoriaAtiva);

            return true;
        } catch (err) {
            if (emprestimoAlvo) setEmprestimosAtivos(prev => [emprestimoAlvo, ...prev]);
            alert("Erro ao devolver. Tente novamente.");
            return false;
        }
    };

    const alterarStatusManutencao = async (itemId, status, observacao = null) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/itens/${itemId}/manutencao`, {
                method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status, observacoes: observacao })
            });
            if (!res.ok) throw new Error('Falha ao atualizar status do item');

            const categoriaAtiva = document.getElementById('cat-sel-hidden')?.value;
            if (categoriaAtiva) carregarItensDisponiveis(categoriaAtiva);

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