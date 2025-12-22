/* const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3500;
const logFile = path.join(__dirname, 'chatlog.json');

// S'assurer que le fichier existe
if (!fs.existsSync(logFile)) {
  fs.writeFileSync(logFile, '[]', 'utf8');
}

// Fonction pour charger les messages valides (moins de 48h)
function loadRecentMessages() {
  const raw = fs.readFileSync(logFile, 'utf8');
  const allMessages = JSON.parse(raw);

  const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48h en ms
  return allMessages.filter(msg => new Date(msg.timestamp).getTime() > cutoff);
}

// Serveur HTTP basique (pour tests éventuels)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Serveur WebSocket actif");
});

// Serveur WebSocket
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔌 Nouveau client connecté');

  ws.on('close', (code, reason) => {
    console.log(`❌ WebSocket fermé (code: ${code}, raison: ${reason.toString()})`);
  });

  ws.on('error', (err) => {
    console.error('❌ Erreur WebSocket côté serveur:', err);
  });
  // Envoyer l'historique des messages récents
  const recentMessages = loadRecentMessages();
  ws.send(JSON.stringify({ type: 'init', messages: recentMessages }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Ajouter timestamp au message côté serveur si pas fourni
      if (!msg.timestamp) {
        msg.timestamp = new Date().toISOString();
      }

      // Charger messages existants, filtrer >48h, ajouter nouveau message
      const messages = loadRecentMessages();
      messages.push(msg);

      // Écrire dans fichier
      fs.writeFileSync(logFile, JSON.stringify(messages, null, 2), 'utf8');

      // Diffuser le message à tous les clients connectés
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'message', message: msg }));
        }
      });

      console.log('📨 Message reçu et diffusé :', msg);
    } catch (err) {
      console.error('Erreur réception message:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Serveur WebSocket en écoute sur ws://localhost:${PORT}`);
});
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

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
