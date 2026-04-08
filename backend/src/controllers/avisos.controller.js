const avisosService = require('../services/avisos.service');
const avisosRepository = require('../repositories/avisos.repository');

class AvisosController {
    async getMural(req, res) {
        try {
            
            const dados = await avisosService.obterMuralOtimizado(req.user.predio_id, req.user.nivel);
            res.json(dados);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getHistorico(req, res) {
        try {
            const dados = await avisosService.obterHistoricoOtimizado(req.user.predio_id, req.user.nivel);
            res.json(dados);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async criar(req, res) {
        try {
            
            const payload = { ...req.body, criado_por: req.user.id, predio_id: req.user.predio_id };
            await avisosRepository.inserir(payload);
            res.status(201).json({ message: 'Aviso criado' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async concluir(req, res) {
        try {
            const { id } = req.params;
            const { obs } = req.body;
            
            
            const pid = req.user.nivel >= 60 ? null : req.user.predio_id;

            await avisosRepository.atualizar(id, pid, {
                status: 'CONCLUIDO',
                concluido_por: req.user.id,
                concluido_em: new Date().toISOString(),
                obs_conclusao: obs
            });
            res.json({ message: 'Concluído com sucesso' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async comentar(req, res) {
        try {
            const { id } = req.params;
            const { descricao_atual, nota, user_email } = req.body;
            const novaDesc = await avisosService.adicionarComentario(id, descricao_atual, nota, user_email, req.user.predio_id, req.user.nivel);
            res.json({ descricao: novaDesc });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}
module.exports = new AvisosController();