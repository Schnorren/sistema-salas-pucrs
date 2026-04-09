import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    try {
        const { dia } = req.query;
        if (!dia) return res.status(400).json({ error: 'Parâmetro "dia" é obrigatório.' });
        
        // CORREÇÃO: Passando apenas dia e predio_id
        const dados = await service.obterTimeline(dia, req.user.predio_id);
        return res.status(200).json(dados);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export default withAuth(handler);