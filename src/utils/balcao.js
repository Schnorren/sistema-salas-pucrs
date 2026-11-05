// Nome do computador da recepção ("Balcão 1"). Os dois PCs usam o MESMO
// login, então o usuário não distingue quem atendeu: cada navegador guarda o
// seu nome, enviado no header x-balcao e gravado em balcao_retirada /
// balcao_devolucao do registro.
const CHAVE = 'balcao';

export const lerBalcao = () => {
  try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; }
};

export const salvarBalcao = (nome) => {
  try { localStorage.setItem(CHAVE, String(nome || '').trim().slice(0, 30)); } catch { /* modo privado: só não lembra */ }
};

// Ponto de empréstimo deste computador (por prédio): o PC da recepção abre
// sempre no seu ponto, mesmo que o login opere mais de um.
const chavePonto = (predioId) => `balcao_ponto:${predioId || ''}`;

export const lerPontoSalvo = (predioId) => {
  try { return localStorage.getItem(chavePonto(predioId)) || ''; } catch { return ''; }
};

export const salvarPontoSalvo = (predioId, pontoId) => {
  try { localStorage.setItem(chavePonto(predioId), String(pontoId || '')); } catch { /* modo privado */ }
};
