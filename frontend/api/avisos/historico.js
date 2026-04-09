import avisosService from '../../backend_core/services/avisos.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    
    try {
        const dados = await avisosService.obterHistoricoOtimizado(req.user.predio_id);
        return res.status(200).json(dados);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

export default withAuth(handler, 'avisos');