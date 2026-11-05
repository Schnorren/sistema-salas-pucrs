// Importação da grade e leitura paginada, com Supabase falso (sem rede).
// Regressão de 2026-11-05: PDF sem aulas não apaga nada; a troca é atômica
// (RPC grade_substituir); leitura passa de 1000 linhas; sem prédio não apaga.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom, silenciarConsole } from './supabaseFalso.js';

const { default: gradeRepository } = await import('../../backend_core/repositories/grade.repository.js');
const { default: gradeService } = await import('../../backend_core/services/grade.service.js');

const P = 'p15';
let salas;
let grade;
let log;

beforeEach(() => {
  salas = [{ id: 's205', numero: '205', status: 'Ativa', andar: '2' }, { id: 's301', numero: '301', status: 'Ativa', andar: '3' }];
  grade = [
    { id: 'g1', sala_id: 's205', dia_semana: 'Segunda', periodo: 'A', nome_aula: 'Cálculo', tipo: 'Regular' },
    { id: 'g2', sala_id: 's301', dia_semana: 'Terça', periodo: 'J', nome_aula: 'Física', tipo: 'Regular' },
  ];
  log = [];
  const comSala = (g) => ({ ...g, salas: salas.find((s) => s.id === g.sala_id), disciplinas: null });
  supabase.from = fakeFrom((q) => {
    if (q.acao === 'upsert' && q.tabela === 'salas') {
      for (const l of q.payload) if (!salas.some((s) => s.numero === l.numero)) salas.push({ id: `s${l.numero}`, numero: l.numero, status: l.status });
      return { error: null };
    }
    if (q.acao === 'insert' && q.tabela === 'auditoria_log') { log.push(['auditoria', q.payload]); return { error: null }; }
    if (q.acao === 'delete') { log.push(['delete', q.tabela, q.filtros]); return { error: null }; }
    if (q.tabela === 'grade' && q.range) return { data: grade.map(comSala).slice(q.range[0], q.range[1] + 1), error: null };
    if (q.tabela === 'salas') return { data: salas, error: null };
    return { data: [], error: null };
  });
  supabase.rpc = async (nome, args) => {
    log.push(['rpc', nome, args.p_linhas.length]);
    grade = args.p_linhas.map((l, i) => ({ id: `n${i}`, ...l }));
    return { data: args.p_linhas.length, error: null };
  };
  supabase.storage.from = () => ({
    upload: async (nome, json) => { log.push(['upload', nome, JSON.parse(json).grade.length]); return { error: null }; },
  });
});

test('PDF sem aulas reconhecíveis → 422 e nenhuma escrita (antes apagava a grade)', async () => {
  await assert.rejects(gradeService.processarUploadCsv([], P), (e) => e.status === 422);
  await assert.rejects(gradeService.processarUploadCsv([{ Sala: '205' }], P), (e) => e.status === 422);
  await assert.rejects(gradeService.processarUploadCsv(undefined, P), (e) => e.status === 502);
  assert.deepEqual(log, []);
});

test('importação: sala nova pendente, troca pela RPC, publica, audita e resume a diferença', async (t) => {
  silenciarConsole(t);
  const r = await gradeService.processarUploadCsv([
    { Sala: '205', Dia: 'Segunda', Periodo: 'A (08:00)', Nome_da_Aula: 'Cálculo' },
    { Sala: 'C.15.01.04.12', Dia: 'Quarta', Periodo: 'C', Nome_da_Aula: 'Programação' }, // → sala 412
    { Sala: '205', Dia: '', Periodo: 'B', Nome_da_Aula: 'linha incompleta' },
  ], P, { id: 'u1', email: 'x@pucrs.br' });

  assert.equal(r.registrosInseridos, 2);
  assert.deepEqual([r.comparacao.novos, r.comparacao.removidos, r.comparacao.alterados], [1, 1, 0]);
  assert.deepEqual(r.comparacao.salasAfetadas, ['301', '412']);
  assert.deepEqual(r.salasParaDecidir.map((s) => s.numero), ['412']);
  assert.deepEqual(log.find((l) => l[0] === 'rpc'), ['rpc', 'grade_substituir', 2]);
  assert.ok(log.some((l) => l[0] === 'upload'), 'publicou o JSON');
  assert.ok(!log.some((l) => l[0] === 'delete' && l[1] === 'grade'), 'sem DELETE solto: a troca é pela RPC');
  const auditoria = log.find((l) => l[0] === 'auditoria')[1];
  assert.equal(auditoria.acao, 'grade.importar');
  assert.equal(auditoria.detalhes.novos, 1);
});

test('reimportar a mesma agenda → "nenhuma mudança"', async () => {
  const linhas = [
    { Sala: '205', Dia: 'Segunda', Periodo: 'A', Nome_da_Aula: 'Cálculo' },
    { Sala: '301', Dia: 'Terça', Periodo: 'J', Nome_da_Aula: 'Física' },
  ];
  const r = await gradeService.processarUploadCsv(linhas, P);
  assert.equal(r.comparacao.iguais, true);
});

test('publicação que falha vira erro 502 (antes a tela dizia sucesso)', async (t) => {
  silenciarConsole(t);
  supabase.storage.from = () => ({ upload: async () => ({ error: { message: 'storage fora' } }) });
  await assert.rejects(
    gradeService.processarUploadCsv([{ Sala: '205', Dia: 'Segunda', Periodo: 'A', Nome_da_Aula: 'Cálculo' }], P),
    (e) => e.status === 502,
  );
});

test('leitura paginada passa de 1000 linhas (o PostgREST corta sem erro)', async () => {
  const TOTAL = 2345;
  const linhas = Array.from({ length: TOTAL }, (_, i) => ({ id: String(i).padStart(5, '0') }));
  let requisicoes = 0;
  supabase.from = fakeFrom((q) => {
    requisicoes++;
    return { data: linhas.slice(q.range[0], Math.min(q.range[1] + 1, q.range[0] + 1000)), error: null };
  });
  const lidas = await gradeRepository.buscarGradeCompleta(P);
  assert.equal(lidas.length, TOTAL);
  assert.equal(new Set(lidas.map((l) => l.id)).size, TOTAL);
  assert.equal(requisicoes, 3);
});

test('limparGrade sem prédio não apaga nada (antes apagava todos os prédios)', async () => {
  await assert.rejects(gradeRepository.limparGrade(null), /prédio obrigatório/);
  assert.equal(log.filter((l) => l[0] === 'delete').length, 0);
});

test('RPC ausente no banco (deploy antes da migration) cai no delete+insert antigo', async (t) => {
  silenciarConsole(t);
  supabase.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
  const n = await gradeRepository.substituirGrade(P, [{ sala_id: 's205', dia_semana: 'Segunda', periodo: 'A', nome_aula: 'X', tipo: 'Regular' }]);
  assert.equal(n, 1);
  assert.ok(log.some((l) => l[0] === 'delete' && l[1] === 'grade' && l[2].predio_id === P));
});
