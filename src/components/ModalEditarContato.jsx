import React, { useState } from 'react';
import { useUI } from '../contexts/UIContext';

const inputStyle = {
    width: '100%', padding: '10px 14px',
    border: '1px solid #334155', borderRadius: '6px',
    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
    background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box'
};

const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 'bold',
    color: '#94a3b8', marginBottom: '6px',
    textTransform: 'uppercase', letterSpacing: '0.05em'
};

const overlayStyle = {
    position: 'fixed',
    top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99999
};

const ROTULO_TIPO = {
    escola: 'Escola',
    unidade: 'Unidade de atendimento',
    local: 'Local / prédio',
    servico: 'Serviço ou espaço',
};

// Lista de campos repetíveis (telefones, e-mails): sempre mostra uma linha
// vazia no fim; o backend descarta as que ficarem em branco.
function ListaEditavel({ titulo, valores, onChange, placeholder }) {
    const linhas = [...valores, ''];

    const atualizar = (indice, valor) => {
        const novo = [...valores];
        if (indice >= novo.length) novo.push(valor);
        else novo[indice] = valor;
        onChange(novo);
    };

    return (
        <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>{titulo}</label>
            {linhas.map((valor, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                        value={valor}
                        placeholder={placeholder}
                        onChange={e => atualizar(i, e.target.value)}
                        style={inputStyle}
                    />
                    {i < valores.length && (
                        <button type="button" onClick={() => onChange(valores.filter((_, j) => j !== i))}
                            style={{
                                background: 'transparent', border: '1px solid #475569', borderRadius: '6px',
                                color: '#94a3b8', cursor: 'pointer', padding: '0 12px', fontSize: '14px'
                            }} title="Remover">✕</button>
                    )}
                </div>
            ))}
        </div>
    );
}

export default function ModalEditarContato({
    modo, contato, paiId, tipoInicial, raizes, isPending, onClose, onSave
}) {
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

    // O pai é fixado pelo contexto de onde o modal foi aberto — mostramos só
    // para o usuário saber onde o item vai cair.
    const pai = raizes?.find(r => r.id === form.pai_id) || null;
    const ehFilho = form.tipo === 'unidade' || form.tipo === 'servico';

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.nome.trim()) {
            toast.error('Preencha o nome do contato.');
            return;
        }
        onSave({
            ...form,
            // Nível 1 nunca manda pai; nível 2 sempre manda.
            pai_id: ehFilho ? form.pai_id : null,
            ordem: Number(form.ordem) || 0,
        });
    };

    return (
        <div style={overlayStyle}>
            <div style={{
                background: '#1e293b', borderRadius: '12px',
                border: '1px solid #334155', width: '600px', maxWidth: '95%',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>
                        {editando ? 'Editar contato' : `Novo ${ROTULO_TIPO[form.tipo]?.toLowerCase() || 'contato'}`}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b', lineHeight: 1 }}>✕</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
                    <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <span style={{
                                fontSize: '11px', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold',
                                background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                                border: '1px solid rgba(59,130,246,0.3)'
                            }}>{ROTULO_TIPO[form.tipo] || form.tipo}</span>
                            {pai && (
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>pertence a <strong>{pai.nome}</strong></span>
                            )}
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Nome</label>
                            <input value={form.nome} onChange={e => set('nome', e.target.value)}
                                required maxLength={200} style={inputStyle}
                                placeholder="Ex.: Escola de Direito" />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Descrição</label>
                            <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
                                rows="2" maxLength={2000} style={{ ...inputStyle, resize: 'vertical' }}
                                placeholder="Observações, telefones por programa, regras de reserva..." />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div>
                                <label style={labelStyle}>Referência no mapa</label>
                                <input value={form.referencia} onChange={e => set('referencia', e.target.value)}
                                    maxLength={40} style={inputStyle} placeholder="Ex.: 1, 12" />
                            </div>
                            <div>
                                <label style={labelStyle}>Ordem de exibição</label>
                                <input type="number" value={form.ordem} onChange={e => set('ordem', e.target.value)}
                                    style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Endereço</label>
                            <input value={form.endereco} onChange={e => set('endereco', e.target.value)}
                                maxLength={300} style={inputStyle}
                                placeholder="Ex.: Prédio 11, 8º andar, sala 801" />
                        </div>

                        <ListaEditavel titulo="Telefones" valores={form.telefones}
                            onChange={v => set('telefones', v)} placeholder="(51) 3320-0000" />

                        <ListaEditavel titulo="E-mails" valores={form.emails}
                            onChange={v => set('emails', v)} placeholder="secretaria@pucrs.br" />

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>WhatsApp</label>
                            <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)}
                                maxLength={40} style={inputStyle} placeholder="(51) 98443-0788" />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Horários de atendimento</label>
                            <textarea value={form.horarios} onChange={e => set('horarios', e.target.value)}
                                rows="2" maxLength={500} style={{ ...inputStyle, resize: 'vertical' }}
                                placeholder="Seg. a sex., das 8h às 18h" />
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} />
                            Contato ativo
                        </label>
                    </div>

                    <div style={{ padding: '16px 24px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'rgba(0,0,0,0.1)', borderRadius: '0 0 12px 12px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 18px', border: '1px solid #475569', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#cbd5e1' }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={isPending} style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', background: isPending ? '#1d4ed8' : '#3b82f6', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                            {isPending ? 'Salvando...' : 'Salvar contato'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
