import { useState } from 'react';
import { agruparPorAndar, descreverAgenda, semAulaRegular } from '../utils/salas';
import LinhaSala from './LinhaSala';

const fundo = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' };
const caixa = { textAlign: 'left', background: 'var(--panel)', borderRadius: '12px', width: '560px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)' };
const botaoSec = { background: 'transparent', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '9px 16px', color: 'var(--text2)', fontSize: '13px', cursor: 'pointer' };
const link = { background: 'none', border: 'none', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 };
const rodape = 'Você pode mudar isso quando quiser em Gestão → Salas do Prédio.';

// Pergunta mostrada logo depois da importação quando a agenda trouxe salas que
// o prédio não conhecia (ou que seguem sem decisão). Até alguém responder,
// essas salas ficam ocultas. "Decidir depois" só fecha: continuam pendentes.
export default function DecisaoSalasNovas({ salas, primeiraImportacao, salvando, onSalvar, onFechar }) {
  // Todas aqui estão sem decisão: a sugestão é exibir as que têm aula regular
  const [escolha, setEscolha] = useState(() => Object.fromEntries(salas.map(s => [s.numero, !semAulaRegular(s)])));

  const decidir = (exibir) => onSalvar({
    exibir: salas.filter(s => exibir(s)).map(s => s.numero),
    ocultar: salas.filter(s => !exibir(s)).map(s => s.numero),
  });

  // Uma sala só: pergunta direta, sim ou não
  if (salas.length === 1 && !primeiraImportacao) {
    const sala = salas[0];
    return (
      <div style={fundo} role="dialog" aria-modal="true" aria-labelledby="titulo-sala-nova">
        <div style={{ ...caixa, padding: '26px 28px', gap: '14px' }}>
          <h2 id="titulo-sala-nova" style={{ margin: 0, fontSize: '19px', color: 'var(--text)' }}>Sala nova na agenda</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text2)', lineHeight: 1.5 }}>
            {sala.nova
              ? <>A agenda que você importou tem agendamentos na <b>sala {sala.numero}</b>, que ainda não aparece no sistema.</>
              : <>A <b>sala {sala.numero}</b> apareceu numa importação anterior e ainda está esperando uma decisão.</>}
          </p>
          <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: 'var(--text2)' }}>
            <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{descreverAgenda(sala)}</div>
            {sala.exemplos?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: 'var(--muted)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {sala.exemplos.map(n => <li key={n}>{n}</li>)}
              </ul>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text)', lineHeight: 1.5 }}>
            Deseja exibir a sala {sala.numero} na Planta, na Linha do tempo e nas demais telas?
            {!sala.regulares && <span style={{ display: 'block', fontSize: '12px', color: 'var(--amber)', marginTop: '4px' }}>Ela não tem nenhuma aula regular nesta semana, só eventos internos ou nenhum agendamento.</span>}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button type="button" className="btn-primary" disabled={salvando} onClick={() => decidir(() => true)}>
              {salvando ? 'Salvando...' : `Sim, exibir a sala ${sala.numero}`}
            </button>
            <button type="button" style={botaoSec} disabled={salvando} onClick={() => decidir(() => false)}>Não, manter oculta</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{rodape}</span>
            <button type="button" style={link} disabled={salvando} onClick={onFechar}>Decidir depois</button>
          </div>
        </div>
      </div>
    );
  }

  // Várias salas (ou a primeira agenda do prédio): lista para marcar
  const exibidas = salas.filter(s => escolha[s.numero]).length;
  return (
    <div style={fundo} role="dialog" aria-modal="true" aria-labelledby="titulo-salas-novas">
      <div style={caixa}>
        <div style={{ padding: '24px 28px 14px' }}>
          <h2 id="titulo-salas-novas" style={{ margin: 0, fontSize: '19px', color: 'var(--text)' }}>
            {primeiraImportacao ? 'Escolha as salas que aparecem no sistema' : `${salas.length} salas novas na agenda`}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
            {primeiraImportacao
              ? 'Esta é a primeira agenda importada para este prédio. Marque as salas que devem aparecer na Planta, na Linha do tempo e nas demais telas. As desmarcadas ficam ocultas, mesmo com agendamentos — por exemplo, auditórios ou salas usadas só para eventos.'
              : 'A agenda que você importou tem agendamentos em salas que ainda não aparecem no sistema. Marque as que devem ser exibidas; as demais ficam ocultas, mesmo com agendamentos.'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--muted)' }}>Já deixamos marcadas as salas que têm aula regular.</p>
        </div>
        <div style={{ overflowY: 'auto', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {agruparPorAndar(salas).map(grupo => (
            <div key={grupo.andar}>
              <div style={{ padding: '6px 20px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--panel2)', borderBottom: '1px solid var(--border)' }}>
                {grupo.rotulo}
              </div>
              <div style={{ padding: '0 8px' }}>
                {grupo.salas.map(s => (
                  <LinhaSala
                    key={s.numero}
                    sala={{ ...s, situacao: 'decidindo' }}
                    marcada={escolha[s.numero]}
                    onAlternar={(n) => setEscolha(e => ({ ...e, [n]: !e[n] }))}
                    desabilitada={salvando}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 28px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={salvando} onClick={() => decidir(s => escolha[s.numero])}>
              {salvando ? 'Salvando...' : 'Salvar escolha'}
            </button>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{exibidas} de {salas.length} {salas.length === 1 ? 'sala será exibida' : 'salas serão exibidas'}</span>
            <button type="button" style={{ ...link, marginLeft: 'auto' }} disabled={salvando} onClick={onFechar}>Decidir depois</button>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{rodape}</span>
        </div>
      </div>
    </div>
  );
}
