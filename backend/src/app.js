const express = require('express');
const cors = require('cors');
const gradeRoutes = require('./routes/grade.routes');

const app = express();

// Middlewares globais
app.use(cors());
app.use(express.json());

// Registro de Rotas
app.use('/api/grade', gradeRoutes);

// Rota de fallback para sabermos que a API está viva
app.get('/', (req, res) => {
  res.json({ message: 'API da Secretaria do Prédio 15 está online!' });
});

module.exports = app;
