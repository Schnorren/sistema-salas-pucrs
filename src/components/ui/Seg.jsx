import { getDiaAtual } from '../../../backend_core/utils/timeHelpers';
import { DIAS_SEMANA, DIA_CURTO } from '../../utils/blocos';

// Controle segmentado: opcoes = [[valor, rótulo], ...]
export function Seg({ opcoes, valor, onChange, rotulo, pequeno = false }) {
  return (
    <div className={`seg ${pequeno ? 'sm' : ''}`} role="group" aria-label={rotulo}>
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

// Dias da semana com marcador em "hoje" (fuso de Brasília). Domingo só aparece
// quando é hoje ou quando já está selecionado — a grade raramente tem aula nele.
export function SegDias({ valor, onChange }) {
  const hoje = getDiaAtual();
  const dias = DIAS_SEMANA.filter((d) => d !== 'Domingo' || hoje === 'Domingo' || valor === 'Domingo');
  return (
    <div className="seg" role="group" aria-label="Dia da semana">
      {dias.map((d) => (
        <button key={d} type="button" aria-pressed={valor === d} onClick={() => onChange(d)} title={d === hoje ? `${d} (hoje)` : d}>
          {DIA_CURTO[d]}
          {d === hoje && <i className="hoje" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
