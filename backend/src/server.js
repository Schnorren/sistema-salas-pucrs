require('dotenv').config();
const app = require('./app');

// Define a porta com fallback para 3000
const PORT = process.env.PORT || 3000;

// O servidor INICIA a escuta aqui. Isso prende o Event Loop do Node.js
const server = app.listen(PORT, () => {
  console.log(`🚀 [Backend] Servidor rodando ativamente na porta ${PORT}`);
});

// Tratamento de erros de inicialização (ex: porta em uso)
server.on('error', (error) => {
  console.error('❌ Erro fatal ao ligar o servidor:', error.message);
  process.exit(1); // Desliga com código de erro
});