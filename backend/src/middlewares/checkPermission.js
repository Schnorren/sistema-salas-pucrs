const checkPermission = (moduloRequisitado) => {
    return (req, res, next) => {
        const user = req.user;

        // Se a requisição chegou aqui sem usuário, o authGuard falhou em algum momento
        if (!user) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        // Regra de Ouro: Super Admins (99) e Coordenadores Globais (60+) têm passe livre para tudo
        if (user.nivel >= 60) {
            return next();
        }

        // Verifica se a string do módulo exigido existe dentro do array de permissões do usuário
        if (user.permissoes && user.permissoes.includes(moduloRequisitado)) {
            return next();
        }

        // Se chegou aqui, é porque não tem nível alto nem a permissão específica
        console.log(`🚫 [CheckPermission] Bloqueado: Usuário tentou acessar o módulo '${moduloRequisitado}' sem autorização.`);
        return res.status(403).json({ 
            error: `Acesso restrito. Você não possui permissão para utilizar o módulo: ${moduloRequisitado}` 
        });
    };
};

module.exports = checkPermission;