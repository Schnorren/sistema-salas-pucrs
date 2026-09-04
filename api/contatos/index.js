// Módulo de Contatos — diretório institucional da PUCRS.
//
// Rotas:
//   GET    /api/contatos                    -> diretório completo (qualquer autenticado)
//   POST   /api/contatos                    -> cria contato          [edicao_contatos]
//   PUT    /api/contatos/:id                -> atualiza contato      [edicao_contatos]
//   DELETE /api/contatos/:id                -> exclui contato        [edicao_contatos]
//   POST   /api/contatos/:id/cursos         -> adiciona curso        [edicao_contatos]
//   DELETE /api/contatos/cursos/:cursoId    -> remove curso          [edicao_contatos]
//
// Este é o único módulo cujos dados NÃO são por prédio: o diretório é
// institucional e igual para todos. Por isso o handler ignora req.user.predio_id
// e é exportado com withAuth(handler, null) — a leitura fica livre para qualquer
// usuário autenticado e só a escrita é gated, via assertPodeEditar().

import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import contatosService from '../../backend_core/services/contatos.service.js';
import { ErroPublico, responderErro } from '../../backend_core/utils/http.js';
import { MODULOS } from '../../backend_core/utils/modulos.js';

function assertPodeEditar(user) {
    if (!user.is_admin && !user.permissoes?.includes(MODULOS.EDICAO_CONTATOS)) {
        throw new ErroPublico('Você não tem permissão para editar o diretório de contatos.', 403);
    }
}

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);

    // Remove o prefixo 'api' e 'contatos' para ficar só com os segmentos do recurso
    const contatosIdx = urlParts.indexOf('contatos');
    const segmentos = urlParts.slice(contatosIdx + 1); // ex: ['abc-123', 'cursos'] ou []

    const id = segmentos[0] || null;
    const acao = segmentos[1] || null;

    try {
        if (req.method === 'GET' && !id) {
            const diretorio = await contatosService.obterDiretorio();
            return res.status(200).json(diretorio);
        }

        // 'cursos' ocupa o slot do :id — precisa ser testado ANTES de tratar
        // segmentos[0] como uuid de contato.
        if (req.method === 'DELETE' && id === 'cursos' && acao) {
            assertPodeEditar(req.user);
            await contatosService.removerCurso(acao, req.user);
            return res.status(200).json({ message: 'Curso removido com sucesso' });
        }

        if (req.method === 'POST' && !id) {
            assertPodeEditar(req.user);
            const criado = await contatosService.criarContato(req.body, req.user);
            return res.status(201).json(criado);
        }

        if (req.method === 'POST' && id && acao === 'cursos') {
            assertPodeEditar(req.user);
            const curso = await contatosService.adicionarCurso(id, req.body?.nome, req.user);
            return res.status(201).json(curso);
        }

        if (req.method === 'PUT' && id && !acao) {
            assertPodeEditar(req.user);
            const atualizado = await contatosService.atualizarContato(id, req.body, req.user);
            return res.status(200).json(atualizado);
        }

        if (req.method === 'DELETE' && id && !acao) {
            assertPodeEditar(req.user);
            await contatosService.excluirContato(id, req.user);
            return res.status(200).json({ message: 'Contato excluído com sucesso' });
        }

        return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Contatos.' });
    } catch (err) {
        return responderErro(res, err);
    }
}

// null de propósito: leitura livre para qualquer autenticado (ver comentário no topo).
export default withAuth(handler, null);
