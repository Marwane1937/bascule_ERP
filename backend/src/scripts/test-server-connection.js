const axios = require('axios');

async function testServerConnection() {
  try {
    console.log('🧪 Test de connexion au serveur...');
    
    // Test simple de connexion
    const response = await axios.get('http://localhost:3500/api/auth/test', {
      timeout: 5000
    });
    
    console.log('✅ Serveur accessible:', response.status);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Serveur non démarré ou port 3500 non accessible');
    } else if (error.code === 'ECONNABORTED') {
      console.log('❌ Timeout - serveur trop lent à répondre');
    } else {
      console.log('❌ Erreur:', error.message);
    }
  }
}

testServerConnection();

