const express = require('express');
const router = express.Router();
const equipeController = require('../controllers/equipe.controller');
const checkPerm = require('../middlewares/checkPermission');

// AGORA EXIGE 'equipe'
router.get('/', checkPerm('equipe'), equipeController.listarEquipe);
router.get('/perfis', checkPerm('equipe'), equipeController.listarPerfis); 
router.post('/membro', checkPerm('equipe'), equipeController.atualizarMembro); 

module.exports = router;