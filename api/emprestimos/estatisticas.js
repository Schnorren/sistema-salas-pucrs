import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const temPermissao = req.user?.permissoes?.includes('emprestimos')
        || req.user?.permissoes?.includes('relatorios')
        || req.user?.permissoes?.includes('admin');
    if (!temPermissao) {
        return res.status(403).json({ error: 'Acesso negado. Requer o módulo de Empréstimos ou Relatórios.' });
    }

    const predioId = req.headers['x-predio-id'];
    if (!predioId) return res.status(400).json({ error: 'Prédio não informado' });

    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'Parâmetros inicio e fim são obrigatórios.' });

    // Converte para timestamptz com fuso de Brasília caso venha sem tz
    const toTimestamptz = (str) => {
        if (!str) return null;
        if (str.length === 16 && !str.includes('Z')) return `${str}:00-03:00`;
        return str;
    };

    try {
        const { data, error } = await supabase.rpc('estatisticas_emprestimos', {
            p_predio_id: predioId,
            p_inicio:    toTimestamptz(inicio),
            p_fim:       toTimestamptz(fim)
        });

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

export default withAuth(handler);
