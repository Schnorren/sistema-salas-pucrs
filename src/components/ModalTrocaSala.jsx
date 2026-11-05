import { useState } from 'react';
import { periodosAfetadosPelaTroca, horarioDosPeriodos, dataPorExtenso } from '../utils/aulasDoDia';
import { OVERLAY, CARTAO, ROTULO, CAMPO, BOTAO, BOTAO_PRIMARIO } from '../utils/estilosModalTroca';

// Formulário da troca de sala: o essencial primeiro (data, períodos, destino)
// e os dados que só servem ao cartaz recolhidos. O destino é texto livre de
// propósito — a troca costuma ir para OUTRO prédio ou ser união de aulas (sala
// já ocupada), então não há sugestão de salas livres.
//
// onSalvar(form, { imprimir }) — quem chama grava e, se pedido, imprime.
export default function ModalTrocaSala({ aula, registro, salvando, onCancelar, onSalvar }) {
  const [form, setForm] = useState(() => ({
    predio: registro?.predio_destino ?? '',
    sala: registro?.sala_destino ?? '',
    motivo: registro?.motivo ?? '',
    nomeAulaEditado: registro?.nome_aula_editado || aula.nomeAula || aula.nome || '',
    professor: registro?.professor ?? '',
    codCred: registro?.cod_cred || aula.codCred || '',
    // Bloco (LMNP) começa todo marcado; editar restaura só a parte salva.
    periodosSelecionados: registro ? periodosAfetadosPelaTroca(registro, aula.periodos) : aula.periodos,
  }));
  const alterar = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

  // Nunca deixa desmarcar o último período (a troca precisa de pelo menos 1).
  const alternarPeriodo = (p) => setForm(f => {
    const marcado = f.periodosSelecionados.includes(p);
    if (marcado && f.periodosSelecionados.length === 1) return f;
    return { ...f, periodosSelecionados: marcado ? f.periodosSelecionados.filter(x => x !== p) : [...f.periodosSelecionados, p] };
  });

  const selecionados = aula.periodos.filter(p => form.periodosSelecionados.includes(p));

  const enviar = (e) => {
    e.preventDefault();
    const imprimir = e.nativeEvent?.submitter?.dataset?.acao === 'imprimir';
    onSalvar({ ...form, periodosSelecionados: selecionados }, { imprimir });
  };

  return (
    <div style={OVERLAY} role="dialog" aria-modal="true" aria-labelledby="titulo-troca-sala">
      <form onSubmit={enviar} style={CARTAO}>
        <h2 id="titulo-troca-sala" style={{ margin: '0 0 4px 0', color: 'var(--text)' }}>
          🔁 {registro ? 'Editar troca de sala' : 'Trocar de sala'}
        </h2>
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
          {aula.nomeAula || aula.nome} · sala {aula.sala}
        </div>
        <div style={{ margin: '10px 0 20px 0', fontSize: '13px', fontWeight: 'bold', color: 'var(--text)' }}>
          📅 Vale só para {dataPorExtenso(aula.dia, aula.data)}
        </div>

        <div style={{ marginBottom: '18px' }}>
          {aula.periodos.length > 1 ? (
            <>
              <span style={ROTULO}>
                PERÍODOS QUE MUDAM <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(desmarque os que continuam na sala {aula.sala})</span>
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {aula.periodos.map(p => {
                  const marcado = form.periodosSelecionados.includes(p);
                  return (
                    <button
                      type="button"
                      key={p}
                      onClick={() => alternarPeriodo(p)}
                      aria-pressed={marcado}
                      title={marcado ? `Período ${p} muda de sala` : `Período ${p} continua na sala ${aula.sala}`}
                      style={{
                        minWidth: '36px', padding: '8px 10px', borderRadius: '6px', fontWeight: 'bold',
                        fontFamily: 'var(--mono)', fontSize: '13px', cursor: 'pointer',
                        border: marcado ? '1px solid var(--blue)' : '1px solid var(--border)',
                        background: marcado ? 'var(--blue)' : 'var(--panel2)',
                        color: marcado ? '#fff' : 'var(--muted)',
                        textDecoration: marcado ? 'none' : 'line-through',
                        transition: 'all .15s',
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
                <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>{horarioDosPeriodos(selecionados)}</span>
              </div>
            </>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Período <b style={{ fontFamily: 'var(--mono)' }}>{aula.periodos[0]}</b> · {horarioDosPeriodos(aula.periodos)}
            </span>
          )}
        </div>

        <span style={ROTULO}>PARA ONDE?</span>
        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
          <label style={{ flex: 1 }}>
            <span style={{ ...ROTULO, fontWeight: 'normal' }}>Prédio</span>
            <input autoFocus type="text" placeholder="Ex: 32" value={form.predio} onChange={alterar('predio')} style={CAMPO} required />
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ ...ROTULO, fontWeight: 'normal' }}>Sala</span>
            <input type="text" placeholder="Ex: 301" value={form.sala} onChange={alterar('sala')} style={CAMPO} required />
          </label>
        </div>

        <label style={{ display: 'block', marginBottom: '18px' }}>
          <span style={ROTULO}>MOTIVO <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(controle interno, não sai no cartaz)</span></span>
          <input type="text" placeholder="Ex: Problema no projetor..." value={form.motivo} onChange={alterar('motivo')} style={CAMPO} />
        </label>

        {/* Só aparecem no cartaz impresso — vêm preenchidos da grade */}
        <details style={{ marginBottom: '22px', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', background: 'var(--panel2)' }}>
          <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>
            DADOS DO CARTAZ <span style={{ fontWeight: 'normal' }}>· {form.nomeAulaEditado || aula.nomeAula}{form.codCred ? ` · ${form.codCred}` : ''}{form.professor ? ` · ${form.professor}` : ''}</span>
          </summary>
          <label style={{ display: 'block', marginTop: '12px' }}>
            <span style={ROTULO}>NOME DA DISCIPLINA</span>
            <input type="text" value={form.nomeAulaEditado} onChange={alterar('nomeAulaEditado')} placeholder={aula.nomeAula} style={{ ...CAMPO, fontWeight: 'bold' }} />
          </label>
          <div style={{ display: 'flex', gap: '15px', marginTop: '12px' }}>
            <label style={{ flex: 1 }}>
              <span style={ROTULO}>COD/CRED <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(opcional)</span></span>
              <input type="text" placeholder="Ex: 34221-04" value={form.codCred} onChange={alterar('codCred')} style={CAMPO} />
            </label>
            <label style={{ flex: 2 }}>
              <span style={ROTULO}>PROFESSOR <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(opcional)</span></span>
              <input type="text" placeholder="Ex: João da Silva" value={form.professor} onChange={alterar('professor')} style={CAMPO} />
            </label>
          </div>
        </details>

        {/* "Salvar" vem antes no DOM: Enter num campo salva sem abrir a impressão */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancelar} style={BOTAO}>Cancelar</button>
          <button type="submit" data-acao="salvar" disabled={salvando} style={BOTAO}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="submit" data-acao="imprimir" disabled={salvando} style={BOTAO_PRIMARIO}>
            🖨️ Salvar e imprimir aviso
          </button>
        </div>
      </form>
    </div>
  );
}
