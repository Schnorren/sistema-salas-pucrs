import repository from '../repositories/emprestimos.repository.js';
import { ErroPublico } from '../utils/http.js';
import { MODULOS } from '../utils/modulos.js';
import {
    normalizarNome, normalizarMatricula, calcularMedianas, hojeSP, RESULTADOS_DEVOLUCAO,
} from '../utils/emprestimoRegras.js';

// Status que o balcão pode definir manualmente. EMPRESTADO e PERDIDO são
// exclusivos do fluxo de retirada/devolução (RPCs). Liberar um item PERDIDO
// que reapareceu = voltar para DISPONIVEL.
const STATUS_EDITAVEIS = ['DISPONIVEL', 'MANUTENCAO'];

// Normaliza entrada de texto vinda do cliente (trim + limite de tamanho).
const limparTexto = (valor, max) => String(valor ?? '').trim().slice(0, max);

// A busca do histórico entra num filtro or() do PostgREST: só letras, números,
// espaço e hífen (vírgula, ponto, parênteses e curingas quebrariam a sintaxe).
const sanearBusca = (valor) => String(valor ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

const temModulo = (user, modulo) => Boolean(user?.is_admin || user?.permissoes?.includes(modulo));
export const podeOperar = (user) => temModulo(user, MODULOS.EMPRESTIMOS);
export const podeGerir = (user) => temModulo(user, MODULOS.GESTAO_EMPRESTIMOS);
export const podeVerRelatorio = (user) => podeOperar(user) || podeGerir(user) || temModulo(user, MODULOS.RELATORIOS);
// Vê o prédio inteiro (todos os pontos) no relatório
const veTodosOsPontos = (user) => Boolean(user?.is_admin) || podeGerir(user) || temModulo(user, MODULOS.RELATORIOS);

const SEM_ACESSO_PONTO = 'Você não tem acesso a este ponto de empréstimo.';

const exigirPredio = (user) => {
    if (!user?.predio_id) throw new ErroPublico('Prédio não informado.');
    return user.predio_id;
};

// Até a v2 o balcão ia junto do e-mail ("fulano@pucrs.br · Balcão 1");
// agora tem coluna própria. Aceita os dois formatos.
const separarBalcao = (texto, coluna) => {
    const [responsavel, legado] = String(texto || '').split(' · ');
    return { responsavel: responsavel || null, balcao: coluna || legado || null };
};

// Quem encerrou (cancelou/extraviou) não tem coluna de balcão: vai junto do e-mail
const responsavelComBalcao = (user, balcao) => {
    const email = user?.email || 'Sistema';
    return balcao ? `${email} · ${balcao}` : email;
};

const mapearAtivo = (r) => {
    const ret = separarBalcao(r.resp_retirada, r.balcao_retirada);
    return {
        id: r.id,
        itemId: r.item_id,
        nomeItem: r.item?.nome_item || null,
        patrimonio: r.item?.patrimonio || null,
        matricula: r.matricula_aluno,
        nomeAluno: r.nome_aluno,
        dataRetirada: r.data_retirada,
        responsavel: ret.responsavel,
        balcao: ret.balcao,
    };
};

const mapearHistorico = (r) => {
    const ret = separarBalcao(r.resp_retirada, r.balcao_retirada);
    const dev = separarBalcao(r.resp_devolucao || r.encerrado_por, r.balcao_devolucao);
    return {
        id: r.id,
        itemId: r.item_id,
        nomeItem: r.item?.nome_item || null,
        patrimonio: r.item?.patrimonio || null,
        matricula: r.matricula_aluno,
        nomeAluno: r.nome_aluno,
        dataRetirada: r.data_retirada,
        dataDevolucao: r.data_devolucao,
        encerradoEm: r.encerrado_em,
        status: r.status,
        ocorrencia: r.ocorrencia,
        obs: r.obs_devolucao,
        responsavelRetirada: ret.responsavel,
        balcaoRetirada: ret.balcao,
        responsavel: dev.responsavel,
        balcaoDevolucao: dev.balcao,
    };
};

// "2026-11-05T08:00" (datetime-local) → timestamptz de Brasília
const paraTimestamptz = (valor) => {
    const s = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00-03:00`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00-03:00`;
    return Number.isFinite(new Date(s).getTime()) ? s : null;
};

class EmprestimosService {
    // ------------------------------------------------------------- pontos
    // Pontos que o usuário OPERA no balcão: admin e gestão → todos os ativos do
    // prédio; atendente → só os vinculados a ele (Gestão de Equipe).
    async pontosOperaveis(user) {
        const predioId = exigirPredio(user);
        if (!podeOperar(user)) return [];
        const pontos = (await repository.getPontosDoPredio(predioId)).filter(p => p.ativo);
        if (user.is_admin || podeGerir(user)) return pontos;
        const meus = new Set(await repository.getPontoIdsDoUsuario(user.id, predioId));
        return pontos.filter(p => meus.has(p.id));
    }

    // Pontos que aparecem no relatório: quem vê o prédio todo → todos (inclusive
    // inativos, pelo histórico); atendente → os seus.
    async pontosDoRelatorio(user) {
        const predioId = exigirPredio(user);
        if (veTodosOsPontos(user)) return repository.getPontosDoPredio(predioId);
        return this.pontosOperaveis(user);
    }

    async listarPontos(user, uso) {
        const pontos = uso === 'relatorio' ? await this.pontosDoRelatorio(user) : await this.pontosOperaveis(user);
        return pontos.map(p => ({ id: p.id, nome: p.nome, limite: p.limite_por_aluno, ativo: p.ativo }));
    }

    async _pontoOperavel(user, pontoId) {
        if (!pontoId) throw new ErroPublico('Escolha o ponto de empréstimo.');
        const ponto = (await this.pontosOperaveis(user)).find(p => p.id === pontoId);
        if (!ponto) throw new ErroPublico(SEM_ACESSO_PONTO, 403);
        return ponto;
    }

    // Operação por ID: o objeto precisa ser do prédio do usuário E de um ponto
    // que ele opera (RLS não cobre a service role).
    async _registroOperavel(user, emprestimoId) {
        exigirPredio(user);
        if (!emprestimoId) throw new ErroPublico('Empréstimo não informado.');
        const reg = await repository.getEmprestimo(emprestimoId);
        if (!reg || reg.predio_id !== user.predio_id) throw new ErroPublico('Empréstimo não encontrado.', 404);
        await this._pontoOperavel(user, reg.ponto_id);
        return reg;
    }

    async _itemOperavel(user, itemId) {
        exigirPredio(user);
        if (!itemId) throw new ErroPublico('Item não informado.');
        const item = await repository.getItem(itemId);
        if (!item || item.categoria?.predio_id !== user.predio_id) {
            throw new ErroPublico('Item não pertence a este prédio.');
        }
        await this._pontoOperavel(user, item.categoria.ponto_id);
        return item;
    }

    // ------------------------------------------------------------- balcão
    // Acervo do ponto com o empréstimo em andamento de cada item e a duração
    // típica (mediana) — base da "previsão de volta" do front.
    async painel(user, pontoId) {
        const ponto = await this._pontoOperavel(user, pontoId);
        const [itens, ativos] = await Promise.all([
            repository.getItensDoPonto(ponto.id),
            repository.getAtivosDoPonto(ponto.id),
        ]);
        const medianas = calcularMedianas(await repository.getDuracoesRecentes(itens.map(i => i.id)), itens);
        const medianaDoItem = (id) => medianas.get(id)?.mediana ?? null;
        const ativoPorItem = new Map(ativos.map(r => [r.item_id, r]));

        return {
            ponto: { id: ponto.id, nome: ponto.nome, limite: ponto.limite_por_aluno },
            itens: itens.map(i => {
                const reg = ativoPorItem.get(i.id);
                return {
                    id: i.id,
                    nome_item: i.nome_item,
                    patrimonio: i.patrimonio,
                    status: i.status,
                    observacoes: i.observacoes,
                    categoria_id: i.categoria_id,
                    categoria_nome: i.categoria?.nome || null,
                    mediana_min: medianaDoItem(i.id),
                    amostras: medianas.get(i.id)?.amostras ?? 0,
                    emprestimo: reg ? mapearAtivo(reg) : null,
                };
            }),
            // Todos os empréstimos em andamento do ponto (painel da direita)
            ativos: ativos.map(r => ({ ...mapearAtivo(r), mediana_min: medianaDoItem(r.item_id) })),
        };
    }

    // Crachá bipado: o que o aluno tem neste ponto, quanto ainda pode pegar,
    // ocorrências e bloqueio (do prédio todo).
    async consultarAluno(user, matriculaBruta, pontoId) {
        const ponto = await this._pontoOperavel(user, pontoId);
        const matricula = normalizarMatricula(matriculaBruta);
        if (!matricula) throw new ErroPublico('Matrícula não informada.');
        const predioId = user.predio_id;

        const [aluno, ativos, ocorrencias, bloqueio] = await Promise.all([
            repository.buscarAlunoCache(matricula),
            repository.getAtivosDoAluno(matricula, predioId),
            repository.getOcorrenciasDoAluno(matricula, predioId),
            repository.getBloqueioAtivo(matricula, predioId, hojeSP()),
        ]);
        const doPonto = ativos.filter(a => a.ponto_id === ponto.id);

        return {
            matricula,
            nome: aluno?.nome || null,
            ativos: doPonto.map(a => ({
                id: a.id,
                itemId: a.item_id,
                nomeItem: a.item?.nome_item || null,
                patrimonio: a.item?.patrimonio || null,
                dataRetirada: a.data_retirada,
            })),
            // Só a contagem: o limite é por ponto e o detalhe é de outro ponto
            ativosOutrosPontos: ativos.length - doPonto.length,
            limite: ponto.limite_por_aluno,
            restantes: Math.max(0, ponto.limite_por_aluno - doPonto.length),
            ocorrencias: {
                total: ocorrencias.total,
                ultimas: ocorrencias.ultimas.map(o => ({
                    tipo: o.ocorrencia,
                    obs: o.obs_devolucao,
                    data: o.data_devolucao || o.encerrado_em || o.data_retirada,
                    nomeItem: o.item?.nome_item || null,
                })),
            },
            bloqueio: bloqueio ? { motivo: bloqueio.motivo, ate: bloqueio.ate } : null,
        };
    }

    async corrigirNome(user, matriculaBruta, nomeBruto) {
        exigirPredio(user);
        if (!(await this.pontosOperaveis(user)).length) throw new ErroPublico(SEM_ACESSO_PONTO, 403);
        const matricula = normalizarMatricula(matriculaBruta);
        const nome = normalizarNome(nomeBruto);
        if (!matricula) throw new ErroPublico('Matrícula não informada.');
        if (nome.length < 2) throw new ErroPublico('Informe o nome do aluno.');
        await repository.atualizarNomeAluno(matricula, nome, user.predio_id);
        return { matricula, nome };
    }

    async retirar(user, { itemId, matricula, nomeAluno }, balcao) {
        const item = await this._itemOperavel(user, itemId);
        const mat = normalizarMatricula(matricula);
        const nome = normalizarNome(nomeAluno);
        if (!mat) throw new ErroPublico('Matrícula não informada.');
        if (nome.length < 2) throw new ErroPublico('Informe o nome do aluno.');
        // A RPC valida atomicamente: item livre (com trava), acervo ativo,
        // bloqueio do aluno e limite de itens por aluno no ponto.
        return repository.retirarRpc({
            predioId: user.predio_id, itemId: item.id, matricula: mat, nome,
            resp: user.email || 'Sistema', balcao,
        });
    }

    async devolver(user, emprestimoId, { resultado, obs } = {}, balcao) {
        const res = String(resultado || RESULTADOS_DEVOLUCAO.OK).toUpperCase();
        if (!Object.values(RESULTADOS_DEVOLUCAO).includes(res)) {
            throw new ErroPublico('Resultado de devolução inválido.');
        }
        const reg = await this._registroOperavel(user, emprestimoId);
        if (reg.status !== 'ATIVO') throw new ErroPublico('Este empréstimo já foi encerrado.');
        const registro = await repository.devolverRpc({
            predioId: user.predio_id, emprestimoId: reg.id, resultado: res,
            obs: limparTexto(obs, 500), resp: user.email || 'Sistema', balcao,
        });
        return { registro, resultado: res, anterior: reg };
    }

    async cancelar(user, emprestimoId, { motivo } = {}, balcao) {
        const reg = await this._registroOperavel(user, emprestimoId);
        const registro = await repository.cancelarRpc({
            predioId: user.predio_id, emprestimoId: reg.id,
            resp: responsavelComBalcao(user, balcao), motivo: limparTexto(motivo, 300),
        });
        return { registro, anterior: reg };
    }

    async reabrir(user, emprestimoId) {
        const reg = await this._registroOperavel(user, emprestimoId);
        const registro = await repository.reabrirRpc({ predioId: user.predio_id, emprestimoId: reg.id });
        return { registro, anterior: reg };
    }

    async alterarStatusItem(user, itemId, novoStatus, observacoes) {
        if (!itemId || !novoStatus) {
            throw new ErroPublico('ID do item e novo status são obrigatórios.');
        }
        if (!STATUS_EDITAVEIS.includes(novoStatus)) {
            throw new ErroPublico('Status inválido. Use DISPONIVEL ou MANUTENCAO.');
        }
        const item = await this._itemOperavel(user, itemId);
        // Uma transação no banco: trava o item, confere o prédio e recusa item
        // com empréstimo em aberto (quem o libera é a devolução).
        await repository.alterarStatusItemRpc({
            predioId: user.predio_id,
            itemId: item.id,
            status: novoStatus,
            observacoes: limparTexto(observacoes, 500) || null,
        });
        return { item, status: novoStatus };
    }

    async historico(user, { pontoId, busca, antes } = {}) {
        const ponto = await this._pontoOperavel(user, pontoId);
        const termo = sanearBusca(busca);
        const antesIso = antes && Number.isFinite(new Date(antes).getTime()) ? new Date(antes).toISOString() : null;
        const itemIdsDoTermo = termo ? await repository.getItemIdsPorNome([ponto.id], termo) : null;
        const { registros, temMais } = await repository.getHistorico({
            pontoIds: [ponto.id], antes: antesIso, termo, itemIdsDoTermo,
        });
        return {
            itens: registros.map(mapearHistorico),
            proximo: temMais ? registros[registros.length - 1].data_retirada : null,
        };
    }

    // ------------------------------------------------------------- relatório
    async estatisticas(user, { inicio, fim, pontoId } = {}) {
        if (!podeVerRelatorio(user)) {
            throw new ErroPublico('Acesso negado. Requer o módulo de Empréstimos ou Relatórios.', 403);
        }
        const predioId = exigirPredio(user);
        const ini = paraTimestamptz(inicio);
        const fimTs = paraTimestamptz(fim);
        if (!ini || !fimTs) throw new ErroPublico('Parâmetros inicio e fim são obrigatórios.');

        const pontos = await this.pontosDoRelatorio(user);
        let pontoIds;
        if (pontoId) {
            if (!pontos.some(p => p.id === pontoId)) throw new ErroPublico(SEM_ACESSO_PONTO, 403);
            pontoIds = [pontoId];
        } else {
            // null = prédio todo; atendente vê só os pontos dele ([] = nenhum)
            pontoIds = veTodosOsPontos(user) ? null : pontos.map(p => p.id);
        }
        return repository.estatisticasRpc({ predioId, pontoIds, inicio: ini, fim: fimTs });
    }
}

export default new EmprestimosService();
