import { periodosAfetadosPelaTroca, horarioDosPeriodos, dataPorExtenso } from '../utils/aulasDoDia';
import { OVERLAY, CARTAO, BOTAO, BOTAO_PRIMARIO, BOTAO_PERIGO } from '../utils/estilosModalTroca';

// Detalhes de uma aula da Linha do tempo (clique na grade) — como numa
// agenda: clicar MOSTRA a aula; trocar de sala é um botão explícito. Também
// serve ao balcão para confirmar a aula, por isso abre para todo mundo; as
// ações de escrita só aparecem com 'edicao_grade' (canEditGrade).
//
// aula = bloco de blocoDaChave() + { data, semana } da ocorrência exibida.
export default function ModalAulaTroca({ aula, registro, canEditGrade, desfazendo, onFechar, onTrocar, onDesfazer, onImprimir }) {
  const afetados = registro ? periodosAfetadosPelaTroca(registro, aula.periodos) : [];
  const parcial = registro && afetados.length < aula.periodos.length;

  return (
    <div style={OVERLAY} role="dialog" aria-modal="true" aria-labelledby="titulo-aula-troca">
      <div style={{ ...CARTAO, width: '560px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <h2 id="titulo-aula-troca" style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', lineHeight: 1.3 }}>
            {aula.nomeAula || aula.nome}
          </h2>
          {aula.codCred && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{aula.codCred}</span>
          )}
        </div>

        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.7 }}>
          <div><b>Sala {aula.sala}</b> · {dataPorExtenso(aula.dia, aula.data)}</div>
          <div style={{ color: 'var(--muted)' }}>
            Períodos <b style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{aula.periodos.join(' ')}</b>
            {' · '}{horarioDosPeriodos(aula.periodos)}
            {aula.tipo === 'Interno' ? ' · Interno' : ''}
          </div>
        </div>

        {registro && (
          <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', color: 'var(--text)', fontSize: '13px', lineHeight: 1.7 }}>
            <div style={{ color: 'var(--red)', fontWeight: 'bold' }}>
              🔁 Trocada para o prédio {registro.predio_destino} · sala {registro.sala_destino}
            </div>
            <div>
              Períodos <b style={{ fontFamily: 'var(--mono)' }}>{afetados.join(' ')}</b> · {horarioDosPeriodos(afetados)}
              {parcial ? ` (os demais continuam na sala ${aula.sala})` : ''}
            </div>
            {registro.motivo && <div style={{ color: 'var(--muted)' }}>Motivo: {registro.motivo}</div>}
          </div>
        )}

        {!canEditGrade && !registro && (
          <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--muted)' }}>
            Registrar troca de sala exige a permissão de edição da grade.
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onFechar} style={BOTAO}>Fechar</button>
          {registro && canEditGrade && (
            <button type="button" onClick={onDesfazer} disabled={desfazendo} style={BOTAO_PERIGO}>
              {desfazendo ? 'Desfazendo...' : 'Desfazer troca'}
            </button>
          )}
          {registro && (
            <button type="button" onClick={onImprimir} style={BOTAO}>🖨️ Reimprimir</button>
          )}
          {canEditGrade && (
            <button type="button" autoFocus onClick={onTrocar} style={BOTAO_PRIMARIO}>
              {registro ? 'Editar troca' : '🔁 Trocar de sala'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
