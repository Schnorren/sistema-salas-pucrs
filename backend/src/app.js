const express = require('express');
const cors = require('cors');
const authGuard = require('./middlewares/authGuard'); 
const gradeRoutes = require('./routes/grade.routes');
const avisosRoutes = require('./routes/avisos.routes'); 
const emprestimosRoutes = require('./routes/emprestimos.routes');

const app = express();

app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api', authGuard); 
app.use('/api/grade', gradeRoutes);
app.use('/api/avisos', avisosRoutes);
app.use('/api/emprestimos', emprestimosRoutes);
app.use('/api/equipe', require('./routes/equipe.routes'));

app.get('/', (req, res) => {
  res.json({ message: 'API Multi-Tenant da PUCRS está online e segura!' });
});

module.exports = app;