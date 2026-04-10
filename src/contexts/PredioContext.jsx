import { createContext, useState, useContext, useEffect } from 'react';

export const PredioContext = createContext();

export const PredioProvider = ({ children }) => {
    const [predioAtivo, setPredioAtivo] = useState(localStorage.getItem('predioAtivo') || null);

    useEffect(() => {
        if (predioAtivo) {
            localStorage.setItem('predioAtivo', predioAtivo);
        } else {
            localStorage.removeItem('predioAtivo');
        }
    }, [predioAtivo]);

    return (
        <PredioContext.Provider value={{ predioAtivo, setPredioAtivo }}>
            {children}
        </PredioContext.Provider>
    );
};

export const usePredio = () => useContext(PredioContext);