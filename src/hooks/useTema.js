import { useSyncExternalStore } from 'react';

// Tema claro/escuro — preferência por navegador. O sinal no DOM continua sendo
// body.dark-mode (o index.css legado e o src/styles/sx.css leem a mesma classe).
//
// Chave nova ('tema'): a antiga ('theme') gravava 'dark' para todo mundo porque
// o escuro era o padrão e o Topbar persistia o valor no primeiro carregamento —
// reaproveitá-la manteria todos no escuro. Padrão agora é o claro.
const CHAVE = 'tema';
const ouvintes = new Set();

const ler = () => {
  try { return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro'; } catch { return 'claro'; }
};
const aplicar = (t) => document.body.classList.toggle('dark-mode', t === 'escuro');

let atual = ler();
aplicar(atual);

export function definirTema(t) {
  atual = t === 'escuro' ? 'escuro' : 'claro';
  try { localStorage.setItem(CHAVE, atual); } catch { /* modo privado: só não persiste */ }
  aplicar(atual);
  ouvintes.forEach((f) => f());
}

const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };

export function useTema() {
  const tema = useSyncExternalStore(assinar, () => atual);
  return [tema, definirTema];
}
