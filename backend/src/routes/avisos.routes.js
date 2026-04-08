const { Router } = require('express');
const avisosController = require('../controllers/avisos.controller');

const router = Router();

router.get('/', avisosController.getMural.bind(avisosController));
router.get('/historico', avisosController.getHistorico.bind(avisosController));
router.post('/', avisosController.criar.bind(avisosController));
router.patch('/:id/concluir', avisosController.concluir.bind(avisosController));
router.patch('/:id/comentar', avisosController.comentar.bind(avisosController));

module.exports = router;