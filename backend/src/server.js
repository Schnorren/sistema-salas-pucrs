require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 [Backend] Servidor rodando ativamente na porta ${PORT}`);
});

server.on('error', (error) => {
  console.error('❌ Erro fatal ao ligar o servidor:', error.message);
  process.exit(1);
});