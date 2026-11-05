import { useEffect, useState } from 'react';

// Cor da barra do navegador/do sistema no celular (meta theme-color e ícone da
// tela de início) — o fundo de cada tema em src/index.css.
const COR_DO_TEMA = { escuro: '#111418', claro: '#f0ede8' };

// Tema claro/escuro, guardado no navegador (escuro é o padrão). Fica no
// Dashboard para valer nos dois layouts: o computador troca pelo topo e o
// celular pelo menu "Mais".
export function useTema() {
    const [escuro, setEscuro] = useState(() => localStorage.getItem('theme') !== 'light');

    useEffect(() => {
        document.body.classList.toggle('dark-mode', escuro);
        localStorage.setItem('theme', escuro ? 'dark' : 'light');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? COR_DO_TEMA.escuro : COR_DO_TEMA.claro);
    }, [escuro]);

    return [escuro, setEscuro];
}
