// Escapa texto para interpolar em HTML montado à mão (janelas de impressão
// abertas com document.write). Essas janelas são about:blank da MESMA origem
// do sistema: um <img onerror> vindo de um dado (nome de sala do PDF, nome de
// arquivo) rodaria com acesso à sessão guardada no navegador.
export const escaparHtml = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Número para CSS/atributo (largura de barra, porcentagem): só dígitos válidos.
export const numeroSeguro = (valor, padrao = 0) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
};
