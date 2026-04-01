const express = require('express');
const cors = require('cors');
const gradeRoutes = require('./routes/grade.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/grade', gradeRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'API da Secretaria do Prédio 15 está online!' });
});

module.exports = app;
