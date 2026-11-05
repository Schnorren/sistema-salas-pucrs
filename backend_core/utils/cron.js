// Chamada dos Cron Jobs da Vercel ("crons" do vercel.json).
//
// Com CRON_SECRET definido nas variáveis da Vercel, ela manda
// "Authorization: Bearer <segredo>" — e aí só isso vale (é o jeito documentado).
// Sem o segredo, vale a identificação da própria Vercel: o user-agent
// "vercel-cron/1.0" ou o header x-vercel-cron (critério antigo deste projeto).
// Esses dois são forjáveis, mas o que o cron faz (um SELECT de uma linha, sem
// devolver dados) não expõe nada nem custa nada.
export const ehChamadaDoCron = (headers = {}, segredo = process.env.CRON_SECRET) => {
    if (segredo) return headers.authorization === `Bearer ${segredo}`;
    return headers['x-vercel-cron'] === '1'
        || String(headers['user-agent'] || '').startsWith('vercel-cron/');
};
