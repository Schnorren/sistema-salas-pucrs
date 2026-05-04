# Sistema de Salas PUCRS

Sistema interno de gestão de salas e recursos acadêmicos para secretarias de prédios da PUCRS. Desenvolvido para substituir planilhas, whatsapp e processos manuais com uma plataforma web centralizada, em tempo real e multi-prédio.

---

## O problema que resolve

As secretarias dos prédios da PUCRS enfrentavam diariamente:

- **Nenhuma visibilidade em tempo real** de quais salas estavam ocupadas ou livres em cada período
- **Avisos de chave e intercorrências gerenciados por WhatsApp**, sem histórico centralizado nem rastreabilidade
- **Empréstimos de equipamentos registrados em papel**, sem controle de quem retirou, quando devolveu ou o que estava disponível
- **Trocas de sala comunicadas verbalmente**, sem cartaz padronizado nem registro para consulta posterior
- **Relatórios de ocupação inexistentes**, impedindo decisões baseadas em dados sobre uso dos espaços

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Planta ao Vivo** | Mapa de salas por andar com status de ocupação em tempo real por período PUCRS |
| **Linha do Tempo** | Grid sala × período para visualizar a grade completa do dia, com modo "Ao vivo" que atualiza automaticamente |
| **Próximas Aulas** | Aulas em andamento, próximas e restantes do dia com contagem regressiva |
| **Mural de Avisos** | Avisos de chave e intercorrências com prioridade, histórico, comentários e notificações em tempo real |
| **Empréstimos** | Wizard de retirada/devolução de itens com consulta de matrícula, realtime e relatórios |
| **Salas Livres** | Lista de salas disponíveis por período para o dia selecionado |
| **Heatmap Semanal** | Mapa de calor de ocupação por sala e dia da semana |
| **Histórico de Aulas** | BI de ocupação histórica via upload de PDF da agenda semanal |
| **Troca de Sala** | Registro de alteração de sala com cartaz A4 colorido para impressão, auto-preenchido por código de disciplina |
| **Gestão de Equipe** | Convite, edição de permissões e revogação de acesso de membros por prédio |
| **Painel Admin** | Gerenciamento global de usuários, prédios, perfis e permissões |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite, TanStack Query, Recharts, Lucide |
| Backend | Funções serverless Vercel (Node.js ESM) |
| Banco de dados | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Deploy | Vercel (front + back no mesmo repositório) |
| PDF | jsPDF + html2canvas |

---

## Arquitetura

```
┌─────────────────────────────────────────────┐
│                  VERCEL                     │
│                                             │
│   ┌─────────────┐    ┌───────────────────┐  │
│   │  React SPA  │    │  API Serverless   │  │
│   │  (Vite)     │    │  /api/**          │  │
│   └──────┬──────┘    └────────┬──────────┘  │
│          │                   │             │
└──────────┼───────────────────┼─────────────┘
           │                   │
           ▼                   ▼
┌─────────────────────────────────────────────┐
│                SUPABASE                     │
│                                             │
│  PostgreSQL │ Auth │ Storage │ Realtime     │
│                                             │
│  grades/grade_predio_{id}.json  ◄── CDN     │
└─────────────────────────────────────────────┘
```

**Grade estática no CDN:** A grade de cada prédio é publicada como JSON no Supabase Storage e lida diretamente pelo frontend — sem custo de serverless para leitura, com cache em `window.__GRADE_CACHE`.

**Backend em camadas:**
```
api/           → Handlers HTTP (autenticação, roteamento, resposta)
backend_core/
  middlewares/ → withAuth (JWT → permissões via cache de 5min)
  services/    → Regras de negócio
  repositories/→ Queries ao banco
  config/      → Cliente Supabase service role
  utils/       → timeHelpers (períodos PUCRS, horários)
```

---

## Períodos PUCRS

O sistema usa o sistema de períodos da PUCRS (A–P):

| Código | Início | Fim |
|---|---|---|
| A | 08:00 | 08:45 |
| B | 08:45 | 09:30 |
| C | 09:45 | 10:30 |
| D | 10:30 | 11:15 |
| E | 11:30 | 12:15 |
| E1 | 12:15 | 13:00 |
| F | 14:00 | 14:45 |
| G | 14:45 | 15:30 |
| H | 15:45 | 16:30 |
| I | 16:30 | 17:15 |
| J | 17:30 | 18:15 |
| K | 18:15 | 19:00 |
| L | 19:15 | 20:00 |
| M | 20:00 | 20:45 |
| N | 21:00 | 21:45 |
| P | 21:45 | 22:30 |

---

## Modelo de Permissões

Cada usuário tem um registro em `usuarios_acessos` com:

| Campo | Descrição |
|---|---|
| `user_id` | ID do usuário no Supabase Auth |
| `predio_id` | Prédio ao qual pertence (null = admin global) |
| `permissoes[]` | Array de módulos liberados |
| `perfil_id` | Cargo/função (referência à tabela `perfis`) |

**Permissões disponíveis:**

| Permissão | Acesso |
|---|---|
| `admin` | Painel administrativo global, todos os prédios |
| `grade` | Visualização e upload de grade |
| `avisos` | Mural de avisos e chaves |
| `emprestimos` | Módulo de empréstimos de equipamentos |
| `relatorios` | Relatórios e estatísticas de empréstimos |
| `edicao_grade` | Registro de trocas de sala |
| `equipe` | Gestão de equipe do prédio |

---

## Variáveis de ambiente

Crie um arquivo `.env` na raiz com:

```env
# Supabase — projeto de desenvolvimento
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key

# URL base da API (Vercel dev local ou produção)
VITE_API_URL=http://localhost:3000

# Supabase service role (usado apenas no backend/serverless)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# API Python para extração de PDF (opcional — Render.com)
PYTHON_API_URL=https://seu-extrator.onrender.com
```

> ⚠️ **Nunca commite o `.env`**. O `.gitignore` já o exclui.

Para produção, configure as mesmas variáveis no painel da Vercel em **Settings → Environment Variables**, usando as credenciais do projeto Supabase de produção.

---

## Banco de dados (Supabase)

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `predios` | Cadastro de prédios |
| `salas` | Salas de cada prédio |
| `usuarios_acessos` | Permissões por usuário/prédio |
| `perfis` | Cargos/funções |
| `sistema_modulos` | Módulos disponíveis no sistema |
| `avisos` | Avisos de chave e intercorrências |
| `trocas_sala` | Registros de troca de sala por dia |
| `emprestimo_categorias` | Categorias de itens emprestáveis |
| `emprestimo_itens` | Itens individuais (patrimônio) |
| `emprestimos_registro` | Histórico de retiradas e devoluções |
| `alunos_cache` | Cache de nomes por matrícula |

### RPCs obrigatórias

Execute no SQL Editor do Supabase (dev e prod):

**1. Devolução atômica:**
```sql
-- arquivo: supabase/migrations/concluir_devolucao_rpc.sql
```

**2. Estatísticas de empréstimos no banco:**
```sql
-- arquivo: supabase/migrations/estatisticas_emprestimos_rpc.sql
```

**3. Trocas de sala por dia (adicionar coluna `data_aula`):**
```sql
-- arquivo: supabase/migrations/trocas_sala_data_aula.sql
```

Os arquivos SQL estão em `supabase/migrations/`. Rode-os **na ordem** acima.

**Verificar se as RPCs foram criadas:**
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('concluir_devolucao', 'estatisticas_emprestimos', 'limpar_trocas_antigas');
```

---

## Instalação e desenvolvimento local

### Pré-requisitos
- Node.js 18+
- Conta Vercel (para CLI)
- Projeto Supabase configurado

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/Schnorren/sistema-salas-pucrs.git
cd sistema-salas-pucrs

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 4. Inicie o servidor de desenvolvimento
# O Vercel CLI é necessário para rodar as funções serverless localmente
npm install -g vercel
vercel dev
```

O projeto estará disponível em `http://localhost:3000`.

> **Por que `vercel dev` e não `npm run dev`?**
> O `npm run dev` inicia apenas o frontend Vite. As rotas `/api/**` são funções serverless e só funcionam com o Vercel CLI, que emula o ambiente de produção localmente.

---

## Deploy

O deploy é automático via integração Vercel + GitHub. Todo push na branch `main` (ou a branch configurada) dispara um novo deploy.

```bash
# Deploy manual (caso necessário)
vercel --prod
```

### Fluxo de trabalho recomendado

```
feature/  →  develop  →  main
   ↓            ↓          ↓
 local      preview     produção
           (Vercel)    (Vercel)
```

---

## Como atualizar a grade de horários

A grade de cada prédio é extraída de um PDF gerado pelo sistema acadêmico da PUCRS.

1. Acesse o sistema com uma conta que tenha a permissão `grade`
2. Navegue até **Upload de Grade** (ícone de upload na barra lateral)
3. Selecione o arquivo `.pdf` da agenda semanal gerado pelo sistema central
4. O sistema envia o PDF para a API Python de extração (hospedada no Render)
5. Os dados extraídos são salvos no banco e o JSON estático é publicado no Supabase Storage (CDN)
6. Todos os usuários do prédio veem a grade atualizada na próxima consulta

> O processamento pode levar de 10 a 40 segundos dependendo do tamanho do PDF e do cold start do serviço Python no Render.

---

## Como registrar uma troca de sala

1. Acesse a aba **Linha do Tempo**
2. Clique em qualquer aula ocupada
3. Confirme que deseja registrar uma alteração
4. O formulário já vem **pré-preenchido** com o código/créditos e nome da aula (detectados automaticamente do padrão `97316-04/1 - NOME DA DISCIPLINA`)
5. Preencha o prédio e sala de destino
6. Opcionalmente adicione professor e motivo
7. Clique em **Imprimir** — o sistema salva a troca automaticamente e abre um cartaz A4 colorido com logo PUCRS pronto para impressão e afixação na porta da sala original

A troca fica visível para todos os usuários do prédio em tempo real (Realtime) e expira automaticamente ao final do dia.

---

## Estrutura de arquivos

```
sistema-salas-pucrs/
├── api/                        # Funções serverless Vercel
│   ├── admin/index.js          # CRUD de usuários, prédios, perfis
│   ├── avisos/index.js         # Mural de avisos e chaves
│   ├── emprestimos/
│   │   ├── index.js            # Retirada, devolução, manutenção
│   │   └── estatisticas.js     # Relatórios (via RPC Supabase)
│   ├── equipe/index.js         # Gestão de membros por prédio
│   └── grade/
│       ├── index.js            # Busca e publicação de grade
│       └── importar-pdf.js     # Upload e processamento de PDF
│
├── backend_core/               # Lógica de negócio compartilhada
│   ├── config/supabase.js      # Cliente Supabase (service role)
│   ├── middlewares/withAuth.js # Autenticação JWT + cache de permissões
│   ├── repositories/           # Acesso direto ao banco
│   ├── services/               # Regras de negócio
│   └── utils/timeHelpers.js    # Períodos PUCRS, horários, utilitários
│
├── src/                        # Frontend React
│   ├── components/             # Componentes de UI
│   ├── contexts/               # PredioContext, UIContext
│   ├── hooks/                  # useAuthAccess, useGrade, useAvisos, useEmprestimos, useEquipe
│   ├── utils/                  # reportGenerator, constants
│   ├── supabase.js             # Cliente Supabase (anon key)
│   └── App.jsx                 # Roteamento principal
│
├── supabase/migrations/        # SQLs das RPCs obrigatórias
├── vercel.json                 # Rewrites, crons e config de build
└── vite.config.js              # Config do Vite
```

---

## Considerações de segurança

- **Autenticação:** Supabase Auth com JWT. Todos os endpoints `/api/**` exigem token válido via middleware `withAuth`
- **Autorização:** Permissões verificadas por módulo em cada endpoint — não existe endpoint autenticado sem checagem de permissão
- **Cache de token:** Tokens validados ficam em cache por 5 minutos no servidor para reduzir latência; entradas expiradas são limpas automaticamente a cada 10 minutos
- **Isolamento por prédio:** Todas as queries filtram por `predio_id` do token validado — usuários não conseguem acessar dados de outros prédios
- **Variáveis de ambiente:** `SUPABASE_SERVICE_ROLE_KEY` existe apenas no backend serverless, nunca exposta ao frontend

---

## Próximos passos sugeridos

- [ ] Criar arquivo `.env.example` com todas as variáveis documentadas
- [ ] Migrar o frontend para TypeScript para maior segurança de tipos
- [ ] Adicionar testes automatizados (Vitest para lógica de `timeHelpers`, Playwright para fluxos críticos)
- [ ] Implementar rate limiting nos endpoints da API
- [ ] Adicionar índices no banco para queries de empréstimos em prédios com muitos itens
- [ ] Explorar Supabase Edge Functions para eliminar a dependência do Render (API Python)

---

## Licença

Projeto interno PUCRS. Uso restrito.
