import { useState, useEffect, useRef } from 'react';
import Topbar from './Topbar';
import UploadCSV from './UploadCSV';
import NextClasses from './NextClasses';
import FreeRooms from './FreeRooms';
import Timeline from './Timeline';
import LiveMap from './LiveMap';
import WeeklyHeatmap from './WeeklyHeatmap';
import HistoricalReports from './HistoricalReports';
import MuralAvisos from './MuralAvisos';

export default function Dashboard({ session }) {
  const [activeTab, setActiveTab] = useState('map');

  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchRef = useRef(null);
  const adminMenuRef = useRef(null);


  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/grade/busca?q=${encodeURIComponent(searchQuery)}`
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
  }, [searchQuery]);


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
      case 'map': return <LiveMap />;
      case 'tl': return <Timeline />;
      case 'next': return <NextClasses />;
      case 'avisos': return <MuralAvisos session={session} />;

      case 'free': return <div style={{ padding: 20 }}><FreeRooms /></div>;
      case 'heat': return <WeeklyHeatmap />;
      case 'reports': return <HistoricalReports />;
      case 'upload':
        return (
          <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <UploadCSV onUploadSuccess={() => console.log('Grade sincronizada com sucesso!')} />
          </div>
        );
      default: return <LiveMap />;
    }
  };

  const isGestaoActive = ['free', 'heat', 'reports', 'upload'].includes(activeTab);

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>


      <Topbar session={session} />


      <div className="search-bar" ref={searchRef}>
        <div className="search-input-wrap">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="search-input"
            placeholder="Buscar por código, disciplina ou sala…"
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
              <div className="sd-empty">Buscando na base do Prédio 15...</div>
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
                        Período {res.periodosFormatados}
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
          <div className={`navtab ${activeTab === 'avisos' ? 'active' : ''}`} onClick={() => setActiveTab('avisos')}>Mural de Avisos</div>
        </div>


        <div style={{ position: 'relative', padding: '0 16px 8px 16px' }} ref={adminMenuRef}>
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
              <div
                onClick={() => { setActiveTab('free'); setShowAdminMenu(false); }}
                style={{
                  padding: '14px 16px', cursor: 'pointer', fontSize: '13px',
                  color: activeTab === 'free' ? '#fff' : '#cbd5e1',
                  background: activeTab === 'free' ? '#2563eb' : 'transparent',
                  borderBottom: '1px solid #334155',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { if (activeTab !== 'free') e.currentTarget.style.background = '#0f172a' }}
                onMouseLeave={(e) => { if (activeTab !== 'free') e.currentTarget.style.background = 'transparent' }}
              >
                🚪 Salas Livres
              </div>
              <div
                onClick={() => { setActiveTab('heat'); setShowAdminMenu(false); }}
                style={{
                  padding: '14px 16px', cursor: 'pointer', fontSize: '13px',
                  color: activeTab === 'heat' ? '#fff' : '#cbd5e1',
                  background: activeTab === 'heat' ? '#2563eb' : 'transparent',
                  borderBottom: '1px solid #334155',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { if (activeTab !== 'heat') e.currentTarget.style.background = '#0f172a' }}
                onMouseLeave={(e) => { if (activeTab !== 'heat') e.currentTarget.style.background = 'transparent' }}
              >
                🔥 Ocupação Semanal
              </div>
              <div
                onClick={() => { setActiveTab('reports'); setShowAdminMenu(false); }}
                style={{
                  padding: '14px 16px', cursor: 'pointer', fontSize: '13px',
                  color: activeTab === 'reports' ? '#fff' : '#cbd5e1',
                  background: activeTab === 'reports' ? '#2563eb' : 'transparent',
                  borderBottom: '1px solid #334155',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { if (activeTab !== 'reports') e.currentTarget.style.background = '#0f172a' }}
                onMouseLeave={(e) => { if (activeTab !== 'reports') e.currentTarget.style.background = 'transparent' }}
              >
                📊 Relatórios Históricos
              </div>
              <div
                onClick={() => { setActiveTab('upload'); setShowAdminMenu(false); }}
                style={{
                  padding: '14px 16px', cursor: 'pointer', fontSize: '13px',
                  color: activeTab === 'upload' ? '#fff' : '#cbd5e1',
                  background: activeTab === 'upload' ? '#2563eb' : 'transparent',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { if (activeTab !== 'upload') e.currentTarget.style.background = '#0f172a' }}
                onMouseLeave={(e) => { if (activeTab !== 'upload') e.currentTarget.style.background = 'transparent' }}
              >
                🔄 Atualizar Grade CSV
              </div>
            </div>
          )}
        </div>
      </div>


      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {renderTabContent()}
      </div>

    </div>
  );
}