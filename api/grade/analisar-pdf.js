import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import formidable from 'formidable';
import fs from 'fs';

// POST /api/grade/analisar-pdf — Histórico de aulas (BI): recebe o PDF de uma
// agenda antiga e devolve a análise do extrator Python. Antes o navegador
// chamava o extrator direto, sem login; agora passa por aqui (módulo
// Relatórios, o mesmo gate da tela no Dashboard).
export const config = { api: { bodyParser: false } };

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const form = formidable({ keepExtensions: true });
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: 'Erro ao processar o formulário multipart.' });
        try {
            const enviado = files.arquivo || files.file;
            if (!enviado) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            const arquivo = Array.isArray(enviado) ? enviado[0] : enviado;
            const resultado = await service.analisarBiPdf(fs.readFileSync(arquivo.filepath));
            return res.status(200).json(resultado);
        } catch (error) {
            if (error.message.includes('Python') || error.message.includes('extração')) {
                return res.status(502).json({ error: 'O extrator de PDF está offline ou demorando para responder. Tente de novo em 30 segundos.' });
            }
            return responderErro(res, error);
        }
    });
}

export default withAuth(handler, 'relatorios');
