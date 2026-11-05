// Ícones de traço do layout de celular (24×24, cor do texto).
const CAMINHOS = {
    lupa: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    planta: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.2" /></>,
    linha: <path d="M4 6.5h10M4 12h15M4 17.5h7" />,
    relogio: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    sino: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
    mais: <path d="M4 7h16M4 12h16M4 17h16" />,
    voltar: <path d="M15 5l-7 7 7 7" />,
    fechar: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
    seta: <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />,
    computador: <><rect x="3" y="4.5" width="18" height="11.5" rx="1.5" /><path d="M8 20h8M12 16v4" /></>,
    telefone: <path d="M5.5 4h3.5l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v3.5a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3.5 6a2 2 0 0 1 2-2z" />,
    conversa: <path d="M4 5.5h16v10.5H9l-5 4z" />,
    email: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
};

export default function Icone({ nome, tamanho = 20 }) {
    return (
        <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {CAMINHOS[nome]}
        </svg>
    );
}
