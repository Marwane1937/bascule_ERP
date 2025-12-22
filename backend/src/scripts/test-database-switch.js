const axios = require('axios');

async function testDatabaseSwitch() {
  try {
    console.log('🧪 Test du système de changement de base de données...');

    const baseURL = 'http://localhost:3500/api';

    // 1. Se connecter d'abord
    console.log('\n1️⃣ Connexion...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      login: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.data.token;
    console.log('✅ Connexion réussie');

    // 2. Récupérer les sociétés
    console.log('\n2️⃣ Récupération des sociétés...');
    const societesResponse = await axios.get(`${baseURL}/societes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const societes = societesResponse.data.data;
    console.log(`✅ ${societes.length} sociétés trouvées:`);
    societes.forEach(societe => {
      console.log(`   - ${societe.nom} (${societe.nom_base})`);
    });

    // 3. Tester le changement de base de données
    if (societes.length > 1) {
      console.log('\n3️⃣ Test changement de base de données...');
      const targetSociete = societes[1]; // Prendre la deuxième société
      
      console.log(`📤 Changement vers: ${targetSociete.nom} (${targetSociete.nom_base})`);
      
      const switchResponse = await axios.post(`${baseURL}/societes/switch-database`, {
        societe_id: targetSociete.id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('✅ Changement réussi:', switchResponse.data.message);
      console.log('   - Société:', switchResponse.data.data.societe.nom);
      console.log('   - Base:', switchResponse.data.data.database);
    }

    // 4. Vérifier la base actuelle
    console.log('\n4️⃣ Vérification base actuelle...');
    const currentResponse = await axios.get(`${baseURL}/database-switch/current`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Base actuelle:', currentResponse.data.data.database);

  } catch (error) {
    if (error.response) {
      console.log('❌ Erreur HTTP:', error.response.status);
      console.log('   - Message:', error.response.data.message);
    } else {
      console.log('❌ Erreur:', error.message);
    }
  }
}

testDatabaseSwitch();

