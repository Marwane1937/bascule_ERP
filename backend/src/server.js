// Configuration dotenv
require('dotenv').config();

const sequelize = require('./config/database');
const app = require('./app');
const http = require('http');
const { setupWebSocketServer } = require('./websocket'); // ← Tu dois avoir ce fichier séparé
const PORT = process.env.PORT || 3500;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à SQL Server réussie');
   
    const server = http.createServer(app);

    // Initialiser WebSocket
    setupWebSocketServer(server); // ← fonction que tu exportes de websocket.js

    server.listen(PORT, () => {
      console.log(`🚀 Serveur en écoute sur http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Erreur de connexion à la BDD :', error);
  }
})();
