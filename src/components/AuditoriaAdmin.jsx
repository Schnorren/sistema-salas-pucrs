import { useState, useEffect, useMemo } from 'react';
import { lerResposta } from '../utils/api';
import { linhaCsv, baixarCsv } from '../utils/csv';
import { hojeSP } from '../../backend_core/utils/emprestimoRegras';

// Aba "Auditoria" do Painel Admin: leitura do registro gravado por
// registrarAuditoria() (backend_core/utils/auditoria.js) — quem mudou
// permissões, convidou pessoas, registrou empréstimos, editou contatos etc.

const ACOES = {
    'emprestimo.retirar': 'Empréstimo registrado',
    'emprestimo.devolver': 'Devolução registrada',
    'emprestimo.transferir': 'Troca de titular do empréstimo',
    'emprestimo.item.status': 'Status de item alterado',
    'emprestimo.cancelar': 'Empréstimo desfeito',
    'emprestimo.reabrir': 'Devolução desfeita',
    'emprestimo.aluno.nome': 'Nome de aluno corrigido',
    'emprestimo.ponto.salvar': 'Ponto de empréstimo salvo',
    'emprestimo.categoria.salvar': 'Categoria de empréstimo salva',
    'emprestimo.item.salvar': 'Item do acervo salvo',
    'emprestimo.bloqueio.criar': 'Aluno suspenso dos empréstimos',
    'emprestimo.bloqueio.remover': 'Suspensão de aluno removida',
    'equipe.convidar': 'Convite enviado',
    'equipe.membro.atualizar': 'Permissões alteradas',
    'equipe.membro.remover': 'Acesso revogado',
    'admin.usuario.atualizar': 'Usuário editado (admin)',
    'admin.usuario.excluir': 'Conta excluída (admin)',
    'admin.usuario.criar': 'Conta criada (admin)',
    'admin.predio.criar': 'Prédio criado',
    'admin.predio.excluir': 'Prédio excluído',
    'admin.perfil.criar': 'Cargo criado',
    'admin.perfil.excluir': 'Cargo excluído',
    'contatos.criar': 'Contato criado',
    'contatos.atualizar': 'Contato editado',
    'contatos.excluir': 'Contato excluído',
    'contatos.curso_adicionar': 'Curso adicionado',
    'contatos.curso_remover': 'Curso removido',
    'excluir_aviso': 'Aviso apagado',
    'grade.salas.visibilidade': 'Salas exibidas/ocultadas',
    'grade.importar': 'Grade importada (PDF)',
};

const CATEGORIAS = [
    ['todos', 'Tudo', () => true],
    ['equipe', 'Equipe e permissões', a => a.startsWith('equipe.') || a.startsWith('admin.usuario')],
    ['emprestimos', 'Empréstimos', a => a.startsWith('emprestimo')],
    ['contatos', 'Contatos', a => a.startsWith('contatos.')],
    ['avisos', 'Avisos', a => a.includes('aviso')],
    ['grade', 'Grade e salas', a => a.startsWith('grade.')],
    ['admin', 'Prédios e cargos', a => a.startsWith('admin.predio') || a.startsWith('admin.perfil')],
];

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
});

// Resumo legível do JSON `detalhes` de cada ação (ids técnicos ficam de fora)
function resumir(item, nomeModulo) {
    const d = item.detalhes || {};
    const modulos = Array.isArray(d.permissoes) ? d.permissoes.map(p => nomeModulo[p] || p).join(', ') : null;
    switch (item.acao) {
        case 'emprestimo.retirar': return [d.matricula && `Matrícula ${d.matricula}`, d.balcao].filter(Boolean).join(' · ');
        case 'emprestimo.devolver': return [
            d.matricula && `Matrícula ${d.matricula}`,
            d.resultado === 'COM_PROBLEMA' && `com problema${d.obs ? `: ${d.obs}` : ''}`,
            d.resultado === 'NAO_DEVOLVIDO' && `não devolvido${d.obs ? `: ${d.obs}` : ''}`,
            d.balcao,
        ].filter(Boolean).join(' · ');
        case 'emprestimo.transferir': return [d.item, d.de && d.para && `Matrícula ${d.de} → ${d.para}`, d.balcao].filter(Boolean).join(' · ');
        case 'emprestimo.cancelar':
        case 'emprestimo.reabrir': return [d.item, d.matricula && `Matrícula ${d.matricula}`, d.trocaDesfeita && 'troca de titular desfeita', d.balcao].filter(Boolean).join(' · ');
        case 'emprestimo.item.status': return [d.item, d.status === 'MANUTENCAO' ? 'manutenção' : d.status === 'DISPONIVEL' ? 'liberado' : d.status].filter(Boolean).join(' · ');
        case 'emprestimo.aluno.nome': return [d.nome, item.entidade_id && `Matrícula ${item.entidade_id}`].filter(Boolean).join(' · ');
        case 'emprestimo.bloqueio.criar': return [d.matricula && `Matrícula ${d.matricula}`, d.motivo, d.ate && `até ${String(d.ate).split('-').reverse().join('/')}`].filter(Boolean).join(' · ');
        case 'emprestimo.bloqueio.remover': return d.matricula ? `Matrícula ${d.matricula}` : '';
        case 'equipe.convidar':
        case 'equipe.membro.atualizar': return [d.email, modulos && `módulos: ${modulos}`].filter(Boolean).join(' · ');
        case 'equipe.membro.remover': return d.email || '';
        case 'admin.usuario.excluir': return [d.email, modulos && `tinha: ${modulos}`, d.motivo].filter(Boolean).join(' · ');
        case 'admin.usuario.criar': return [
            d.email,
            d.modo === 'senha' ? 'senha definida pelo admin' : 'convite por e-mail',
            modulos && `módulos: ${modulos}`,
        ].filter(Boolean).join(' · ');
        case 'admin.usuario.atualizar': return [
            modulos && `módulos: ${modulos}`,
            Array.isArray(d.pontosRede) && `${d.pontosRede.length} ponto${d.pontosRede.length === 1 ? '' : 's'} no relatório da rede`,
            d.senhaAlterada && 'senha alterada',
        ].filter(Boolean).join(' · ');
        case 'contatos.curso_adicionar':
        case 'contatos.curso_remover': return [d.curso, d.contato].filter(Boolean).join(' · ');
        case 'grade.importar': return [
            Number.isFinite(d.aulas) && `${d.aulas} períodos de aula`,
            Number.isFinite(d.novos) && `+${d.novos} / −${d.removidos} / ~${d.alterados} vs. anterior`,
            d.salasNovas?.length && `salas novas: ${d.salasNovas.join(', ')}`,
        ].filter(Boolean).join(' · ');
        case 'grade.salas.visibilidade': return [
            d.exibidas?.length && `exibidas: ${d.exibidas.join(', ')}`,
            d.ocultadas?.length && `ocultadas: ${d.ocultadas.join(', ')}`,
        ].filter(Boolean).join(' · ');
        case 'excluir_aviso': return [d.tipo === 'CHAVE' ? 'Autorização de chave' : d.tipo, d.referencia].filter(Boolean).join(' · ');
        default:
            if (d.nome) return d.nome;
            return Object.entries(d)
                .filter(([k, v]) => !/id$/i.test(k) && v !== null && typeof v !== 'object')
                .map(([k, v]) => `${k}: ${v}`).join(' · ');
    }
}

export default function AuditoriaAdmin({ token, predios, modulos }) {
    const [registros, setRegistros] = useState(null);
    const [erro, setErro] = useState('');
    const [categoria, setCategoria] = useState('todos');
    const [busca, setBusca] = useState('');

    useEffect(() => {
        let ativo = true;
        fetch(`${import.meta.env.VITE_API_URL}/api/admin/auditoria`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(lerResposta)
            .then(json => { if (ativo) setRegistros(json); })
            .catch(e => { if (ativo) setErro(e.message || 'Não foi possível carregar a auditoria.'); });
        return () => { ativo = false; };
    }, [token]);

    const nomeModulo = useMemo(() => Object.fromEntries((modulos || []).map(m => [m.id, m.nome])), [modulos]);
    const nomePredio = useMemo(() => Object.fromEntries((predios || []).map(p => [p.id, p.nome])), [predios]);

    const filtrados = useMemo(() => {
        const teste = CATEGORIAS.find(c => c[0] === categoria)[2];
        const t = busca.trim().toLowerCase();
        return (registros || [])
            .map(r => ({ ...r, resumo: resumir(r, nomeModulo), rotulo: ACOES[r.acao] || r.acao }))
            .filter(r => teste(r.acao))
            .filter(r => !t || `${r.user_email || ''} ${r.rotulo} ${r.resumo} ${nomePredio[r.predio_id] || ''}`.toLowerCase().includes(t));
    }, [registros, categoria, busca, nomeModulo, nomePredio]);

    // Os registros que estão na tela (categoria + busca), para prestação de
    // contas fora do sistema. celulaCsv neutraliza fórmula (CSV injection).
    const exportarCsv = () => {
        const linhas = [linhaCsv(['Data e hora', 'Quem', 'Ação', 'Detalhe', 'Prédio', 'Código da ação', 'Entidade', 'Id'])];
        filtrados.forEach(r => linhas.push(linhaCsv([
            dataHora(r.criado_em), r.user_email || 'Sistema', r.rotulo, r.resumo || '', nomePredio[r.predio_id] || '',
            r.acao, r.entidade, r.entidade_id || '',
        ])));
        baixarCsv(`auditoria_${hojeSP()}.csv`, linhas);
    };

    return (
        <div className="bar-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ margin: 0 }}>Registro de Auditoria</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>Ações sensíveis feitas no sistema, das mais recentes para as mais antigas (até 500).</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Buscar por e-mail, ação ou detalhe..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', width: '300px', outline: 'none' }}
                    />
                    <button
                        className="exp-btn"
                        onClick={exportarCsv}
                        disabled={!filtrados.length}
                        title="Exporta os registros filtrados (abre no Excel)"
                    >
                        Exportar CSV
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {CATEGORIAS.map(([id, rotulo]) => (
                    <button
                        key={id}
                        onClick={() => setCategoria(id)}
                        style={{
                            padding: '5px 12px', borderRadius: '14px', fontSize: '12px', cursor: 'pointer',
                            border: `1px solid ${categoria === id ? '#3b82f6' : 'var(--border)'}`,
                            background: categoria === id ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                            color: categoria === id ? '#3b82f6' : 'var(--muted)', fontWeight: categoria === id ? 'bold' : 'normal'
                        }}
                    >
                        {rotulo}
                    </button>
                ))}
            </div>

            {erro ? (
                <div className="empty-st" style={{ padding: '20px', color: 'var(--red)' }}>{erro}</div>
            ) : registros === null ? (
                <div className="empty-st" style={{ padding: '20px' }}>Carregando registros...</div>
            ) : filtrados.length === 0 ? (
                <div className="empty-st" style={{ padding: '20px' }}>Nenhum registro encontrado.</div>
            ) : (
                <table className="heat-tbl" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>Data e hora</th>
                            <th style={{ textAlign: 'left' }}>Quem</th>
                            <th style={{ textAlign: 'left' }}>Ação</th>
                            <th style={{ textAlign: 'left' }}>Detalhe</th>
                            <th style={{ textAlign: 'center' }}>Prédio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtrados.map(r => (
                            <tr key={r.id}>
                                <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: '12px' }}>{dataHora(r.criado_em)}</td>
                                <td style={{ textAlign: 'left', fontSize: '12px' }}>{r.user_email || 'Sistema'}</td>
                                <td style={{ textAlign: 'left' }}>
                                    <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'nowrap' }}>{r.rotulo}</span>
                                </td>
                                <td style={{ textAlign: 'left', fontSize: '12px', color: 'var(--muted)' }}>{r.resumo || '—'}</td>
                                <td style={{ textAlign: 'center', fontSize: '12px' }}>{nomePredio[r.predio_id] || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
