#!/usr/bin/env node
// Auditoria de segurança do banco (SOMENTE LEITURA) — `npm run auditar:banco`.
//
// Confere no catálogo do Postgres o que nenhum teste do repositório pega:
// objetos criados à mão no painel do Supabase. Foi assim que vazaram dados duas
// vezes: `estatisticas_emprestimos` (SECURITY DEFINER executável pela anon key,
// até 2026-11-05) e `vw_equipe_predio` (view com auth.users legível pela anon
// key, até 2026-11-05). Rode depois de mexer no banco pelo painel e antes de
// publicar uma migration nova.
//
// Falha (exit 1) quando encontra:
//   - view do public legível por anon/authenticated (view não passa pela RLS)
//   - função SECURITY DEFINER executável por anon, ou sem search_path fixo
//   - tabela do public sem RLS
//   - policy de Storage que deixa anon/authenticated gravar
// Avisa (sem falhar) sobre: SECURITY DEFINER executável por authenticated fora
// da lista conhecida, policy liberada para anon/public e cadastro público do
// Auth ligado (o sistema é só por convite).
//
// Requer psql e DATABASE_URL (Session pooler), como o `npm run migrate`.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function carregarEnv() {
  const caminho = join(raiz, '.env');
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || process.env[m[1]] !== undefined) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    process.env[m[1]] = valor;
  }
}
carregarEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\n✗ DATABASE_URL não definida (mesma do npm run migrate — Session pooler).\n');
  process.exit(1);
}

// SECURITY DEFINER que o front chama com sessão (authenticated) de propósito:
// helpers das policies de RLS e a limpeza de trocas da Timeline (CLAUDE.md).
const DEFINER_AUTHENTICATED_ESPERADO = new Set([
  'app_is_admin', 'app_predio_id', 'app_has_modulo', 'app_categoria_predio',
  'app_item_predio', 'app_tem_ponto', 'limpar_trocas_antigas',
]);

// Cada consulta devolve linhas "a|b|c" (psql -At -F '|')
const CONSULTAS = {
  views: `
    select c.relname,
           has_table_privilege('anon', c.oid, 'select'),
           has_table_privilege('authenticated', c.oid, 'select')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')`,
  definer: `
    select p.proname,
           pg_get_function_identity_arguments(p.oid),
           has_function_privilege('anon', p.oid, 'execute'),
           has_function_privilege('authenticated', p.oid, 'execute'),
           coalesce(array_to_string(p.proconfig, ','), '')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)`,
  semRls: `
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
  policiesAbertas: `
    select tablename, policyname, cmd, roles::text
      from pg_policies
     where schemaname = 'public' and (roles && array['anon', 'public']::name[])`,
  storageEscrita: `
    select policyname, cmd, roles::text
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and (roles && array['anon', 'authenticated', 'public']::name[])`,
};

function consultar(sql) {
  const saida = execFileSync('psql', [DATABASE_URL, '-X', '-q', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1',
    '-c', 'begin read only', '-c', sql, '-c', 'rollback'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return saida.split('\n').map(l => l.trim()).filter(l => l && l !== 'BEGIN' && l !== 'ROLLBACK').map(l => l.split('|'));
}

const falhas = [];
const avisos = [];

try {
  execFileSync('psql', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('\n✗ psql não encontrado no PATH (postgresql-client).\n');
  process.exit(1);
}

const host = (DATABASE_URL.match(/@([^:/?]+)/) || [])[1] || '(desconhecido)';
console.log(`\n🔎 Auditoria de segurança do banco (somente leitura) — ${host}\n`);

for (const [view, anon, auth] of consultar(CONSULTAS.views)) {
  if (anon === 't' || auth === 't') {
    falhas.push(`view ${view} legível por ${[anon === 't' && 'anon', auth === 't' && 'authenticated'].filter(Boolean).join(' e ')} — view não passa pela RLS: revoke all on table ${view} from public, anon, authenticated`);
  }
}

for (const [nome, args, anon, auth, config] of consultar(CONSULTAS.definer)) {
  const assinatura = `${nome}(${args})`;
  if (anon === 't') falhas.push(`SECURITY DEFINER ${assinatura} executável pela anon key — revoke all on function ... from public, anon`);
  if (!/search_path=/.test(config)) falhas.push(`SECURITY DEFINER ${assinatura} sem search_path fixo — set search_path = public`);
  if (auth === 't' && !DEFINER_AUTHENTICATED_ESPERADO.has(nome)) {
    avisos.push(`SECURITY DEFINER ${assinatura} executável por qualquer usuário logado (authenticated) — confirme que é de propósito`);
  }
}

for (const [tabela] of consultar(CONSULTAS.semRls)) {
  falhas.push(`tabela ${tabela} sem RLS — alter table ${tabela} enable row level security`);
}

for (const [tabela, policy, cmd, roles] of consultar(CONSULTAS.policiesAbertas)) {
  avisos.push(`policy "${policy}" (${cmd}) em ${tabela} vale para ${roles} — o projeto usa só "to authenticated"`);
}

for (const [policy, cmd, roles] of consultar(CONSULTAS.storageEscrita)) {
  falhas.push(`Storage: policy "${policy}" (${cmd}) deixa ${roles} gravar — só a API (service role) publica o JSON da grade`);
}

// Cadastro público do Auth (endpoint público; só lê configuração)
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (url && anonKey) {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(15000) });
    const cfg = await res.json();
    if (cfg?.disable_signup === false) {
      avisos.push('Auth: cadastro público LIGADO — qualquer um cria conta com a anon key (e gasta a cota de e-mail dos convites). Desligue em Authentication → Sign In / Providers → "Allow new users to sign up".');
    }
  } catch (e) {
    avisos.push(`Auth: não foi possível ler /auth/v1/settings (${e.message})`);
  }
}

for (const f of falhas) console.log(`  ✗ ${f}`);
for (const a of avisos) console.log(`  ⚠ ${a}`);
if (!falhas.length && !avisos.length) console.log('  ✓ nada encontrado');

console.log(`\n${falhas.length} falha(s), ${avisos.length} aviso(s).\n`);
process.exit(falhas.length ? 1 : 0);
