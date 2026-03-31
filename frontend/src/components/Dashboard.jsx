import { useState, useEffect, useRef } from 'react';
import Topbar from './Topbar';
import UploadCSV from './UploadCSV';
import NextClasses from './NextClasses';
import FreeRooms from './FreeRooms';
import Timeline from './Timeline';
import LiveMap from './LiveMap';
import WeeklyHeatmap from './WeeklyHeatmap';
import HistoricalReports from './HistoricalReports'; // Importação do novo módulo

export default function Dashboard({ session }) {
  // Estado de Navegação
  const [activeTab, setActiveTab] = useState('map');
  
  // Estados da Busca Global
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const searchRef = useRef(null);

  /**
   * Efeito de Busca com Debounce (300ms)
   */
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

  /**
   * Handler para fechar o dropdown ao clicar fora
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * Lógica ao selecionar resultado da busca
   */
  const handleSelectResult = (result) => {
    setShowDropdown(false);
    setSearchQuery('');
    setActiveTab('tl'); // Redireciona para a Linha do Tempo
  };

  /**
   * Renderizador de Conteúdo Dinâmico (Switch Case)
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'map':
        return <LiveMap />;
      case 'tl':
        return <Timeline />;
      case 'next':
        return <NextClasses />;
      case 'free':
        return (
          <div style={{ padding: 20 }}>
            <FreeRooms />
          </div>
        );
      case 'heat':
        return <WeeklyHeatmap />;
      case 'reports': // Novo caso para a Sandbox do Encarregado
        return <HistoricalReports />;
      case 'upload':
        return (
          <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <UploadCSV onUploadSuccess={() => console.log('Grade sincronizada com sucesso!')} />
          </div>
        );
      default:
        return <LiveMap />;
    }
  };

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Cabeçalho Superior */}
      <Topbar session={session} />

      {/* BARRA DE BUSCA GLOBAL */}
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

        {/* Dropdown de Resultados */}
        {showDropdown && (
          <div className="search-dropdown vis">
            {isSearching ? (
              <div className="sd-empty">Buscando na base do Prédio 15...</div>
            ) : searchResults.length === 0 ? (
              <div className="sd-empty">Nenhum registro encontrado.</div>
            ) : (
              <>
                {searchResults.map((res) => (
                  <div key={res.id} className="sd-item" onClick={() => handleSelectResult(res)}>
                    <div className="sd-room">{res.sala}</div>
                    <div className="sd-info">
                      <div className="sd-class">{res.nome}</div>
                      <div className="sd-meta">
                        {res.dia_semana} · Per. {res.periodosFormatados} · {res.horarioInicio}
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

      {/* NAVEGAÇÃO ENTRE ABAS */}
      <div className="navtabs">
        <div className={`navtab ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>Planta ao Vivo</div>
        <div className={`navtab ${activeTab === 'tl' ? 'active' : ''}`} onClick={() => setActiveTab('tl')}>Linha do Tempo</div>
        <div className={`navtab ${activeTab === 'next' ? 'active' : ''}`} onClick={() => setActiveTab('next')}>Próximas Aulas</div>
        <div className={`navtab ${activeTab === 'free' ? 'active' : ''}`} onClick={() => setActiveTab('free')}>Salas Livres</div>
        <div className={`navtab ${activeTab === 'heat' ? 'active' : ''}`} onClick={() => setActiveTab('heat')}>Ocupação Semanal</div>
        
        {/* NOVA ABA: Relatórios Históricos */}
        <div className={`navtab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Relatórios Históricos</div>
        
        <div className={`navtab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Atualizar Grade</div>
      </div>

      {/* ÁREA DE CONTEÚDO DINÂMICO */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {renderTabContent()}
      </div>

    </div>
  );
}