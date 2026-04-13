import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import SeletorPredio from './SeletorPredio';

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
  const nomeUsuario = session?.user?.user_metadata?.nome 
    || session?.user?.email?.split('@')[0] 
    || 'Usuário';
  const inicial = nomeUsuario.charAt(0).toUpperCase();

  return (
    <div className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border, #334155)', background: 'var(--bg, #0f172a)' }}>
      <div className="tb-logo" style={{ display: 'flex', alignItems: 'center', gap: '16px', fontWeight: 'bold', fontSize: '18px' }}>
        <span style={{ color: '#3b82f6', letterSpacing: '1px' }}>PUCRS</span>
        <div style={{ width: '1px', height: '20px', background: 'var(--border, #334155)' }}></div>
        <SeletorPredio acesso={acesso} /> 
      </div>
      <div className="tb-clock" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary, #94a3b8)', fontSize: '14px', fontWeight: '500' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>
          {`${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`}
        </span>
        <span>·</span>
        <span>{time.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}</span>
      </div>
      <div className="tb-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="live-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div className="live-dot" style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }}></div>
          AO VIVO
        </div>
        <button 
          className="tb-btn" 
          onClick={onAbrirPerfil}
          title={`${session?.user?.email} (${acesso?.perfilNome || 'Sem Perfil'})`}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            background: 'var(--surface, rgba(255,255,255,0.05))',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            padding: '4px 16px 4px 4px', 
            borderRadius: '24px',
            color: 'var(--text, #f8fafc)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border, rgba(255,255,255,0.1))'}
        >
          <div style={{ 
            background: '#3b82f6', color: '#fff', width: '28px', height: '28px', 
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 'bold' 
          }}>
            {inicial}
          </div>
          <span style={{ fontWeight: '600', fontSize: '13px' }}>{nomeUsuario}</span>
        </button>
        <button 
          className="tb-btn" 
          onClick={() => setIsDark(!isDark)}
          title="Alternar Tema"
          style={{ 
            background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer',
            padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.8, transition: 'opacity 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = 1}
          onMouseOut={(e) => e.currentTarget.style.opacity = 0.8}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <button 
          className="tb-btn" 
          onClick={() => supabase.auth.signOut()} 
          style={{ 
            background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.5)', 
            color: '#ef4444', padding: '6px 16px', borderRadius: '6px', 
            fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.borderColor = '#ef4444'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'; }}
        >
          Sair
        </button>

      </div>
    </div>
  );
}