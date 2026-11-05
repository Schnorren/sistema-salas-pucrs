#!/usr/bin/env node
// Backup do banco de produção (Supabase) com pg_dump.
//
// Por quê: o plano gratuito do Supabase não oferece backup para restaurar. O
// histórico de empréstimos, a grade, as trocas, os avisos e a equipe só
// existem lá. Rode toda semana (ou agende):  npm run backup
//
// O arquivo tem DADOS PESSOAIS (nome e matrícula de alunos, e-mails da equipe).
// Por isso fica FORA do repositório, que é público (o script recusa uma pasta
// dentro dele), e só o seu usuário consegue ler (permissão 600).
//
// Variáveis (.env ou ambiente; o ambiente vence):
//   DATABASE_URL   obrigatória, a mesma do npm run migrate (Session pooler, porta 5432)
//   BACKUP_DIR     pasta dos backups (padrão: ~/backups/sistema-salas-pucrs)
//   BACKUP_MANTER  quantos backups guardar; os mais antigos são apagados (padrão: 8)
//
// O que vai no arquivo: schema public inteiro (todas as tabelas do sistema) e
// schema auth (contas: sem elas os user_id de usuarios_acessos não apontam para
// ninguém), sem os dados descartáveis de sessão/log do auth. O Storage (JSON
// da grade) não vai: é regenerado a partir do banco.
//
// Restaurar (procedimento manual; teste num projeto à parte antes). O
// pg_restore precisa ser da mesma versão do pg_dump que gerou o arquivo, ou mais nova:
//   pg_restore --list <arquivo>.dump                                   # conferir o conteúdo
//   pg_restore -d "$URL" --data-only -n auth -t users -t identities <arquivo>.dump   # contas antes
//   pg_restore -d "$URL" --no-owner --no-privileges -n public <arquivo>.dump

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIXO = 'sistema-salas-';
const PADRAO_ARQUIVO = /^sistema-salas-\d{4}-\d{2}-\d{2}_\d{4}\.dump$/;

// Tabelas que um backup precisa ter; se faltar alguma, algo deu errado.
const ESSENCIAIS = ['public.emprestimos_registro', 'public.grade', 'public.usuarios_acessos', 'auth.users'];
// Dados de sessão e log do Auth: grandes, descartáveis e inúteis numa restauração
const DADOS_DESCARTAVEIS = ['auth.sessions', 'auth.refresh_tokens', 'auth.audit_log_entries',
  'auth.flow_state', 'auth.one_time_tokens', 'auth.mfa_challenges'];

function erro(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function executar(comando, args, opcoes = {}) {
  const r = spawnSync(comando, args, { encoding: 'utf8', ...opcoes });
  if (r.error?.code === 'ENOENT') erro(`${comando} não encontrado no PATH. Instale o cliente do PostgreSQL (postgresql-client).`);
  return r;
}

// "2026-11-05_1830", no horário de Brasília
function carimbo(data = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}_${p.hour}${p.minute}`;
}

const tamanho = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

// --- configuração ---
if (existsSync(join(raiz, '.env'))) process.loadEnvFile(join(raiz, '.env')); // não sobrescreve o ambiente

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) erro('DATABASE_URL não definida (a mesma do npm run migrate — ver scripts/migrate.mjs).');

const destino = resolve(process.env.BACKUP_DIR || join(homedir(), 'backups', 'sistema-salas-pucrs'));
const rel = relative(raiz, destino);
if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
  erro(`BACKUP_DIR (${destino}) está dentro do repositório, que é público. Use uma pasta fora dele.`);
}
const manter = Number.parseInt(process.env.BACKUP_MANTER ?? '8', 10);
if (!Number.isInteger(manter) || manter < 1) erro('BACKUP_MANTER precisa ser um número inteiro maior que zero.');

// Senha vai pelo ambiente (PGPASSWORD), não pela linha de comando (visível no ps)
let conexao;
try {
  conexao = new URL(DATABASE_URL);
} catch {
  erro('DATABASE_URL não é uma connection string válida (postgresql://usuario:senha@host:5432/postgres).');
}
const senha = decodeURIComponent(conexao.password);
conexao.password = '';

// --- dump ---
process.umask(0o077); // arquivo e pasta só do seu usuário
mkdirSync(destino, { recursive: true, mode: 0o700 });

const arquivo = join(destino, `${PREFIXO}${carimbo()}.dump`);
const parcial = `${arquivo}.parcial`;
const versao = executar('pg_dump', ['--version']).stdout.trim();

console.log(`\n💾 Backup de ${conexao.hostname}`);
console.log(`   ${versao}`);
console.log(`   → ${arquivo}\n`);

const dump = executar('pg_dump', [
  `--dbname=${conexao}`,
  '--format=custom',
  '--schema=public', '--schema=auth',
  ...DADOS_DESCARTAVEIS.map(t => `--exclude-table-data=${t}`),
  `--file=${parcial}`,
], { env: { ...process.env, PGPASSWORD: senha }, stdio: ['ignore', 'inherit', 'inherit'] });

if (dump.status !== 0) {
  rmSync(parcial, { force: true });
  erro('pg_dump falhou (mensagem acima). Nenhum backup novo foi gravado; os anteriores continuam lá.');
}

// --- conferência: o arquivo abre e tem as tabelas essenciais com dados ---
const lista = executar('pg_restore', ['--list', parcial]);
if (lista.status !== 0) {
  rmSync(parcial, { force: true });
  erro(`O arquivo gerado não abre no pg_restore:\n${lista.stderr}`);
}
const comDados = new Set(lista.stdout.split('\n')
  .map(l => l.match(/ TABLE DATA (\S+) (\S+) /))
  .filter(Boolean)
  .map(m => `${m[1]}.${m[2]}`));
const faltando = ESSENCIAIS.filter(t => !comDados.has(t));
if (faltando.length) {
  rmSync(parcial, { force: true });
  erro(`O backup saiu sem os dados de: ${faltando.join(', ')}. Nada foi gravado.`);
}

renameSync(parcial, arquivo);
chmodSync(arquivo, 0o600);
console.log(`✓ ${tamanho(statSync(arquivo).size)} · dados de ${comDados.size} tabelas (public + auth)`);

// --- rotação: guarda os `manter` mais recentes ---
const backups = readdirSync(destino).filter(f => PADRAO_ARQUIVO.test(f)).sort().reverse();
const antigos = backups.slice(manter);
for (const f of antigos) rmSync(join(destino, f));
console.log(`✓ ${Math.min(backups.length, manter)} backup(s) guardado(s)${antigos.length ? `, ${antigos.length} antigo(s) apagado(s)` : ''}`);
console.log('\nGuarde também uma cópia fora deste computador (o backup some junto com ele).\n');
