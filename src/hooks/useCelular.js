import { useSyncExternalStore } from 'react';

// Layout de celular: abaixo deste limite entram a barra de baixo, o topo
// enxuto e os painéis que sobem de baixo. É o MESMO limite das regras de
// celular do CSS (src/celular.css e o bloco @media de src/index.css) — ao
// mudar um, mude o outro.
export const CONSULTA_CELULAR = '(max-width: 768px)';

const assinar = (avisar) => {
    if (typeof window.matchMedia !== 'function') return () => {};
    const mq = window.matchMedia(CONSULTA_CELULAR);
    mq.addEventListener('change', avisar);
    return () => mq.removeEventListener('change', avisar);
};
const ler = () => typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_CELULAR).matches;

// true quando a tela tem largura de celular. Acompanha girar o aparelho e
// redimensionar a janela.
export const useCelular = () => useSyncExternalStore(assinar, ler, () => false);
