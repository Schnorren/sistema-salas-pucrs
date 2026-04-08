const avisosRepository = require('../repositories/avisos.repository');

class AvisosService {
    _peso(prioridade) {
        const pesos = { 'ALTA': 1, 'NORMAL': 2, 'BAIXA': 3 };
        return pesos[prioridade || 'NORMAL'];
    }

    async obterMuralOtimizado(predio_id) {
        
        const avisos = await avisosRepository.buscarAtivos(predio_id);

        const chaves = avisos
            .filter(a => a.tipo === 'CHAVE')
            .sort((a, b) => {
                const dataA = a.data_prevista || '9999-12-31';
                const dataB = b.data_prevista || '9999-12-31';
                if (dataA !== dataB) return dataA.localeCompare(dataB);
                return (a.periodo || '').localeCompare(b.periodo || '');
            });

        const gerais = avisos
            .filter(a => a.tipo === 'GERAL')
            .sort((a, b) => this._peso(a.prioridade) - this._peso(b.prioridade));

        return { chaves, gerais };
    }

    async obterHistoricoOtimizado(predio_id) {
        const historico = await avisosRepository.buscarHistorico(predio_id, 200);

        return {
            chaves: historico.filter(h => h.tipo === 'CHAVE'),
            gerais: historico.filter(h => h.tipo === 'GERAL')
        };
    }

    async adicionarComentario(id, descricao_atual, novo_comentario, user_email, predio_id) {
        const dataHora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const nomeUsuario = user_email.split('@')[0];

        const textoAdicional = `\n\n📌 [${dataHora} - ${nomeUsuario}]: ${novo_comentario}`;
        const novaDescricao = (descricao_atual || '') + textoAdicional;

        await avisosRepository.atualizar(id, predio_id, { descricao: novaDescricao });
        return novaDescricao;
    }
}
module.exports = new AvisosService();