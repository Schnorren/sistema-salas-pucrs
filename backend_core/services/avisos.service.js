import avisosRepository from '../repositories/avisos.repository.js';
import { ErroPublico } from '../utils/http.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { PERIOD_OPTIONS } from '../utils/timeHelpers.js';

const PRIORIDADES = ['ALTA', 'NORMAL', 'BAIXA'];
const CODIGOS_PERIODO = new Set(PERIOD_OPTIONS.map(p => p.code));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textoObrigatorio(valor, campo, max) {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (!texto) throw new ErroPublico(`Preencha o campo "${campo}".`);
    if (texto.length > max) throw new ErroPublico(`O campo "${campo}" deve ter no máximo ${max} caracteres.`);
    return texto;
}

function assertUuid(id) {
    if (!UUID_REGEX.test(id || '')) throw new ErroPublico('Aviso não encontrado.', 404);
}

class AvisosService {
    _peso(prioridade) {
        const pesos = { ALTA: 1, NORMAL: 2, BAIXA: 3 };
        return pesos[String(prioridade || 'NORMAL').toUpperCase()] || 2;
    }

    async obterMuralOtimizado(predio_id) {
        const avisos = await avisosRepository.buscarAtivos(predio_id);

        const chaves = avisos
            .filter(a => a.tipo === 'CHAVE')
            .sort((a, b) => {
                const dataA = a.data_prevista || '9999-12-31';
                const dataB = b.data_prevista || '9999-12-31';
                if (dataA !== dataB) return dataA.localeCompare(dataB);
                return (a.periodo || '').localeCompare(b.periodo || '');
            });

        // Prioridade primeiro; empate vai para o mais antigo (pendente há mais tempo no topo)
        const gerais = avisos
            .filter(a => a.tipo === 'GERAL')
            .sort((a, b) => {
                const diff = this._peso(a.prioridade) - this._peso(b.prioridade);
                if (diff !== 0) return diff;
                return (a.created_at || '').localeCompare(b.created_at || '');
            });

        return { chaves, gerais };
    }

    async obterHistoricoOtimizado(predio_id) {
        const historico = await avisosRepository.buscarHistorico(predio_id, 200);

        return {
            chaves: historico.filter(h => h.tipo === 'CHAVE'),
            gerais: historico.filter(h => h.tipo === 'GERAL')
        };
    }

    // Monta o insert só com campos permitidos — nunca repasse req.body cru ao banco.
    montarNovoAviso(body, user, predio_id) {
        const dados = body || {};
        const base = { status: 'ATIVO', criado_por: user.id, predio_id };

        if (dados.tipo === 'CHAVE') {
            const periodo = textoObrigatorio(dados.periodo, 'Períodos', 20).toUpperCase();
            if ([...periodo].some(letra => !CODIGOS_PERIODO.has(letra))) {
                throw new ErroPublico('Períodos inválidos: use as letras da grade PUCRS.');
            }
            const data_prevista = textoObrigatorio(dados.data_prevista, 'Data prevista', 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(data_prevista)) {
                throw new ErroPublico('Data prevista inválida.');
            }
            return {
                ...base,
                tipo: 'CHAVE',
                aluno_nome: textoObrigatorio(dados.aluno_nome, 'Nome do aluno', 120),
                sala_id: textoObrigatorio(dados.sala_id, 'Sala', 40),
                disciplina: textoObrigatorio(dados.disciplina, 'Disciplina', 120),
                data_prevista,
                periodo
            };
        }

        if (dados.tipo === 'GERAL') {
            const prioridade = String(dados.prioridade || 'NORMAL').toUpperCase();
            if (!PRIORIDADES.includes(prioridade)) throw new ErroPublico('Prioridade inválida.');
            return {
                ...base,
                tipo: 'GERAL',
                titulo: textoObrigatorio(dados.titulo, 'Título', 120),
                descricao: textoObrigatorio(dados.descricao, 'Descrição', 4000),
                prioridade
            };
        }

        throw new ErroPublico('Tipo de registro inválido.');
    }

    async criarAviso(body, user, predio_id) {
        const payload = this.montarNovoAviso(body, user, predio_id);
        await avisosRepository.inserir(payload);
    }

    async concluirAviso(id, obs, user, predio_id) {
        assertUuid(id);
        const observacao = typeof obs === 'string' ? obs.trim() : '';
        if (observacao.length > 1000) {
            throw new ErroPublico('A observação deve ter no máximo 1000 caracteres.');
        }

        const concluiu = await avisosRepository.concluirSeAtivo(id, predio_id, {
            status: 'CONCLUIDO',
            concluido_por: user.id,
            concluido_em: new Date().toISOString(),
            obs_conclusao: observacao || null
        });
        if (!concluiu) throw new ErroPublico('Aviso não encontrado ou já concluído.', 404);
    }

    async adicionarComentario(id, nota, user, predio_id) {
        assertUuid(id);
        const comentario = textoObrigatorio(nota, 'Comentário', 1000);

        // Lê a descrição atual do banco (não do cliente): evita sobrescrita arbitrária
        // e comentários perdidos por estado desatualizado no front.
        const aviso = await avisosRepository.buscarPorId(id, predio_id);
        if (!aviso) throw new ErroPublico('Aviso não encontrado.', 404);

        const dataHora = new Date().toLocaleString('pt-BR', {
            dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
        });
        const nomeUsuario = (user.email || 'sistema').split('@')[0];

        const novaDescricao = `${aviso.descricao || ''}\n\n📌 [${dataHora} - ${nomeUsuario}]: ${comentario}`;
        await avisosRepository.atualizar(id, predio_id, { descricao: novaDescricao });
        return novaDescricao;
    }

    async excluirAviso(id, user, predio_id) {
        assertUuid(id);
        const removido = await avisosRepository.deletar(id, predio_id);
        if (!removido) throw new ErroPublico('Aviso não encontrado.', 404);

        // Exclusão é permanente e sai do histórico do mural — fica só no log de auditoria.
        registrarAuditoria({
            user,
            acao: 'excluir_aviso',
            entidade: 'avisos',
            entidadeId: id,
            predioId: predio_id,
            detalhes: {
                tipo: removido.tipo,
                status: removido.status,
                referencia: removido.tipo === 'CHAVE'
                    ? `${removido.sala_id || '?'} - ${removido.aluno_nome || '?'}`
                    : removido.titulo || '?'
            }
        });
    }
}

export default new AvisosService();
