import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import SeletorPredio from './SeletorPredio'; // <-- Importe o componente

export default function Topbar({ session, acesso }) {
  const [isDark, setIsDark] = useState(localStorage.getItem('theme') !== 'light');
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="topbar">
      <div className="tb-logo">
        PUCRS 
        <SeletorPredio acesso={acesso} /> 
        <span style={{ marginLeft: '8px' }}>·</span> Secretaria
      </div>
      <div className="tb-sep"></div>
            
      <div className="tb-clock">
        {`${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`}
      </div>
      <div className="tb-date">
        {time.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}
      </div>
      
      <div className="tb-right">
        <div className="tb-file" title={`${session.user.email} (${acesso?.perfilNome || 'Sem Perfil'})`}>
          👤 {session.user.email.split('@')[0]}
        </div>
        <button className="tb-btn" onClick={() => setIsDark(!isDark)}>
          {isDark ? '☀️ Claro' : '🌙 Escuro'}
        </button>
        <button className="tb-btn" onClick={() => supabase.auth.signOut()} style={{ borderColor: '#a02828', color: '#ffb3b3' }}>
          Sair
        </button>
        <div className="live-badge"><div className="live-dot"></div>AO VIVO</div>
      </div>
    </div>
  );
}