import service, { podeOperar, podeGerir, podeVerRelatorio, podeVerRelatorioRede } from '../../backend_core/services/emprestimos.service.js';
import gestao from '../../backend_core/services/emprestimosGestao.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import { registrarAuditoria } from '../../backend_core/utils/auditoria.js';

// Rotas (todas exigem login; a permissão é checada por grupo abaixo):
//   Balcão (módulo emprestimos)        GET  /pontos[?uso=relatorio]   GET /painel?ponto=
//                                      GET  /aluno/:mat?ponto=         PUT /aluno/:mat {nome}
//                                      POST /retirar {itemId, matricula, nomeAluno}
//                                      POST /devolver/:id {resultado, obs}
//                                      POST /transferir/:id {matricula, nomeAluno}  (troca de titular)
//                                      POST /cancelar/:id {motivo}     POST /reabrir/:id
//                                      PUT  /itens/:id/manutencao {status, observacoes}
//                                      GET  /historico?ponto=&busca=&antes=
//   Relatório (emprestimos|relatorios) GET  /relatorio?inicio=&fim=&ponto=
//   Relatório da rede (relatorio_emprestimos_rede; não usa o prédio do login)
//                                      GET  /rede/pontos   GET /rede/relatorio?inicio=&fim=&pontos=a,b
//   Gestão (gestao_emprestimos)        GET  /gestao   GET /gestao/ocorrencias
//                                      POST /gestao/{pontos,categorias,itens}  PUT /gestao/{...}/:id
//                                      GET|POST /gestao/bloqueios  DELETE /gestao/bloqueios/:id

// Segmentos de URL podem vir codificados (%20 etc.); sequência inválida não pode derrubar o handler
function decodificarSegmento(valor) {
    try {
        return valor ? decodeURIComponent(valor) : valor;
    } catch {
        return valor;
    }
}

// Login compartilhado na recepção: o front manda o nome do computador
// (x-balcao, salvo no navegador de cada máquina) para o registro dizer QUAL
// balcão atendeu, não só qual conta. URL-encoded, curto e sem caractere de controle.
function lerBalcao(req) {
    let balcao = '';
    try { balcao = decodeURIComponent(String(req.headers['x-balcao'] || '')); } catch { balcao = ''; }
    return [...balcao].filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').trim().slice(0, 30);
}

const negar = (res, mensagem) => res.status(403).json({ error: mensagem });

async function handler(req, res) {
    const segs = req.url.split('?')[0].split('/').filter(Boolean);
    const base = segs.indexOf('emprestimos');
    const [c1, c2, c3] = base === -1 ? [] : segs.slice(base + 1).map(decodificarSegmento);
    const q = req.query || {};
    const body = req.body || {};
    const user = req.user;
    // Prédio vem SEMPRE do withAuth (resolvido no servidor). Nunca reler o header
    // aqui — isso permitiria a um usuário comum forjar x-predio-id.
    const predioId = user.predio_id;
    const balcao = lerBalcao(req);
    const auditar = (acao, entidade, entidadeId, detalhes) =>
        registrarAuditoria({ user, acao, entidade, entidadeId, predioId, detalhes: detalhes || null });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        // ------------------------------------------------------- relatório
        if (req.method === 'GET' && c1 === 'relatorio') {
            if (!podeVerRelatorio(user)) return negar(res, 'Acesso negado. Requer o módulo de Empréstimos ou Relatórios.');
            return res.status(200).json(await service.relatorio(user, { inicio: q.inicio, fim: q.fim, pontoId: q.ponto }));
        }

        // Vários prédios: os pontos vêm da lista do Painel Admin, nunca do
        // prédio do login (que é nulo no login da rede)
        if (req.method === 'GET' && c1 === 'rede') {
            if (!podeVerRelatorioRede(user)) return negar(res, 'Acesso negado. Requer o módulo Relatório de Empréstimos da Rede.');
            if (c2 === 'pontos') return res.status(200).json(await service.pontosDaRede(user));
            if (c2 === 'relatorio') {
                return res.status(200).json(await service.relatorioRede(user, { inicio: q.inicio, fim: q.fim, pontos: q.pontos }));
            }
            return res.status(404).json({ error: 'Endpoint não encontrado no relatório da rede.' });
        }

        if (req.method === 'GET' && c1 === 'pontos') {
            if (q.uso === 'relatorio' ? !podeVerRelatorio(user) : !podeOperar(user)) {
                return negar(res, 'Acesso negado. Requer o módulo de Empréstimos.');
            }
            return res.status(200).json(await service.listarPontos(user, q.uso));
        }

        // ------------------------------------------------------- gestão
        if (c1 === 'gestao') {
            if (!podeGerir(user)) return negar(res, 'Acesso negado. Requer o módulo Gestão de Empréstimos.');

            if (req.method === 'GET' && !c2) return res.status(200).json(await gestao.visaoGeral(user));
            if (req.method === 'GET' && c2 === 'ocorrencias') return res.status(200).json(await gestao.listarOcorrencias(user));
            if (req.method === 'GET' && c2 === 'bloqueios') return res.status(200).json(await gestao.listarBloqueios(user));

            // [método, ação da auditoria, entidade, campos que vão para o log]
            // — só os campos que o cadastro usa: o body inteiro deixava o
            // cliente gravar qualquer chave (e qualquer tamanho) na auditoria
            const salvar = {
                pontos: ['salvarPonto', 'emprestimo.ponto.salvar', 'emprestimo_pontos', ['nome', 'limite', 'ativo']],
                categorias: ['salvarCategoria', 'emprestimo.categoria.salvar', 'emprestimo_categorias', ['nome', 'pontoId', 'ativo']],
                itens: ['salvarItem', 'emprestimo.item.salvar', 'emprestimo_itens', ['nome', 'codigo', 'categoriaId', 'ativo', 'observacoes']],
            }[c2];
            if (salvar && ((req.method === 'POST' && !c3) || (req.method === 'PUT' && c3))) {
                const [metodo, acao, entidade, campos] = salvar;
                const salvo = await gestao[metodo](user, c3 || null, body);
                const detalhes = Object.fromEntries(campos.filter(c => body[c] !== undefined)
                    .map(c => [c, typeof body[c] === 'string' ? body[c].slice(0, 200) : body[c]]));
                await auditar(acao, entidade, salvo?.id, { novo: !c3, ...detalhes });
                return res.status(c3 ? 200 : 201).json(salvo);
            }

            if (req.method === 'POST' && c2 === 'bloqueios' && !c3) {
                const bloqueio = await gestao.criarBloqueio(user, body);
                await auditar('emprestimo.bloqueio.criar', 'emprestimo_bloqueios', bloqueio.id,
                    { matricula: bloqueio.matricula, motivo: bloqueio.motivo, ate: bloqueio.ate });
                return res.status(201).json(bloqueio);
            }
            if (req.method === 'DELETE' && c2 === 'bloqueios' && c3) {
                const bloqueio = await gestao.removerBloqueio(user, c3);
                await auditar('emprestimo.bloqueio.remover', 'emprestimo_bloqueios', c3, { matricula: bloqueio.matricula });
                return res.status(200).json({ success: true });
            }
            return res.status(404).json({ error: 'Endpoint não encontrado na Gestão de Empréstimos.' });
        }

        // ------------------------------------------------------- balcão
        if (!podeOperar(user)) return negar(res, 'Acesso negado. Requer o módulo de Empréstimos.');

        if (req.method === 'GET' && c1 === 'painel') {
            return res.status(200).json(await service.painel(user, q.ponto));
        }

        if (req.method === 'GET' && c1 === 'historico') {
            return res.status(200).json(await service.historico(user, { pontoId: q.ponto, busca: q.busca, antes: q.antes }));
        }

        if (c1 === 'aluno' && c2) {
            if (req.method === 'GET') return res.status(200).json(await service.consultarAluno(user, c2, q.ponto));
            if (req.method === 'PUT') {
                const corrigido = await service.corrigirNome(user, c2, body.nome);
                await auditar('emprestimo.aluno.nome', 'alunos_cache', corrigido.matricula, { nome: corrigido.nome });
                return res.status(200).json(corrigido);
            }
        }

        if (req.method === 'POST' && c1 === 'retirar') {
            // Campos explícitos — o spread do body permitiria injetar chaves extras no service
            const registro = await service.retirar(user, {
                itemId: body.itemId, matricula: body.matricula, nomeAluno: body.nomeAluno,
            }, balcao);
            await auditar('emprestimo.retirar', 'emprestimos_registro', registro?.id,
                { itemId: registro?.item_id, matricula: registro?.matricula_aluno, balcao: balcao || null });
            return res.status(201).json({ success: true, data: registro });
        }

        if (req.method === 'POST' && c1 === 'devolver' && c2) {
            const { registro, resultado, anterior } = await service.devolver(user, c2, { resultado: body.resultado, obs: body.obs }, balcao);
            await auditar('emprestimo.devolver', 'emprestimos_registro', c2, {
                resultado, obs: body.obs || null, matricula: anterior.matricula_aluno, balcao: balcao || null,
            });
            return res.status(200).json({ success: true, data: registro });
        }

        if (req.method === 'POST' && c1 === 'transferir' && c2) {
            // Campos explícitos, como na retirada
            const { registro, anterior } = await service.transferir(user, c2, {
                matricula: body.matricula, nomeAluno: body.nomeAluno,
            }, balcao);
            await auditar('emprestimo.transferir', 'emprestimos_registro', registro?.id, {
                item: anterior.item?.nome_item || null, de: anterior.matricula_aluno,
                para: registro?.matricula_aluno || null, anterior: anterior.id, balcao: balcao || null,
            });
            return res.status(201).json({ success: true, data: registro });
        }

        if (req.method === 'POST' && c1 === 'cancelar' && c2) {
            const { registro, anterior } = await service.cancelar(user, c2, { motivo: body.motivo }, balcao);
            await auditar('emprestimo.cancelar', 'emprestimos_registro', c2, {
                matricula: anterior.matricula_aluno, item: anterior.item?.nome_item || null, balcao: balcao || null,
                // Desfez uma troca de titular: o item voltou para o registro anterior
                ...(anterior.transferido_de ? { trocaDesfeita: true } : {}),
            });
            return res.status(200).json({ success: true, data: registro });
        }

        if (req.method === 'POST' && c1 === 'reabrir' && c2) {
            const { registro, anterior } = await service.reabrir(user, c2);
            await auditar('emprestimo.reabrir', 'emprestimos_registro', c2,
                { matricula: anterior.matricula_aluno, item: anterior.item?.nome_item || null, balcao: balcao || null });
            return res.status(200).json({ success: true, data: registro });
        }

        if (req.method === 'PUT' && c1 === 'itens' && c2 && c3 === 'manutencao') {
            const { item, status } = await service.alterarStatusItem(user, c2, body.status, body.observacoes);
            await auditar('emprestimo.item.status', 'emprestimo_itens', c2, { status, item: item.nome_item });
            return res.status(200).json({ success: true, message: 'Status do item atualizado.' });
        }

        return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Empréstimos.' });
    } catch (error) {
        return responderErro(res, error);
    }
}

// Módulo checado por rota (o relatório também aceita 'relatorios', e a gestão
// tem permissão própria). Admin passa em tudo (ver podeOperar/podeGerir).
export default withAuth(handler, null);
