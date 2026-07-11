import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { getSemanaAtual } from '../../backend_core/utils/timeHelpers';

// Sufixo único por assinatura: Dashboard e Timeline montam o hook ao mesmo
// tempo e cada canal Realtime precisa de um tópico distinto.
let canalSeq = 0;

// Trocas de sala ativas do prédio na semana corrente, como mapa
// aula_unique_key → registro. Fonte única do dado para o badge do Dashboard
// e para a Timeline: faz a própria busca (não depende de outra aba popular o
// cache) e invalida via Realtime. A `semana` entra na queryKey para o dado
// zerar na virada da semana; as mutations da Timeline invalidam pelo prefixo
// ['trocas_sala', predioId], que alcança a key de qualquer semana.
export function useTrocasSala(predioId) {
    const queryClient = useQueryClient();
    const semana = getSemanaAtual();

    const { data: trocasAtivas = {} } = useQuery({
        queryKey: ['trocas_sala', predioId, semana],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('trocas_sala')
                .select('*')
                .eq('predio_id', predioId)
                .eq('semana', semana);
            if (error) throw error;
            const map = {};
            data.forEach(t => { map[t.aula_unique_key] = t; });
            return map;
        },
        enabled: !!predioId
    });

    useEffect(() => {
        if (!predioId) return;
        const channel = supabase.channel(`trocas_${predioId}_${++canalSeq}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trocas_sala', filter: `predio_id=eq.${predioId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['trocas_sala', predioId] });
            }).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [predioId, queryClient]);

    return trocasAtivas;
}
