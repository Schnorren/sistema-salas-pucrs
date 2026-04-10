import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    console.log("📥 [Upload PDF] Recebendo requisição...");
    const form = formidable({ keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error("❌ [Upload PDF] Erro no Formidable:", err);
            return res.status(500).json({ error: "Erro ao processar o formulário multipart." });
        }

        try {
            const arquivoArrayOuObjeto = files.arquivo || files.file;

            if (!arquivoArrayOuObjeto) {
                console.error("❌ [Upload PDF] Chaves recebidas no form:", Object.keys(files));
                return res.status(400).json({ error: 'Nenhum arquivo enviado. Verifique se o nome do campo é "arquivo" ou "file".' });
            }

            const arquivoReal = Array.isArray(arquivoArrayOuObjeto) ? arquivoArrayOuObjeto[0] : arquivoArrayOuObjeto;

            console.log("📄 [Upload PDF] Arquivo detectado:", arquivoReal.originalFilename || arquivoReal.name);

            const buffer = fs.readFileSync(arquivoReal.filepath);

            console.log("🚀 [Upload PDF] Enviando buffer para o Python/Render...");
            const resultado = await service.processarUploadPdf(buffer, req.user.predio_id);

            console.log("✅ [Upload PDF] Sucesso! Linhas importadas:", resultado.registrosInseridos);
            return res.status(201).json(resultado);

        } catch (error) {
            console.error('❌ [API Erro - PDF]:', error.message);
            if (error.message.includes('Python')) {
                return res.status(502).json({ error: "A API do extrator (Render) está offline ou demorando para responder. Tente novamente em 30 segundos." });
            }
            return res.status(500).json({ error: error.message });
        }
    });
}

export default withAuth(handler, 'grade');