import { descreverAgenda, semAulaRegular } from '../utils/salas';

const etiqueta = (cor, fundo) => ({
  fontSize: '10px', fontWeight: 'bold', letterSpacing: '.4px', textTransform: 'uppercase',
  color: cor, background: fundo, padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap',
});

// Uma sala com caixa de marcar + o que ela tem na agenda da semana.
// Usada na tela Salas do Prédio e na pergunta depois da importação.
export default function LinhaSala({ sala, marcada, onAlternar, desabilitada }) {
  const pendente = sala.situacao === 'pendente';
  return (
    <label
      style={{
        display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 12px', cursor: desabilitada ? 'default' : 'pointer',
        borderBottom: '1px solid var(--border)', background: marcada ? 'transparent' : 'var(--panel2)',
      }}
    >
      <input
        type="checkbox"
        checked={marcada}
        onChange={() => onAlternar(sala.numero)}
        disabled={desabilitada}
        style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'inherit', accentColor: 'var(--navy)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <b style={{ fontSize: '14px', color: marcada ? 'var(--text)' : 'var(--muted)' }}>Sala {sala.numero}</b>
          {pendente && <span style={etiqueta('var(--blue)', 'var(--blue-b)')}>Nova</span>}
          {semAulaRegular(sala) && <span style={etiqueta('var(--amber)', 'var(--amber-b)')}>Sem aula regular</span>}
          {!marcada && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>· oculta</span>}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '3px' }}>{descreverAgenda(sala)}</div>
        {sala.exemplos?.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sala.exemplos.join('\n')}>
            Ex.: {sala.exemplos.join(' · ')}
          </div>
        )}
      </div>
    </label>
  );
}
