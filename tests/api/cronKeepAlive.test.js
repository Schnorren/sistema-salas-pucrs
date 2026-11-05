// Cron diário da Vercel (/api/equipe): tem que tocar o banco, senão o Supabase
// gratuito pausa o projeto depois de 7 dias sem uso. Supabase falso, sem rede.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom, chamar, silenciarConsole } from './supabaseFalso.js';

const { default: equipe } = await import('../../api/equipe/index.js');
const { ehChamadaDoCron } = await import('../../backend_core/utils/cron.js');

let consultas;
let bancoFora;
const segredoOriginal = process.env.CRON_SECRET;

beforeEach(() => {
  delete process.env.CRON_SECRET;
  consultas = [];
  bancoFora = false;
  supabase.from = fakeFrom((q) => {
    consultas.push(q.tabela);
    return bancoFora ? { data: null, error: { message: 'connection refused' } } : { data: [{ id: 'p15' }], error: null };
  });
});
afterEach(() => {
  if (segredoOriginal === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = segredoOriginal;
});

test('cron: identifica a chamada da Vercel (user-agent, header antigo, CRON_SECRET)', () => {
  assert.equal(ehChamadaDoCron({ 'user-agent': 'vercel-cron/1.0' }, ''), true);
  assert.equal(ehChamadaDoCron({ 'x-vercel-cron': '1' }, ''), true);
  assert.equal(ehChamadaDoCron({ 'user-agent': 'Mozilla/5.0' }, ''), false);
  assert.equal(ehChamadaDoCron({}, ''), false);
  // Com o segredo configurado, só ele vale
  assert.equal(ehChamadaDoCron({ authorization: 'Bearer s3gr3do' }, 's3gr3do'), true);
  assert.equal(ehChamadaDoCron({ 'user-agent': 'vercel-cron/1.0' }, 's3gr3do'), false);
  assert.equal(ehChamadaDoCron({ authorization: 'Bearer outro' }, 's3gr3do'), false);
});

test('cron: keep-alive faz uma consulta de verdade no banco', async () => {
  const r = await chamar(equipe, { url: '/api/equipe', headers: { 'user-agent': 'vercel-cron/1.0' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'keep-alive');
  assert.equal(r.body.banco, 'ok');
  assert.deepEqual(consultas, ['predios']);
});

test('cron: banco fora do ar vira 503 (falha visível no log do cron), sem mensagem do banco', async (t) => {
  silenciarConsole(t);
  bancoFora = true;
  const r = await chamar(equipe, { url: '/api/equipe', headers: { 'x-vercel-cron': '1' } });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'Banco indisponível.');
});

test('cron: com CRON_SECRET, header forjado não pula a autenticação', async () => {
  process.env.CRON_SECRET = 's3gr3do';
  const forjado = await chamar(equipe, { url: '/api/equipe', headers: { 'x-vercel-cron': '1' } });
  assert.equal(forjado.status, 401);
  assert.deepEqual(consultas, []);
  const real = await chamar(equipe, { url: '/api/equipe', headers: { authorization: 'Bearer s3gr3do' } });
  assert.equal(real.status, 200);
  assert.deepEqual(consultas, ['predios']);
});
