import { useMemo, useState } from 'react';
import { useUI } from '../contexts/UIContext';
import { useSalasPredio } from '../hooks/useSalasPredio';
import { agruparPorAndar, marcadaPorPadrao, montarAlteracoes } from '../utils/salas';
import LinhaSala from './LinhaSala';

// Gestão → Salas do Prédio: escolhe quais salas aparecem no sistema. Sala
// desmarcada some da Planta, Linha do tempo, Próximas aulas, Salas livres,
// Ocupação e da busca, mesmo que a agenda traga agendamentos nela.
export default function SalasPredio({ session, acesso }) {
  const { toast } = useUI();
  const { salas, pendentes, loading, error, salvarVisibilidade, salvando } = useSalasPredio(session, acesso);
  const [escolha, setEscolha] = useState({});

  const marcada = (s) => escolha[s.numero] ?? marcadaPorPadrao(s);
  const alternar = (numero) => {
    const sala = salas.find(s => s.numero === numero);
    setEscolha(e => ({ ...e, [numero]: !marcada(sala) }));
  };
  const marcarTodas = (valor) => setEscolha(Object.fromEntries(salas.map(s => [s.numero, valor])));

  const andares = useMemo(() => agruparPorAndar(salas), [salas]);
  const alteracoes = montarAlteracoes(salas, escolha);
  const totalAlteracoes = alteracoes.exibir.length + alteracoes.ocultar.length;
  const visiveis = salas.filter(marcada).length;

  const salvar = async () => {
    try {
      await salvarVisibilidade(alteracoes);
      setEscolha({});
      toast.success(`Salas salvas: ${visiveis} visíveis, ${salas.length - visiveis} ocultas.`);
    } catch (e) {
      // Mantém a escolha na tela para poder salvar de novo
      toast.error(e.message || 'Não foi possível salvar as salas.');
    }
  };

  if (loading) return <div className="empty-st">Carregando salas do prédio...</div>;
  if (error) return <div className="empty-st" style={{ color: 'var(--red)' }}>⚠️ {error.message}</div>;
  if (!salas.length) return <div className="empty-st">Nenhuma sala cadastrada. Importe a agenda do prédio em Gestão → Atualizar Grade.</div>;

  const botaoSec = { background: 'transparent', border: '1px solid var(--border2)', borderRadius: '6px', padding: '6px 12px', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer' };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Sem overflow:hidden no cartão — ele anularia o sticky da barra de salvar */}
      <div className="bar-card" style={{ padding: 0 }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Salas do Prédio</h3>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
            Marque as salas que aparecem no sistema. As desmarcadas ficam ocultas na Planta, na Linha do tempo,
            nas Próximas aulas, em Salas livres, na Ocupação e na busca, mesmo que a agenda traga agendamentos nelas.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: 'auto' }}>
              <b style={{ color: 'var(--text)' }}>{visiveis}</b> visíveis · <b style={{ color: 'var(--text)' }}>{salas.length - visiveis}</b> ocultas
            </span>
            <button type="button" style={botaoSec} onClick={() => marcarTodas(true)} disabled={salvando}>Marcar todas</button>
            <button type="button" style={botaoSec} onClick={() => marcarTodas(false)} disabled={salvando}>Desmarcar todas</button>
          </div>
        </div>

        {pendentes.length > 0 && (
          <div style={{ padding: '10px 20px', background: 'var(--blue-b)', color: 'var(--blue)', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
            {pendentes.length === 1
              ? <>A sala <b>{pendentes[0].numero}</b> apareceu numa importação e ainda não aparece no sistema. Marque se ela deve ser exibida e salve.</>
              : <><b>{pendentes.length} salas novas</b> apareceram em importações e ainda não aparecem no sistema. Marque as que devem ser exibidas e salve.</>}
          </div>
        )}

        {andares.map(grupo => (
          <div key={grupo.andar}>
            <div style={{ padding: '8px 20px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--panel2)', borderBottom: '1px solid var(--border)' }}>
              {grupo.rotulo}
            </div>
            <div style={{ padding: '0 8px' }}>
              {grupo.salas.map(s => (
                <LinhaSala key={s.numero} sala={s} marcada={marcada(s)} onAlternar={alternar} desabilitada={salvando} />
              ))}
            </div>
          </div>
        ))}

        <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: 'var(--panel)', borderTop: '1px solid var(--border)', borderRadius: '0 0 var(--radius) var(--radius)', boxShadow: '0 -6px 12px -8px rgba(0,0,0,.35)' }}>
          <span style={{ fontSize: '12px', color: totalAlteracoes ? 'var(--text)' : 'var(--muted)', marginRight: 'auto' }}>
            {totalAlteracoes
              ? `${totalAlteracoes} ${totalAlteracoes === 1 ? 'alteração não salva' : 'alterações não salvas'}`
              : 'Nenhuma alteração'}
          </span>
          <button type="button" style={botaoSec} onClick={() => setEscolha({})} disabled={!totalAlteracoes || salvando}>Desfazer</button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={!totalAlteracoes || salvando} style={{ opacity: !totalAlteracoes || salvando ? 0.5 : 1 }}>
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
