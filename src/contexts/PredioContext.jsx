/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect } from 'react';

export const PredioContext = createContext();

export const PredioProvider = ({ children }) => {
    const [predioAtivo, setPredioAtivo] = useState(localStorage.getItem('predioAtivo') || null);
    // Nome legível do prédio ativo (preenchido pelo SeletorPredio). Usado em
    // textos impressos, como o cabeçalho do cartaz de troca de sala.
    const [predioNome, setPredioNome] = useState('');

    useEffect(() => {
        if (predioAtivo) {
            localStorage.setItem('predioAtivo', predioAtivo);
        } else {
            localStorage.removeItem('predioAtivo');
        }
    }, [predioAtivo]);

    return (
        <PredioContext.Provider value={{ predioAtivo, setPredioAtivo, predioNome, setPredioNome }}>
            {children}
        </PredioContext.Provider>
    );
};

export const usePredio = () => useContext(PredioContext);