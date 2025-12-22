const databaseSwitchService = require('./src/services/database-switch.service');
const Societe = require('./src/models/societe.model');

async function testRealDatabase() {
  try {
    console.log('🧪 Test avec des bases de données réelles...');
    
    // Récupérer toutes les sociétés
    const societes = await Societe.findAll();
    console.log(`📊 ${societes.length} sociétés trouvées`);
    
    // Tester avec des bases de données qui existent vraiment
    const realDatabases = ['CactusErp_MR', 'CactusErp_SNMR', 'ScaleCom'];
    
    for (const dbName of realDatabases) {
      const societe = societes.find(s => s.nom_base === dbName);
      if (societe) {
        console.log(`\n🔄 Test de changement vers: ${societe.nom} (${societe.nom_base})`);
        
        try {
          await databaseSwitchService.switchToSociete(societe);
          console.log('✅ Changement de base de données réussi !');
          
          // Vérifier que la connexion fonctionne
          const connection = databaseSwitchService.getCurrentConnection();
          if (connection) {
            await connection.authenticate();
            console.log('✅ Connexion active vérifiée');
          }
          
        } catch (error) {
          console.log(`❌ Erreur avec ${societe.nom}: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test échoué:', error.message);
  } finally {
    await databaseSwitchService.closeAllConnections();
    process.exit(0);
  }
}

testRealDatabase();









