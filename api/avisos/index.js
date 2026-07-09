import avisosService from '../../backend_core/services/avisos.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';

// Padrão de URL:
//   GET    /api/avisos               → listar ativos
//   POST   /api/avisos               → criar aviso
//   GET    /api/avisos/historico      → listar histórico
//   PUT    /api/avisos/:id/concluir   → concluir aviso
//   PATCH  /api/avisos/:id/comentar   → adicionar comentário
//   DELETE /api/avisos/:id            → excluir aviso

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);

    // Remove o prefixo 'api' e 'avisos' para ficar só com os segmentos do recurso
    const avisosIdx = urlParts.indexOf('avisos');
    const segmentos = urlParts.slice(avisosIdx + 1); // ex: ['abc-123', 'concluir'] ou []

    const id      = segmentos[0] || null;  // UUID do aviso, se presente
    const acao    = segmentos[1] || null;  // 'concluir' | 'comentar', se presente
    const predioId = req.user.predio_id;

    try {
        // GET /api/avisos
        if (req.method === 'GET' && !id) {
            const dados = await avisosService.obterMuralOtimizado(predioId);
            return res.status(200).json(dados);
        }

        // POST /api/avisos
        if (req.method === 'POST' && !id) {
            await avisosService.criarAviso(req.body, req.user, predioId);
            return res.status(201).json({ message: 'Aviso criado com sucesso' });
        }

        // GET /api/avisos/historico
        if (req.method === 'GET' && id === 'historico') {
            const dados = await avisosService.obterHistoricoOtimizado(predioId);
            return res.status(200).json(dados);
        }

        // PUT /api/avisos/:id/concluir
        if (req.method === 'PUT' && id && acao === 'concluir') {
            await avisosService.concluirAviso(id, req.body?.obs, req.user, predioId);
            return res.status(200).json({ message: 'Concluído com sucesso' });
        }

        // PATCH /api/avisos/:id/comentar
        if (req.method === 'PATCH' && id && acao === 'comentar') {
            const descricao = await avisosService.adicionarComentario(id, req.body?.nota, req.user, predioId);
            return res.status(200).json({ descricao });
        }

        // DELETE /api/avisos/:id
        if (req.method === 'DELETE' && id && !acao) {
            await avisosService.excluirAviso(id, req.user, predioId);
            return res.status(200).json({ message: 'Aviso excluído com sucesso' });
        }

        return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Avisos.' });
    } catch (err) {
        return responderErro(res, err);
    }
}

export default withAuth(handler, 'avisos');
