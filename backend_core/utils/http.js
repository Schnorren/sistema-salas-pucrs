// Erro "público": mensagem segura para o usuário final (validação/regra de negócio).
// Qualquer outro erro é tratado como interno: logado no servidor, genérico no cliente.
export class ErroPublico extends Error {
    constructor(mensagem, status = 400) {
        super(mensagem);
        this.name = 'ErroPublico';
        this.status = status;
    }
}

// Responde um erro sem vazar detalhe interno do banco.
export function responderErro(res, err) {
    if (err instanceof ErroPublico) {
        return res.status(err.status).json({ error: err.message });
    }
    console.error('[API]', err?.message || err, err?.stack ? `\n${err.stack}` : '');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
}
