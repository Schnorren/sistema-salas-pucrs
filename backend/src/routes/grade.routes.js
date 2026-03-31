const { Router } = require('express');
const gradeController = require('../controllers/grade.controller');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });


// Endpoint para buscar a grade processada para a tela de "Próximas Aulas"
router.get('/proximas', gradeController.getProximasAulas.bind(gradeController));

// Endpoint para importar o CSV processado pelo frontend
router.post('/importar', gradeController.importarGrade.bind(gradeController));

router.get('/livres', gradeController.getSalasLivres.bind(gradeController));

router.get('/timeline', gradeController.getTimeline.bind(gradeController));

router.get('/ocupacao', gradeController.getOcupacao.bind(gradeController));

router.get('/planta', gradeController.getPlanta.bind(gradeController));
router.get('/busca', gradeController.buscar.bind(gradeController));
router.post('/analisar-externo', gradeController.postAnaliseExterna.bind(gradeController));

router.post('/importar-pdf', upload.single('arquivo'), gradeController.importarPdf.bind(gradeController));
module.exports = router;