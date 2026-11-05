import saudeRepository from '../repositories/saude.repository.js';

class SaudeService {
    // Keep-alive do banco. O plano gratuito do Supabase pausa o projeto depois
    // de 7 dias sem atividade — no recesso, ninguém abre o sistema e ele sairia
    // do ar até alguém reativar no painel do Supabase. O cron diário da Vercel
    // (vercel.json → /api/equipe) chama isto. Antes ele só respondia "ok" sem
    // tocar no banco, o que mantinha a função da Vercel aquecida mas não o Supabase.
    async manterBancoAtivo() {
        const inicio = Date.now();
        await saudeRepository.tocarBanco();
        return { banco: 'ok', ms: Date.now() - inicio };
    }
}

export default new SaudeService();
