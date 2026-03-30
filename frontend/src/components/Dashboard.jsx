import { useState } from 'react';
import Topbar from './Topbar';
import UploadCSV from './UploadCSV';

export default function Dashboard({ session }) {
  // Estado para controlar qual aba está aberta
  const [activeTab, setActiveTab] = useState('map');

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* Cabeçalho */}
      <Topbar session={session} />

      {/* Barra de Busca (Estática por enquanto) */}
      <div className="search-bar">
        <div className="search-input-wrap">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input className="search-input" placeholder="Buscar por código, disciplina ou sala…" autoComplete="off" />
        </div>
      </div>

      {/* Navegação das Abas */}
      <div className="navtabs">
        <div className={`navtab ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>Planta ao Vivo</div>
        <div className={`navtab ${activeTab === 'tl' ? 'active' : ''}`} onClick={() => setActiveTab('tl')}>Linha do Tempo</div>
        <div className={`navtab ${activeTab === 'next' ? 'active' : ''}`} onClick={() => setActiveTab('next')}>Próximas Aulas</div>
        <div className={`navtab ${activeTab === 'free' ? 'active' : ''}`} onClick={() => setActiveTab('free')}>Salas Livres</div>
        <div className={`navtab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Atualizar Grade</div>
      </div>

      {/* Conteúdo Dinâmico das Abas */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {activeTab === 'map' && <div style={{ padding: 20 }}>Visão da Planta (Em construção...)</div>}
        {activeTab === 'tl' && <div style={{ padding: 20 }}>Visão da Linha do Tempo (Em construção...)</div>}
        {activeTab === 'next' && <div style={{ padding: 20 }}>Próximas Aulas (Em construção...)</div>}
        {activeTab === 'free' && <div style={{ padding: 20 }}>Salas Livres (Em construção...)</div>}
        {activeTab === 'upload' && (
          <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <UploadCSV onUploadSuccess={() => console.log('Upload feito!')} />
          </div>
        )}
      </div>

    </div>
  );
} 