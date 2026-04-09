import service from '../../../../backend_core/services/emprestimos.service.js';
import { withAuth } from '../../../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    try {
        const { categoriaId } = req.query;
        const itens = await service.listarItensDisponiveis(categoriaId);
        return res.status(200).json(itens);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}
export default withAuth(handler, 'emprestimos');