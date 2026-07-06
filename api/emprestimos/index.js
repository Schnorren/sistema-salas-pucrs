import service from '../../backend_core/services/emprestimos.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import { registrarAuditoria } from '../../backend_core/utils/auditoria.js';

async function handler(req, res) {
    const temPermissao = req.user?.permissoes?.includes('emprestimos') || req.user?.permissoes?.includes('admin');
    if (!temPermissao) {
        return res.status(403).json({ error: 'Acesso negado. Requer o módulo de Empréstimos.' });
    }

    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const baseIndex = urlParts.indexOf('emprestimos');
    const caminho1 = baseIndex !== -1 && urlParts.length > baseIndex + 1 ? urlParts[baseIndex + 1] : null; 
    const caminho2 = baseIndex !== -1 && urlParts.length > baseIndex + 2 ? urlParts[baseIndex + 2] : null; 
    const caminho3 = baseIndex !== -1 && urlParts.length > baseIndex + 3 ? urlParts[baseIndex + 3] : null;

    // Prédio vem SEMPRE do withAuth (resolvido no servidor). Nunca reler o header
    // aqui — isso permitiria a um usuário comum forjar x-predio-id e vazar/alterar
    // dados de outro prédio.
    const predioId = req.user.predio_id;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'GET' && caminho1 === 'ativos') {
        try {
            const ativos = await service.listarEmprestimosAtivos(predioId);
            return res.status(200).json(ativos);
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'GET' && caminho1 === 'categorias' && !caminho2) {
        try {
            const categorias = await service.listarCategorias(predioId);
            return res.status(200).json(categorias);
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'GET' && caminho1 === 'categorias' && caminho2 && caminho3 === 'itens') {
        try {
            const categoriaId = caminho2;
            const itens = await service.listarItensDisponiveis(categoriaId, predioId);
            return res.status(200).json(itens);
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'GET' && caminho1 === 'aluno' && caminho2) {
        try {
            const matricula = caminho2;
            const dados = await service.consultarMatricula(matricula, predioId);
            return res.status(200).json(dados);
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'GET' && caminho1 === 'historico') {
        try {
            const historico = await service.listarHistorico(predioId);
            return res.status(200).json(historico);
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'POST' && caminho1 === 'retirar') {
        try {
            const respRetirada = req.user?.email || 'Sistema';
            const resultado = await service.registrarRetirada({
                ...req.body,
                predioId,
                respRetirada
            });
            registrarAuditoria({
                user: req.user, acao: 'emprestimo.retirar', entidade: 'emprestimos_registro',
                entidadeId: resultado?.id || resultado?.emprestimo_id || null, predioId,
                detalhes: { itemId: req.body?.itemId, matricula: req.body?.matricula }
            });
            return res.status(201).json({ success: true, data: resultado });
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'POST' && caminho1 === 'devolver' && caminho2) {
        try {
            const id = caminho2;
            const respDevolucao = req.user?.email || 'Sistema';

            const resultado = await service.registrarDevolucao({
                emprestimoId: id,
                respDevolucao,
                predioId
            });
            registrarAuditoria({
                user: req.user, acao: 'emprestimo.devolver', entidade: 'emprestimos_registro',
                entidadeId: id, predioId
            });
            return res.status(200).json({ success: true, data: resultado });
        } catch (error) {
            return responderErro(res, error);
        }
    }
    if (req.method === 'PUT' && caminho1 === 'itens' && caminho3 === 'manutencao') {
        try {
            const itemId = caminho2;
            const { status, observacoes } = req.body;

            await service.alterarStatusItem(itemId, status, observacoes, predioId);

            registrarAuditoria({
                user: req.user, acao: 'emprestimo.item.status', entidade: 'emprestimo_itens',
                entidadeId: itemId, predioId, detalhes: { status }
            });
            return res.status(200).json({ success: true, message: "Status do item atualizado." });
        } catch (error) {
            return responderErro(res, error);
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Empréstimos.' });
}

export default withAuth(handler, 'emprestimos');