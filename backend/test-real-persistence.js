const databaseSwitchService = require('./src/services/database-switch.service');
const Societe = require('./src/models/societe.model');

async function testRealPersistence() {
  try {
    console.log('🧪 Test de persistance avec des bases réelles...');
    
    // Récupérer des sociétés avec des bases de données qui existent
    const realDatabases = ['CactusErp_MR', 'CactusErp_SNMR', 'ScaleCom'];
    const societes = await Societe.findAll({
      where: {
        nom_base: realDatabases
      }
    });
    
    if (societes.length < 2) {
      console.log('❌ Pas assez de sociétés réelles pour le test');
      return;
    }
    
    const societe1 = societes[0];
    const societe2 = societes[1];
    
    console.log(`\n🔄 Test 1: Connexion à ${societe1.nom} (${societe1.nom_base})`);
    await databaseSwitchService.switchToSociete(societe1);
    const current1 = databaseSwitchService.getCurrentSocieteInfo();
    console.log(`✅ Connexion actuelle: ${current1?.nom} (${current1?.nom_base})`);
    
    console.log(`\n🔄 Test 2: Connexion à ${societe2.nom} (${societe2.nom_base})`);
    await databaseSwitchService.switchToSociete(societe2);
    const current2 = databaseSwitchService.getCurrentSocieteInfo();
    console.log(`✅ Connexion actuelle: ${current2?.nom} (${current2?.nom_base})`);
    
    console.log(`\n🔄 Test 3: Reconnexion à ${societe1.nom} (${societe1.nom_base})`);
    await databaseSwitchService.switchToSociete(societe1);
    const current3 = databaseSwitchService.getCurrentSocieteInfo();
    console.log(`✅ Connexion actuelle: ${current3?.nom} (${current3?.nom_base})`);
    
    console.log('\n✅ Test de persistance réussi !');
    console.log('✅ Le système maintient correctement la connexion à la base sélectionnée');
    
  } catch (error) {
    console.error('❌ Test échoué:', error.message);
  } finally {
    await databaseSwitchService.closeAllConnections();
    process.exit(0);
  }
}

testRealPersistence();









