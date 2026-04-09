import avisosRepository from '../../../backend_core/repositories/avisos.repository.js';
import { withAuth } from '../../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'PUT') return res.status(405).end();
    
    try {
        const { id } = req.query; // Pega o ID do nome do arquivo [id].js
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

export default withAuth(handler, 'avisos');