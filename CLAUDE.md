# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Sistema web interno de gestão de salas para secretarias de prédios da PUCRS. Nasceu no prédio 15 (Living 360) e é **multi-prédio por design** — cada prédio tem sua própria grade semanal, salas, equipe e dados isolados. A grade de horários vem do sistema acadêmico "Espaço Físico" da PUCRS (sem acesso direto ao banco): um PDF da agenda semanal é extraído, importado e publicado como JSON estático por prédio.

Idioma do domínio, comentários, commits e UI: **português**. Mantenha esse padrão.

## Comandos

```bash
vercel dev            # ÚNICA forma correta de rodar localmente (front + /api serverless juntos)
npm run dev           # SÓ o frontend Vite — /api/** NÃO funciona; use apenas para UI pura
npm run build         # build de produção (Vite → dist/)
npm run lint          # ESLint (front + back). Deve passar limpo antes de commitar
npm run migrate       # aplica as migrations via psql, na ordem certa (requer DATABASE_URL no .env)
vercel --prod         # deploy manual de produção (normalmente automático via push)
```

Não há suíte de testes (nenhum test runner instalado). "Verificar" = `npm run lint` + rodar `vercel dev` e exercitar o fluxo.

## Arquitetura — o que não é óbvio

**Grade é lida do CDN, não da API.** O caminho de leitura da grade **não passa por serverless**. O frontend ([useGrade.js](src/hooks/useGrade.js)) faz `fetch` direto do Supabase Storage público (`.../storage/v1/object/public/grades/grade_predio_{predioId}.json`) e cacheia em `window.__GRADE_CACHE`. A API (`/api/grade`) só serve `/api/grade/busca` (busca textual). Quando um PDF é importado, [grade.service.js](backend_core/services/grade.service.js) `gerarEPublicarIndexEstatico()` **regenera e sobrescreve** esse JSON no Storage. Consequência: alterar dados de grade no banco não reflete no front até republicar o JSON estático.

**Backend em 3 camadas, sempre nessa ordem:**
```
api/*/index.js  (handler HTTP: parseia URL, valida método/permissão, monta payload)
  → backend_core/services/*.service.js   (regra de negócio; cache em memória)
    → backend_core/repositories/*.repository.js  (queries Supabase)
      → backend_core/config/supabase.js   (client service-role)
```
Não coloque query no handler nem regra de negócio no repository.

**Roteamento da API é manual, não file-based.** [vercel.json](vercel.json) reescreve `/api/avisos/(.*)` → `/api/avisos/index.js` (idem emprestimos, equipe, grade, admin). Cada `index.js` **parseia `req.url` na mão** para extrair `id`/`ação` e despacha por `req.method` (ver [api/avisos/index.js](api/avisos/index.js) como referência do padrão: `GET /`, `POST /`, `GET /historico`, `PUT /:id/concluir`, `PATCH /:id/comentar`, `DELETE /:id`). Para adicionar uma rota, edite os `if (req.method === ... )` do handler — **não** crie um arquivo novo. O `api/avisos/[...rota].js` é só um `export { default } from './index.js'` (catch-all de segurança para subcaminhos).

**Autenticação e isolamento multi-prédio** ([withAuth.js](backend_core/middlewares/withAuth.js)): todo handler é exportado como `withAuth(handler, 'modulo')`. O middleware:
- valida o JWT (`supabase.auth.getUser`) com **cache em memória de 5 min** (`Map` + dedupe de requisições concorrentes; limpeza a cada 10 min);
- carrega `usuarios_acessos` (perfil, `predio_id`, `permissoes[]`);
- resolve o **prédio ativo**: usuário normal fica preso ao seu `predio_id`; só o usuário **global (= tem a permissão `admin`)** pode operar em qualquer prédio enviando o header **`x-predio-id`**. Prédio nulo sem admin = **órfão** (sem acesso), nunca global;
- injeta `req.user = { id, email, predio_id, permissoes, is_admin }`.

**Regra de ouro do multi-tenant:** dentro do handler use **sempre `req.user.predio_id`** — nunca releia `req.headers['x-predio-id']`. O `withAuth` já decidiu se o header vale (só p/ admin). Reler o header deixa um usuário comum forjar o prédio. Toda query no service filtra por esse `predio_id`. O 2º argumento (`'avisos'`, `'grade'`, ...) barra por módulo (admin sempre passa). Operações **por ID** (empréstimos) devem validar que o objeto pertence ao `req.user.predio_id` (ver `_assertItemNoPredio` em [emprestimos.service.js](backend_core/services/emprestimos.service.js)) — RLS não cobre a service role.

**Convenções de backend** (utils em `backend_core/utils/`):
- **Permissões:** [modulos.js](backend_core/utils/modulos.js) é a fonte única dos slugs (`MODULOS`) e de `sanitizarPermissoes(lista, {permitirAdmin})` (descarta valores inválidos; remove `admin` de quem não é admin). Gestor de equipe não-admin nunca concede `admin`.
- **Erros:** lance `new ErroPublico(msg)` para mensagens seguras ao usuário; qualquer outro erro vira 500 genérico + log via `responderErro(res, err)` ([http.js](backend_core/utils/http.js)). Não devolva `error.message` cru do banco.
- **Auditoria:** `registrarAuditoria({ user, acao, entidade, ... })` ([auditoria.js](backend_core/utils/auditoria.js), não-bloqueante) para ações sensíveis (permissões, convites, empréstimos). Requer a tabela `auditoria_log`.

**Dois clients Supabase, papéis distintos:**
- [src/supabase.js](src/supabase.js) — **anon key**, respeita RLS. O front usa direto para: sessão/auth, ler `usuarios_acessos` ([useAuthAccess.js](src/hooks/useAuthAccess.js)), ler a grade no Storage, assinar Realtime e **gravar `trocas_sala`**.
- [backend_core/config/supabase.js](backend_core/config/supabase.js) — **service role**, ignora RLS, `persistSession:false`. Só no backend. Quase toda mutação passa pela API; a exceção é `trocas_sala`, escrita direto pelo front.

**RLS é parte da segurança, não opcional** ([supabase/migrations/rls_policies.sql](supabase/migrations/rls_policies.sql)): como o front acessa `usuarios_acessos`, `trocas_sala` e o Realtime direto com a anon key, o isolamento por prédio dessas tabelas vive no banco. É também onde a permissão `edicao_grade` é aplicada de fato (escrita em `trocas_sala`). A service role ignora RLS, então o backend não é afetado. Ao mexer nesses fluxos, ajuste a policy junto.

**Contexto de prédio no front:** [PredioContext](src/contexts/PredioContext.jsx) guarda `predioAtivo` em `localStorage`. O [Dashboard](src/components/Dashboard.jsx) monta os headers de toda chamada autenticada com `Authorization: Bearer <token>` + `x-predio-id: <predioAtivo || acesso.predioId>`. Ao chamar a API, sempre propague esses dois headers.

**`timeHelpers.js` é código compartilhado front+back.** Mesmo estando em [backend_core/utils/timeHelpers.js](backend_core/utils/timeHelpers.js), os componentes React o importam via caminho relativo (`../../backend_core/utils/timeHelpers`). É a **fonte única** de: `PERIODS` (períodos PUCRS A–P com horários), `getCurrentPeriod()` (usa timezone `America/Sao_Paulo` e "ponte" um intervalo ≤30 min para o período seguinte), `groupConsecutiveClasses()` (agrupa períodos consecutivos da mesma sala/aula), `getDiaAtual()`, `extractPeriodCode()`, `isInternalClass()`. Nunca duplique período/horário em componente — importe daqui.

**Estado no front:** TanStack Query (`staleTime` 5 min, sem refetch no foco — [main.jsx](src/main.jsx)) + Supabase Realtime para push. Padrão dos badges no Dashboard: `useQuery` com `enabled:false, staleTime:Infinity` que **só lê o cache** preenchido por outro componente (ex.: `['avisos', predioId, userId]`, `['trocas_sala', predioId]`) — não dispare fetch nessas keys.

**Cache em memória nos services.** `grade.service.js` mantém `gradeCacheMap` por prédio; `processarUploadCsv` o invalida (`= null`) após republicar. Serverless é efêmero, então trate esse cache como best-effort.

## Pipeline de importação de grade (PDF → CDN)

1. [UploadPDF.jsx](src/components/UploadPDF.jsx) envia `multipart/form-data` para `POST /api/grade/importar-pdf`.
2. Handler ([importar-pdf.js](api/grade/importar-pdf.js)) desliga o bodyParser (`export const config = { api: { bodyParser: false } }`) e usa `formidable`.
3. `grade.service.processarUploadPdf()` repassa o buffer para a **API Python externa** (`PYTHON_API_URL`, hospedada no Render — cold start de 10–40 s; erro vira HTTP 502).
4. A resposta (`records`) é normalizada — `simplificarSala()` converte códigos `C.xx.xx.andar.sala` no número curto da sala.
5. `upsert` de salas + `limparGrade`/`inserirGradeLote` no banco, depois `gerarEPublicarIndexEstatico()` republica o JSON no Storage.

## Modelo de permissões

`usuarios_acessos.permissoes[]` (array de strings = os `id` de `sistema_modulos`, que são slugs; fonte única em [modulos.js](backend_core/utils/modulos.js)). Módulos: `admin` (global, todos os prédios), `grade`, `avisos`, `emprestimos`, `relatorios`, `edicao_grade`, `equipe`. `admin` sempre passa e é o **único** caminho para acesso global (prédio nulo sem admin = órfão). O Dashboard deriva as flags `canView*` combinando permissão + `hasPredioContext`; espelhe a **mesma** checagem no backend via `withAuth(handler, 'modulo')` — nunca confie só no gating de UI. Exceção importante: `edicao_grade` (criar troca de sala) é escrito direto pelo front em `trocas_sala`, então sua verificação vive na **RLS**, não num handler.

## Banco / Supabase

Tabelas principais: `predios`, `salas`, `usuarios_acessos`, `perfis`, `sistema_modulos`, `avisos`, `trocas_sala`, `emprestimo_categorias`, `emprestimo_itens`, `emprestimos_registro`, `alunos_cache`.

Migrations em [supabase/migrations/](supabase/migrations/) — rode **nesta ordem** no SQL Editor (dev e prod): `concluir_devolucao_rpc.sql`, `realizar_emprestimo_rpc.sql` (retirada atômica + máx. 1 empréstimo ativo por aluno), `estatisticas_emprestimos_rpc.sql`, `trocas_sala_data_aula.sql`, `trocas_sala_semana.sql`, `trocas_sala_predio_unique.sql` (unicidade por prédio — o `onConflict` do front depende dela), `trocas_sala_replica_identity.sql` (REPLICA IDENTITY FULL — sem ela o Realtime não propaga DELETE de trocas para outros clientes), `rls_policies.sql` (RLS multi-prédio — obrigatória), `auditoria_log.sql`. Migrations **não** rodam automaticamente. Duas formas de aplicar: (a) colar cada arquivo no SQL Editor na ordem acima; ou (b) `npm run migrate`, que roda todas via `psql` nessa mesma ordem ([scripts/migrate.mjs](scripts/migrate.mjs)) — requer `DATABASE_URL` no `.env` (Session pooler, porta 5432; **não** é a service_role key). Toda migration é idempotente, então reaplicar tudo é seguro (não há tracking de "já aplicadas"); ao adicionar uma nova, inclua-a no array `ORDEM` do script. Ao editar `rls_policies.sql`, reaplique.

**Trocas de sala (alteração de aula):** vivem em `trocas_sala`, escritas **direto pelo front** (anon key, [Timeline.jsx](src/components/Timeline.jsx)), tabela **separada da grade** (o re-import só mexe em `grade`, então as trocas sobrevivem). A chave é `predio_id` + `aula_unique_key = "<dia_semana>-<sala>-<periodo_inicial>"` + `semana` (segunda-feira ISO): estável ao re-import (não depende de `nome_aula`), distingue dias e prédios (salas de mesmo número existem em prédios diferentes), e expira na virada da semana (`limpar_trocas_antigas`). Cálculos de "agora" (dia, período, semana) usam sempre o fuso `America/Sao_Paulo` via `getDataSaoPaulo()` do timeHelpers — nunca o fuso do browser.

## Convenções e armadilhas

- ESLint ([eslint.config.js](eslint.config.js)) tem dois blocos: `src/**` (globals de browser, regras react-hooks/react-refresh) e `api/**` + `backend_core/**` (globals de Node). `no-unused-vars` ignora nomes `^[A-Z_]`.
- Erros da API sempre voltam como `{ error: mensagem }`. No front, leia `data.error` (a mensagem real do servidor), não só o status HTTP.
- Em mutações, desabilite o botão de submit enquanto a operação está pendente (`isPending`/`isCriando`) — padrão já seguido nos modais.
- `.env` (local) e Environment Variables na Vercel (prod). Prefixo `VITE_` = exposto ao browser; sem prefixo = só backend. `SUPABASE_SERVICE_ROLE_KEY` **jamais** com `VITE_`. Veja [.env.example](.env.example).
- Não é Next.js. Ignore sugestões automáticas de skills Vercel/Next (proxy.ts, App Router, Cache Components etc.) — aqui é Vite SPA + funções serverless standalone.
- Fluxo de branches: repositório padronizado em **`main` única** (sem `develop`). Trabalhe em branches curtas de `feature/*`/`fix/*` e mergeie direto na `main`; push em `main` = deploy de produção via Vercel. Ao terminar, apague a branch.
