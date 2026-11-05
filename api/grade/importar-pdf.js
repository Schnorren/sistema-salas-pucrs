import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import { lerPdfDoFormulario } from '../../backend_core/utils/uploadPdf.js';

// POST /api/grade/importar-pdf — PDF da agenda semanal → grade do prédio.
// bodyParser desligado: o multipart é lido pelo formidable (lerPdfDoFormulario).
export const config = { api: { bodyParser: false } };

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

    // Mesmo gate da tela (Dashboard: canEditGrade). Antes aceitava 'grade', o
    // módulo de leitura — quem só via a grade conseguia substituí-la pela API.
    const temPermissao = req.user?.permissoes?.includes('edicao_grade') || req.user?.permissoes?.includes('admin');
    if (!temPermissao) {
        return res.status(403).json({ error: 'Acesso negado. Requer o módulo Atualização de Grade.' });
    }

    try {
        const buffer = await lerPdfDoFormulario(req);
        // Falha do extrator sai como ErroPublico 502 (grade.service)
        const resultado = await service.processarUploadPdf(buffer, req.user.predio_id, req.user);
        return res.status(201).json(resultado);
    } catch (error) {
        return responderErro(res, error);
    }
}

export default withAuth(handler, 'edicao_grade');
