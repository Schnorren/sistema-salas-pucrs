import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const endpoint = urlParts.length > 2 ? urlParts[2] : null;

    const predioId = req.headers['x-predio-id'] || req.user?.predio_id;

    // Apenas a rota de Busca Global sobreviveu a migração para a CDN!
    if (req.method === 'GET' && endpoint === 'busca') {
        try {
            const { q } = req.query;
            const resultados = await service.realizarBuscaGlobal(q, predioId);
            return res.status(200).json(resultados);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado ou migrado para CDN.' });
}

export default withAuth(handler);