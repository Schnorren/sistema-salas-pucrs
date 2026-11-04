/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { CircleCheck, TriangleAlert, Info, Bell } from 'lucide-react';

const UIContext = createContext();

export const useUI = () => useContext(UIContext);

const ICONE = { success: CircleCheck, error: TriangleAlert, warning: Bell, info: Info };

// Toasts e diálogos (confirmar / pedir texto) da aplicação inteira. Ficam fora
// do Dashboard, então levam a classe .sx para herdar os tokens do redesign.
export const UIProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const [modal, setModal] = useState(null);
    const seq = useRef(0);

    const addToast = useCallback((message, type = 'info') => {
        const id = ++seq.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), type === 'error' ? 6000 : 4000);
    }, []);

    const toast = useMemo(() => ({
        success: (msg) => addToast(msg, 'success'),
        error:   (msg) => addToast(msg, 'error'),
        info:    (msg) => addToast(msg, 'info'),
        warning: (msg) => addToast(msg, 'warning'),
    }), [addToast]);

    const showConfirm = useCallback((message, title = 'Confirmação', { confirmar = 'Confirmar', perigo = false } = {}) => {
        return new Promise((resolve) => {
            setModal({
                type: 'confirm', title, message, confirmar, perigo,
                onConfirm: () => { setModal(null); resolve(true); },
                onCancel: () => { setModal(null); resolve(false); }
            });
        });
    }, []);

    const showPrompt = useCallback((message, title = 'Ação necessária', { placeholder = 'Digite aqui…', confirmar = 'Confirmar' } = {}) => {
        return new Promise((resolve) => {
            setModal({
                type: 'prompt', title, message, inputValue: '', placeholder, confirmar,
                onConfirm: (val) => { setModal(null); resolve(val); },
                onCancel: () => { setModal(null); resolve(null); }
            });
        });
    }, []);

    const valor = useMemo(() => ({ toast, showConfirm, showPrompt }), [toast, showConfirm, showPrompt]);
    const podeConfirmar = modal?.type !== 'prompt' || Boolean(modal?.inputValue?.trim());

    return (
        <UIContext.Provider value={valor}>
            {children}

            <div className="sx toasts" aria-live="polite">
                {toasts.map(t => {
                    const Icone = ICONE[t.type] || Info;
                    return <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}><Icone size={16} /><span>{t.message}</span></div>;
                })}
            </div>

            {modal && (
                <div className="sx dlg-fundo" onKeyDown={(e) => { if (e.key === 'Escape') modal.onCancel(); }}>
                    <form
                        className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo"
                        onSubmit={(e) => { e.preventDefault(); if (podeConfirmar) modal.onConfirm(modal.type === 'prompt' ? modal.inputValue.trim() : true); }}
                    >
                        <h3 id="dlg-titulo">{modal.title}</h3>
                        <p>{modal.message}</p>
                        {modal.type === 'prompt' && (
                            <input
                                autoFocus className="inp" type="text" placeholder={modal.placeholder}
                                value={modal.inputValue}
                                onChange={(e) => setModal({ ...modal, inputValue: e.target.value })}
                            />
                        )}
                        <div className="dlg-pe">
                            <button type="button" className="btn" onClick={modal.onCancel} autoFocus={modal.type === 'confirm'}>Cancelar</button>
                            <button type="submit" className={`btn ${modal.perigo ? 'perigo' : 'pri'}`} disabled={!podeConfirmar}>{modal.confirmar}</button>
                        </div>
                    </form>
                </div>
            )}
        </UIContext.Provider>
    );
};
