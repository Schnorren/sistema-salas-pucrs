import { useState } from 'react';
import { supabase } from '../supabase';
import { useUI } from '../contexts/UIContext';
import { useTema } from '../hooks/useTema';
import { Seg } from './ui/Seg';

const nomeDe = (session) => {
  const meta = session?.user?.user_metadata;
  return meta?.nome || meta?.name || meta?.full_name || '';
};

// Meu perfil: nome de exibição, senha e tema. Nome e senha são salvos
// separadamente (supabase.auth.updateUser), cada um com o seu botão.
export default function MeuPerfil({ session, acesso, isAdmin }) {
  const { toast } = useUI();
  const [tema, setTema] = useTema();
  const [nome, setNome] = useState(() => nomeDe(session));
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const exibido = nome.trim() || session?.user?.email?.split('@')[0] || 'Usuário';
  const iniciais = exibido.split(/[\s.]+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const salvarNome = async (e) => {
    e.preventDefault();
    setSalvandoNome(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { nome: nome.trim() } });
      if (error) throw error;
      toast.success('Nome atualizado.');
    } catch (err) { toast.error(err.message || 'Não foi possível atualizar o nome.'); }
    finally { setSalvandoNome(false); }
  };

  const salvarSenha = async (e) => {
    e.preventDefault();
    if (senha.length < 6) { toast.error('A nova senha precisa ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmar) { toast.error('As duas senhas não são iguais.'); return; }
    setSalvandoSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSenha(''); setConfirmar('');
      toast.success('Senha alterada.');
    } catch (err) { toast.error(err.message || 'Não foi possível alterar a senha.'); }
    finally { setSalvandoSenha(false); }
  };

  return (
    <div className="pg">
      <div className="perfil">
        <h1 className="t-pg">Meu perfil</h1>
        <section className="card perfil-topo">
          <span className="avatar">{iniciais}</span>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 17 }}>{exibido}</b>
            <div className="sub">{[acesso?.perfilNome, acesso?.predioNome, isAdmin && 'Administrador'].filter(Boolean).join(' · ')}</div>
          </div>
        </section>

        <form className="card" onSubmit={salvarNome}>
          <div className="card-hd"><b>Dados de acesso</b></div>
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="campo"><label htmlFor="pf-nome">Como você quer ser chamado</label><input id="pf-nome" className="inp" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" maxLength={120} /></div>
            <div className="campo"><label htmlFor="pf-email">E-mail de login</label><input id="pf-email" className="inp" value={session?.user?.email || ''} disabled /></div>
            <div><button className="btn pri" disabled={salvandoNome || nome.trim() === nomeDe(session)}>{salvandoNome ? 'Salvando…' : 'Salvar nome'}</button></div>
          </div>
        </form>

        <form className="card" onSubmit={salvarSenha}>
          <div className="card-hd"><b>Trocar senha</b></div>
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="linha-campos">
              <div className="campo"><label htmlFor="pf-s1">Nova senha</label><input id="pf-s1" className="inp" type="password" autoComplete="new-password" placeholder="mínimo 6 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
              <div className="campo"><label htmlFor="pf-s2">Confirmar</label><input id="pf-s2" className="inp" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} /></div>
            </div>
            <div><button className="btn" disabled={salvandoSenha || !senha}>{salvandoSenha ? 'Alterando…' : 'Trocar senha'}</button></div>
          </div>
        </form>

        <section className="card">
          <div className="card-hd"><b>Preferências deste navegador</b></div>
          <div className="card-bd" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}>Tema da interface</span>
            <Seg rotulo="Tema" valor={tema} onChange={setTema} opcoes={[['claro', 'Claro'], ['escuro', 'Escuro']]} />
          </div>
        </section>
      </div>
    </div>
  );
}
