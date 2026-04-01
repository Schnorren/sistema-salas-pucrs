import { useState, useCallback } from 'react';
import { supabase } from '../supabase';

export const useAvisos = () => {
    const [avisos, setAvisos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchAvisosAtivos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('avisos')
                .select('*')
                .eq('status', 'ATIVO')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAvisos(data || []);
        } catch (err) {
            console.error('🚨 Erro ao buscar avisos:', err.message);
            setError('Não foi possível carregar o mural.');
        } finally {
            setLoading(false);
        }
    }, []);

    const criarAviso = async (dados, userId) => {
        try {
            const { error } = await supabase.from('avisos').insert([
                { ...dados, criado_por: userId }
            ]);
            if (error) throw error;
            await fetchAvisosAtivos();
            return true;
        } catch (err) {
            console.error('🚨 Erro ao criar aviso:', err.message);
            return false;
        }
    };

    const concluirAviso = async (id, obs, userId) => {
        try {
            const { error } = await supabase
                .from('avisos')
                .update({ 
                    status: 'CONCLUIDO', 
                    concluido_por: userId,
                    concluido_em: new Date().toISOString(),
                    obs_conclusao: obs 
                })
                .eq('id', id);

            if (error) throw error;
            
            setAvisos(prev => prev.filter(aviso => aviso.id !== id));
            return true;
        } catch (err) {
            console.error('🚨 Erro ao concluir aviso:', err.message);
            return false;
        }
    };

    return { avisos, loading, error, fetchAvisosAtivos, criarAviso, concluirAviso };
};