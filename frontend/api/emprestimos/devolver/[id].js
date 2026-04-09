import service from '../../../../backend_core/services/emprestimos.service.js';
import { withAuth } from '../../../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    try {
        const { id } = req.query;
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
export default withAuth(handler, 'emprestimos');