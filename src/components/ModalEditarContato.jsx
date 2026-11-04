import { useState } from 'react';
import { X } from 'lucide-react';
import { useUI } from '../contexts/UIContext';
import Gaveta from './ui/Gaveta';

const ROTULO_TIPO = {
    escola: 'Escola',
    unidade: 'Unidade de atendimento',
    local: 'Local / prédio',
    servico: 'Serviço ou espaço',
};

// Campos repetíveis (telefones, e-mails): sempre há uma linha vazia no fim; o
// backend descarta as que ficarem em branco.
function ListaEditavel({ id, titulo, valores, onChange, placeholder }) {
    const linhas = [...valores, ''];
    const atualizar = (i, valor) => {
        const novo = [...valores];
        if (i >= novo.length) novo.push(valor); else novo[i] = valor;
        onChange(novo);
    };
    return (
        <div className="campo">
            <label htmlFor={`${id}-0`}>{titulo}</label>
            {linhas.map((valor, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input id={`${id}-${i}`} className="inp" value={valor} placeholder={placeholder} onChange={e => atualizar(i, e.target.value)} />
                    {i < valores.length && <button type="button" className="icon-btn" style={{ height: 36, width: 36 }} onClick={() => onChange(valores.filter((_, j) => j !== i))} aria-label={`Remover ${valor}`}><X size={16} /></button>}
                </div>
            ))}
        </div>
    );
}

// Painel de criar/editar contato do diretório (nome mantido por compatibilidade).
export default function ModalEditarContato({ modo, contato, paiId, tipoInicial, raizes, isPending, onClose, onSave }) {
    const { toast } = useUI();
    const editando = modo === 'editar';
    const [form, setForm] = useState(() => ({
        tipo: contato?.tipo || tipoInicial || 'escola',
        pai_id: contato?.pai_id || paiId || null,
        nome: contato?.nome || '',
        descricao: contato?.descricao || '',
        referencia: contato?.referencia || '',
        endereco: contato?.endereco || '',
        telefones: contato?.telefones || [],
        emails: contato?.emails || [],
        whatsapp: contato?.whatsapp || '',
        horarios: contato?.horarios || '',
        ordem: contato?.ordem ?? 0,
        ativo: contato?.ativo !== false,
    }));
    const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
    // O pai é fixado por onde o painel foi aberto — só informamos onde o item cai
    const pai = raizes?.find(r => r.id === form.pai_id) || null;
    const ehFilho = form.tipo === 'unidade' || form.tipo === 'servico';

    const submit = (e) => {
        e.preventDefault();
        if (!form.nome.trim()) { toast.error('Preencha o nome do contato.'); return; }
        // Nível 1 nunca manda pai; nível 2 sempre manda.
        onSave({ ...form, pai_id: ehFilho ? form.pai_id : null, ordem: Number(form.ordem) || 0 });
    };

    return (
        <Gaveta
            titulo={editando ? 'Editar contato' : `Novo ${ROTULO_TIPO[form.tipo]?.toLowerCase() || 'contato'}`}
            sub={pai ? `Pertence a ${pai.nome}` : ROTULO_TIPO[form.tipo]}
            onFechar={onClose}
            rodape={<><span className="esp" /><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" form="form-contato" className="btn pri" disabled={isPending}>{isPending ? 'Salvando…' : 'Salvar contato'}</button></>}
        >
            <form id="form-contato" onSubmit={submit} style={{ display: 'contents' }}>
                <div className="campo"><label htmlFor="ct-nome">Nome</label><input id="ct-nome" data-autofocus className="inp" required maxLength={200} placeholder="Ex.: Escola de Direito" value={form.nome} onChange={e => set('nome', e.target.value)} /></div>
                <div className="campo"><label htmlFor="ct-desc">Descrição</label><textarea id="ct-desc" className="inp" rows={2} maxLength={2000} placeholder="Observações, telefones por programa, regras de reserva…" value={form.descricao} onChange={e => set('descricao', e.target.value)} /></div>
                <div className="linha-campos">
                    <div className="campo"><label htmlFor="ct-ref">Referência no mapa</label><input id="ct-ref" className="inp" maxLength={40} placeholder="Ex.: 1, 12" value={form.referencia} onChange={e => set('referencia', e.target.value)} /></div>
                    <div className="campo"><label htmlFor="ct-ordem">Ordem de exibição</label><input id="ct-ordem" className="inp" type="number" value={form.ordem} onChange={e => set('ordem', e.target.value)} /></div>
                </div>
                <div className="campo"><label htmlFor="ct-end">Endereço</label><input id="ct-end" className="inp" maxLength={300} placeholder="Ex.: Prédio 11, 8º andar, sala 801" value={form.endereco} onChange={e => set('endereco', e.target.value)} /></div>
                <ListaEditavel id="ct-tel" titulo="Telefones" valores={form.telefones} onChange={v => set('telefones', v)} placeholder="(51) 3320-0000" />
                <ListaEditavel id="ct-mail" titulo="E-mails" valores={form.emails} onChange={v => set('emails', v)} placeholder="secretaria@pucrs.br" />
                <div className="campo"><label htmlFor="ct-wpp">WhatsApp</label><input id="ct-wpp" className="inp" maxLength={40} placeholder="(51) 98443-0788" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} /></div>
                <div className="campo"><label htmlFor="ct-hor">Horários de atendimento</label><textarea id="ct-hor" className="inp" rows={2} maxLength={500} placeholder="Seg. a sex., das 8h às 18h" value={form.horarios} onChange={e => set('horarios', e.target.value)} /></div>
                <label className={`mod ${form.ativo ? 'on' : ''}`} htmlFor="ct-ativo">
                    <b>Contato ativo</b><small>Contatos inativos somem do diretório e da busca.</small>
                    <span className="sw"><input id="ct-ativo" type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} /><span /></span>
                </label>
            </form>
        </Gaveta>
    );
}
