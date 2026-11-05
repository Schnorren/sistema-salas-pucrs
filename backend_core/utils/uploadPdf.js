import formidable, { errors as errosFormidable } from 'formidable';
import { promises as fs } from 'node:fs';
import { ErroPublico } from './http.js';
import { TAMANHO_MAX_PDF, TAMANHO_MAX_PDF_TEXTO } from './limites.js';

// Upload de PDF (importar a grade e Histórico de aulas/BI). Limite de tamanho
// em limites.js (compartilhado com as telas de upload).

// O cabeçalho "%PDF-" pode vir depois de alguns bytes de lixo (a spec tolera
// até 1024) — leitores aceitam, então aqui também.
export const pareceUmPdf = (buffer) =>
    Buffer.isBuffer(buffer) && buffer.subarray(0, 1024).includes('%PDF-');

// Lê o PDF do multipart (campo "arquivo" ou "file"), valida tamanho e tipo
// pela assinatura do conteúdo (a extensão e o Content-Type vêm do cliente) e
// SEMPRE apaga os temporários — antes ficavam no /tmp da instância a cada
// importação. Devolve o Buffer; erros saem como ErroPublico.
export async function lerPdfDoFormulario(req) {
    const form = formidable({
        maxFiles: 1,
        maxFileSize: TAMANHO_MAX_PDF,
        maxTotalFileSize: TAMANHO_MAX_PDF,
        maxFields: 5,
        maxFieldsSize: 64 * 1024,
        allowEmptyFiles: false,
    });

    let files;
    try {
        [, files] = await form.parse(req);
    } catch (err) {
        const tamanho = [errosFormidable.biggerThanMaxFileSize, errosFormidable.biggerThanTotalMaxFileSize].includes(err?.code);
        if (tamanho || err?.httpCode === 413) throw new ErroPublico(`O PDF passa do limite de ${TAMANHO_MAX_PDF_TEXTO}.`, 413);
        if (err?.code === errosFormidable.maxFilesExceeded) throw new ErroPublico('Envie um PDF por vez.', 400);
        throw new ErroPublico('Não foi possível ler o arquivo enviado. Tente de novo.', 400);
    }

    const todos = Object.values(files || {}).flat().filter(Boolean);
    try {
        const enviado = files?.arquivo || files?.file;
        const arquivo = Array.isArray(enviado) ? enviado[0] : enviado;
        if (!arquivo?.filepath) throw new ErroPublico('Nenhum arquivo enviado. Escolha o PDF da agenda.', 400);

        const buffer = await fs.readFile(arquivo.filepath);
        if (!pareceUmPdf(buffer)) throw new ErroPublico('O arquivo enviado não é um PDF válido.', 415);
        return buffer;
    } finally {
        await Promise.all(todos.map(f => (f?.filepath ? fs.unlink(f.filepath).catch(() => {}) : null)));
    }
}
