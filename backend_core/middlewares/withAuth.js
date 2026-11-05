import supabase from '../config/supabase.js';
import { responderErro } from '../utils/http.js';

const tokenCache = new Map();
const activeAuthRequests = new Map();
const TEMPO_DE_CACHE = 1000 * 60 * 5;
const MAX_TOKENS_EM_CACHE = 2000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Falha de autenticação com status e mensagem seguros para o cliente.
class ErroDeAuth extends Error {
    constructor(status, mensagem) {
        super(mensagem);
        this.status = status;
    }
}

// Remove entradas expiradas a cada 10min para evitar crescimento ilimitado da Map.
// unref: o timer não segura o processo vivo (serverless/testes).
setInterval(() => {
    const agora = Date.now();
    for (const [key, value] of tokenCache.entries()) {
        if (agora > value.exp) tokenCache.delete(key);
    }
}, 1000 * 60 * 10).unref?.();

// `exp` (ms) do JWT, só para limitar o cache: o token já foi validado pelo
// Auth antes de entrar aqui. Token sem exp legível → cache normal.
function expiracaoDoJwt(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        return Number.isFinite(payload?.exp) ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

// Permissões mudaram (Gestão de Equipe / Painel Admin): a próxima requisição
// do usuário relê o acesso. Vale para esta instância; as outras expiram o
// cache em até 5 min.
export function invalidarAcessoEmCache(userId) {
    if (!userId) return;
    for (const [key, value] of tokenCache.entries()) {
        if (value.data?.user?.id === userId) tokenCache.delete(key);
    }
}

async function validarEBuscarAcesso(token) {
    const cached = tokenCache.get(token);
    if (cached && cached.exp > Date.now()) return cached.data;

    if (activeAuthRequests.has(token)) {
        return await activeAuthRequests.get(token);
    }

    const promise = (async () => {
        const { data, error: authError } = await supabase.auth.getUser(token);
        const user = data?.user;
        if (authError || !user) {
            // Auth fora do ar / rede ≠ sessão inválida: não mandar o front relogar à toa
            const indisponivel = !authError?.status || authError.status >= 500 || authError.name === 'AuthRetryableFetchError';
            if (authError && indisponivel) {
                console.error('[auth] falha ao validar token:', authError.message);
                throw new ErroDeAuth(503, 'Não foi possível validar o seu acesso agora. Tente de novo em instantes.');
            }
            throw new ErroDeAuth(401, 'Sessão expirada ou inválida. Entre de novo no sistema.');
        }

        const { data: acesso, error: dbError } = await supabase
            .from('usuarios_acessos')
            .select('perfil_id, predio_id, permissoes')
            .eq('user_id', user.id)
            .single();

        // PGRST116 = nenhuma linha (conta sem acesso) — não é erro
        if (dbError && dbError.code !== 'PGRST116') {
            console.error('[auth] falha ao carregar acessos:', dbError.message);
            throw new ErroDeAuth(503, 'Não foi possível carregar as suas permissões agora. Tente de novo em instantes.');
        }

        const result = { user, acesso };

        // Nunca além do vencimento do próprio JWT
        const expJwt = expiracaoDoJwt(token);
        const exp = Math.min(Date.now() + TEMPO_DE_CACHE, expJwt ?? Infinity);
        if (exp > Date.now()) {
            if (tokenCache.size >= MAX_TOKENS_EM_CACHE) tokenCache.delete(tokenCache.keys().next().value);
            tokenCache.set(token, { data: result, exp });
        }

        return result;
    })();

    activeAuthRequests.set(token, promise);

    try {
        return await promise;
    } finally {
        activeAuthRequests.delete(token);
    }
}

// Prédio escolhido pelo admin no front (header x-predio-id). Header repetido
// chega como array; valor que não é uuid seria erro 22P02 (500) em toda query.
function lerPredioDoAdmin(req) {
    const bruto = req.headers['x-predio-id'] ?? req.query?.predio_id;
    const valor = Array.isArray(bruto) ? bruto[0] : bruto;
    if (valor == null || valor === '') return { predio: null };
    const texto = String(valor).trim();
    return UUID_REGEX.test(texto) ? { predio: texto } : { invalido: true };
}

export const withAuth = (handler, moduloRequisitado = null) => {
    return async (req, res) => {
        let user;
        let acesso;
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

            const [esquema, token] = String(authHeader).trim().split(/\s+/);
            if (!/^bearer$/i.test(esquema || '') || !token || token === 'undefined' || token === 'null') {
                return res.status(401).json({ error: 'Token inválido' });
            }

            ({ user, acesso } = await validarEBuscarAcesso(token));
        } catch (err) {
            if (err instanceof ErroDeAuth) return res.status(err.status).json({ error: err.message });
            console.error('[auth] erro inesperado:', err?.message || err);
            return res.status(503).json({ error: 'Não foi possível validar o seu acesso agora. Tente de novo em instantes.' });
        }

        let predioAtivo = acesso?.predio_id || null;
        const permissoesUser = Array.isArray(acesso?.permissoes) ? acesso.permissoes : [];

        // "Global" (pode operar em qualquer prédio) exige a permissão 'admin'.
        // Prédio nulo SEM admin = usuário órfão (sem prédio, sem acesso), nunca global.
        const isAdmin = permissoesUser.includes('admin');

        // Só o admin escolhe o prédio pelo header; usuário comum fica preso ao
        // seu predio_id resolvido no servidor (fonte única de verdade) — o
        // header dele é ignorado.
        if (isAdmin) {
            const escolha = lerPredioDoAdmin(req);
            if (escolha.invalido) return res.status(400).json({ error: 'Prédio inválido.' });
            if (escolha.predio) predioAtivo = escolha.predio;
        }

        if (moduloRequisitado && !isAdmin && !permissoesUser.includes(moduloRequisitado)) {
            return res.status(403).json({ error: `Acesso restrito ao módulo: ${moduloRequisitado}` });
        }

        req.user = {
            id: user.id,
            email: user.email,
            predio_id: predioAtivo,
            permissoes: permissoesUser,
            is_admin: isAdmin
        };

        // Erro que escapou do handler: 500 genérico + log (antes virava 401 com
        // a mensagem crua do banco — o front lia como sessão inválida).
        try {
            return await handler(req, res);
        } catch (err) {
            if (res.headersSent) {
                console.error('[API] erro depois da resposta:', err?.message || err);
                return;
            }
            return responderErro(res, err);
        }
    };
};
