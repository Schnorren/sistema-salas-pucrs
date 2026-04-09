import avisosService from '../../backend_core/services/avisos.service.js';
import avisosRepository from '../../backend_core/repositories/avisos.repository.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const caminho1 = urlParts.length > 2 ? urlParts[2] : null;
    const caminho2 = urlParts.length > 3 ? urlParts[3] : null;

    if (req.method === 'GET' && !caminho1) {
        try {
            const dados = await avisosService.obterMuralOtimizado(req.user.predio_id);
            return res.status(200).json(dados);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'POST' && !caminho1) {
        try {
            const payload = {
                ...req.body,
                criado_por: req.user.id,
                predio_id: req.user.predio_id
            };
            await avisosRepository.inserir(payload);
            return res.status(201).json({ message: 'Aviso criado com sucesso' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'GET' && caminho1 === 'historico') {
        try {
            const dados = await avisosService.obterHistoricoOtimizado(req.user.predio_id);
            return res.status(200).json(dados);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'PUT' && caminho1 === 'concluir' && caminho2) {
        try {
            const id = caminho2;
            const { obs } = req.body;
            const pid = req.user.nivel >= 60 ? null : req.user.predio_id;

            await avisosRepository.atualizar(id, pid, {
                status: 'CONCLUIDO',
                concluido_por: req.user.id,
                concluido_em: new Date().toISOString(),
                obs_conclusao: obs
            });

            return res.status(200).json({ message: 'Concluído com sucesso' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Avisos.' });
}

export default withAuth(handler, 'avisos');