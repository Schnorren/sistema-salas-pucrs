import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { ErroPublico, responderErro } from '../../backend_core/utils/http.js';
import { MODULOS } from '../../backend_core/utils/modulos.js';

// Rotas (a leitura da grade em si vem do CDN — ver useGrade.js):
//   GET /api/grade/busca?q=   -> busca de aulas da barra do topo     [grade]
//   GET /api/grade/salas      -> salas do prédio + resumo da agenda  [edicao_grade]
//   PUT /api/grade/salas      -> { exibir: [], ocultar: [] }          [edicao_grade]
// importar-pdf e analisar-pdf têm arquivo próprio (bodyParser desligado).

const tem = (user, modulo) => user?.is_admin || user?.permissoes?.includes(modulo);

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const endpoint = urlParts.length > 2 ? urlParts[2] : null;

    // Prédio resolvido pelo withAuth — não reler x-predio-id (evita spoofing de prédio).
    const predioId = req.user?.predio_id;

    try {
        if (endpoint === 'salas') {
            if (!tem(req.user, MODULOS.EDICAO_GRADE)) {
                throw new ErroPublico('Acesso negado. Requer o módulo de Edição da grade.', 403);
            }
            if (!predioId) throw new ErroPublico('Selecione um prédio no menu superior.');

            if (req.method === 'GET') return res.status(200).json(await service.listarSalas(predioId));
            if (req.method === 'PUT') return res.status(200).json(await service.definirVisibilidadeSalas(predioId, req.body, req.user));
            return res.status(405).json({ error: 'Método não permitido.' });
        }

        if (!tem(req.user, MODULOS.GRADE)) {
            return res.status(403).json({ error: 'Acesso negado. Requer o módulo de Grade.' });
        }

        if (req.method === 'GET' && endpoint === 'busca') {
            const { q } = req.query;
            return res.status(200).json(await service.realizarBuscaGlobal(q, predioId));
        }

        return res.status(404).json({ error: 'Endpoint não encontrado ou migrado para CDN.' });
    } catch (e) {
        return responderErro(res, e);
    }
}

export default withAuth(handler);
