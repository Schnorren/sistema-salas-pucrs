import service from '../../backend_core/services/admin.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import { registrarAuditoria } from '../../backend_core/utils/auditoria.js';

async function handler(req, res) {
    if (!req.user?.permissoes?.includes('admin')) {
        return res.status(403).json({ error: 'Acesso negado. Requer o módulo de Administração.' });
    }

    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const endpoint = urlParts.length > 2 ? urlParts[2] : null;

    if (req.method === 'GET') {
        try {
            if (endpoint === 'predios') return res.status(200).json(await service.listarPredios());
            if (endpoint === 'perfis')  return res.status(200).json(await service.listarPerfis());
            if (endpoint === 'usuarios') return res.status(200).json(await service.listarUsuarios());
            if (endpoint === 'modulos')  return res.status(200).json(await service.listarModulos());
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'POST') {
        try {
            if (endpoint === 'predios') {
                const { nome } = req.body;
                if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

                const novo = await service.criarPredio(nome);
                registrarAuditoria({ user: req.user, acao: 'admin.predio.criar', entidade: 'predios', entidadeId: novo.id, detalhes: { nome } });
                return res.status(201).json(novo);
            }

            if (endpoint === 'perfis') {
                const { nome } = req.body;
                if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

                const novo = await service.criarPerfil(nome);
                registrarAuditoria({ user: req.user, acao: 'admin.perfil.criar', entidade: 'perfis', entidadeId: novo.id, detalhes: { nome } });
                return res.status(201).json(novo);
            }
        } catch (error) {
            return responderErro(res, error);
        }
    }


    if (req.method === 'PUT' && endpoint === 'usuarios') {
        try {
            const { usuarioId, nome, predioId, perfilId, senha, permissoes } = req.body;

            if (!usuarioId) return res.status(400).json({ error: 'ID do usuário é obrigatório.' });

            const resultado = await service.atualizarUsuarioCompleto(usuarioId, {
                nome,
                predioId,
                perfilId,
                senha,
                permissoes
            });

            registrarAuditoria({
                user: req.user, acao: 'admin.usuario.atualizar', entidade: 'usuarios_acessos',
                entidadeId: usuarioId, predioId: predioId || null,
                detalhes: { perfilId: perfilId || null, permissoes: permissoes || [], senhaAlterada: Boolean(senha && senha.trim()) }
            });

            return res.status(200).json(resultado);
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'DELETE') {
        try {
            if (endpoint === 'predios') {
                const { id } = req.body;
                if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
                await service.deletarPredio(id);
                registrarAuditoria({ user: req.user, acao: 'admin.predio.excluir', entidade: 'predios', entidadeId: id });
                return res.status(200).json({ success: true });
            }
            if (endpoint === 'perfis') {
                const { id } = req.body;
                if (!id) return res.status(400).json({ error: 'ID é obrigatório.' });
                await service.deletarPerfil(id);
                registrarAuditoria({ user: req.user, acao: 'admin.perfil.excluir', entidade: 'perfis', entidadeId: id });
                return res.status(200).json({ success: true });
            }
        } catch (error) {
            return responderErro(res, error);
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo Administrativo.' });
}

export default withAuth(handler, 'admin');
