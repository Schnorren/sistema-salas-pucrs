import { useEffect, useState } from 'react';
import { getDiaAtual, getCurrentPeriod } from '../../backend_core/utils/timeHelpers';

// "Agora" da PUCRS — dia da semana e período atual, no fuso de Brasília (regra
// do projeto: nunca o fuso do navegador). O valor só muda quando um dos dois
// muda, então quem depende dele recalcula exatamente nas viradas:
//   - início E fim de período (antes as telas só reagiam ao minuto exato de
//     início — às 13:00, fim do E1, a Planta seguia mostrando o E1 até as 14h);
//   - meia-noite (antes o dia só virava no primeiro período, às 08:00);
//   - aba que volta a ficar visível (o navegador atrasa timers de aba em
//     segundo plano e um minuto exato podia ser pulado).
// Use `momento.periodo` DENTRO do useMemo e nas deps — um contador de tick
// que o memo não lê é removido pelo lint e a tela para de atualizar (foi o que
// aconteceu na Planta ao Vivo).
const ler = () => {
    const dia = getDiaAtual();
    const periodo = getCurrentPeriod();
    return { dia, periodo, chave: `${dia}|${periodo ?? '-'}` };
};

export function useMomentoAtual(intervaloMs = 15000) {
    const [momento, setMomento] = useState(ler);

    useEffect(() => {
        const conferir = () => setMomento(prev => {
            const agora = ler();
            return agora.chave === prev.chave ? prev : agora;
        });
        const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
        const timer = setInterval(conferir, intervaloMs);
        document.addEventListener('visibilitychange', aoVoltar);
        window.addEventListener('focus', conferir);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', aoVoltar);
            window.removeEventListener('focus', conferir);
        };
    }, [intervaloMs]);

    return momento;
}

// Dia escolhido num seletor que "volta para hoje" a cada virada de período ou
// de dia (comportamento das telas ao vivo). A escolha manual vale só até a
// próxima virada — sem efeito/setState sincronizado.
export function useDiaQueAcompanhaHoje(momento) {
    const [escolha, setEscolha] = useState({ dia: null, chave: null });
    const dia = escolha.dia && escolha.chave === momento.chave ? escolha.dia : momento.dia;
    const setDia = (novo) => setEscolha({ dia: novo, chave: momento.chave });
    return [dia, setDia];
}
