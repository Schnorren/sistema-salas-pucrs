import { useState, useEffect, useMemo, useRef, Component } from 'react';
import { Routes, Route, Navigate, NavLink, Link, matchPath, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ROTAS } from '../rotas';
import Topbar from './Topbar';
import UploadCSV from './UploadPDF';
import NextClasses from './NextClasses';
import FreeRooms from './FreeRooms';
import Timeline from './Timeline';
import LiveMap from './LiveMap';
import WeeklyHeatmap from './WeeklyHeatmap';
import HistoricalReports from './HistoricalReports';
import MuralAvisos from './MuralAvisos';
import MuralEmprestimos from './MuralEmprestimos';
import MuralContatos from './MuralContatos';
import AdminPanel from './AdminPanel';
import GestaoEquipe from './GestaoEquipe';
import MeuPerfil from './MeuPerfil';
import RelatoriosEmprestimos from './RelatoriosEmprestimos';
import { useContatos } from '../hooks/useContatos';
import { buscarNoDiretorio } from '../utils/contatosBusca';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
          <strong>Erro ao carregar o componente:</strong><br /><br />
          {this.state.error?.message}<br /><br />
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{this.state.error?.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: '20px', padding: '8px 16px', cursor: 'pointer' }}>
            Tentar novamente
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
import { useQuery } from '@tanstack/react-query';
import { useGrade } from '../hooks/useGrade';
import { useTrocasSala } from '../hooks/useTrocasSala';
import { computarChavesDeBlocos } from '../../backend_core/utils/timeHelpers';

export default function Dashboard({ session }) {
  const acesso = useAuthAccess(session);
  const { predioAtivo } = usePredio();
  const { toast } = useUI();

  // A tela ativa vem da URL (ver src/rotas.js), não de estado local.
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showAdminMenu, setShowAdminMenu] = useState(false);
  // Cabeçalho (topbar + busca + abas) minimizável — preferência persistida
  // por navegador, igual ao tema (ver Topbar.jsx)
  const [headerCollapsed, setHeaderCollapsed] = useState(() => localStorage.getItem('headerCollapsed') === '1');
  useEffect(() => {
    localStorage.setItem('headerCollapsed', headerCollapsed ? '1' : '0');
  }, [headerCollapsed]);

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
  const adminMenuRef = useRef(null);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${session?.access_token}`,
    'x-predio-id': predioAtivo || acesso?.predioId || ''
  });

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
          { headers: getAuthHeaders() }
        );
        const data = await response.json();
        setSearchResults(data);
      } catch {
        // busca silencia erros — não interrompe o fluxo do usuário
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, predioAtivo, acesso]);

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

  // Badge de avisos — useQuery com staleTime infinito para leitura reativa do
  // cache sem disparar novo fetch (o dado é mantido pelo MuralAvisos)
  const { data: avisosCache } = useQuery({
    queryKey: ['avisos', predioId, userId],
    enabled: false, // nunca faz fetch — só lê o que já está no cache
    staleTime: Infinity,
  });
  const totalAvisosPendentes = (avisosCache?.chaves?.length || 0) + (avisosCache?.gerais?.length || 0);

  // Badge de trocas — busca própria + Realtime (hook compartilhado com a
  // Timeline): o número fica certo sem depender da aba Linha do Tempo já ter
  // sido aberta e acompanha trocas criadas/removidas por outros usuários.
  const trocasAtivas = useTrocasSala(predioId);
  // Conta só trocas cuja aula ainda existe na grade atual (mesma regra de
  // exibição da Timeline) — um re-import pode mover/remover aulas e deixar
  // trocas órfãs no banco até a virada da semana.
  const { dados: gradeData } = useGrade(predioId);
  const chavesGrade = useMemo(
    () => (gradeData?.grade ? computarChavesDeBlocos(gradeData.grade) : null),
    [gradeData]
  );
  const totalTrocasSemana = useMemo(() => {
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
        event: 'INSERT',
        schema: 'public',
        table: 'avisos',
        filter: `predio_id=eq.${predioId}`
      }, (payload) => {
        const novoAviso = payload.new;
        if (novoAviso?.prioridade === 'ALTA' || novoAviso?.tipo === 'CHAVE') {
          toast.warning(`🔔 Novo aviso urgente: ${novoAviso.titulo || 'Aviso de chave'}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [predioId, toast]);

  const handleSelectContato = (resultado) => {
    setShowDropdown(false);
    setSearchQuery('');
    navigate(`${ROTAS.contatos}?${new URLSearchParams({ id: resultado.contatoId })}`);
  };

  const handleSelectResult = (result) => {
    setShowDropdown(false);
    setSearchQuery('');
    navigate(`${ROTAS.linhaDoTempo}?${new URLSearchParams({ dia: result.dia_semana, filtro: result.sala })}`);
  };

  if (acesso.loading) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>Verificando credenciais de segurança...</div>;
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
  // Contatos: leitura livre para qualquer autenticado e sem gate de prédio
  // (o diretório é institucional/global). Só a edição é gated.
  const canEditContatos = acesso.permissoes?.includes('edicao_contatos') || isAdmin;

  const isGestor = canViewRelatorios || canViewEquipe || canViewEmprestimos || canEditGrade || canViewOperacional;

  // Mesmo gating das abas, aplicado à URL: quem digita o endereço de uma tela
  // sem permissão (ou sem prédio) volta para a Planta. É só UX — o backend
  // barra de novo pelo withAuth.
  const restrita = (permitido, elemento) => (permitido ? elemento : <Navigate to={ROTAS.planta} replace />);

  const itensGestao = [
    canViewOperacional && { to: ROTAS.salasLivres, rotulo: '🚪 Salas Livres' },
    canViewOperacional && { to: ROTAS.ocupacao, rotulo: '🔥 Ocupação Semanal' },
    canViewRelatorios && { to: ROTAS.historicoAulas, rotulo: '📊 Histórico de Aulas (BI)' },
    canEditGrade && { to: ROTAS.atualizarGrade, rotulo: '🔄 Atualizar Grade CSV/PDF' },
    canViewEquipe && { to: ROTAS.equipe, rotulo: '👥 Gestão de Equipe' },
    (canViewEmprestimos || canViewRelatorios) && { to: ROTAS.relatorioEmprestimos, rotulo: '📊 Relatório de Empréstimos' },
  ]
    .filter(Boolean)
    .map(item => ({ ...item, ativo: Boolean(matchPath(item.to, location.pathname)) }));

  const isGestaoActive = itensGestao.some(item => item.ativo);

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div
        className="header-toggle"
        onClick={() => setHeaderCollapsed(!headerCollapsed)}
        title={headerCollapsed ? 'Mostrar cabeçalho' : 'Minimizar cabeçalho'}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ transform: headerCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {!headerCollapsed && (
        <>
          <Topbar session={session} acesso={acesso} onAbrirPerfil={() => navigate(ROTAS.perfil)} />
    
          <div className="search-bar" ref={searchRef}>
            <div className="search-input-wrap">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                className="search-input"
                placeholder={`Buscar por código, disciplina ou sala...`}
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
              />
              {searchQuery && (
                <button className="search-clear vis" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
    
            {showDropdown && (
              <div className="search-dropdown vis">
                {isSearching && searchResults.length === 0 && resultadosContatos.length === 0 ? (
                  <div className="sd-empty">Buscando na base...</div>
                ) : searchResults.length === 0 && resultadosContatos.length === 0 ? (
                  <div className="sd-empty">Nenhum registro encontrado.</div>
                ) : (
                  <>
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
              </div>
            )}
            <span className="search-hint">Busca inteligente em tempo real</span>
          </div>
    
          <div className="navtabs" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', flex: 1 }}>
              {/* NavLink acrescenta a classe "active" sozinho quando a URL bate. */}
              <NavLink to={ROTAS.planta} end className="navtab">Planta ao Vivo</NavLink>
              <NavLink to={ROTAS.linhaDoTempo} className="navtab">
                Linha do Tempo
                {totalTrocasSemana > 0 && (
                  <span title="Trocas de sala ativas nesta semana" style={{ marginLeft: '6px', background: '#ea580c', color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', padding: '1px 6px', verticalAlign: 'middle' }}>
                    {totalTrocasSemana}
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
                <NavLink to={ROTAS.emprestimos} className="navtab">📦 Empréstimos</NavLink>
              )}

              {/* Visível para todos: o diretório de contatos não é gated por permissão nem por prédio. */}
              <NavLink to={ROTAS.contatos} className="navtab">📇 Contatos</NavLink>

              {isAdmin && (
                <NavLink
                  to={ROTAS.admin}
                  className="navtab"
                  style={({ isActive }) => (isActive ? { color: '#fbbf24', borderBottomColor: '#fbbf24' } : undefined)}
                >
                  🛡️ Painel Admin
                </NavLink>
              )}
            </div>
    
            {isGestor && (
              <div style={{ position: 'relative', padding: '10px 16px' }} ref={adminMenuRef}>
                <button
                  onClick={() => setShowAdminMenu(!showAdminMenu)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: isGestaoActive ? '#60a5fa' : '#9ca3af',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}
                >
                  ⚙️ Gestão ▾
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

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        <Routes>
          <Route path={ROTAS.planta} element={<LiveMap session={session} acesso={acesso} />} />
          <Route
            path={ROTAS.linhaDoTempo}
            element={
              <ErrorBoundary>
                {/* ?dia=&filtro= vem da busca global (link compartilhável) */}
                <Timeline session={session} acesso={acesso} initialDay={searchParams.get('dia')} initialFiltro={searchParams.get('filtro')} />
              </ErrorBoundary>
            }
          />
          <Route path={ROTAS.proximasAulas} element={<NextClasses session={session} acesso={acesso} />} />
          <Route path={ROTAS.avisos} element={restrita(canViewAvisos, <MuralAvisos session={session} acesso={acesso} />)} />
          <Route path={ROTAS.emprestimos} element={restrita(canViewEmprestimos, <MuralEmprestimos session={session} acesso={acesso} />)} />
          <Route path={ROTAS.contatos} element={<MuralContatos session={session} acesso={acesso} canEditContatos={canEditContatos} contatoFocado={contatoFocado} />} />
          <Route path={ROTAS.admin} element={restrita(isAdmin, <AdminPanel session={session} acesso={acesso} />)} />
          <Route path={ROTAS.perfil} element={<MeuPerfil session={session} onClose={() => navigate(ROTAS.planta)} />} />

          <Route path={ROTAS.salasLivres} element={restrita(canViewOperacional, <div style={{ padding: 20 }}><FreeRooms session={session} acesso={acesso} /></div>)} />
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
          <Route path={ROTAS.equipe} element={restrita(canViewEquipe, <GestaoEquipe session={session} acesso={acesso} />)} />
          <Route path={ROTAS.relatorioEmprestimos} element={restrita(canViewEmprestimos || canViewRelatorios, <RelatoriosEmprestimos session={session} acesso={acesso} />)} />

          {/* Endereço desconhecido → Planta */}
          <Route path="*" element={<Navigate to={ROTAS.planta} replace />} />
        </Routes>
      </div>
    </div>
  );
}