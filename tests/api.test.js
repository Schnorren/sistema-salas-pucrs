// Leitura das respostas da API no front (src/utils/api.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerResposta } from '../src/utils/api.js';

test('sucesso devolve o JSON', async () => {
  assert.deepEqual(await lerResposta(new Response(JSON.stringify({ ok: 1 }), { status: 200 })), { ok: 1 });
});

test('erro usa a mensagem do servidor ({ error })', async () => {
  await assert.rejects(lerResposta(new Response(JSON.stringify({ error: 'Sala não encontrada neste prédio.' }), { status: 400 })),
    { message: 'Sala não encontrada neste prédio.' });
});

test('corpo que não é JSON (413 da Vercel, 502 da plataforma) vira mensagem pelo status', async () => {
  await assert.rejects(lerResposta(new Response('Request Entity Too Large', { status: 413 })), /grande demais/);
  await assert.rejects(lerResposta(new Response('<html>Bad Gateway</html>', { status: 502 })), /servidor não respondeu/);
  await assert.rejects(lerResposta(new Response('', { status: 401 })), /sessão expirou/);
  await assert.rejects(lerResposta(new Response('', { status: 418 })), /Erro 418/);
});
