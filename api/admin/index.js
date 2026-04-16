import service from '../../backend_core/services/admin.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (!req.user?.permissoes?.includes('admin')) {
        return res.status(403).json({ error: 'Acesso negado. Requer o módulo de Administração.' });
    }

    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const endpoint = urlParts.length > 2 ? urlParts[2] : null;

    if (req.method === 'GET') {
        try {
            if (endpoint === 'predios') {
                const dados = await service.listarPredios();
                return res.status(200).json(dados);
            }
            if (endpoint === 'perfis') {
                const dados = await service.listarPerfis();
                return res.status(200).json(dados);
            }
            if (endpoint === 'usuarios') {
                const dados = await service.listarUsuarios();
                return res.status(200).json(dados);
            }
            if (endpoint === 'modulos') {
                const dados = await service.listarModulos();
                return res.status(200).json(dados);
            }
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            if (endpoint === 'perfis') {
                const { nome } = req.body;
                if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

                const novo = await service.criarPerfil(nome);
                return res.status(201).json(novo);
            }
        } catch (error) {
            return res.status(400).json({ error: error.message });
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

            return res.status(200).json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo Administrativo.' });
}

export default withAuth(handler, 'admin');