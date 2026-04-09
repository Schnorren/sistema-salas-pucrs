import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    try {
        // CORREÇÃO: Ocupação não recebe dia nem periodo, apenas o predio_id!
        const dados = await service.obterOcupacaoSemanal(req.user.predio_id);
        return res.status(200).json(dados);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export default withAuth(handler);