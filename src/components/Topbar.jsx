import { useState, useEffect, useRef } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Search, ChevronDown, User, Moon, LogOut } from 'lucide-react';
import { supabase } from '../supabase';
import SeletorPredio from './SeletorPredio';
import { useTema } from '../hooks/useTema';
import { useMenu } from '../hooks/useMenu';
import { getDataSaoPaulo, getCurrentPeriod } from '../../backend_core/utils/timeHelpers';

// Relógio no fuso da PUCRS + período atual (regra do projeto: nunca o fuso do browser).
function Relogio() {
  const [agora, setAgora] = useState(() => getDataSaoPaulo());
  useEffect(() => {
    const t = setInterval(() => setAgora(getDataSaoPaulo()), 15000);
    return () => clearInterval(t);
  }, []);
  const per = getCurrentPeriod();
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return (
    <div className="relogio" title={`${data} · horário de Brasília`}>
      <span className="vivo" aria-hidden="true" />
      <span className="hora">{hh}:{mm}</span>
      <span className="per">{per ? `Per. ${per}` : 'Fora de aula'}</span>
    </div>
  );
}

function MenuUsuario({ session, acesso, isAdmin }) {
  const { aberto, setAberto, ref } = useMenu();
  const [tema, setTema] = useTema();
  const [saindo, setSaindo] = useState(false);
  const nome = session?.user?.user_metadata?.nome || session?.user?.email?.split('@')[0] || 'Usuário';
  const iniciais = nome.split(/[\s.]+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const sair = async () => {
    setSaindo(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSaindo(false);
      await supabase.auth.signOut({ scope: 'local' }); // falhou no servidor: limpa a sessão local mesmo assim
    }
  };

  return (
    <div className="user-wrap" ref={ref}>
      <button className="avatar-btn" onClick={() => setAberto(!aberto)} aria-haspopup="true" aria-expanded={aberto} aria-label="Menu do usuário" title={session?.user?.email}>
        <span className="avatar">{iniciais}</span>
      </button>
      {aberto && (
        <div className="menu dir">
          <div className="mu-quem">
            <span className="avatar">{iniciais}</span>
            <div style={{ minWidth: 0 }}>
              <b>{nome}</b>
              <small>{acesso?.perfilNome || 'Sem cargo'}{isAdmin ? ' · Administrador' : ''}</small>
              <small style={{ overflowWrap: 'anywhere' }}>{session?.user?.email}</small>
            </div>
          </div>
          <div className="menu-sep" />
          <Link className="mi" to="/perfil" onClick={() => setAberto(false)}><User size={16} /><span>Meu perfil</span></Link>
          <div className="mi" style={{ cursor: 'default' }}>
            <Moon size={16} /><span style={{ flex: 1 }}>Tema</span>
            <div className="seg sm" role="group" aria-label="Tema">
              <button type="button" aria-pressed={tema === 'claro'} onClick={() => setTema('claro')}>Claro</button>
              <button type="button" aria-pressed={tema === 'escuro'} onClick={() => setTema('escuro')}>Escuro</button>
            </div>
          </div>
          <div className="menu-sep" />
          <button className="mi perigo" onClick={sair} disabled={saindo}><LogOut size={16} /><span>{saindo ? 'Saindo…' : 'Sair'}</span></button>
        </div>
      )}
    </div>
  );
}

function MenuGestao({ grupos, ativo }) {
  const { aberto, setAberto, ref } = useMenu();
  const [esquerda, setEsquerda] = useState(0);
  const btnRef = useRef(null);
  const abrir = () => {
    // O menu fica fora da faixa de abas (que tem overflow-x e cortaria o
    // dropdown), posicionado sob o botão.
    const hdr = btnRef.current?.closest('.hdr')?.getBoundingClientRect();
    const b = btnRef.current?.getBoundingClientRect();
    if (hdr && b) setEsquerda(Math.max(8, Math.min(b.left - hdr.left, window.innerWidth - 350)));
    setAberto(!aberto);
  };
  if (!grupos.length) return null;
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <button ref={btnRef} className={`tab ${ativo ? 'active' : ''}`} onClick={abrir} aria-haspopup="true" aria-expanded={aberto}>
        Gestão <ChevronDown size={14} />
      </button>
      {aberto && (
        <div className="menu menu-gestao" style={{ left: esquerda }}>
          {grupos.map(g => (
            <div key={g.grupo}>
              <div className="menu-grupo">{g.grupo}</div>
              {g.itens.map((item) => {
                const Icone = item.Icone;
                return (
                  <Link key={item.to} to={item.to} className={`mi ${item.ativo ? 'active' : ''}`} onClick={() => setAberto(false)}>
                    <Icone size={16} /><span>{item.rotulo}<small>{item.descricao}</small></span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cabeçalho em barra única (56px): marca + prédio · abas · busca (Ctrl K) ·
// relógio com período · avatar (perfil, tema, sair).
export default function Topbar({ session, acesso, isAdmin, abas, gruposGestao, gestaoAtiva, onAbrirBusca }) {
  return (
    <header className="hdr">
      <Link to="/" className="marca" aria-label="PUCRS · ir para a Planta">
        <span className="selo" aria-hidden="true" />
        <span className="marca-nome">PUCRS</span>
      </Link>
      <SeletorPredio acesso={acesso} session={session} />
      <nav className="tabs" aria-label="Telas">
        {abas.map(({ to, rotulo, badge, badgeTipo, badgeTitulo, end }) => (
          <NavLink key={to} to={to} end={end} className="tab">
            {rotulo}
            {badge > 0 && <span className={`badge ${badgeTipo}`} title={badgeTitulo}>{badge}</span>}
          </NavLink>
        ))}
        <MenuGestao grupos={gruposGestao} ativo={gestaoAtiva} />
      </nav>
      <div className="hdr-dir">
        <button className="busca-btn" onClick={onAbrirBusca} aria-label="Buscar (Ctrl K)">
          <Search size={15} /><span className="txt">Buscar sala, aula, contato…</span><kbd>Ctrl K</kbd>
        </button>
        <Relogio />
        <MenuUsuario session={session} acesso={acesso} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
