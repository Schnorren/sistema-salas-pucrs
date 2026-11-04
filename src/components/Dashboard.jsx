import { useState, useEffect, useMemo, useCallback, useSyncExternalStore, Component } from 'react';
import { Routes, Route, Navigate, matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { DoorOpen, FileUp, Flame, Package, Users, Shield } from 'lucide-react';
import { ROTAS } from '../rotas';
import Topbar from './Topbar';
import BuscaGlobal from './BuscaGlobal';
import UploadPDF from './UploadPDF';
import NextClasses from './NextClasses';
import FreeRooms from './FreeRooms';
import Timeline from './Timeline';
import LiveMap from './LiveMap';
import Ocupacao from './Ocupacao';
import MuralAvisos from './MuralAvisos';
import MuralEmprestimos from './MuralEmprestimos';
import MuralContatos from './MuralContatos';
import AdminPanel from './AdminPanel';
import GestaoEquipe from './GestaoEquipe';
import MeuPerfil from './MeuPerfil';
import RelatoriosEmprestimos from './RelatoriosEmprestimos';
import { Carregando } from './ui/Estado';
import { TooltipGlobal } from './ui/Estado';
import { useContatos } from '../hooks/useContatos';
import { useAuthAccess } from '../hooks/useAuthAccess';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { computarChavesDeBlocos } from '../../backend_core/utils/timeHelpers';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="estado erro">
          <b>Esta tela encontrou um erro</b>
          <span className="mono" style={{ maxWidth: 640, fontSize: 12.5 }}>{this.state.error?.message}</span>
          <button className="btn" onClick={() => this.setState({ error: null })}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Telas que ocupam a altura toda e rolam por dentro (grade, listas em colunas).
const TELAS_FIXAS = [ROTAS.planta, ROTAS.linhaDoTempo, ROTAS.proximasAulas, ROTAS.emprestimos, ROTAS.contatos];

export default function Dashboard({ session }) {
  const acesso = useAuthAccess(session);
  const { predioAtivo } = usePredio();
  const { toast } = useUI();

  // A tela ativa vem da URL (ver src/rotas.js), não de estado local.
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [buscaAberta, setBuscaAberta] = useState(false);

  // Contato a destacar na aba Contatos (/contatos?id=..., vem da busca global).
  // A `key` da location muda a cada navegação: clicar de novo no mesmo
  // resultado gera um objeto novo e o MuralContatos volta a rolar até o card.
  const idContatoFocado = searchParams.get('id');
  const contatoFocado = useMemo(
    () => (idContatoFocado ? { id: idContatoFocado, n: location.key } : null),
    [idContatoFocado, location.key]
  );

  const predioId = predioAtivo || acesso?.predioId || '';
  const userId = session?.user?.id;

  // Ctrl K / Cmd K abre a busca de qualquer tela
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscaAberta(a => !a); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const fecharBusca = useCallback(() => setBuscaAberta(false), []);

  // Diretório de contatos: mesma queryKey do MuralContatos, então a busca
  // global filtra o cache existente sem disparar requisição nova.
  const { diretorio: diretorioContatos } = useContatos(session, acesso);

  // Badge de avisos — só LÊ o cache (preenchido pela Planta e pelo MuralAvisos).
  // Assina o QueryCache em vez de criar um useQuery sem queryFn na mesma key:
  // um observer sem queryFn sobrescrevia as opções da query e fazia os
  // refetch do Realtime falharem ("No queryFn was passed").
  const queryClient = useQueryClient();
  const totalAvisosPendentes = useSyncExternalStore(
    (avisar) => queryClient.getQueryCache().subscribe(avisar),
    () => {
      const d = queryClient.getQueryData(['avisos', predioId, userId]);
      return (d?.chaves?.length || 0) + (d?.gerais?.length || 0);
    }
  );

  // Badge de trocas — busca própria + Realtime (hook compartilhado com a
  // Timeline), contando só trocas cuja aula ainda existe na grade atual.
  const trocasAtivas = useTrocasSala(predioId);
  const { dados: gradeData } = useGrade(predioId);
  const chavesGrade = useMemo(
    () => (gradeData?.grade ? computarChavesDeBlocos(gradeData.grade) : null),
    [gradeData]
  );
  const totalTrocasSemana = useMemo(() => {
    const chaves = Object.keys(trocasAtivas);
    if (!chavesGrade) return chaves.length;
    return chaves.filter(c => chavesGrade.has(c)).length;
  }, [trocasAtivas, chavesGrade]);

  // Notificação de aviso urgente em qualquer aba
  useEffect(() => {
    if (!predioId) return;
    const channel = supabase
      .channel(`dashboard_avisos_urgentes_${predioId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'avisos', filter: `predio_id=eq.${predioId}`
      }, (payload) => {
        const novoAviso = payload.new;
        if (novoAviso?.prioridade === 'ALTA' || novoAviso?.tipo === 'CHAVE') {
          toast.warning(`Novo aviso urgente: ${novoAviso.titulo || 'autorização de chave'}`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [predioId, toast]);

  if (acesso.loading) {
    return <div className="sx app"><Carregando texto="Verificando suas permissões…" /></div>;
  }

  const isAdmin = acesso.permissoes?.includes('admin');
  const hasPredioContext = Boolean(acesso.predioId || predioAtivo);
  // Órfão = sem prédio e sem admin. Global exige admin; prédio nulo sem admin não dá acesso.
  const isOrphan = !isAdmin && !acesso.predioId;

  if (isOrphan) {
    return (
      <div className="sx app">
        <div className="estado">
          <span className="selo" aria-hidden="true" />
          <b>Acesso aguardando liberação</b>
          <span style={{ maxWidth: 440 }}>Sua conta foi criada, mas a coordenação do prédio ainda precisa liberar o seu acesso.</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
        </div>
      </div>
    );
  }

  const tem = (p) => acesso.permissoes?.includes(p) || isAdmin;
  const canViewAvisos = tem('avisos') && hasPredioContext;
  const canViewEmprestimos = tem('emprestimos') && hasPredioContext;
  const canViewOperacional = tem('grade') && hasPredioContext;
  const canViewRelatorios = tem('relatorios') && hasPredioContext;
  const canEditGrade = tem('edicao_grade') && hasPredioContext;
  const canViewEquipe = tem('equipe') && hasPredioContext;
  // Contatos: leitura livre para qualquer autenticado e sem gate de prédio
  // (o diretório é institucional/global). Só a edição é gated.
  const canEditContatos = tem('edicao_contatos');

  // Mesmo gating das abas, aplicado à URL: quem digita o endereço de uma tela
  // sem permissão (ou sem prédio) volta para a Planta. É só UX — o backend
  // barra de novo pelo withAuth.
  const restrita = (permitido, elemento) => (permitido ? elemento : <Navigate to={ROTAS.planta} replace />);
  const ativa = (to) => Boolean(matchPath(to, location.pathname));

  const abas = [
    { to: ROTAS.planta, rotulo: 'Planta', end: true },
    { to: ROTAS.linhaDoTempo, rotulo: 'Linha do tempo', badge: totalTrocasSemana, badgeTipo: 'b-troca', badgeTitulo: 'Trocas de sala ativas nesta semana' },
    { to: ROTAS.proximasAulas, rotulo: 'Próximas aulas' },
    canViewAvisos && { to: ROTAS.avisos, rotulo: 'Avisos', badge: totalAvisosPendentes, badgeTipo: 'b-alta', badgeTitulo: 'Autorizações e avisos pendentes' },
    canViewEmprestimos && { to: ROTAS.emprestimos, rotulo: 'Empréstimos' },
    { to: ROTAS.contatos, rotulo: 'Contatos' },
  ].filter(Boolean);

  const podeOcupacao = canViewOperacional || canViewRelatorios;
  const gruposGestao = [
    { grupo: 'Operação', itens: [
      canViewOperacional && { to: ROTAS.salasLivres, Icone: DoorOpen, rotulo: 'Salas livres', descricao: 'Encontrar sala livre por dia e horário' },
      canEditGrade && { to: ROTAS.atualizarGrade, Icone: FileUp, rotulo: 'Atualizar grade', descricao: 'Importar o PDF do Espaço Físico' },
    ] },
    { grupo: 'Relatórios', itens: [
      podeOcupacao && { to: canViewOperacional ? ROTAS.ocupacao : ROTAS.historicoAulas, Icone: Flame, rotulo: 'Ocupação das salas', descricao: 'Grade atual ou PDF de outro semestre', ativo: ativa(ROTAS.ocupacao) || ativa(ROTAS.historicoAulas) },
      (canViewEmprestimos || canViewRelatorios) && { to: ROTAS.relatorioEmprestimos, Icone: Package, rotulo: 'Relatório de empréstimos', descricao: 'Rotatividade e uso do acervo' },
    ] },
    { grupo: 'Administração', itens: [
      canViewEquipe && { to: ROTAS.equipe, Icone: Users, rotulo: 'Equipe', descricao: 'Convites e permissões do prédio' },
      isAdmin && { to: ROTAS.admin, Icone: Shield, rotulo: 'Painel admin', descricao: 'Usuários, cargos e prédios' },
    ] },
  ]
    .map(g => ({ ...g, itens: g.itens.filter(Boolean).map(i => ({ ...i, ativo: i.ativo ?? ativa(i.to) })) }))
    .filter(g => g.itens.length);
  const gestaoAtiva = gruposGestao.some(g => g.itens.some(i => i.ativo));

  const telasBusca = [
    ...abas.map(a => ({ to: a.to, rotulo: a.rotulo === 'Planta' ? 'Planta ao vivo' : a.rotulo })),
    ...gruposGestao.flatMap(g => g.itens.map(i => ({ to: i.to, rotulo: i.rotulo }))),
    { to: ROTAS.perfil, rotulo: 'Meu perfil' },
  ];

  const fixa = TELAS_FIXAS.some(t => matchPath({ path: t, end: true }, location.pathname));
  const props = { session, acesso };

  return (
    <div className="sx app">
      <Topbar
        session={session} acesso={acesso} isAdmin={isAdmin}
        abas={abas} gruposGestao={gruposGestao} gestaoAtiva={gestaoAtiva}
        onAbrirBusca={() => setBuscaAberta(true)}
      />

      <main className={`app-main ${fixa ? 'fixa' : ''}`}>
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path={ROTAS.planta} element={<LiveMap {...props} podeVerAvisos={canViewAvisos} podeEditarGrade={canEditGrade} salaInicial={searchParams.get('sala')} navKey={location.key} />} />
            {/* ?dia=&filtro= vem da busca global (link compartilhável) */}
            <Route path={ROTAS.linhaDoTempo} element={<Timeline {...props} initialDay={searchParams.get('dia')} initialFiltro={searchParams.get('filtro')} />} />
            <Route path={ROTAS.proximasAulas} element={<NextClasses {...props} />} />
            <Route path={ROTAS.avisos} element={restrita(canViewAvisos, <MuralAvisos {...props} />)} />
            <Route path={ROTAS.emprestimos} element={restrita(canViewEmprestimos, <MuralEmprestimos {...props} />)} />
            <Route path={ROTAS.contatos} element={<MuralContatos {...props} canEditContatos={canEditContatos} contatoFocado={contatoFocado} />} />
            <Route path={ROTAS.admin} element={restrita(isAdmin, <AdminPanel {...props} />)} />
            <Route path={ROTAS.perfil} element={<MeuPerfil session={session} acesso={acesso} isAdmin={isAdmin} />} />

            <Route path={ROTAS.salasLivres} element={restrita(canViewOperacional, <FreeRooms {...props} />)} />
            <Route path={ROTAS.ocupacao} element={restrita(canViewOperacional, <Ocupacao {...props} fonte="atual" podeAtual={canViewOperacional} podePdf={canViewRelatorios} />)} />
            <Route path={ROTAS.historicoAulas} element={restrita(canViewRelatorios, <Ocupacao {...props} fonte="pdf" podeAtual={canViewOperacional} podePdf={canViewRelatorios} />)} />
            <Route path={ROTAS.atualizarGrade} element={restrita(canEditGrade, <UploadPDF {...props} />)} />
            <Route path={ROTAS.equipe} element={restrita(canViewEquipe, <GestaoEquipe {...props} />)} />
            <Route path={ROTAS.relatorioEmprestimos} element={restrita(canViewEmprestimos || canViewRelatorios, <RelatoriosEmprestimos {...props} />)} />

            {/* Endereço desconhecido → Planta */}
            <Route path="*" element={<Navigate to={ROTAS.planta} replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      {buscaAberta && (
        <BuscaGlobal gradeData={gradeData} trocas={trocasAtivas} diretorio={diretorioContatos} telas={telasBusca} onFechar={fecharBusca} />
      )}
      <TooltipGlobal />
    </div>
  );
}
