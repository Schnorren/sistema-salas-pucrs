// Nome do computador da recepção ("Balcão 1"). Os dois PCs usam o MESMO
// login, então o usuário não distingue quem atendeu: cada navegador guarda o
// seu nome, enviado no header x-balcao e gravado junto do e-mail em
// resp_retirada / resp_devolucao ("email · Balcão 1").
const CHAVE = 'balcao';

export const lerBalcao = () => {
  try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; }
};

export const salvarBalcao = (nome) => {
  try { localStorage.setItem(CHAVE, String(nome || '').trim().slice(0, 30)); } catch { /* modo privado: só não lembra */ }
};

// "fulano@pucrs.br · Balcão 2" -> "Balcão 2"; sem balcão -> "fulano"
export const rotuloResponsavel = (texto) => {
  if (!texto) return '';
  const [email, balcao] = String(texto).split(' · ');
  return balcao || (email || '').split('@')[0];
};
