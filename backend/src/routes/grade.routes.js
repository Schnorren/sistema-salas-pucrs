const { Router } = require('express');
const multer = require('multer');
const gradeController = require('../controllers/grade.controller');

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.get('/proximas', gradeController.getProximasAulas.bind(gradeController));

router.post('/importar', gradeController.importarGrade.bind(gradeController));

router.post('/importar-pdf', upload.single('arquivo'), gradeController.importarPdf.bind(gradeController));

router.get('/livres', gradeController.getSalasLivres.bind(gradeController));
router.get('/timeline', gradeController.getTimeline.bind(gradeController));
router.get('/ocupacao', gradeController.getOcupacao.bind(gradeController));
router.get('/planta', gradeController.getPlanta.bind(gradeController));
router.get('/busca', gradeController.buscar.bind(gradeController));
router.post('/analisar-externo', gradeController.postAnaliseExterna.bind(gradeController));
router.post('/analisar-externo-pdf', upload.single('arquivo'), gradeController.analisarPdfExterno.bind(gradeController));
module.exports = router;