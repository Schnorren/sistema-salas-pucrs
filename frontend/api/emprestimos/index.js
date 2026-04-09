import service from '../../backend_core/services/emprestimos.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const caminho1 = urlParts.length > 2 ? urlParts[2] : null;
    const caminho2 = urlParts.length > 3 ? urlParts[3] : null;
    const caminho3 = urlParts.length > 4 ? urlParts[4] : null;

    const predioId = req.headers['x-predio-id'] || req.user.predio_id;

    if (req.method === 'GET' && caminho1 === 'ativos') {
        try {
            const ativos = await service.listarEmprestimosAtivos(predioId);
            return res.status(200).json(ativos);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && caminho1 === 'categorias' && !caminho2) {
        try {
            const categorias = await service.listarCategorias(predioId);
            return res.status(200).json(categorias);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && caminho1 === 'categorias' && caminho2 && caminho3 === 'itens') {
        try {
            const categoriaId = caminho2;
            const itens = await service.listarItensDisponiveis(categoriaId);
            return res.status(200).json(itens);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && caminho1 === 'aluno' && caminho2) {
        try {
            const matricula = caminho2;
            console.log(`🔍 [API] Consultando matrícula: ${matricula} no prédio: ${predioId}`);
            const dados = await service.consultarMatricula(matricula, predioId);
            return res.status(200).json(dados);
        } catch (error) {
            console.error('❌ [API Error - Aluno]:', error.message);
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && caminho1 === 'historico') {
        try {
            const historico = await service.listarHistorico(predioId);
            return res.status(200).json(historico);
        } catch (error) {
            return res.status(400).json({ error: error.message });
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
            return res.status(201).json({ success: true, data: resultado });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'POST' && caminho1 === 'devolver' && caminho2) {
        try {
            const id = caminho2;
            const respDevolucao = req.user?.email || 'Sistema';

            const resultado = await service.registrarDevolucao({
                emprestimoId: id,
                respDevolucao
            });
            return res.status(200).json({ success: true, data: resultado });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Empréstimos.' });
}

export default withAuth(handler, 'emprestimos');