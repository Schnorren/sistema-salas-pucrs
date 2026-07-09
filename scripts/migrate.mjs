#!/usr/bin/env node
// Aplica as migrations SQL do Supabase via psql, na ordem documentada no
// CLAUDE.md. Todas as migrations são idempotentes (IF NOT EXISTS / DROP IF
// EXISTS), então reaplicar tudo é seguro — não há tracking de "já aplicadas".
//
// Uso:
//   npm run migrate            aplica todas as migrations em ordem
//   npm run migrate -- --dry-run   só lista o que rodaria (não executa)
//
// Requer:
//   - psql no PATH
//   - DATABASE_URL no ambiente ou no .env (Session pooler do Supabase:
//     Settings → Database → Connection string → "Session pooler", porta 5432).
//     A SERVICE_ROLE_KEY NÃO serve aqui — é chave da API REST, não do Postgres.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(__dirname, '..');
const dirMigrations = join(raiz, 'supabase', 'migrations');

// Ordem importa: RPCs e tabelas antes das constraints/RLS que dependem delas.
// Mantida em sincronia com a seção "Banco / Supabase" do CLAUDE.md.
const ORDEM = [
  'concluir_devolucao_rpc.sql',
  'realizar_emprestimo_rpc.sql',
  'estatisticas_emprestimos_rpc.sql',
  'trocas_sala_data_aula.sql',
  'trocas_sala_semana.sql',
  'trocas_sala_predio_unique.sql',
  'trocas_sala_replica_identity.sql',
  'rls_policies.sql',
  'auditoria_log.sql',
];

const dryRun = process.argv.includes('--dry-run');

// --- .env: parser mínimo (só o necessário; process.env tem precedência) ---
function carregarEnv() {
  const caminho = join(raiz, '.env');
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const chave = m[1];
    if (process.env[chave] !== undefined) continue; // ambiente vence o .env
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[chave] = valor;
  }
}

function erro(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

carregarEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  erro('DATABASE_URL não definida. Adicione ao .env a connection string do ' +
       'Session pooler (Supabase → Settings → Database). Ex.:\n' +
       '  DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<region>.pooler.supabase.com:5432/postgres');
}

// psql instalado?
try {
  execFileSync('psql', ['--version'], { stdio: 'ignore' });
} catch {
  erro('psql não encontrado no PATH. Instale o cliente do PostgreSQL (postgresql-client).');
}

// Migrations listadas existem?
const faltando = ORDEM.filter(f => !existsSync(join(dirMigrations, f)));
if (faltando.length) {
  erro(`Migrations não encontradas em supabase/migrations/:\n  ${faltando.join('\n  ')}`);
}

// Aviso: .sql no diretório que NÃO estão na ORDEM (nova migration não registrada aqui)
try {
  const { readdirSync } = await import('node:fs');
  const todas = readdirSync(dirMigrations).filter(f => f.endsWith('.sql'));
  const foraDaOrdem = todas.filter(f => !ORDEM.includes(f));
  if (foraDaOrdem.length) {
    console.warn(`⚠ .sql presentes mas fora de ORDEM (não serão aplicados): ${foraDaOrdem.join(', ')}`);
    console.warn('  Adicione-os ao array ORDEM em scripts/migrate.mjs na posição correta.\n');
  }
} catch { /* diretório já validado acima */ }

// Alvo (host mascarado só pra confirmar o destino sem vazar a senha)
const host = (DATABASE_URL.match(/@([^:/?]+)/) || [])[1] || '(desconhecido)';
console.log(`\n🎯 Alvo: ${host}`);
console.log(`📦 ${ORDEM.length} migration(s), na ordem do CLAUDE.md${dryRun ? '  [DRY-RUN]' : ''}\n`);

for (const arquivo of ORDEM) {
  const caminho = join(dirMigrations, arquivo);
  if (dryRun) {
    console.log(`  • ${arquivo}`);
    continue;
  }
  process.stdout.write(`→ ${arquivo} ... `);
  try {
    execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-f', caminho], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    console.log('✓');
  } catch {
    console.error(`\n\n✗ Falhou em ${arquivo}. Nada além deste ponto foi aplicado.`);
    process.exit(1);
  }
}

console.log(dryRun ? '\nDry-run concluído.\n' : '\n✅ Todas as migrations aplicadas.\n');
