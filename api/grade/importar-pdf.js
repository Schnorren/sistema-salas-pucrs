import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const temPermissao = req.user?.permissoes?.includes('grade') || req.user?.permissoes?.includes('admin');
    if (!temPermissao) {
        return res.status(403).json({ error: 'Acesso negado. Requer o módulo de Grade e Salas.' });
    }

    const form = formidable({ keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            return res.status(500).json({ error: "Erro ao processar o formulário multipart." });
        }

        try {
            const arquivoArrayOuObjeto = files.arquivo || files.file;

            if (!arquivoArrayOuObjeto) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado. Verifique se o nome do campo é "arquivo" ou "file".' });
            }

            const arquivoReal = Array.isArray(arquivoArrayOuObjeto) ? arquivoArrayOuObjeto[0] : arquivoArrayOuObjeto;
            const buffer = fs.readFileSync(arquivoReal.filepath);
            const resultado = await service.processarUploadPdf(buffer, req.user.predio_id);

            return res.status(201).json(resultado);

        } catch (error) {
            if (error.message.includes('Python') || error.message.includes('extração')) {
                return res.status(502).json({ error: "A API do extrator (Render) está offline ou demorando para responder. Tente novamente em 30 segundos." });
            }
            return res.status(500).json({ error: error.message });
        }
    });
}

export default withAuth(handler, 'grade');
