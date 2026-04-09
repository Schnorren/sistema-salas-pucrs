import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    try {
        const { q } = req.query;
        const resultados = await service.realizarBuscaGlobal(q, req.user.predio_id);
        return res.status(200).json(resultados);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
export default withAuth(handler);