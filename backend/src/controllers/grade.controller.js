const gradeService = require('../services/grade.service');

class GradeController {
    async getProximasAulas(req, res) {
        try {
            const { dia, periodo } = req.query;
            if (!dia) return res.status(400).json({ error: 'O parâmetro "dia" é obrigatório.' });
            const dadosProcessados = await gradeService.obterProximasAulas(dia, periodo || 'auto');
            return res.status(200).json(dadosProcessados);
        } catch (error) {
            console.error('[Controller Error - getProximasAulas]:', error);
            return res.status(500).json({ error: 'Erro interno ao processar as próximas aulas.' });
        }
    }

    async getSalasLivres(req, res) {
        try {
            const { dia } = req.query;
            if (!dia) return res.status(400).json({ error: 'O parâmetro "dia" é obrigatório.' });
            const dadosProcessados = await gradeService.obterSalasLivres(dia);
            return res.status(200).json(dadosProcessados);
        } catch (error) {
            console.error('[Controller Error - getSalasLivres]:', error);
            return res.status(500).json({ error: 'Erro interno ao buscar salas livres.' });
        }
    }

    async getPlanta(req, res) {
        try {
            const { dia, periodo } = req.query;
            if (!dia) return res.status(400).json({ error: 'Dia é obrigatório.' });
            const planta = await gradeService.obterStatusPlanta(dia, periodo || 'auto');
            return res.status(200).json(planta);
        } catch (error) {
            console.error('[Controller Error - getPlanta]:', error);
            return res.status(500).json({ error: 'Erro ao processar planta ao vivo.' });
        }
    }

    async getTimeline(req, res) {
        try {
            const { dia } = req.query;
            if (!dia) return res.status(400).json({ error: 'Dia é obrigatório.' });
            const dados = await gradeService.obterTimeline(dia);
            return res.status(200).json(dados);
        } catch (error) {
            console.error('[Controller Error - getTimeline]:', error);
            return res.status(500).json({ error: 'Erro ao processar timeline.' });
        }
    }

    async getOcupacao(req, res) {
        try {
            const dados = await gradeService.obterOcupacaoSemanal();
            return res.status(200).json(dados);
        } catch (error) {
            console.error('[Controller Error - getOcupacao]:', error);
            return res.status(500).json({ error: 'Erro ao gerar heatmap de ocupação.' });
        }
    }

    async buscar(req, res) {
        try {
            const { q } = req.query;
            const resultados = await gradeService.realizarBuscaGlobal(q);
            return res.status(200).json(resultados);
        } catch (e) { 
            return res.status(500).json({ error: e.message }); 
        }
    }

    async postAnaliseExterna(req, res) {
        try {
            const dadosCsv = req.body;
            if (!Array.isArray(dadosCsv) || dadosCsv.length === 0) {
                return res.status(400).json({ error: 'Dados vazios' });
            }
            const resultado = await gradeService.analisarGradeExterna(dadosCsv);
            return res.status(200).json(resultado);
        } catch (error) {
            console.error('[Controller Error - AnaliseExterna]:', error);
            return res.status(500).json({ error: error.message });
        }
    }
    async importarPdf(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
            }

            // Envia o buffer do arquivo (bytes em memória) para o service
            const resultado = await gradeService.processarUploadPdf(req.file.buffer);
            return res.status(201).json(resultado);

        } catch (error) {
            console.error('[Controller Error - importarPdf]:', error);
            return res.status(500).json({ error: error.message || 'Erro interno ao processar PDF.' });
        }
    }

    async importarGrade(req, res) {
        try {
            const dadosCsv = req.body;
            if (!dadosCsv) {
                return res.status(400).json({ error: 'Nenhum dado enviado.' });
            }
            const resultado = await gradeService.processarUploadCsv(dadosCsv);
            return res.status(201).json(resultado);
        } catch (error) {
            console.error('[Controller Error - importarGrade]:', error);
            return res.status(500).json({ error: error.message });
        }
    }
}


module.exports = new GradeController();