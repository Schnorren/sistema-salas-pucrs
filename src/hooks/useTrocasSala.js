import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { getProximosSeteDias } from '../../backend_core/utils/timeHelpers';
import { trocasVigentes } from '../utils/aulasDoDia';

// Sufixo único por assinatura: Dashboard e Timeline montam o hook ao mesmo
// tempo e cada canal Realtime precisa de um tópico distinto.
let canalSeq = 0;

// Trocas de sala que valem do prédio, como mapa aula_unique_key → registro.
// Uma troca é de uma data só: para cada dia da semana vale o registro da
// PRÓXIMA ocorrência dele, hoje incluso (trocasVigentes). Por isso a busca
// cobre a semana atual e a seguinte (troca registrada com antecedência).
// Fonte única do dado para o badge do Dashboard, a Timeline, a Planta, as
// Próximas aulas e a busca do topo: faz a própria busca e invalida via
// Realtime. O dia de hoje entra na queryKey porque a seleção muda a cada
// virada de dia; as mutations da Timeline invalidam pelo prefixo
// ['trocas_sala', predioId], que alcança a key de qualquer dia.
export function useTrocasSala(predioId) {
    const queryClient = useQueryClient();
    const hoje = getProximosSeteDias()[0].data;

    const { data: trocasAtivas = {} } = useQuery({
        queryKey: ['trocas_sala', predioId, hoje],
        queryFn: async () => {
            const proximosDias = getProximosSeteDias();
            const semanas = [...new Set(proximosDias.map(d => d.semana))]; // 1 (na segunda) ou 2
            const { data, error } = await supabase
                .from('trocas_sala')
                .select('*')
                .eq('predio_id', predioId)
                .in('semana', semanas);
            if (error) throw error;
            return trocasVigentes(data, proximosDias);
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
