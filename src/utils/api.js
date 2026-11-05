// Leitura das respostas da API do sistema — fonte única (antes cada hook tinha
// a sua cópia). Erro sai com a mensagem do servidor ({ error }), regra do
// projeto; quando o corpo não é JSON (ex.: 413 da Vercel antes de a função
// rodar, 502/504 da plataforma), a mensagem vem do status.
const mensagemPorStatus = (status) => {
  if (status === 401) return 'Sua sessão expirou. Entre de novo no sistema.';
  if (status === 403) return 'Você não tem permissão para esta ação.';
  if (status === 404) return 'Não encontrado.';
  if (status === 413) return 'O envio é grande demais.';
  if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.';
  if (status >= 500) return 'O servidor não respondeu como esperado. Tente de novo em instantes.';
  return `Erro ${status}`;
};

export async function lerResposta(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || mensagemPorStatus(res.status));
  return json;
}
