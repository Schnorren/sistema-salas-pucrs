import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export const useAuthAccess = (session) => {
    const [acesso, setAcesso] = useState({
        loading: true,
        perfilNome: '',
        predioId: null,
        predioNome: '',
        isGlobal: false,
        permissoes: []
    });

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
                    
                    const isAdmin = permissoesArray.includes('admin');
                    const isUserGlobal = data.predio_id === null || isAdmin;

                    setAcesso({
                        loading: false,
                        perfilNome: data.perfis?.nome || 'Sem Perfil',
                        predioId: data.predio_id,
                        predioNome: data.predios?.nome || 'Todos os Prédios',
                        isGlobal: isUserGlobal,
                        permissoes: permissoesArray
                    });
                } else {
                    setAcesso(prev => ({ ...prev, loading: false }));
                }

            } catch (err) {
                console.error('Erro ao verificar permissões:', err);
                setAcesso(prev => ({ ...prev, loading: false }));
            }
        };

        fetchAcesso();
    }, [session]);

    return acesso;
};