import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';

export const useAuthAccess = (session) => {
    const [acesso, setAcesso] = useState({
        loading: true,
        perfilNome: '',
        predioId: null,
        predioNome: '',
        isGlobal: false,
        permissoes: [],
        // Falha ao consultar (rede, sessão): NÃO é o mesmo que "sem acesso" — o
        // Dashboard mostra "tentar de novo" em vez da tela de conta órfã.
        erro: false
    });
    const [tentativa, setTentativa] = useState(0);
    const recarregar = useCallback(() => {
        setAcesso(prev => ({ ...prev, loading: true, erro: false }));
        setTentativa(t => t + 1);
    }, []);

    useEffect(() => {
        const fetchAcesso = async () => {
            if (!session?.user?.id) {
                setAcesso(prev => ({ ...prev, loading: false }));
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('usuarios_acessos')
                    .select(`
                        predio_id,
                        permissoes, 
                        predios ( nome ),
                        perfis ( nome )
                    `)
                    .eq('user_id', session.user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }

                if (data) {
                    const permissoesArray = data.permissoes || [];
                    
                    // Global (troca de prédio) exige 'admin'. Prédio nulo sem admin = órfão,
                    // exceto o login do relatório da rede (vários prédios, só esse relatório).
                    const isAdmin = permissoesArray.includes('admin');
                    const isUserGlobal = isAdmin;
                    const semPredio = isAdmin ? 'Todos os Prédios'
                        : permissoesArray.includes('relatorio_emprestimos_rede') ? 'Empréstimos da rede' : '';

                    setAcesso({
                        loading: false,
                        perfilNome: data.perfis?.nome || 'Sem Perfil',
                        predioId: data.predio_id,
                        predioNome: data.predios?.nome || semPredio,
                        isGlobal: isUserGlobal,
                        permissoes: permissoesArray
                    });
                } else {
                    setAcesso(prev => ({ ...prev, loading: false }));
                }

            } catch {
                setAcesso(prev => ({ ...prev, loading: false, erro: true }));
            }
        };

        fetchAcesso();
    }, [session, tentativa]);

    // Identidade estável: SeletorPredio e outros efeitos dependem de `acesso`
    return useMemo(() => ({ ...acesso, recarregar }), [acesso, recarregar]);
};