// Upload de PDF (backend_core/utils/uploadPdf.js): limite de tamanho,
// assinatura %PDF- e limpeza do arquivo temporário — com multipart de verdade
// passando pelo formidable.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { promises as fsp } from 'node:fs';
import { lerPdfDoFormulario, pareceUmPdf } from '../backend_core/utils/uploadPdf.js';
import { TAMANHO_MAX_PDF } from '../backend_core/utils/limites.js';

function requisicaoMultipart(conteudo, { campo = 'arquivo', nome = 'agenda.pdf' } = {}) {
  const boundary = '----teste123';
  const partes = conteudo === null ? [] : [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nome}"\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo),
    Buffer.from('\r\n'),
  ];
  const corpo = Buffer.concat([...partes, Buffer.from(`--${boundary}--\r\n`)]);
  const req = Readable.from([corpo]);
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(corpo.length) };
  return req;
}

test('pareceUmPdf: assinatura nos primeiros 1024 bytes', () => {
  assert.equal(pareceUmPdf(Buffer.from('%PDF-1.7\n...')), true);
  assert.equal(pareceUmPdf(Buffer.concat([Buffer.alloc(100, 0x20), Buffer.from('%PDF-1.4')])), true);
  assert.equal(pareceUmPdf(Buffer.from('<html>não sou pdf</html>')), false);
  assert.equal(pareceUmPdf(Buffer.concat([Buffer.alloc(2000, 0x20), Buffer.from('%PDF-1.4')])), false);
  assert.equal(pareceUmPdf('texto'), false);
});

test('PDF válido volta como Buffer e o temporário é apagado', async (t) => {
  const unlink = t.mock.method(fsp, 'unlink');
  const buffer = await lerPdfDoFormulario(requisicaoMultipart('%PDF-1.7 conteúdo de teste'));
  assert.ok(Buffer.isBuffer(buffer));
  assert.match(buffer.toString(), /^%PDF-1\.7/);
  assert.equal(unlink.mock.callCount(), 1);
});

test('aceita o campo "file" (nome antigo)', async () => {
  const buffer = await lerPdfDoFormulario(requisicaoMultipart('%PDF-1.7 x', { campo: 'file' }));
  assert.ok(Buffer.isBuffer(buffer));
});

test('arquivo que não é PDF → 415, e o temporário é apagado mesmo assim', async (t) => {
  const unlink = t.mock.method(fsp, 'unlink');
  await assert.rejects(lerPdfDoFormulario(requisicaoMultipart('MZ executável renomeado', { nome: 'virus.pdf' })), { status: 415 });
  assert.equal(unlink.mock.callCount(), 1);
});

test('acima do limite → 413 com mensagem em português', async () => {
  const grande = Buffer.concat([Buffer.from('%PDF-1.7 '), Buffer.alloc(TAMANHO_MAX_PDF + 1024, 0x41)]);
  await assert.rejects(lerPdfDoFormulario(requisicaoMultipart(grande)), (err) => err.status === 413 && /limite de 4,4 MB/.test(err.message));
});

test('sem arquivo → 400', async () => {
  await assert.rejects(lerPdfDoFormulario(requisicaoMultipart(null)), { status: 400 });
});

mock.restoreAll();
