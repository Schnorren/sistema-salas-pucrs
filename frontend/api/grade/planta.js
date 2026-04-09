import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    try {
        const { dia, periodo } = req.query;
        
        const diaObrigatorio = dia || new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
            .format(new Date())
            .split('-')[0]
            .replace(/^\w/, (c) => c.toUpperCase());
        
        const dados = await service.obterStatusPlanta(diaObrigatorio, periodo || 'auto', req.user.predio_id);
        return res.status(200).json(dados);
    } catch (error) {
        console.error('❌ [Endpoint Error - Planta]:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
export default withAuth(handler);