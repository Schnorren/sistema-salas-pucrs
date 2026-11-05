import { horarioDosPeriodos, dataCurta } from '../utils/aulasDoDia';
import { OVERLAY, CARTAO, BOTAO, BOTAO_PERIGO, BOTAO_PEQUENO } from '../utils/estilosModalTroca';

const rotuloDoDia = (item) => {
  const quando = item.emDias === 0 ? ' (hoje)' : item.emDias === 1 ? ' (amanhã)' : '';
  return `${item.dia}, ${dataCurta(item.data)}${quando}`;
};

// Lista das trocas de sala que ainda vão acontecer (hoje e os próximos 6 dias),
// para reimprimir, editar e desfazer sem procurar a célula vermelha na grade.
// itens = listarTrocas() de utils/aulasDoDia (já ordenados).
export default function ModalListaTrocas({ itens, ate, canEditGrade, desfazendoChave, onFechar, onVerNaGrade, onImprimir, onEditar, onDesfazer }) {
  return (
    <div style={OVERLAY} role="dialog" aria-modal="true" aria-labelledby="titulo-lista-trocas">
      <div style={{ ...CARTAO, width: '760px', display: 'flex', flexDirection: 'column' }}>
        <h2 id="titulo-lista-trocas" style={{ margin: '0 0 4px 0', color: 'var(--text)' }}>🔁 Trocas de sala</h2>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
          De hoje até {ate}. Cada troca vale só para a data dela.
        </div>

        {itens.length === 0 ? (
          <div className="empty-st" style={{ padding: '30px 10px' }}>Nenhuma troca de sala registrada para esses dias.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {itens.map(item => {
              const { registro, bloco } = item;
              const nome = registro.nome_aula_editado || bloco?.nomeAula || bloco?.nome || '';
              return (
                <div key={item.chave} data-troca={item.chave} style={{ border: '1px solid var(--border)', borderLeft: '4px solid var(--red)', borderRadius: '8px', padding: '12px 14px', background: 'var(--panel2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                      <span style={{ color: 'var(--red)' }}>{rotuloDoDia(item)}</span>
                      <span style={{ fontFamily: 'var(--mono)', marginLeft: '10px' }}>{item.afetados.join(' ')}</span>
                      <span style={{ fontWeight: 'normal', color: 'var(--muted)', marginLeft: '8px', fontSize: '12px' }}>{horarioDosPeriodos(item.afetados)}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                      Sala <b>{item.sala}</b> → Prédio <b>{registro.predio_destino}</b> · Sala <b>{registro.sala_destino}</b>
                    </div>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text)' }}>
                    {nome}
                    {registro.motivo && <span style={{ color: 'var(--muted)' }}> · Motivo: {registro.motivo}</span>}
                  </div>
                  {!bloco && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                      ⚠️ Esta aula não está mais na grade atual (a grade foi reimportada).
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px', flexWrap: 'wrap' }}>
                    {bloco && <button type="button" onClick={() => onVerNaGrade(item)} style={{ ...BOTAO, ...BOTAO_PEQUENO }}>Ver na grade</button>}
                    <button type="button" onClick={() => onImprimir(item)} style={{ ...BOTAO, ...BOTAO_PEQUENO }}>🖨️ Reimprimir</button>
                    {canEditGrade && bloco && <button type="button" onClick={() => onEditar(item)} style={{ ...BOTAO, ...BOTAO_PEQUENO }}>Editar</button>}
                    {canEditGrade && (
                      <button type="button" onClick={() => onDesfazer(item)} disabled={desfazendoChave === item.chave} style={{ ...BOTAO_PERIGO, ...BOTAO_PEQUENO }}>
                        {desfazendoChave === item.chave ? 'Desfazendo...' : 'Desfazer'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" onClick={onFechar} style={BOTAO}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
