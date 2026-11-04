import { useState, useMemo } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { useUI } from '../contexts/UIContext';
import { normalizarTexto } from '../utils/contatosBusca';
import Gaveta from './ui/Gaveta';

// Painel dos cursos de uma Escola (índice curso → Escola responsável).
export default function ModalCursosContato({ contato, isPending, onClose, onAdicionar, onRemover }) {
    const { showConfirm, toast } = useUI();
    const [novoCurso, setNovoCurso] = useState('');
    const [filtro, setFiltro] = useState('');
    const cursos = useMemo(() => contato?.cursos || [], [contato]);
    const visiveis = useMemo(() => {
        const alvo = normalizarTexto(filtro);
        return alvo ? cursos.filter(c => normalizarTexto(c.nome).includes(alvo)) : cursos;
    }, [cursos, filtro]);

    const adicionar = async (e) => {
        e.preventDefault();
        const nome = novoCurso.trim();
        if (!nome) return;
        try { await onAdicionar(nome); setNovoCurso(''); toast.success('Curso adicionado.'); }
        catch (err) { toast.error(err.message || 'Não foi possível adicionar o curso.'); }
    };
    const remover = async (curso) => {
        if (!(await showConfirm(`Remover "${curso.nome}" deste contato?`, 'Remover curso', { confirmar: 'Remover', perigo: true }))) return;
        try { await onRemover(curso.id); toast.success('Curso removido.'); }
        catch (err) { toast.error(err.message || 'Não foi possível remover o curso.'); }
    };

    return (
        <Gaveta titulo="Cursos" sub={contato?.nome} onFechar={onClose} rodape={<><span className="esp" /><button className="btn" onClick={onClose}>Fechar</button></>}>
            <form onSubmit={adicionar} style={{ display: 'flex', gap: 8 }}>
                <input className="inp" data-autofocus placeholder="Nome do curso a adicionar" value={novoCurso} onChange={e => setNovoCurso(e.target.value)} maxLength={200} aria-label="Nome do curso" />
                <button className="btn pri" disabled={isPending || !novoCurso.trim()}><Plus size={16} />Adicionar</button>
            </form>
            <div className="campo-busca" style={{ minWidth: 0 }}><Search size={16} /><input className="inp" placeholder={`Filtrar ${cursos.length} cursos`} value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar cursos" /></div>
            {visiveis.length === 0 ? <div className="vazio">Nenhum curso{filtro ? ` para “${filtro}”` : ''}.</div> : (
                <ul className="lista-hist">
                    {visiveis.map(c => (
                        <li key={c.id} style={{ alignItems: 'center' }}>
                            <span>{c.nome}</span>
                            <button className="icon-btn" onClick={() => remover(c)} disabled={isPending} aria-label={`Remover ${c.nome}`}><X size={15} /></button>
                        </li>
                    ))}
                </ul>
            )}
        </Gaveta>
    );
}
