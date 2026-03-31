const { Router } = require('express');
const multer = require('multer'); // <-- FALTAVA ESSA LINHA!
const gradeController = require('../controllers/grade.controller');

const router = Router();

// Configuração do multer para manter o arquivo na memória (RAM)
const upload = multer({ storage: multer.memoryStorage() });

// Endpoint para buscar a grade processada para a tela de "Próximas Aulas"
router.get('/proximas', gradeController.getProximasAulas.bind(gradeController));

// Endpoint genérico para importar CSV (se ainda for usar)
router.post('/importar', gradeController.importarGrade.bind(gradeController));

// NOVA ROTA: Upload direto de PDF
router.post('/importar-pdf', upload.single('arquivo'), gradeController.importarPdf.bind(gradeController));

router.get('/livres', gradeController.getSalasLivres.bind(gradeController));
router.get('/timeline', gradeController.getTimeline.bind(gradeController));
router.get('/ocupacao', gradeController.getOcupacao.bind(gradeController));
router.get('/planta', gradeController.getPlanta.bind(gradeController));
router.get('/busca', gradeController.buscar.bind(gradeController));
router.post('/analisar-externo', gradeController.postAnaliseExterna.bind(gradeController));

module.exports = router;