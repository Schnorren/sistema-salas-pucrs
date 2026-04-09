import avisosService from '../../backend_core/services/avisos.service.js';
import avisosRepository from '../../backend_core/repositories/avisos.repository.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    // 🟢 MÉTODO GET: Retorna o Mural
    if (req.method === 'GET') {
        try {
            // No seu service, passamos apenas o predio_id
            const dados = await avisosService.obterMuralOtimizado(req.user.predio_id);
            return res.status(200).json(dados);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // 🔵 MÉTODO POST: Cria um novo aviso
    if (req.method === 'POST') {
        try {
            const payload = { 
                ...req.body, 
                criado_por: req.user.id, 
                predio_id: req.user.predio_id 
            };
            await avisosRepository.inserir(payload);
            return res.status(201).json({ message: 'Aviso criado com sucesso' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Caso tentem um método que não mapeamos
    return res.status(405).json({ error: 'Método não permitido' });
}

export default withAuth(handler, 'avisos');