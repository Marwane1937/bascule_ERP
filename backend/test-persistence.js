const axios = require('axios');

async function testPersistence() {
  try {
    console.log('🧪 Test de persistance de la connexion...');
    
    // Simuler une requête avec un ID de société
    const headers = {
      'Authorization': 'Bearer test-token',
      'x-societe-id': '2' // ID d'une société
    };
    
    console.log('📡 Envoi de requête avec header x-societe-id: 2');
    
    const response = await axios.get('http://localhost:3500/api/societes', { headers });
    
    console.log('✅ Réponse reçue:');
    console.log(`  - Nombre de sociétés: ${response.data.data.length}`);
    console.log(`  - Base de données actuelle: ${response.data.currentDatabase}`);
    
    // Tester une deuxième requête pour voir si la connexion persiste
    console.log('\n📡 Deuxième requête pour tester la persistance...');
    const response2 = await axios.get('http://localhost:3500/api/societes', { headers });
    
    console.log('✅ Deuxième réponse:');
    console.log(`  - Base de données actuelle: ${response2.data.currentDatabase}`);
    
    if (response.data.currentDatabase === response2.data.currentDatabase) {
      console.log('✅ La connexion persiste correctement !');
    } else {
      console.log('❌ La connexion ne persiste pas');
    }
    
  } catch (error) {
    console.error('❌ Test échoué:', error.response?.data || error.message);
  }
}

// Attendre que le serveur soit démarré
setTimeout(() => {
  testPersistence();
}, 3000);









