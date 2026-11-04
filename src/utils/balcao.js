// Nome do computador da recepção (ex.: "Balcão 1"). Os dois PCs da recepção
// usam o MESMO login, então o usuário não distingue quem atendeu: cada navegador
// guarda seu próprio nome, enviado no header x-balcao e gravado junto do e-mail
// em resp_retirada / resp_devolucao ("email · Balcão 1").
const CHAVE = 'balcao';

export const lerBalcao = () => {
  try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; }
};

export const salvarBalcao = (nome) => {
  try { localStorage.setItem(CHAVE, String(nome || '').trim().slice(0, 30)); } catch { /* modo privado */ }
};

// "fulano@pucrs.br · Balcão 2" -> { balcao: 'Balcão 2', quem: 'fulano' }
export const lerResponsavel = (texto) => {
  const [email, balcao] = String(texto || '').split(' · ');
  return { balcao: balcao || '', quem: (email || '').split('@')[0] };
};
