// Painel Admin e Contatos, com Supabase falso (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom } from './supabaseFalso.js';

const { default: adminService } = await import('../../backend_core/services/admin.service.js');
const { default: contatosService } = await import('../../backend_core/services/contatos.service.js');

const PREDIO = '11111111-2222-4333-8444-555555555555';

test('excluir prédio: lista o que ainda está vinculado e não apaga (FKs CASCADE/RESTRICT)', async () => {
  const acoes = [];
  supabase.from = fakeFrom((q) => {
    if (q.acao === 'delete') { acoes.push(`delete ${q.tabela}`); return { error: null }; }
    return { count: { avisos: 3, emprestimos_registro: 41 }[q.tabela] || 0, error: null };
  });
  await assert.rejects(adminService.deletarPredio(PREDIO), (e) => e.status === 400 && /3 aviso\(s\), 41 registro\(s\)/.test(e.message));
  assert.deepEqual(acoes, []);
});

test('excluir prédio limpo: apaga e remove o JSON público da grade', async () => {
  const acoes = [];
  supabase.from = fakeFrom((q) => {
    if (q.acao === 'delete') { acoes.push(`delete ${q.tabela}`); return { error: null }; }
    return { count: 0, error: null };
  });
  supabase.storage.from = () => ({ remove: async (arquivos) => { acoes.push(`storage ${arquivos.join(',')}`); return { error: null }; } });
  await adminService.deletarPredio(PREDIO);
  assert.deepEqual(acoes, ['delete predios', `storage grade_predio_${PREDIO}.json`]);
});

test('admin não tira de si a permissão de administrador; senha curta é recusada', async () => {
  supabase.auth.admin.updateUserById = async () => ({ data: {}, error: null });
  supabase.from = fakeFrom(() => ({ error: null }));
  await assert.rejects(adminService.atualizarUsuarioCompleto('admin-1', { permissoes: ['grade'] }, { id: 'admin-1' }), /própria permissão de administrador/);
  await assert.rejects(adminService.atualizarUsuarioCompleto('outro', { permissoes: [], senha: '1234567' }, { id: 'admin-1' }), /pelo menos 8/);
  assert.deepEqual(await adminService.atualizarUsuarioCompleto('outro', { permissoes: ['grade'], senha: 'senha-boa-123' }, { id: 'admin-1' }), { success: true });
});

test('contatos: a API não troca o tipo de um contato (árvore escola→unidade, local→serviço)', async () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  supabase.from = fakeFrom((q) => {
    if (q.maybe) return { data: { id: ID, tipo: 'escola', nome: 'Escola X', pai_id: null }, error: null };
    if (q.acao === 'update') return { data: [{ id: ID, nome: q.payload.nome, tipo: q.payload.tipo }], error: null };
    return { error: null };
  });
  await assert.rejects(contatosService.atualizarContato(ID, { tipo: 'local', nome: 'Escola X' }, { id: 'u' }), /tipo de um contato não pode ser alterado/);
  const r = await contatosService.atualizarContato(ID, { tipo: 'escola', nome: 'Escola X (nova)' }, { id: 'u' });
  assert.equal(r.nome, 'Escola X (nova)');
});
