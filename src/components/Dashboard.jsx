import { useState, useEffect, useRef } from 'react';
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
import AdminPanel from './AdminPanel';
import GestaoEquipe from './GestaoEquipe';
import MeuPerfil from './MeuPerfil'; 

import { useAuthAccess } from '../hooks/useAuthAccess';
import { usePredio } from '../contexts/PredioContext';

export default function Dashboard({ session }) {
  const acesso = useAuthAccess(session);
  const { predioAtivo } = usePredio();

  const [activeTab, setActiveTab] = useState('map');
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
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

    const delayDebounce = setTimeout(async () => {
      if (!predioAtivo && !acesso?.predioId) return;

      setIsSearching(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/grade/busca?q=${encodeURIComponent(searchQuery)}`,
          { headers: getAuthHeaders() }
        );
        const data = await response.json();
        setSearchResults(data);
        setShowDropdown(true);
      } catch (err) {
        console.error("Erro ao realizar busca global:", err);
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

  const handleSelectResult = (result) => {
    setShowDropdown(false);
    setSearchQuery('');
    setActiveTab('tl');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'map': return <LiveMap session={session} acesso={acesso} />;
      case 'tl': return <Timeline session={session} acesso={acesso} />;
      case 'next': return <NextClasses session={session} acesso={acesso} />;
      case 'avisos': return <MuralAvisos session={session} acesso={acesso} />;
      case 'emprestimos': return <MuralEmprestimos session={session} acesso={acesso} />;
      case 'free': return <div style={{ padding: 20 }}><FreeRooms session={session} acesso={acesso} /></div>;
      case 'heat': return <WeeklyHeatmap session={session} acesso={acesso} />;
      case 'reports': return <HistoricalReports session={session} acesso={acesso} />;
      case 'equipe': return <GestaoEquipe session={session} acesso={acesso} />;
      case 'perfil': return <MeuPerfil session={session} onClose={() => setActiveTab('map')} />;
      case 'upload':
        return (
          <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <UploadCSV session={session} acesso={acesso} onUploadSuccess={() => console.log('Grade sincronizada com sucesso!')} />
          </div>
        );
      case 'admin': return <AdminPanel session={session} acesso={acesso} />;
      default: return <LiveMap session={session} acesso={acesso} />;
    }
  };

  if (acesso.loading) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>Verificando credenciais de segurança...</div>;
  }

  if (acesso.nivel === 0) {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <h2>Acesso Restrito</h2>
        <p style={{ color: 'var(--muted)', marginTop: '10px' }}>Sua conta foi criada, mas um Coordenador precisa liberar o seu acesso ao Prédio.</p>
      </div>
    );
  }

  const hasPredioContext = Boolean(acesso.predioId || predioAtivo);
  const isSuperAdmin = acesso.nivel >= 60;

  const canViewAvisos = (acesso.permissoes?.includes('avisos') || isSuperAdmin) && hasPredioContext;
  const canViewEmprestimos = (acesso.permissoes?.includes('emprestimos') || isSuperAdmin) && hasPredioContext;

  const isGestaoActive = ['free', 'heat', 'reports', 'upload', 'equipe'].includes(activeTab);
  const canViewRelatorios = (acesso.permissoes?.includes('relatorios') || isSuperAdmin);
  const canViewEquipe = (acesso.permissoes?.includes('equipe') || isSuperAdmin);
  const isGestor = canViewRelatorios || canViewEquipe;

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Topbar 
        session={session} 
        acesso={acesso} 
        onAbrirPerfil={() => setActiveTab('perfil')} 
      />

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
            {isSearching ? (
              <div className="sd-empty">Buscando na base...</div>
            ) : searchResults.length === 0 ? (
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
                <div className="sd-footer">Clique para ver detalhes na Linha do Tempo</div>
              </>
            )}
          </div>
        )}
        <span className="search-hint">Busca inteligente em tempo real</span>
      </div>

      <div className="navtabs" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>

        <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', flex: 1 }}>
          <div className={`navtab ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>Planta ao Vivo</div>
          <div className={`navtab ${activeTab === 'tl' ? 'active' : ''}`} onClick={() => setActiveTab('tl')}>Linha do Tempo</div>
          <div className={`navtab ${activeTab === 'next' ? 'active' : ''}`} onClick={() => setActiveTab('next')}>Próximas Aulas</div>

          {canViewAvisos && (
            <div className={`navtab ${activeTab === 'avisos' ? 'active' : ''}`} onClick={() => setActiveTab('avisos')}>Mural de Avisos</div>
          )}

          {canViewEmprestimos && (
            <div className={`navtab ${activeTab === 'emprestimos' ? 'active' : ''}`} onClick={() => setActiveTab('emprestimos')}>📦 Empréstimos</div>
          )}

          {acesso.nivel === 99 && (
            <div className={`navtab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')} style={{ color: activeTab === 'admin' ? '#fbbf24' : '', borderBottomColor: activeTab === 'admin' ? '#fbbf24' : '' }}>
              🛡️ Painel Admin
            </div>
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

                {canViewEquipe && (
                  <div
                    onClick={() => { setActiveTab('equipe'); setShowAdminMenu(false); }}
                    style={{ padding: '14px 16px', cursor: 'pointer', fontSize: '13px', color: activeTab === 'equipe' ? '#fff' : '#cbd5e1', background: activeTab === 'equipe' ? '#2563eb' : 'transparent', borderBottom: '1px solid #334155' }}
                    onMouseEnter={(e) => { if (activeTab !== 'equipe') e.currentTarget.style.background = '#0f172a' }}
                    onMouseLeave={(e) => { if (activeTab !== 'equipe') e.currentTarget.style.background = 'transparent' }}
                  >👥 Gestão de Equipe</div>
                )}

                {canViewRelatorios && (
                  <>
                    <div
                      onClick={() => { setActiveTab('free'); setShowAdminMenu(false); }}
                      style={{ padding: '14px 16px', cursor: 'pointer', fontSize: '13px', color: activeTab === 'free' ? '#fff' : '#cbd5e1', background: activeTab === 'free' ? '#2563eb' : 'transparent', borderBottom: '1px solid #334155' }}
                      onMouseEnter={(e) => { if (activeTab !== 'free') e.currentTarget.style.background = '#0f172a' }}
                      onMouseLeave={(e) => { if (activeTab !== 'free') e.currentTarget.style.background = 'transparent' }}
                    >🚪 Salas Livres</div>
                    <div
                      onClick={() => { setActiveTab('heat'); setShowAdminMenu(false); }}
                      style={{ padding: '14px 16px', cursor: 'pointer', fontSize: '13px', color: activeTab === 'heat' ? '#fff' : '#cbd5e1', background: activeTab === 'heat' ? '#2563eb' : 'transparent', borderBottom: '1px solid #334155' }}
                      onMouseEnter={(e) => { if (activeTab !== 'heat') e.currentTarget.style.background = '#0f172a' }}
                      onMouseLeave={(e) => { if (activeTab !== 'heat') e.currentTarget.style.background = 'transparent' }}
                    >🔥 Ocupação Semanal</div>
                    <div
                      onClick={() => { setActiveTab('reports'); setShowAdminMenu(false); }}
                      style={{ padding: '14px 16px', cursor: 'pointer', fontSize: '13px', color: activeTab === 'reports' ? '#fff' : '#cbd5e1', background: activeTab === 'reports' ? '#2563eb' : 'transparent', borderBottom: '1px solid #334155' }}
                      onMouseEnter={(e) => { if (activeTab !== 'reports') e.currentTarget.style.background = '#0f172a' }}
                      onMouseLeave={(e) => { if (activeTab !== 'reports') e.currentTarget.style.background = 'transparent' }}
                    >📊 Relatórios Históricos</div>
                    <div
                      onClick={() => { setActiveTab('upload'); setShowAdminMenu(false); }}
                      style={{ padding: '14px 16px', cursor: 'pointer', fontSize: '13px', color: activeTab === 'upload' ? '#fff' : '#cbd5e1', background: activeTab === 'upload' ? '#2563eb' : 'transparent' }}
                      onMouseEnter={(e) => { if (activeTab !== 'upload') e.currentTarget.style.background = '#0f172a' }}
                      onMouseLeave={(e) => { if (activeTab !== 'upload') e.currentTarget.style.background = 'transparent' }}
                    >🔄 Atualizar Grade CSV</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {renderTabContent()}
      </div>
    </div>
  );
}