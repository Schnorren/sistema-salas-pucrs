import { useState, useEffect, useMemo, useRef, useCallback, Component, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, NavLink, Link, matchPath, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ROTAS } from '../rotas';
import Topbar from './Topbar';
import NextClasses from './NextClasses';
import Timeline from './Timeline';
import LiveMap from './LiveMap';
import MuralAvisos from './MuralAvisos';
import MuralEmprestimos from './MuralEmprestimos';
import MuralContatos from './MuralContatos';
// Telas do balcão (acima) vêm no bundle inicial. As de gestão, de uso raro,
// carregam sob demanda — chunk que sumiu após deploy é tratado pela
// ErrorBoundary (recarrega a página).
const UploadCSV = lazy(() => import('./UploadPDF'));
const SalasPredio = lazy(() => import('./SalasPredio'));
const FreeRooms = lazy(() => import('./FreeRooms'));
const AdminPanel = lazy(() => import('./AdminPanel'));
const GestaoEquipe = lazy(() => import('./GestaoEquipe'));
const MeuPerfil = lazy(() => import('./MeuPerfil'));
// Telas de relatório carregam sob demanda: trazem gráficos (recharts) e
// geração de PDF (jspdf), que as outras telas não usam.
const WeeklyHeatmap = lazy(() => import('./WeeklyHeatmap'));
const HistoricalReports = lazy(() => import('./HistoricalReports'));
const RelatoriosEmprestimos = lazy(() => import('./RelatoriosEmprestimos'));
const GestaoEmprestimos = lazy(() => import('./GestaoEmprestimos'));
import { useContatos } from '../hooks/useContatos';
import { buscarNoDiretorio } from '../utils/contatosBusca';

// Depois de um deploy, os chunks antigos (nome com hash) deixam de existir: a
// aba que ficou aberta (os PCs da recepção ficam o dia todo) quebra ao abrir
// uma tela carregada sob demanda. Recarregar a página resolve.
const ERRO_DE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;
const CHAVE_RECARGA = 'pucrs.recarregouPorChunk';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  // Detalhes técnicos vão para o console (F12), não para a tela
  componentDidCatch(error, info) {
    console.error('Erro na tela:', error, info?.componentStack);
    // Uma recarga automática por sessão de aba (evita laço se o erro persistir)
    if (ERRO_DE_CHUNK.test(String(error?.message || '')) && !sessionStorage.getItem(CHAVE_RECARGA)) {
      sessionStorage.setItem(CHAVE_RECARGA, '1');
      window.location.reload();
    }
  }
  render() {
    if (this.state.error) {
      const versaoNova = ERRO_DE_CHUNK.test(String(this.state.error?.message || ''));
      return (
        <div style={{ padding: '40px', color: 'var(--text)', fontSize: '14px' }}>
          <strong style={{ color: 'var(--red)' }}>
            {versaoNova ? 'O sistema foi atualizado enquanto esta tela estava aberta.' : 'Esta tela encontrou um erro e não pôde ser exibida.'}
          </strong><br /><br />
          <span style={{ color: 'var(--muted)' }}>
            {versaoNova ? 'Recarregue a página para usar a versão nova.' : 'Tente de novo. Se continuar, avise a coordenação informando o que estava fazendo.'}
          </span><br />
          <button
            onClick={() => (versaoNova ? window.location.reload() : this.setState({ error: null }))}
            style={{ marginTop: '20px', padding: '8px 16px', cursor: 'pointer' }}
          >
            {versaoNova ? 'Recarregar' : 'Tentar novamente'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { useAuthAccess } from '../hooks/useAuthAccess';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buscarAvisos } from '../hooks/useAvisos';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { computarChavesDeBlocos, getDiaAtual, getCurrentPeriod, getDataSaoPaulo, PERIODS } from '../../backend_core/utils/timeHelpers';
import { situacaoDaSala, salaCoincide, normalizar, IDX_PERIODO } from '../utils/aulasDoDia';
import { useCelular } from '../hooks/useCelular';
import { useTema } from '../hooks/useTema';
import TopoCelular from './celular/TopoCelular';
import BarraInferior from './celular/BarraInferior';
import BuscaCelular from './celular/BuscaCelular';
import MenuMais from './celular/MenuMais';
import Icone from './celular/Icone';

// Telas que no celular abrem como no computador, com um aviso (decisão de
// 05/11: não esconder; o balcão de empréstimos fica nos PCs da recepção).
const TELAS_DE_COMPUTADOR = [
  ROTAS.emprestimos, ROTAS.ocupacao, ROTAS.historicoAulas, ROTAS.atualizarGrade, ROTAS.equipe,
  ROTAS.relatorioEmprestimos, ROTAS.gestaoEmprestimos, ROTAS.admin,
];

export default function Dashboard({ session }) {
  const acesso = useAuthAccess(session);
  const { predioAtivo } = usePredio();
  const { toast } = useUI();

  // A tela ativa vem da URL (ver src/rotas.js), não de estado local.
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  // Contato a destacar na aba Contatos (/contatos?id=..., vem da busca global).
  // A `key` da location muda a cada navegação, então clicar de novo no mesmo
  // resultado gera um objeto novo e o MuralContatos volta a rolar até o card.
  const idContatoFocado = searchParams.get('id');
  const contatoFocado = useMemo(
    () => (idContatoFocado ? { id: idContatoFocado, n: location.key } : null),
    [idContatoFocado, location.key]
  );
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchRef = useRef(null);
  // Layout de celular (barra de baixo, topo enxuto, busca em tela cheia)
  const celular = useCelular();
  const [escuro, setEscuro] = useTema();
  const [buscaCelular, setBuscaCelular] = useState(null); // null | 'numero' | 'texto'
  const campoBuscaCelular = useRef(null);
  const fecharBuscaCelular = useCallback(() => {
    setBuscaCelular(null);
    setSearchQuery('');
    campoBuscaCelular.current?.blur();
  }, []);
  const adminMenuRef = useRef(null);

  // Recarga automática por chunk velho (ErrorBoundary): depois de 30 s de uso
  // estável, libera uma nova recarga para o próximo deploy. Se a versão nova
  // estiver quebrada, o erro volta antes disso e não entra em laço.
  useEffect(() => {
    const t = setTimeout(() => sessionStorage.removeItem(CHAVE_RECARGA), 30000);
    return () => clearTimeout(t);
  }, []);

  const token = session?.access_token;

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Contatos são filtrados em memória (useMemo abaixo), então o dropdown já
    // pode abrir — não depende do fetch da grade nem de haver prédio ativo.
    setShowDropdown(true);

    const delayDebounce = setTimeout(async () => {
      if (!predioAtivo && !acesso?.predioId) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/grade/busca?q=${encodeURIComponent(searchQuery)}`,
          { headers: { 'Authorization': `Bearer ${token}`, 'x-predio-id': predioAtivo || acesso?.predioId || '' } }
        );
        const data = await response.json().catch(() => null);
        // Erro da API volta como { error } — nunca pode chegar ao .map() do
        // dropdown (derrubava a tela inteira ao digitar na busca).
        setSearchResults(response.ok && Array.isArray(data) ? data : []);
      } catch {
        // busca silencia erros — não interrompe o fluxo do usuário
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, predioAtivo, acesso, token]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const predioId = predioAtivo || acesso?.predioId || '';
  const userId = session?.user?.id;

  // Diretório de contatos: mesma queryKey do MuralContatos, então a busca
  // global filtra o cache existente sem disparar requisição nova.
  const { diretorio: diretorioContatos } = useContatos(session, acesso);
  const resultadosContatos = useMemo(
    () => buscarNoDiretorio(diretorioContatos, searchQuery, 6),
    [diretorioContatos, searchQuery]
  );

  // Badge de avisos — mesma query (e mesma queryFn) do MuralAvisos, então o
  // número aparece desde o login e o cache é um só. O Realtime abaixo invalida.
  const queryClient = useQueryClient();
  const podeVerAvisos = Boolean(predioId && userId)
    && Boolean(acesso.permissoes?.includes('avisos') || acesso.permissoes?.includes('admin'));
  const { data: avisosCache } = useQuery({
    queryKey: ['avisos', predioId, userId],
    queryFn: () => buscarAvisos(session?.access_token, predioId),
    enabled: podeVerAvisos,
  });
  const totalAvisosPendentes = (avisosCache?.chaves?.length || 0) + (avisosCache?.gerais?.length || 0);

  // Badge de trocas — busca própria + Realtime (hook compartilhado com a
  // Timeline): o número fica certo sem depender da aba Linha do Tempo já ter
  // sido aberta e acompanha trocas criadas/removidas por outros usuários.
  // O hook só devolve trocas de hoje até 6 dias à frente (próxima ocorrência
  // de cada dia), então o badge conta as trocas que ainda vão acontecer.
  const trocasAtivas = useTrocasSala(predioId);
  // Conta só trocas cuja aula ainda existe na grade atual (mesma regra de
  // exibição da Timeline) — um re-import pode mover/remover aulas e deixar
  // trocas órfãs no banco até a virada da semana.
  const { dados: gradeData } = useGrade(predioId);
  const chavesGrade = useMemo(
    () => (gradeData?.grade ? computarChavesDeBlocos(gradeData.grade) : null),
    [gradeData]
  );
  const totalTrocasAtivas = useMemo(() => {
    const chaves = Object.keys(trocasAtivas);
    if (!chavesGrade) return chaves.length; // grade ainda carregando — usa o total bruto
    return chaves.filter(c => chavesGrade.has(c)).length;
  }, [trocasAtivas, chavesGrade]);

  // Notificação de aviso urgente em qualquer aba
  useEffect(() => {
    if (!predioId) return;

    const channel = supabase
      .channel(`dashboard_avisos_urgentes_${predioId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'avisos',
        filter: `predio_id=eq.${predioId}`
      }, (payload) => {
        // Mantém o badge certo em qualquer tela (o MuralAvisos tem canal próprio)
        queryClient.invalidateQueries({ queryKey: ['avisos', predioId, userId] });
        if (payload.eventType !== 'INSERT') return;
        const novoAviso = payload.new;
        if (novoAviso?.prioridade === 'ALTA' || novoAviso?.tipo === 'CHAVE') {
          toast.warning(`🔔 Novo aviso urgente: ${novoAviso.titulo || 'Aviso de chave'}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [predioId, userId, queryClient, toast]);

  // Busca do topo: quando o texto é o número de uma sala, mostra no topo da
  // lista o que importa no balcão — a aula de agora, troca de sala e
  // autorização de chave pendente (horário de Brasília).
  const salaConsultada = useMemo(() => {
    const termo = normalizar(searchQuery);
    const sala = termo ? (gradeData?.salas || []).find(s => normalizar(s.numero) === termo) : null;
    if (!sala) return null;
    const hoje = getDiaAtual();
    const per = getCurrentPeriod();
    const dt = getDataSaoPaulo();
    const { atual, troca, proxima } = situacaoDaSala(gradeData.grade, trocasAtivas, hoje, sala.numero, per, dt.getHours() * 60 + dt.getMinutes());
    return {
      numero: sala.numero, dia: hoje, per,
      inicioPer: per ? PERIODS[IDX_PERIODO[per]].lb : null,
      agora: atual, troca, proxima,
      chaves: (avisosCache?.chaves || []).filter(c => salaCoincide(c.sala_id, sala.numero)),
    };
  }, [searchQuery, gradeData, trocasAtivas, avisosCache]);

  const handleSelectContato = (resultado) => {
    setShowDropdown(false);
    fecharBuscaCelular();
    setSearchQuery('');
    navigate(`${ROTAS.contatos}?${new URLSearchParams({ id: resultado.contatoId })}`);
  };

  // No celular, abre direto a agenda da sala (?sala=) em vez de filtrar a grade.
  const handleSelectResult = (result) => {
    setShowDropdown(false);
    fecharBuscaCelular();
    setSearchQuery('');
    const params = celular ? { dia: result.dia_semana, sala: result.sala } : { dia: result.dia_semana, filtro: result.sala };
    navigate(`${ROTAS.linhaDoTempo}?${new URLSearchParams(params)}`);
  };

  if (acesso.loading) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>Verificando credenciais de segurança...</div>;
  }

  // Falha de rede/sessão ao consultar as permissões NÃO é conta sem acesso
  if (acesso.erro) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)', color: 'var(--text)', textAlign: 'center', padding: '20px' }}>
        <h2>Não foi possível verificar seu acesso</h2>
        <p style={{ color: 'var(--muted)', marginTop: '10px' }}>Verifique a conexão com a internet e tente de novo.</p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={acesso.recarregar} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Tentar de novo</button>
          <button onClick={() => supabase.auth.signOut()} style={{ padding: '10px 20px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>Sair da conta</button>
        </div>
      </div>
    );
  }

  const isAdmin = acesso.permissoes?.includes('admin');
  const hasPredioContext = Boolean(acesso.predioId || predioAtivo);
  // Órfão = sem prédio e sem admin. Global exige admin; prédio nulo sem admin não dá acesso.
  const isOrphan = !isAdmin && !acesso.predioId;

  if (isOrphan) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <h2>Acesso Restrito</h2>
        <p style={{ color: 'var(--muted)', marginTop: '10px' }}>Sua conta foi criada, mas o encarregado/administrador precisa liberar o seu acesso ao Prédio.</p>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ marginTop: '20px', padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Sair da conta
        </button>
      </div>
    );
  }

  const canViewAvisos = (acesso.permissoes?.includes('avisos') || isAdmin) && hasPredioContext;
  const canViewEmprestimos = (acesso.permissoes?.includes('emprestimos') || isAdmin) && hasPredioContext;

  const canViewOperacional = (acesso.permissoes?.includes('grade') || isAdmin) && hasPredioContext;
  const canViewRelatorios = (acesso.permissoes?.includes('relatorios') || isAdmin) && hasPredioContext;
  const canEditGrade = (acesso.permissoes?.includes('edicao_grade') || isAdmin) && hasPredioContext;
  const canViewEquipe = (acesso.permissoes?.includes('equipe') || isAdmin) && hasPredioContext;
  // Cadastro do acervo de empréstimos (pontos, categorias, itens), limite e suspensões
  const canGerirEmprestimos = (acesso.permissoes?.includes('gestao_emprestimos') || isAdmin) && hasPredioContext;
  // Contatos: leitura livre para qualquer autenticado e sem gate de prédio
  // (o diretório é institucional/global). Só a edição é gated.
  const canEditContatos = acesso.permissoes?.includes('edicao_contatos') || isAdmin;

  const isGestor = isAdmin || canViewRelatorios || canViewEquipe || canViewEmprestimos || canGerirEmprestimos || canEditGrade || canViewOperacional;

  // Mesmo gating das abas, aplicado à URL: quem digita o endereço de uma tela
  // sem permissão (ou sem prédio) volta para a Planta. É só UX — o backend
  // barra de novo pelo withAuth.
  const restrita = (permitido, elemento) => (permitido ? elemento : <Navigate to={ROTAS.planta} replace />);

  const itensGestao = [
    canViewOperacional && { to: ROTAS.salasLivres, rotulo: 'Salas Livres' },
    canViewOperacional && { to: ROTAS.ocupacao, rotulo: 'Ocupação Semanal' },
    canViewRelatorios && { to: ROTAS.historicoAulas, rotulo: 'Histórico de Aulas (BI)' },
    canEditGrade && { to: ROTAS.atualizarGrade, rotulo: 'Atualizar Grade CSV/PDF' },
    canEditGrade && { to: ROTAS.salasPredio, rotulo: 'Salas do Prédio' },
    canViewEquipe && { to: ROTAS.equipe, rotulo: 'Gestão de Equipe' },
    (canViewEmprestimos || canViewRelatorios || canGerirEmprestimos) && { to: ROTAS.relatorioEmprestimos, rotulo: 'Relatório de Empréstimos' },
    canGerirEmprestimos && { to: ROTAS.gestaoEmprestimos, rotulo: 'Gestão de Empréstimos' },
    // Painel Admin saiu das abas (só admin vê)
    isAdmin && { to: ROTAS.admin, rotulo: 'Painel Admin' },
  ]
    .filter(Boolean)
    .map(item => ({ ...item, ativo: Boolean(matchPath(item.to, location.pathname)) }));

  const isGestaoActive = itensGestao.some(item => item.ativo);

  // Resultados da busca: os mesmos no dropdown do computador e na busca em
  // tela cheia do celular.
  const resultadosBusca = (
    <>
        {isSearching && searchResults.length === 0 && resultadosContatos.length === 0 && !salaConsultada ? (
          <div className="sd-empty">Buscando na base...</div>
        ) : searchResults.length === 0 && resultadosContatos.length === 0 && !salaConsultada ? (
          <div className="sd-empty">Nenhum registro encontrado.</div>
        ) : (
          <>
            {salaConsultada && (
              <>
                <div className="sd-footer" style={{ textAlign: 'left', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                  SALA {salaConsultada.numero} · {salaConsultada.per ? `AGORA (PER. ${salaConsultada.per} · ${salaConsultada.inicioPer})` : 'FORA DO HORÁRIO DE AULA'}
                </div>
                <div
                  className="sd-item"
                  style={salaConsultada.troca ? { background: 'rgba(239, 68, 68, 0.08)' } : undefined}
                  onClick={() => handleSelectResult({ dia_semana: salaConsultada.dia, sala: salaConsultada.numero })}
                >
                  <div className="sd-room">{salaConsultada.numero}</div>
                  <div className="sd-info">
                    {salaConsultada.agora ? (
                      <>
                        <div className="sd-class">
                          {salaConsultada.agora.nomeAula}
                          {salaConsultada.agora.codCred && <span style={{ opacity: 0.7, fontWeight: 'normal' }}> · {salaConsultada.agora.codCred}</span>}
                        </div>
                        <div className="sd-meta">
                          {salaConsultada.troca && (
                            <>
                              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🔁 TRANSFERIDA → PRÉDIO {salaConsultada.troca.predio_destino} · SALA {salaConsultada.troca.sala_destino}</span>
                              <span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>
                            </>
                          )}
                          Per. {salaConsultada.agora.periodos.join('')}
                          <span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>
                          {salaConsultada.agora.inicio} às {salaConsultada.agora.fim}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="sd-class">Livre agora</div>
                        <div className="sd-meta">
                          {salaConsultada.proxima
                            ? `Próxima aula: ${salaConsultada.proxima.nomeAula} às ${salaConsultada.proxima.inicio} (${salaConsultada.proxima.periodos.join('')})`
                            : 'Sem mais aulas hoje nesta sala'}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {salaConsultada.agora && salaConsultada.proxima && (
                  <div className="sd-item" onClick={() => handleSelectResult({ dia_semana: salaConsultada.dia, sala: salaConsultada.numero })}>
                    <div className="sd-room" style={{ opacity: 0.6 }}>⏭</div>
                    <div className="sd-info">
                      <div className="sd-class">Depois: {salaConsultada.proxima.nomeAula}</div>
                      <div className="sd-meta">às {salaConsultada.proxima.inicio} · Per. {salaConsultada.proxima.periodos.join('')}</div>
                    </div>
                  </div>
                )}
                {podeVerAvisos && (salaConsultada.chaves.length > 0 ? salaConsultada.chaves.map(c => (
                  <div key={c.id} className="sd-item" onClick={() => { setShowDropdown(false); fecharBuscaCelular(); setSearchQuery(''); navigate(ROTAS.avisos); }}>
                    <div className="sd-room">🔑</div>
                    <div className="sd-info">
                      <div className="sd-class">Autorização de chave: {c.aluno_nome}</div>
                      <div className="sd-meta">
                        {c.disciplina}
                        {c.periodo && <><span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>Per. {c.periodo}</>}
                        {typeof c.data_prevista === 'string' && <><span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>{c.data_prevista.split('-').reverse().join('/')}</>}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="sd-item" style={{ cursor: 'default' }}>
                    <div className="sd-room" style={{ opacity: 0.6 }}>🔑</div>
                    <div className="sd-info"><div className="sd-class" style={{ fontWeight: 'normal' }}>Sem autorização de chave pendente para a {salaConsultada.numero}</div></div>
                  </div>
                ))}
                {searchResults.length > 0 && (
                  <div className="sd-footer" style={{ textAlign: 'left', fontWeight: 'bold', letterSpacing: '0.05em' }}>AULAS DA SEMANA</div>
                )}
              </>
            )}
            {searchResults.map((res) => (
              <div key={`${res.dia_semana}-${res.id}-${res.sala}`} className="sd-item" onClick={() => handleSelectResult(res)}>
                <div className="sd-room">{res.sala}</div>
                <div className="sd-info">
                  <div className="sd-class">{res.nome}</div>
                  <div className="sd-meta">
                    <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>{res.dia_semana}</span>
                    <span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>
                    Per. {res.periodosFormatados}
                    <span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>
                    {res.horarioInicio} às {res.horarioFim}
                  </div>
                </div>
              </div>
            ))}
            {searchResults.length > 0 && (
              <div className="sd-footer">Clique para ver detalhes na Linha do Tempo</div>
            )}
    
            {resultadosContatos.length > 0 && (
              <>
                <div className="sd-footer" style={{ textAlign: 'left', fontWeight: 'bold', letterSpacing: '0.05em' }}>CONTATOS</div>
                {resultadosContatos.map((res) => (
                  <div key={res.chave} className="sd-item" onClick={() => handleSelectContato(res)}>
                    <div className="sd-room">{res.tipo === 'curso' ? '🎓' : '📇'}</div>
                    <div className="sd-info">
                      <div className="sd-class">{res.titulo}</div>
                      <div className="sd-meta">
                        {res.subtitulo && <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>{res.subtitulo}</span>}
                        {res.subtitulo && res.telefone && <span style={{ color: 'var(--muted)', margin: '0 6px' }}>•</span>}
                        {res.telefone}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
    </>
  );

  // Abre a busca do celular. O foco vai para o campo DENTRO do toque (a busca
  // fica montada e escondida): só assim o iPhone abre o teclado. 'numero' =
  // Consultar sala (teclado numérico); 'texto' = lupa do topo.
  const abrirBuscaCelular = (teclado) => {
    const campo = campoBuscaCelular.current;
    if (campo) {
      campo.inputMode = teclado === 'numero' ? 'numeric' : 'search';
      campo.focus();
    }
    setBuscaCelular(teclado);
  };

  // Telas que continuam com o layout do computador no celular (decisão de 05/11)
  const telaDeComputador = celular && TELAS_DE_COMPUTADOR.some(rota => matchPath({ path: rota, end: true }, location.pathname));

  return (
    <div id="app" className={celular ? 'app-celular' : undefined} style={celular ? undefined : { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {celular ? (
        <TopoCelular session={session} acesso={acesso} onBuscar={() => abrirBuscaCelular('texto')} />
      ) : (
      <>
          {/* Cabeçalho em duas linhas: a busca fica na faixa de cima, junto de
              prédio, relógio e usuário; as abas ficam na de baixo. */}
          <Topbar
            session={session} acesso={acesso} onAbrirPerfil={() => navigate(ROTAS.perfil)}
            escuro={escuro} onAlternarTema={() => setEscuro(e => !e)}
            busca={(
              <div className="search-bar search-bar--topo" ref={searchRef}>
                <div className="search-input-wrap">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    className="search-input"
                    aria-label="Buscar por código, disciplina, sala ou contato"
                    placeholder={`Buscar por código, disciplina ou sala...`}
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
                  />
                  {searchQuery && (
                    <button className="search-clear vis" onClick={() => setSearchQuery('')} aria-label="Limpar busca" title="Limpar busca">×</button>
                  )}
                </div>
    
                {showDropdown && (
                  <div className="search-dropdown vis">
                    {resultadosBusca}
                  </div>
                )}
              </div>
            )}
          />
    
    
          <div className="navtabs" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', flex: 1 }}>
              {/* NavLink acrescenta a classe "active" sozinho quando a URL bate. */}
              <NavLink to={ROTAS.planta} end className="navtab">Planta ao Vivo</NavLink>
              <NavLink to={ROTAS.linhaDoTempo} className="navtab">
                Linha do Tempo
                {totalTrocasAtivas > 0 && (
                  // Clicar no número abre a lista de trocas (o resto da aba só abre a Linha do tempo).
                  // ?trocas= muda a cada clique para a lista reabrir mesmo já estando na aba.
                  <span
                    role="button"
                    title="Ver as trocas de sala de hoje e dos próximos 6 dias"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`${ROTAS.linhaDoTempo}?trocas=${Date.now()}`); }}
                    style={{ marginLeft: '6px', background: '#ea580c', color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', padding: '1px 6px', verticalAlign: 'middle', cursor: 'pointer' }}
                  >
                    {totalTrocasAtivas}
                  </span>
                )}
              </NavLink>
              <NavLink to={ROTAS.proximasAulas} className="navtab">Próximas Aulas</NavLink>

              {canViewAvisos && (
                <NavLink to={ROTAS.avisos} className="navtab">
                  Mural de Avisos
                  {totalAvisosPendentes > 0 && (
                    <span style={{ marginLeft: '6px', background: '#dc2626', color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', padding: '1px 6px', verticalAlign: 'middle' }}>
                      {totalAvisosPendentes}
                    </span>
                  )}
                </NavLink>
              )}

              {canViewEmprestimos && (
                <NavLink to={ROTAS.emprestimos} className="navtab">Empréstimos</NavLink>
              )}

              {/* Visível para todos: o diretório de contatos não é gated por permissão nem por prédio. */}
              <NavLink to={ROTAS.contatos} className="navtab">Contatos</NavLink>

            </div>
    
            {isGestor && (
              <div style={{ position: 'relative', padding: '10px 16px' }} ref={adminMenuRef}>
                <button
                  onClick={() => setShowAdminMenu(!showAdminMenu)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: isGestaoActive ? '#60a5fa' : '#9ca3af',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}
                >
                  Gestão ▾
                </button>
    
                {showAdminMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', right: '16px',
                    background: '#1e293b', border: '1px solid #334155',
                    borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 50, minWidth: '220px', overflow: 'hidden'
                  }}>
                    {itensGestao.map(({ to, rotulo, ativo }, i) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setShowAdminMenu(false)}
                        style={{
                          display: 'block', textDecoration: 'none',
                          padding: '14px 16px', cursor: 'pointer', fontSize: '13px',
                          color: ativo ? '#fff' : '#cbd5e1',
                          background: ativo ? '#2563eb' : 'transparent',
                          borderBottom: i < itensGestao.length - 1 ? '1px solid #334155' : 'none'
                        }}
                        onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.background = '#0f172a' }}
                        onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.background = 'transparent' }}
                      >{rotulo}</Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
      </>
      )}

      {telaDeComputador && (
        <div className="cel-aviso-pc" role="note">
          <Icone nome="computador" tamanho={16} /> Esta tela foi feita para o computador. No celular ela funciona, mas sem ajustes.
        </div>
      )}

      <div className={celular ? 'cel-conteudo' : undefined} style={celular ? undefined : { flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {/* key: o erro de uma tela não "gruda" nas outras ao navegar */}
        <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<div className="empty-st">Carregando...</div>}>
        <Routes>
          <Route
            path={ROTAS.planta}
            element={
              <LiveMap
                session={session} acesso={acesso} canEditGrade={canEditGrade}
                chaves={podeVerAvisos ? (avisosCache?.chaves || []) : null}
                onConsultarSala={() => abrirBuscaCelular('numero')}
              />
            }
          />
          <Route
            path={ROTAS.linhaDoTempo}
            element={
              <ErrorBoundary>
                {/* ?dia=&filtro= vem da busca global (link compartilhável) */}
                <Timeline session={session} acesso={acesso} canEditGrade={canEditGrade} initialDay={searchParams.get('dia')} initialFiltro={searchParams.get('filtro')} abrirTrocas={searchParams.get('trocas')} />
              </ErrorBoundary>
            }
          />
          <Route path={ROTAS.proximasAulas} element={<NextClasses session={session} acesso={acesso} />} />
          <Route path={ROTAS.avisos} element={restrita(canViewAvisos, <MuralAvisos session={session} acesso={acesso} />)} />
          <Route path={ROTAS.emprestimos} element={restrita(canViewEmprestimos, <MuralEmprestimos session={session} acesso={acesso} />)} />
          <Route path={ROTAS.contatos} element={<MuralContatos session={session} acesso={acesso} canEditContatos={canEditContatos} contatoFocado={contatoFocado} />} />
          <Route path={ROTAS.admin} element={restrita(isAdmin, <AdminPanel session={session} acesso={acesso} />)} />
          <Route
            path={ROTAS.mais}
            element={celular
              ? <MenuMais session={session} acesso={acesso} itensGestao={itensGestao} canViewEmprestimos={canViewEmprestimos} escuro={escuro} onAlternarTema={() => setEscuro(e => !e)} />
              : <Navigate to={ROTAS.planta} replace />}
          />
          <Route path={ROTAS.perfil} element={<MeuPerfil session={session} onClose={() => navigate(ROTAS.planta)} />} />

          <Route path={ROTAS.salasLivres} element={restrita(canViewOperacional, <div style={{ padding: celular ? 12 : 20 }}><FreeRooms session={session} acesso={acesso} /></div>)} />
          <Route path={ROTAS.ocupacao} element={restrita(canViewOperacional, <WeeklyHeatmap session={session} acesso={acesso} />)} />
          <Route path={ROTAS.historicoAulas} element={restrita(canViewRelatorios, <HistoricalReports session={session} acesso={acesso} />)} />
          <Route
            path={ROTAS.atualizarGrade}
            element={restrita(canEditGrade,
              <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                <UploadCSV session={session} acesso={acesso} onUploadSuccess={() => {}} />
              </div>
            )}
          />
          <Route path={ROTAS.salasPredio} element={restrita(canEditGrade, <SalasPredio session={session} acesso={acesso} />)} />
          <Route path={ROTAS.equipe} element={restrita(canViewEquipe, <GestaoEquipe session={session} acesso={acesso} />)} />
          <Route path={ROTAS.relatorioEmprestimos} element={restrita(canViewEmprestimos || canViewRelatorios || canGerirEmprestimos, <RelatoriosEmprestimos session={session} acesso={acesso} />)} />
          <Route path={ROTAS.gestaoEmprestimos} element={restrita(canGerirEmprestimos, <GestaoEmprestimos session={session} acesso={acesso} />)} />

          {/* Endereço desconhecido → Planta */}
          <Route path="*" element={<Navigate to={ROTAS.planta} replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>

      {celular && (
        <>
          <BarraInferior canViewAvisos={canViewAvisos} totalTrocas={totalTrocasAtivas} totalAvisos={totalAvisosPendentes} />
          <BuscaCelular
            ref={campoBuscaCelular}
            aberta={!!buscaCelular}
            teclado={buscaCelular}
            valor={searchQuery}
            onMudar={setSearchQuery}
            onFechar={fecharBuscaCelular}
          >
            {searchQuery.trim().length >= 2 ? resultadosBusca : (
              <div className="cel-busca-dica">
                {buscaCelular === 'numero'
                  ? 'Digite o número da sala para ver a aula de agora, a próxima, a troca de sala e as autorizações de chave.'
                  : 'Digite o número de uma sala, o nome ou o código de uma disciplina, ou um curso para achar o contato.'}
              </div>
            )}
          </BuscaCelular>
        </>
      )}
    </div>
  );
}