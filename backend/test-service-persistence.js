const databaseSwitchService = require('./src/services/database-switch.service');
const Societe = require('./src/models/societe.model');

async function testServicePersistence() {
  try {
    console.log('🧪 Test de persistance du service...');
    
    // Récupérer une société
    const societes = await Societe.findAll();
    if (societes.length < 2) {
      console.log('❌ Pas assez de sociétés pour le test');
      return;
    }
    
    const societe1 = societes[0];
    const societe2 = societes[1];
    
    console.log(`\n🔄 Test 1: Connexion à ${societe1.nom}`);
    await databaseSwitchService.switchToSociete(societe1);
    console.log(`✅ Connexion actuelle: ${databaseSwitchService.getCurrentSocieteInfo()?.nom}`);
    
    console.log(`\n🔄 Test 2: Connexion à ${societe2.nom}`);
    await databaseSwitchService.switchToSociete(societe2);
    console.log(`✅ Connexion actuelle: ${databaseSwitchService.getCurrentSocieteInfo()?.nom}`);
    
    console.log(`\n🔄 Test 3: Reconnexion à ${societe1.nom}`);
    await databaseSwitchService.switchToSociete(societe1);
    console.log(`✅ Connexion actuelle: ${databaseSwitchService.getCurrentSocieteInfo()?.nom}`);
    
    console.log('\n✅ Test de persistance réussi !');
    
  } catch (error) {
    console.error('❌ Test échoué:', error.message);
  } finally {
    await databaseSwitchService.closeAllConnections();
    process.exit(0);
  }
}

testServicePersistence();









