const express = require('express');
const router = express.Router();
const emprestimosController = require('../controllers/emprestimos.controller');

// 📍 Importação que estava faltando:
const checkPerm = require('../middlewares/checkPermission');

// GET /api/emprestimos/categorias
router.get('/categorias', checkPerm('emprestimos'), emprestimosController.getCategorias);

// GET /api/emprestimos/categorias/:categoriaId/itens
router.get('/categorias/:categoriaId/itens', checkPerm('emprestimos'), emprestimosController.getItensDisponiveis);

// GET /api/emprestimos/ativos
router.get('/ativos', checkPerm('emprestimos'), emprestimosController.getAtivos);

// GET /api/emprestimos/historico
router.get('/historico', checkPerm('emprestimos'), emprestimosController.getHistorico);

// GET /api/emprestimos/aluno/:matricula
router.get('/aluno/:matricula', checkPerm('emprestimos'), emprestimosController.consultarAluno);

// POST /api/emprestimos/retirar
router.post('/retirar', checkPerm('emprestimos'), emprestimosController.retirar);

// POST /api/emprestimos/devolver/:id
router.post('/devolver/:id', checkPerm('emprestimos'), emprestimosController.devolver);

module.exports = router;