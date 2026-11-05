import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import { lerPdfDoFormulario } from '../../backend_core/utils/uploadPdf.js';

// POST /api/grade/analisar-pdf — Histórico de aulas (BI): recebe o PDF de uma
// agenda antiga e devolve a análise do extrator Python. Antes o navegador
// chamava o extrator direto, sem login; agora passa por aqui (módulo
// Relatórios, o mesmo gate da tela no Dashboard).
export const config = { api: { bodyParser: false } };

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    try {
        const buffer = await lerPdfDoFormulario(req);
        return res.status(200).json(await service.analisarBiPdf(buffer));
    } catch (error) {
        return responderErro(res, error);
    }
}

export default withAuth(handler, 'relatorios');
