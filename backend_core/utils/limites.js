// Limites compartilhados front + back (sem dependências — o front importa por
// caminho relativo, como o timeHelpers).

// A Vercel recusa corpo de requisição acima de 4,5 MB antes de a função rodar
// (a resposta nem é JSON). O limite fica logo abaixo para o erro sair em
// português — e a tela confere antes de enviar.
export const TAMANHO_MAX_PDF = Math.floor(4.4 * 1024 * 1024);
export const TAMANHO_MAX_PDF_TEXTO = '4,4 MB';

// Relatório de empréstimos: a API devolve cada retirada do período (as contas
// são feitas na tela). ~220 bytes por retirada → 12 mil ≈ 2,6 MB, com folga
// para os 4,5 MB que a Vercel aceita numa resposta. Acima disso, pede período menor.
export const MAX_RETIRADAS_RELATORIO = 12000;
