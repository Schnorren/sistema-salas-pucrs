// ✅ Verifique se são exatamente TRÊS níveis (../../../)
import service from '../../../backend_core/services/emprestimos.service.js';
import { withAuth } from '../../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    
    try {
        const { matricula } = req.query; // Pega o que está no [matricula]
        const predioId = req.headers['x-predio-id'] || req.user.predio_id;

        console.log(`🔍 [API] Consultando matrícula: ${matricula} no prédio: ${predioId}`);

        const dados = await service.consultarMatricula(matricula, predioId);
        return res.status(200).json(dados);
    } catch (error) {
        console.error('❌ [API Error - Aluno]:', error.message);
        return res.status(400).json({ error: error.message });
    }
}

export default withAuth(handler, 'emprestimos');