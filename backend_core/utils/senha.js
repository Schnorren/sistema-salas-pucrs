// Política de senha — fonte única, compartilhada front + back (como o
// timeHelpers, o front importa por caminho relativo). Sem dependências:
// testada com node --test (tests/senha.test.js).
//
// Mínimo de 8 caracteres (NIST SP 800-63B). Antes cada tela checava 6 por
// conta própria e o Painel Admin não checava nada (o erro do Supabase virava
// 500 genérico). Não exige "maiúscula + símbolo": regra de composição só
// empurra para senhas previsíveis; o que pesa é o tamanho.

export const SENHA_MIN = 8;
export const SENHA_MAX = 72; // limite do bcrypt usado pelo Supabase Auth

// Mensagem de erro (texto para o usuário) ou null se a senha serve.
export function validarSenha(senha) {
  const s = typeof senha === 'string' ? senha : '';
  if (s.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
  if (s.length > SENHA_MAX) return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  if (!s.trim()) return 'A senha não pode ser só espaços.';
  return null;
}

// Erros do Supabase Auth na troca de senha chegam em inglês.
export function traduzirErroSenha(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('different from the old')) return 'A nova senha precisa ser diferente da atual.';
  if (msg.includes('at least') || msg.includes('should be')) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
  if (msg.includes('weak') || msg.includes('pwned') || msg.includes('leaked')) return 'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.';
  if (msg.includes('reauthentication') || msg.includes('nonce')) return 'Por segurança, entre de novo no sistema antes de trocar a senha.';
  if (error?.status === 429 || msg.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.';
  return 'Não foi possível salvar a senha. Tente de novo.';
}
