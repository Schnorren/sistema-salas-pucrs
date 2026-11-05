// Supabase falso para testar handlers e services sem rede (tests/api/*).
//
// O client real (backend_core/config/supabase.js) é um singleton: os testes
// trocam os métodos dele (from, rpc, storage.from, auth.*) por versões em
// memória. Importe ESTE arquivo antes de qualquer módulo do backend — ele
// define as variáveis de ambiente que o createClient exige.
process.env.SUPABASE_URL ??= 'https://teste.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'chave-de-teste';

const { default: supabase } = await import('../../backend_core/config/supabase.js');
export { supabase };

// Query builder encadeável do supabase-js: registra a consulta e, ao ser
// aguardado (then), devolve resolver(consulta).
export function fakeFrom(resolver) {
  return (tabela) => {
    const q = { tabela, acao: 'select', filtros: {} };
    const b = {
      select() { return b; }, order() { return b; }, in() { return b; }, is() { return b; }, or() { return b; }, not() { return b; },
      limit() { return b; },
      eq(coluna, valor) { q.filtros[coluna] = valor; return b; },
      range(inicio, fim) { q.range = [inicio, fim]; return b; },
      update(payload) { q.acao = 'update'; q.payload = payload; return b; },
      delete() { q.acao = 'delete'; return b; },
      upsert(payload) { q.acao = 'upsert'; q.payload = payload; return b; },
      insert(payload) { q.acao = 'insert'; q.payload = payload; return b; },
      single() { q.single = true; return b; },
      maybeSingle() { q.maybe = true; return b; },
      then(ok, erro) { return Promise.resolve().then(() => resolver(q)).then(ok, erro); },
    };
    return b;
  };
}

// req/res mínimos do runtime Node da Vercel
export function chamar(handler, { metodo = 'GET', url = '/api/x', headers = {}, body, query = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headersSent: false, cabecalhos: {},
      setHeader(k, v) { this.cabecalhos[k] = v; },
      status(codigo) { this.statusCode = codigo; return this; },
      json(dados) { this.headersSent = true; resolve({ status: this.statusCode, body: dados }); return this; },
      end() { this.headersSent = true; resolve({ status: this.statusCode, body: null }); return this; },
    };
    Promise.resolve(handler({ method: metodo, url, headers, body, query }, res))
      .catch((e) => resolve({ status: 'EXCEÇÃO', body: e?.message }));
  });
}

// Logs esperados de erro (responderErro, auditoria) não poluem a saída do teste
export function silenciarConsole(t) {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
}
