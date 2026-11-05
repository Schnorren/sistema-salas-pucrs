// Fonte única dos caminhos de URL das telas do Dashboard (React Router).
// Cada tela tem endereço próprio: F5 mantém a tela, Voltar/Avançar do navegador
// funcionam e dá para abrir uma aba em nova guia ou mandar o link para alguém.
//
// Ao criar uma tela: registre o caminho aqui e a <Route> no Dashboard. Não há
// nada a mexer na Vercel — o vercel.json já devolve o index.html para qualquer
// caminho fora de /api.
//
// A Planta fica na raiz de propósito: o link de convite/recuperação de senha
// chega em "/#access_token=..." e um redirect na raiz apagaria esse hash antes
// de o supabase-js lê-lo (ver App.jsx).
export const ROTAS = {
  planta: '/',
  linhaDoTempo: '/linha-do-tempo',
  proximasAulas: '/proximas-aulas',
  avisos: '/avisos',
  emprestimos: '/emprestimos',
  contatos: '/contatos',
  admin: '/admin',
  perfil: '/perfil',
  // Só no celular: o que não coube na barra de baixo (no computador volta para a Planta)
  mais: '/mais',
  // Menu "Gestão"
  salasLivres: '/gestao/salas-livres',
  ocupacao: '/gestao/ocupacao',
  historicoAulas: '/gestao/historico-aulas',
  atualizarGrade: '/gestao/atualizar-grade',
  salasPredio: '/gestao/salas-do-predio',
  equipe: '/gestao/equipe',
  relatorioEmprestimos: '/gestao/relatorio-emprestimos',
  gestaoEmprestimos: '/gestao/emprestimos',
};
