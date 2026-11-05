import { randomInt } from 'node:crypto';
import repository from '../repositories/emprestimosGestao.repository.js';
import { ErroPublico } from '../utils/http.js';
import { MODULOS } from '../utils/modulos.js';
import { podeGerir } from './emprestimos.service.js';
import { hojeSP, normalizarMatricula } from '../utils/emprestimoRegras.js';

// Gestão do acervo de empréstimos (módulo 'gestao_emprestimos'): pontos,
// categorias, itens, alunos suspensos e ocorrências. Também guarda os vínculos
// usuário ↔ ponto, usados pela Gestão de Equipe.

const LIMITE_MAXIMO_POR_ALUNO = 20; // espelha o CHECK de emprestimo_pontos

const texto = (valor, { min = 1, max, rotulo }) => {
    const t = String(valor ?? '').replace(/\s+/g, ' ').trim();
    if (t.length < min) throw new ErroPublico(`Informe ${rotulo}.`);
    if (t.length > max) throw new ErroPublico(`${rotulo[0].toUpperCase()}${rotulo.slice(1)} pode ter no máximo ${max} caracteres.`);
    return t;
};

const booleano = (valor, padrao) => (typeof valor === 'boolean' ? valor : padrao);

// Código para item sem etiqueta: "EMP-7K2QXM" (sem 0/O/1/I para não confundir)
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const gerarCodigo = () => `EMP-${Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')}`;

const ehViolacaoUnica = (erro) => erro?.code === '23505';

class EmprestimosGestaoService {
    _exigirGestao(user) {
        if (!podeGerir(user)) throw new ErroPublico('Requer o módulo Gestão de Empréstimos.', 403);
        if (!user?.predio_id) throw new ErroPublico('Prédio não informado.');
        return user.predio_id;
    }

    async _pontoDoPredio(pontoId, predioId) {
        const ponto = pontoId ? await repository.getPonto(pontoId) : null;
        if (!ponto || ponto.predio_id !== predioId) throw new ErroPublico('Ponto de empréstimo não encontrado.', 404);
        return ponto;
    }

    async _categoriaDoPredio(categoriaId, predioId) {
        const cat = categoriaId ? await repository.getCategoria(categoriaId) : null;
        if (!cat || cat.predio_id !== predioId) throw new ErroPublico('Categoria não encontrada.', 404);
        return cat;
    }

    // ------------------------------------------------------------- visão geral
    // Pontos → categorias → itens (inclusive inativos/de baixa), com uso e quem
    // está com cada item agora.
    async visaoGeral(user) {
        const predioId = this._exigirGestao(user);
        const [pontos, categorias, uso, ativos] = await Promise.all([
            repository.getPontos(predioId),
            repository.getCategorias(predioId),
            repository.getUsoItens(predioId),
            repository.getAtivosDoPredio(predioId),
        ]);
        const itens = await repository.getItensDasCategorias(categorias.map(c => c.id));
        const usoPorItem = new Map(uso.map(u => [u.item_id, u]));
        const ativoPorItem = new Map(ativos.map(a => [a.item_id, a]));

        return {
            pontos: pontos.map(p => ({
                id: p.id,
                nome: p.nome,
                limite: p.limite_por_aluno,
                ativo: p.ativo,
                categorias: categorias.filter(c => c.ponto_id === p.id).map(c => ({
                    id: c.id,
                    nome: c.nome,
                    ativo: c.ativo !== false,
                    itens: itens.filter(i => i.categoria_id === c.id).map(i => {
                        const u = usoPorItem.get(i.id);
                        const a = ativoPorItem.get(i.id);
                        return {
                            id: i.id,
                            nome: i.nome_item,
                            codigo: i.patrimonio,
                            status: i.status,
                            observacoes: i.observacoes,
                            ativo: i.ativo,
                            usos: Number(u?.total || 0),
                            ultimoUso: u?.ultimo || null,
                            emprestimo: a ? { nomeAluno: a.nome_aluno, matricula: a.matricula_aluno, dataRetirada: a.data_retirada } : null,
                        };
                    }),
                })),
            })),
        };
    }

    // ------------------------------------------------------------- pontos
    async salvarPonto(user, id, dados = {}) {
        const predioId = this._exigirGestao(user);
        const nome = texto(dados.nome, { min: 2, max: 60, rotulo: 'o nome do ponto' });
        const limite = Number(dados.limite);
        if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO_POR_ALUNO) {
            throw new ErroPublico(`O limite por aluno deve ser de 1 a ${LIMITE_MAXIMO_POR_ALUNO}.`);
        }
        const campos = { nome, limite_por_aluno: limite };
        const retorno = 'id, nome, limite_por_aluno, ativo';

        try {
            if (!id) {
                return await repository.inserir('emprestimo_pontos',
                    { ...campos, predio_id: predioId, ativo: booleano(dados.ativo, true) }, retorno);
            }
            const atual = await this._pontoDoPredio(id, predioId);
            const ativo = booleano(dados.ativo, atual.ativo);
            if (atual.ativo && !ativo && await repository.contarEmprestados({ pontoId: id })) {
                throw new ErroPublico('Há itens deste ponto emprestados. Registre as devoluções antes de desativá-lo.');
            }
            return await repository.atualizar('emprestimo_pontos', id, { ...campos, ativo }, retorno);
        } catch (erro) {
            if (ehViolacaoUnica(erro)) throw new ErroPublico('Já existe um ponto com esse nome neste prédio.');
            throw erro;
        }
    }

    // ------------------------------------------------------------- categorias
    async salvarCategoria(user, id, dados = {}) {
        const predioId = this._exigirGestao(user);
        const nome = texto(dados.nome, { min: 2, max: 80, rotulo: 'o nome da categoria' });
        const ponto = await this._pontoDoPredio(dados.pontoId, predioId);
        const retorno = 'id, nome, ativo, ponto_id';

        if (!id) {
            return repository.inserir('emprestimo_categorias',
                { nome, ponto_id: ponto.id, predio_id: predioId, ativo: booleano(dados.ativo, true) }, retorno);
        }
        const atual = await this._categoriaDoPredio(id, predioId);
        const ativo = booleano(dados.ativo, atual.ativo !== false);
        const mudaPonto = ponto.id !== atual.ponto_id;
        if ((mudaPonto || (atual.ativo !== false && !ativo)) && await repository.contarEmprestados({ categoriaId: id })) {
            throw new ErroPublico('Há itens desta categoria emprestados. Registre as devoluções antes de mover ou desativar.');
        }
        return repository.atualizar('emprestimo_categorias', id, { nome, ponto_id: ponto.id, ativo }, retorno);
    }

    // ------------------------------------------------------------- itens
    async salvarItem(user, id, dados = {}) {
        const predioId = this._exigirGestao(user);
        const nome = texto(dados.nome, { min: 2, max: 120, rotulo: 'o nome do item' });
        const codigoInformado = String(dados.codigo ?? '').trim().slice(0, 100);
        const observacoes = String(dados.observacoes ?? '').trim().slice(0, 500) || null;
        const categoria = await this._categoriaDoPredio(dados.categoriaId, predioId);
        const retorno = 'id, nome_item, patrimonio, status, ativo, categoria_id, observacoes';

        let atual = null;
        if (id) {
            atual = await repository.getItem(id);
            if (!atual || atual.categoria?.predio_id !== predioId) throw new ErroPublico('Item não encontrado.', 404);
        }
        const ativo = booleano(dados.ativo, atual ? atual.ativo : true);
        if (atual?.status === 'EMPRESTADO' && (!ativo || categoria.id !== atual.categoria_id)) {
            throw new ErroPublico('Este item está emprestado. Registre a devolução antes de mover ou dar baixa.');
        }

        const campos = { nome_item: nome, categoria_id: categoria.id, ativo };
        // observações de manutenção são do balcão; aqui só no cadastro
        if (!atual) campos.observacoes = observacoes;

        // Sem código (item sem etiqueta): gera um; tenta de novo se colidir
        for (let tentativa = 0; tentativa < 4; tentativa++) {
            const codigo = codigoInformado || (atual ? atual.patrimonio : gerarCodigo());
            try {
                return atual
                    ? await repository.atualizar('emprestimo_itens', id, { ...campos, patrimonio: codigo }, retorno)
                    : await repository.inserir('emprestimo_itens', { ...campos, patrimonio: codigo, status: 'DISPONIVEL' }, retorno);
            } catch (erro) {
                if (!ehViolacaoUnica(erro)) throw erro;
                if (codigoInformado || atual) throw new ErroPublico(`Já existe um item com o código "${codigo}".`);
            }
        }
        throw new ErroPublico('Não foi possível gerar um código para o item. Tente de novo.');
    }

    // ------------------------------------------------------------- bloqueios
    async listarBloqueios(user) {
        const predioId = this._exigirGestao(user);
        const lista = await repository.getBloqueiosAtivos(predioId, hojeSP());
        const nomes = await repository.getNomes([...new Set(lista.map(b => b.matricula))]);
        return lista.map(b => ({ ...b, nome: nomes.get(b.matricula) || null }));
    }

    async criarBloqueio(user, dados = {}) {
        const predioId = this._exigirGestao(user);
        const matricula = normalizarMatricula(dados.matricula);
        if (!matricula) throw new ErroPublico('Informe a matrícula do aluno.');
        const motivo = texto(dados.motivo, { min: 3, max: 300, rotulo: 'o motivo' });
        let ate = null;
        if (dados.ate) {
            ate = String(dados.ate).slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(ate) || !Number.isFinite(new Date(`${ate}T12:00:00Z`).getTime())) {
                throw new ErroPublico('Data de fim da suspensão inválida.');
            }
            if (ate < hojeSP()) throw new ErroPublico('A suspensão precisa terminar hoje ou depois.');
        }
        const ativos = await repository.getBloqueiosAtivos(predioId, hojeSP());
        if (ativos.some(b => b.matricula === matricula)) {
            throw new ErroPublico('Este aluno já está suspenso. Libere a suspensão atual para criar outra.');
        }
        return repository.inserir('emprestimo_bloqueios', {
            predio_id: predioId, matricula, motivo, ate, criado_por: user.email || 'Sistema',
        }, 'id, matricula, motivo, ate, criado_em');
    }

    async removerBloqueio(user, id) {
        const predioId = this._exigirGestao(user);
        const bloqueio = id ? await repository.getBloqueio(id) : null;
        if (!bloqueio || bloqueio.predio_id !== predioId) throw new ErroPublico('Suspensão não encontrada.', 404);
        if (bloqueio.removido_em) return bloqueio;
        await repository.removerBloqueio(id, user.email || 'Sistema');
        return bloqueio;
    }

    // ------------------------------------------------------------- ocorrências
    async listarOcorrencias(user) {
        const predioId = this._exigirGestao(user);
        const [lista, pontos, bloqueios] = await Promise.all([
            repository.getOcorrencias(predioId),
            repository.getPontos(predioId),
            repository.getBloqueiosAtivos(predioId, hojeSP()),
        ]);
        const nomePonto = new Map(pontos.map(p => [p.id, p.nome]));
        const suspensos = new Set(bloqueios.map(b => b.matricula));
        return lista.map(o => ({
            id: o.id,
            matricula: o.matricula_aluno,
            nomeAluno: o.nome_aluno,
            tipo: o.ocorrencia,
            obs: o.obs_devolucao,
            data: o.data_devolucao || o.encerrado_em || o.data_retirada,
            nomeItem: o.item?.nome_item || null,
            ponto: nomePonto.get(o.ponto_id) || null,
            suspenso: suspensos.has(o.matricula_aluno),
        }));
    }

    // ------------------------------------------------------------- equipe
    // Lista para os checkboxes da Gestão de Equipe (módulo 'equipe').
    async pontosParaEquipe(predioId) {
        if (!predioId) return [];
        const pontos = await repository.getPontos(predioId);
        return pontos.map(p => ({ id: p.id, nome: p.nome, ativo: p.ativo }));
    }

    async vinculosPorUsuario(predioId) {
        const mapa = new Map();
        if (!predioId) return mapa;
        for (const v of await repository.getVinculosDoPredio(predioId)) {
            mapa.set(v.user_id, [...(mapa.get(v.user_id) || []), v.ponto_id]);
        }
        return mapa;
    }

    // Grava os pontos que o usuário opera neste prédio. Sem o módulo
    // Empréstimos, os vínculos saem (não dariam acesso a nada). Ids que não são
    // do prédio são descartados.
    async definirPontosDoUsuario({ userId, predioId, pontoIds, permissoes }) {
        if (!userId || !predioId) return [];
        const doPredio = (await repository.getPontos(predioId)).map(p => p.id);
        const pedidos = Array.isArray(pontoIds) ? pontoIds.map(String) : [];
        const temModulo = (permissoes || []).includes(MODULOS.EMPRESTIMOS);
        const finais = temModulo ? [...new Set(pedidos.filter(id => doPredio.includes(id)))] : [];
        await repository.definirVinculos(userId, doPredio, finais);
        return finais;
    }
}

export default new EmprestimosGestaoService();
