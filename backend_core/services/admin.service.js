import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';
import { sanitizarPermissoes, MODULOS } from '../utils/modulos.js';
import { validarSenha } from '../utils/senha.js';
import emprestimosRepository from '../repositories/emprestimos.repository.js';
import gestaoEmprestimos from './emprestimosGestao.service.js';
import {
    normalizarEmail, RE_EMAIL, emailPermitido, urlDoApp, traduzirErroDeConvite, ehContaExistente,
} from '../utils/convite.js';

// Loga o detalhe real do banco no servidor e devolve um Error com mensagem limpa
// (evita vazar nomes de colunas/constraints para o cliente).
function falha(contexto, error) {
    console.error(`[admin] ${contexto}:`, error?.message || error);
    return new Error(contexto);
}

// Erro do Auth ao criar a conta → mensagem segura. E-mail que já tem conta
// não é sobrescrito: o admin acha a pessoa na lista e usa "Editar Acesso".
function erroAoCriarConta(error, { convite }) {
    if (error?.code === 'weak_password') {
        return new ErroPublico('O Supabase recusou a senha por ser fraca. Use uma senha mais longa, com letras e números.');
    }
    if (ehContaExistente(error)) {
        return new ErroPublico('Já existe uma conta com este e-mail. Procure a pessoa na lista e use "Editar Acesso".', 409);
    }
    const traduzido = convite ? traduzirErroDeConvite(error) : null;
    if (traduzido?.status === 429) {
        return new ErroPublico('Limite de e-mails do provedor atingido. Tente de novo mais tarde, ou crie a conta com "Definir a senha agora" (sem e-mail).', 429);
    }
    return traduzido || falha('Erro ao criar a conta (Auth)', error);
}

// Só os pontos que existem (o resto seria erro de FK → 500), sem repetidos
async function pontosDaRedeValidos(pontosRede) {
    const existentes = new Set((await emprestimosRepository.getTodosOsPontos()).map(p => p.id));
    return [...new Set((Array.isArray(pontosRede) ? pontosRede : []).map(String))].filter(p => existentes.has(p));
}

class AdminService {
    async listarPredios() {
        const { data, error } = await supabase
            .from('predios')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw falha('Erro ao buscar prédios', error);
        return data;
    }

    async criarPredio(nome) {
        const { data, error } = await supabase
            .from('predios')
            .insert([{ nome }])
            .select()
            .single();

        // 23505 = UNIQUE (nome): antes virava 500 genérico
        if (error?.code === '23505') throw new ErroPublico('Já existe um prédio com esse nome.', 409);
        if (error) throw falha('Erro ao criar prédio', error);
        return data;
    }

    async listarPerfis() {
        const { data, error } = await supabase
            .from('perfis')
            .select('id, nome')
            .order('nome', { ascending: true });

        if (error) throw falha('Erro ao buscar perfis', error);
        return data;
    }

    async criarPerfil(nome) {
        const { data, error } = await supabase
            .from('perfis')
            .insert([{ nome }])
            .select()
            .single();

        // 23505 = UNIQUE (nome): antes virava 500 genérico
        if (error?.code === '23505') throw new ErroPublico('Já existe um cargo com esse nome.', 409);
        if (error) throw falha('Erro ao criar perfil', error);
        return data;
    }

    async deletarPredio(id) {
        // Integridade referencial: não apagar prédio que ainda tem dados. Avisos,
        // pontos/acervo e bloqueios têm FK ON DELETE CASCADE (sumiriam em
        // silêncio); registros de empréstimo são RESTRICT (o delete falhava
        // com 500). Trocas de sala não têm FK (predio_id é texto).
        const contar = (tabela) =>
            supabase.from(tabela).select('predio_id', { count: 'exact', head: true }).eq('predio_id', id);
        const tabelas = [
            ['usuarios_acessos', 'membro(s)'],
            ['salas', 'sala(s)'],
            ['avisos', 'aviso(s)'],
            ['emprestimo_pontos', 'ponto(s) de empréstimo'],
            ['emprestimos_registro', 'registro(s) de empréstimo'],
            ['trocas_sala', 'troca(s) de sala'],
        ];
        const resultados = await Promise.all(tabelas.map(([t]) => contar(t)));
        const erro = resultados.find(r => r.error)?.error;
        if (erro) throw falha('Erro ao verificar referências do prédio', erro);

        const vinculados = resultados
            .map((r, i) => ((r.count || 0) > 0 ? `${r.count} ${tabelas[i][1]}` : null))
            .filter(Boolean);
        if (vinculados.length) {
            throw new ErroPublico(`Não é possível excluir: o prédio ainda tem ${vinculados.join(', ')}. Remova-os antes.`);
        }

        const { error } = await supabase.from('predios').delete().eq('id', id);
        if (error) throw falha('Erro ao deletar prédio', error);

        // JSON público da grade do prédio (best effort — não existir não é erro)
        const { error: errStorage } = await supabase.storage.from('grades').remove([`grade_predio_${id}.json`]);
        if (errStorage) console.error('[admin] prédio excluído, mas o JSON da grade ficou no Storage:', errStorage.message);
    }

    async deletarPerfil(id) {
        const { count, error: eCount } = await supabase
            .from('usuarios_acessos')
            .select('user_id', { count: 'exact', head: true })
            .eq('perfil_id', id);
        if (eCount) throw falha('Erro ao verificar referências do cargo', eCount);

        if ((count || 0) > 0) {
            throw new ErroPublico(`Não é possível excluir: ${count} usuário(s) usam este cargo.`);
        }

        const { error } = await supabase.from('perfis').delete().eq('id', id);
        if (error) throw falha('Erro ao deletar perfil', error);
    }

    // Registro de auditoria (tabela auditoria_log, gravada por registrarAuditoria).
    // Só leitura, para o Painel Admin; os mais recentes primeiro.
    async listarAuditoria(limite = 500) {
        const { data, error } = await supabase
            .from('auditoria_log')
            .select('id, user_email, acao, entidade, entidade_id, predio_id, detalhes, criado_em')
            .order('criado_em', { ascending: false })
            .limit(Math.min(Math.max(Number(limite) || 500, 1), 1000));
        if (error) throw falha('Não foi possível carregar a auditoria', error);
        return data || [];
    }

    // Pontos de empréstimo de todos os prédios, para escolher os do relatório
    // da rede (formulário do usuário no Painel Admin)
    async listarPontosEmprestimo() {
        const pontos = await emprestimosRepository.getTodosOsPontos();
        return pontos
            .map(p => ({ id: p.id, nome: p.nome, ativo: p.ativo, predioId: p.predio_id, predioNome: p.predio?.nome || '' }))
            .sort((a, b) => a.predioNome.localeCompare(b.predioNome, 'pt-BR', { numeric: true }) || a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    async listarModulos() {
        const { data, error } = await supabase
            .from('sistema_modulos')
            .select('id, nome, descricao')
            .order('nome', { ascending: true });

        if (error) throw falha('Erro ao buscar módulos', error);
        return data;
    }

    async listarUsuarios() {
        // Supabase Auth trunca em 1000 sem paginação — busca todas as páginas
        let allUsers = [];
        let page = 1;
        const perPage = 1000;

        while (true) {
            const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
                page,
                perPage
            });
            if (authError) throw falha('Erro ao listar usuários (Auth)', authError);
            allUsers = allUsers.concat(authData.users || []);
            if ((authData.users || []).length < perPage) break;
            page++;
        }

        const { data: accessData, error: accessError } = await supabase
            .from('usuarios_acessos')
            .select(`user_id, predio_id, perfil_id, permissoes, predios (nome), perfis (nome)`);

        if (accessError) throw falha('Erro ao listar acessos', accessError);

        // Pontos do relatório da rede de cada login
        const pontosRede = new Map();
        for (const v of await emprestimosRepository.getVinculosDaRede()) {
            pontosRede.set(v.user_id, [...(pontosRede.get(v.user_id) || []), v.ponto_id]);
        }

        return allUsers.map(authUser => {
            const acesso = accessData.find(a => a.user_id === authUser.id) || {};
            const permissoes = acesso.permissoes || [];
            const semPredio = permissoes.includes(MODULOS.RELATORIO_EMPRESTIMOS_REDE) && !permissoes.includes(MODULOS.ADMIN)
                ? 'Sem prédio (relatório da rede)'
                : 'Acesso Global / Sem Prédio';
            return {
                id: authUser.id,
                email: authUser.email,
                nome: authUser.user_metadata?.nome || '',
                predioId: acesso.predio_id || null,
                predioNome: acesso.predios?.nome || semPredio,
                perfilId: acesso.perfil_id || null,
                perfilNome: acesso.perfis?.nome || 'Sem Cargo',
                permissoes,
                pontosRede: pontosRede.get(authUser.id) || [],
            };
        });
    }


    // `pontosRede`: pontos do relatório da rede (só vale com o módulo; sem ele,
    // a lista é apagada). Ausente = não mexe na lista. Devolve a lista gravada
    // (ou null se não mexeu) para a auditoria.
    async atualizarUsuarioCompleto(id, { nome, predioId, perfilId, senha, permissoes, pontosRede }, editor = null) {
        const permissoesFinais = sanitizarPermissoes(permissoes, { permitirAdmin: true });

        // Espelha a tela (o Painel não deixa editar o próprio acesso): o admin
        // não tira de si mesmo a permissão 'admin' — com um admin só, o sistema
        // ficaria sem ninguém para devolver.
        if (editor?.id && editor.id === id && !permissoesFinais.includes('admin')) {
            throw new ErroPublico('Você não pode remover a sua própria permissão de administrador.');
        }

        const authPayload = { user_metadata: { nome } };

        if (typeof senha === 'string' && senha !== '') {
            const problema = validarSenha(senha);
            if (problema) throw new ErroPublico(problema);
            authPayload.password = senha;
        }

        const { error: authError } = await supabase.auth.admin.updateUserById(id, authPayload);
        if (authError) throw falha('Erro ao atualizar usuário (Auth)', authError);

        const { error: accessError } = await supabase
            .from('usuarios_acessos')
            .upsert({
                user_id: id,
                predio_id: predioId || null,
                perfil_id: perfilId || null,
                // Admin pode conceder qualquer módulo, inclusive 'admin' — mas valores
                // desconhecidos são descartados (não grava uuid/garbage).
                permissoes: permissoesFinais
            }, { onConflict: 'user_id' });

        if (accessError) throw falha('Erro ao atualizar acessos', accessError);

        let pontosRedeFinais = null;
        try {
            if (!permissoesFinais.includes(MODULOS.RELATORIO_EMPRESTIMOS_REDE)) {
                pontosRedeFinais = [];
            } else if (Array.isArray(pontosRede)) {
                pontosRedeFinais = await pontosDaRedeValidos(pontosRede);
            }
            if (pontosRedeFinais) await emprestimosRepository.definirPontosDaRede(id, pontosRedeFinais);
        } catch (error) {
            console.error('[admin] pontos do relatório da rede:', error?.message || error);
            throw new ErroPublico('As permissões foram salvas, mas os pontos do relatório da rede não. Tente salvar de novo.', 500);
        }

        return { success: true, pontosRede: pontosRedeFinais };
    }

    // Conta nova pelo Painel Admin, já com prédio, cargo, módulos e pontos.
    //   modo 'convite' (padrão): e-mail com link; a pessoa define a senha
    //     (mesmo fluxo da Gestão de Equipe, sujeito ao limite de e-mails).
    //   modo 'senha': o admin define a senha e passa para a pessoa; nenhum
    //     e-mail sai (e-mail já confirmado).
    // Conta sem prédio só com Administração ou Relatório da Rede — senão
    // nasceria órfã (sem acesso a nada).
    async criarUsuario({ email, nome, predioId, perfilId, permissoes, pontosRede, pontosBalcao, modo, senha }) {
        const emailFinal = normalizarEmail(email);
        if (!RE_EMAIL.test(emailFinal)) throw new ErroPublico('E-mail inválido.');
        if (!emailPermitido(emailFinal)) throw new ErroPublico('Domínio de e-mail não permitido para convite.');

        const permissoesFinais = sanitizarPermissoes(permissoes, { permitirAdmin: true });
        const valeSemPredio = permissoesFinais.includes(MODULOS.ADMIN) || permissoesFinais.includes(MODULOS.RELATORIO_EMPRESTIMOS_REDE);
        if (!predioId && !valeSemPredio) {
            throw new ErroPublico('Escolha o prédio da pessoa (ou marque Administração ou o Relatório da Rede): sem prédio a conta não acessa nada.');
        }
        if (!permissoesFinais.length) throw new ErroPublico('Marque pelo menos um módulo.');

        const comSenha = modo === 'senha';
        if (comSenha) {
            const problema = validarSenha(senha);
            if (problema) throw new ErroPublico(problema);
        }
        const nomeFinal = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 120);
        const metadados = nomeFinal ? { nome: nomeFinal } : {};

        let usuario;
        if (comSenha) {
            const { data, error } = await supabase.auth.admin.createUser({
                email: emailFinal, password: senha, email_confirm: true, user_metadata: metadados,
            });
            if (error) throw erroAoCriarConta(error, { convite: false });
            usuario = data?.user;
        } else {
            const destino = urlDoApp();
            const { data, error } = await supabase.auth.admin.inviteUserByEmail(emailFinal, {
                data: metadados, ...(destino ? { redirectTo: destino } : {}),
            });
            if (error) throw erroAoCriarConta(error, { convite: true });
            usuario = data?.user;
        }
        if (!usuario?.id) throw falha('Erro ao criar a conta (Auth)', 'resposta sem usuário');

        const { error: accessError } = await supabase.from('usuarios_acessos').insert({
            user_id: usuario.id,
            predio_id: predioId || null,
            perfil_id: perfilId || null,
            permissoes: permissoesFinais,
        });
        if (accessError) {
            // Conta sem acesso gravado é inútil e travaria um novo cadastro do mesmo e-mail
            await supabase.auth.admin.deleteUser(usuario.id).catch(() => {});
            throw falha('Erro ao gravar os acessos da conta nova', accessError);
        }

        let pontosRedeFinais = [];
        let pontosBalcaoFinais = [];
        try {
            if (permissoesFinais.includes(MODULOS.RELATORIO_EMPRESTIMOS_REDE) && Array.isArray(pontosRede) && pontosRede.length) {
                pontosRedeFinais = await pontosDaRedeValidos(pontosRede);
                await emprestimosRepository.definirPontosDaRede(usuario.id, pontosRedeFinais);
            }
            // Balcão: só pontos do prédio da pessoa, e só com o módulo Empréstimos
            if (predioId && Array.isArray(pontosBalcao) && pontosBalcao.length) {
                pontosBalcaoFinais = await gestaoEmprestimos.definirPontosDoUsuario({
                    userId: usuario.id, predioId, pontoIds: pontosBalcao, permissoes: permissoesFinais,
                });
            }
        } catch (error) {
            console.error('[admin] conta criada, pontos não:', error?.message || error);
            throw new ErroPublico('A conta foi criada, mas os pontos de empréstimo não foram salvos. Abra "Editar Acesso" e marque de novo.', 500);
        }

        return {
            id: usuario.id,
            email: emailFinal,
            permissoes: permissoesFinais,
            pontosRede: pontosRedeFinais,
            pontosBalcao: pontosBalcaoFinais,
            modo: comSenha ? 'senha' : 'convite',
            message: comSenha
                ? `Conta criada para ${emailFinal}. Passe o e-mail e a senha para a pessoa entrar.`
                : `Convite enviado para ${emailFinal}. A pessoa define a senha pelo link do e-mail (vale olhar o spam).`,
        };
    }
}

export default new AdminService();
