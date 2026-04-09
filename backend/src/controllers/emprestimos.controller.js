const emprestimosService = require('../services/emprestimos.service');

class EmprestimosController {
    async getCategorias(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            const categorias = await emprestimosService.listarCategorias(predioId);
            res.json(categorias);
        } catch (error) {
            console.error("Erro em getCategorias:", error);
            res.status(400).json({ error: error.message });
        }
    }

    async getItensDisponiveis(req, res) {
        try {
            const { categoriaId } = req.params;
            const itens = await emprestimosService.listarItensDisponiveis(categoriaId);
            res.json(itens);
        } catch (error) {
            console.error("Erro em getItensDisponiveis:", error);
            res.status(400).json({ error: error.message });
        }
    }

    async getAtivos(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            const ativos = await emprestimosService.listarEmprestimosAtivos(predioId);
            res.json(ativos);
        } catch (error) {
            console.error("Erro em getAtivos:", error);
            res.status(400).json({ error: error.message });
        }
    }

    async retirar(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            const respRetirada = req.user?.email || 'Sistema'; // req.user populado pelo authGuard
            const { itemId, matricula, nomeAluno, documento } = req.body;

            const resultado = await emprestimosService.registrarRetirada({
                predioId,
                itemId,
                matricula,
                nomeAluno,
                documento,
                respRetirada
            });

            res.json({ success: true, data: resultado });
        } catch (error) {
            console.error("Erro em retirar:", error);
            res.status(400).json({ error: error.message });
        }
    }

    async consultarAluno(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            const { matricula } = req.params;
            const dados = await emprestimosService.consultarMatricula(matricula, predioId);
            res.json(dados);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async getHistorico(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            const historico = await emprestimosService.listarHistorico(predioId);
            res.json(historico);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async devolver(req, res) {
        try {
            const { id } = req.params; // ID do empréstimo
            const respDevolucao = req.user?.email || 'Sistema';

            const resultado = await emprestimosService.registrarDevolucao({
                emprestimoId: id,
                respDevolucao
            });

            res.json({ success: true, data: resultado });
        } catch (error) {
            console.error("Erro em devolver:", error);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new EmprestimosController();