import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export const useAuthAccess = (session) => {
    const [acesso, setAcesso] = useState({
        loading: true,
        nivel: 0, // 0 = Sem acesso liberado
        perfilNome: '',
        predioId: null,
        predioNome: '',
        isGlobal: false // True se for Coordenador/Admin (Nível >= 60) ou sem prédio fixo
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
                        predios ( nome ),
                        perfis ( nome, nivel )
                    `)
                    .eq('user_id', session.user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }

                if (data) {
                    const nivelPoder = data.perfis?.nivel || 0;
                    
                    const isUserGlobal = data.predio_id === null || nivelPoder >= 60;

                    setAcesso({
                        loading: false,
                        nivel: nivelPoder,
                        perfilNome: data.perfis?.nome || 'Sem Perfil',
                        predioId: data.predio_id,
                        predioNome: data.predios?.nome || 'Todos os Prédios',
                        isGlobal: isUserGlobal
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