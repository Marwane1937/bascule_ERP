const WebSocket = require('ws');

let clients = [];

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('🔌 Nouveau client WebSocket connecté');
    clients.push(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('📨 Message reçu :', data);

        // Diffuser à tous les clients sauf l'envoyeur
        clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (err) {
        console.error('❌ Erreur de parsing ou d’enregistrement :', err);
      }
    });

    ws.on('close', () => {
      console.log('📴 Client WebSocket déconnecté');
      clients = clients.filter((client) => client !== ws);
    });
  });

  console.log('📡 Serveur WebSocket initialisé');
}

module.exports = { setupWebSocketServer };
