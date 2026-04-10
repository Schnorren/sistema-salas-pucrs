import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import SeletorPredio from './SeletorPredio';

// 🔥 Adicionamos a prop onAbrirPerfil
export default function Topbar({ session, acesso, onAbrirPerfil }) {
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

  // Tenta extrair o nome dos metadados para mostrar no topo (fica mais elegante que o e-mail)
  const nomeUsuario = session?.user?.user_metadata?.nome 
    || session?.user?.email?.split('@')[0] 
    || 'Usuário';

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
        {/* 🔥 TRANSFORMAMOS EM UM BOTÃO CLICÁVEL */}
        <button 
          className="tb-btn" 
          onClick={onAbrirPerfil}
          title={`${session.user.email} (${acesso?.perfilNome || 'Sem Perfil'})`}
          style={{ 
            background: 'rgba(59, 130, 246, 0.1)', 
            borderColor: '#3b82f6', 
            color: '#60a5fa',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          👤 Meu Perfil ({nomeUsuario})
        </button>

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