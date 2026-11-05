/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

const UIContext = createContext();

export const useUI = () => useContext(UIContext);

export const UIProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const [modal, setModal] = useState(null);

    // Contador em vez de Date.now(): dois toasts no mesmo milissegundo tinham o
    // mesmo id (key repetida e os dois sumiam juntos).
    const proximoId = useRef(0);
    const addToast = useCallback((message, type = 'info') => {
        const id = ++proximoId.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    // Identidade estável: antes `toast` (e o value do contexto) eram objetos
    // novos a cada render do provider — todo toast que aparecia/sumia
    // re-renderizava todos os consumidores, e efeitos com `toast` nas deps
    // (o canal Realtime de avisos do Dashboard) eram desfeitos e refeitos.
    const toast = useMemo(() => ({
        success: (msg) => addToast(msg, 'success'),
        error:   (msg) => addToast(msg, 'error'),
        info:    (msg) => addToast(msg, 'info'),
        warning: (msg) => addToast(msg, 'warning'),
    }), [addToast]);

    const showConfirm = useCallback((message, title = 'Confirmação') => {
        return new Promise((resolve) => {
            setModal({
                type: 'confirm', title, message,
                onConfirm: () => { setModal(null); resolve(true); },
                onCancel: () => { setModal(null); resolve(false); }
            });
        });
    }, []);

    const showPrompt = useCallback((message, title = 'Ação Necessária') => {
        return new Promise((resolve) => {
            setModal({
                type: 'prompt', title, message, inputValue: '',
                onConfirm: (val) => { setModal(null); resolve(val); },
                onCancel: () => { setModal(null); resolve(null); }
            });
        });
    }, []);

    const valor = useMemo(() => ({ toast, showConfirm, showPrompt }), [toast, showConfirm, showPrompt]);

    return (
        <UIContext.Provider value={valor}>
            {children}

            <div className="ui-toasts" style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {toasts.map(t => (
                    <div key={t.id} style={{
                        background: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : t.type === 'warning' ? '#f59e0b' : '#3b82f6',
                        color: '#fff', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
                        animation: 'slideIn 0.3s ease-out'
                    }}>
                        {t.type === 'success' && '✅'}
                        {t.type === 'error' && '⚠️'}
                        {t.type === 'warning' && '🔔'}
                        {t.type === 'info' && 'ℹ️'}
                        {t.message}
                    </div>
                ))}
            </div>

            {modal && (
                <div data-ui-modal="" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="ui-dialogo" style={{ background: 'var(--surface, #1e293b)', padding: '24px', borderRadius: '12px', width: '400px', border: '1px solid var(--border, #334155)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: 'var(--text, #fff)' }}>{modal.title}</h3>
                        <p style={{ margin: '0 0 20px 0', color: 'var(--muted, #94a3b8)', fontSize: '14px', lineHeight: '1.5' }}>{modal.message}</p>

                        {modal.type === 'prompt' && (
                            <input
                                autoFocus
                                type="text"
                                placeholder="Digite o motivo aqui..."
                                onChange={(e) => setModal({ ...modal, inputValue: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter' && modal.inputValue.trim()) modal.onConfirm(modal.inputValue); }}
                                style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
                            />
                        )}

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: modal.type === 'confirm' ? '20px' : '0' }}>
                            <button onClick={modal.onCancel} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Cancelar
                            </button>
                            <button
                                onClick={() => modal.onConfirm(modal.type === 'prompt' ? modal.inputValue : true)}
                                disabled={modal.type === 'prompt' && !modal.inputValue?.trim()}
                                style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: (modal.type === 'prompt' && !modal.inputValue?.trim()) ? 0.5 : 1 }}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes slideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
            `}</style>
        </UIContext.Provider>
    );
};