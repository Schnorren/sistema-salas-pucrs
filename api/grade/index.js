import service from '../../backend_core/services/grade.service.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const endpoint = urlParts.length > 2 ? urlParts[2] : null;

    const predioId = req.headers['x-predio-id'] || req.user?.predio_id;

    if (req.method === 'GET' && endpoint === 'busca') {
        try {
            const { q } = req.query;
            const resultados = await service.realizarBuscaGlobal(q, predioId);
            return res.status(200).json(resultados);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method === 'GET' && endpoint === 'livres') {
        try {
            const { dia } = req.query;
            if (!dia) return res.status(400).json({ error: 'Parâmetro "dia" é obrigatório.' });

            const dados = await service.obterSalasLivres(dia, predioId);
            return res.status(200).json(dados);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && endpoint === 'ocupacao') {
        try {
            const dados = await service.obterOcupacaoSemanal(predioId);
            return res.status(200).json(dados);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && endpoint === 'planta') {
        try {
            const { dia, periodo } = req.query;

            const diaObrigatorio = dia || new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
                .format(new Date())
                .split('-')[0]
                .replace(/^\w/, (c) => c.toUpperCase());

            const dados = await service.obterStatusPlanta(diaObrigatorio, periodo || 'auto', predioId);
            return res.status(200).json(dados);
        } catch (error) {
            console.error('❌ [Endpoint Error - Planta]:', error.message);
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && endpoint === 'proximas') {
        try {
            const { dia, periodo } = req.query;
            if (!dia) return res.status(400).json({ error: 'Parâmetro "dia" é obrigatório.' });

            const dados = await service.obterProximasAulas(dia, periodo || 'auto', predioId);
            return res.status(200).json(dados);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && endpoint === 'timeline') {
        try {
            const { dia } = req.query;
            if (!dia) return res.status(400).json({ error: 'Parâmetro "dia" é obrigatório.' });

            const dados = await service.obterTimeline(dia, predioId);
            return res.status(200).json(dados);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Grade.' });
}

export default withAuth(handler);