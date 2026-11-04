import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, ChevronRight } from 'lucide-react';
import { getDiaAtual, getCurrentPeriod } from '../../backend_core/utils/timeHelpers';
import { DIAS_SEMANA, DIA_CURTO, blocosDoDia, ordenarSalas, estadoDaSala, normalizar } from '../utils/blocos';
import { buscarNoDiretorio } from '../utils/contatosBusca';

// Busca global (Ctrl K): salas (com o estado de agora), aulas da semana,
// contatos e telas. Tudo é filtrado em memória — a grade já está no cache do
// CDN (useGrade) e o diretório de contatos no cache do useContatos.
export default function BuscaGlobal({ gradeData, trocas, diretorio, telas, onFechar }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const listaRef = useRef(null);

  const hoje = getDiaAtual();
  const per = getCurrentPeriod();

  const porDia = useMemo(
    () => Object.fromEntries(DIAS_SEMANA.map(d => [d, blocosDoDia(gradeData?.grade, d)])),
    [gradeData]
  );
  const salas = useMemo(() => ordenarSalas(gradeData?.salas), [gradeData]);

  const itens = useMemo(() => {
    const n = normalizar(q);
    const r = [];
    const ir = (fn) => () => { onFechar(); fn(); };

    if (n) {
      salas.filter(s => normalizar(s.numero).startsWith(n)).slice(0, 5).forEach(s => {
        const blocos = porDia[hoje]?.[s.numero] || [];
        let desc = blocos.length ? `Hoje: ${blocos.length} aula${blocos.length > 1 ? 's' : ''}` : 'Sem aulas hoje';
        if (per) {
          const e = estadoDaSala(blocos, per, trocas);
          if (e.tipo === 'livre') desc = e.prox ? `Livre agora, até ${e.prox.inicio}` : 'Livre agora, sem mais aulas hoje';
          else if (e.tipo === 'trocada') desc = `Agora: ${e.bloco.titulo} · transferida para P${e.troca.predio_destino} · ${e.troca.sala_destino}`;
          else desc = `Agora: ${e.bloco.titulo} · até ${e.bloco.fim}`;
        }
        r.push({ grupo: 'Salas', id: `s-${s.numero}`, ico: s.numero, titulo: `Sala ${s.numero}`, desc, ir: ir(() => navigate(`/?sala=${encodeURIComponent(s.numero)}`)) });
      });

      if (n.length >= 2) {
        // Começa por hoje e segue a semana, para o resultado mais útil vir 1º
        const ordem = [...DIAS_SEMANA.slice(DIAS_SEMANA.indexOf(hoje)), ...DIAS_SEMANA.slice(0, DIAS_SEMANA.indexOf(hoje))];
        const achadas = [];
        ordem.forEach(dia => Object.values(porDia[dia] || {}).forEach(lista => lista.forEach(b => {
          if (normalizar(`${b.nome} ${b.codCred}`).includes(n)) achadas.push(b);
        })));
        achadas.slice(0, 8).forEach(b => r.push({
          grupo: 'Aulas da semana', id: `a-${b.chave}`, ico: DIA_CURTO[b.dia], titulo: b.titulo,
          desc: `${b.dia} · sala ${b.sala} · ${b.periodosStr} · ${b.inicio}–${b.fim}${b.codCred ? ` · ${b.codCred}` : ''}`,
          ir: ir(() => navigate(`/linha-do-tempo?${new URLSearchParams({ dia: b.dia, filtro: b.sala })}`)),
        }));

        buscarNoDiretorio(diretorio, q, 6).forEach(c => r.push({
          grupo: 'Contatos', id: `c-${c.chave}`, ico: <BookOpen size={15} />, titulo: c.titulo,
          desc: [c.tipo === 'curso' ? `Curso → ${c.subtitulo}` : c.subtitulo, c.telefone].filter(Boolean).join(' · '),
          ir: ir(() => navigate(`/contatos?${new URLSearchParams({ id: c.contatoId })}`)),
        }));
      }
    }

    telas.filter(t => !n || normalizar(t.rotulo).includes(n)).slice(0, n ? 4 : 20).forEach(t => r.push({
      grupo: 'Ir para', id: `t-${t.to}`, ico: <ChevronRight size={15} />, titulo: t.rotulo, desc: '', ir: ir(() => navigate(t.to)),
    }));
    return r;
  }, [q, salas, porDia, hoje, per, trocas, diretorio, telas, navigate, onFechar]);

  useEffect(() => { setSel(0); }, [q]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(itens.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); itens[sel]?.ir(); }
  };

  let grupoAnterior = null;
  return (
    <div className="ck-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="ck" role="dialog" aria-modal="true" aria-label="Busca">
        <div className="ck-in">
          <Search size={18} />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Sala (ex.: 205), disciplina, código ou contato" aria-label="Buscar" autoComplete="off"
            role="combobox" aria-expanded="true" aria-controls="ck-res" aria-activedescendant={itens[sel] ? `ck-${sel}` : undefined}
          />
        </div>
        <div className="ck-res" id="ck-res" role="listbox" ref={listaRef}>
          {itens.length === 0 && <div className="vazio" style={{ margin: 10 }}>Nada encontrado para “{q}”.</div>}
          {itens.map((it, i) => {
            const cab = it.grupo !== grupoAnterior ? <div className="ck-grupo">{it.grupo}</div> : null;
            grupoAnterior = it.grupo;
            return (
              <div key={it.id}>
                {cab}
                <div id={`ck-${i}`} data-i={i} className="ck-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={it.ir}>
                  <span className="ck-ico">{it.ico}</span>
                  <span style={{ minWidth: 0 }}><b>{it.titulo}</b>{it.desc && <small>{it.desc}</small>}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="ck-pe">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navegar</span>
          <span><kbd className="kbd">Enter</kbd> abrir</span>
          <span><kbd className="kbd">Esc</kbd> fechar</span>
          <span style={{ marginLeft: 'auto' }}>Salas, aulas da semana, contatos e telas</span>
        </div>
      </div>
    </div>
  );
}
