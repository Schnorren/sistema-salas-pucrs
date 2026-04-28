import avisosService from '../../backend_core/services/avisos.service.js';
import avisosRepository from '../../backend_core/repositories/avisos.repository.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

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

    // GET /api/avisos
    if (req.method === 'GET' && !id) {
        try {
            const dados = await avisosService.obterMuralOtimizado(predioId);
            return res.status(200).json(dados);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // POST /api/avisos
    if (req.method === 'POST' && !id) {
        try {
            const payload = {
                ...req.body,
                criado_por: req.user.id,
                predio_id: predioId
            };
            await avisosRepository.inserir(payload);
            return res.status(201).json({ message: 'Aviso criado com sucesso' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // GET /api/avisos/historico
    if (req.method === 'GET' && id === 'historico') {
        try {
            const dados = await avisosService.obterHistoricoOtimizado(predioId);
            return res.status(200).json(dados);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // PUT /api/avisos/:id/concluir
    if (req.method === 'PUT' && id && acao === 'concluir') {
        try {
            const { obs } = req.body;
            await avisosRepository.atualizar(id, predioId, {
                status: 'CONCLUIDO',
                concluido_por: req.user.id,
                concluido_em: new Date().toISOString(),
                obs_conclusao: obs || null
            });
            return res.status(200).json({ message: 'Concluído com sucesso' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // PATCH /api/avisos/:id/comentar
    if (req.method === 'PATCH' && id && acao === 'comentar') {
        try {
            const { descricao_atual, nota, user_email } = req.body;
            const novaDescricao = await avisosService.adicionarComentario(
                id, descricao_atual, nota, user_email, predioId
            );
            return res.status(200).json({ descricao: novaDescricao });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // DELETE /api/avisos/:id
    if (req.method === 'DELETE' && id && !acao) {
        try {
            await avisosRepository.deletar(id, predioId);
            return res.status(200).json({ message: 'Aviso excluído com sucesso' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Avisos.' });
}

export default withAuth(handler, 'avisos');
