const databaseSwitchService = require('./src/services/database-switch.service');
const clientModel = require('./src/models/base/client.model');
const devisModel = require('./src/models/ventes/devis.model');

async function testDatabaseSwitch() {
  console.log('🧪 Test du changement de base de données...\n');

  try {
    // 1. Tester la connexion par défaut
    console.log('1️⃣ Test de la connexion par défaut...');
    const defaultDb = databaseSwitchService.getCurrentDatabase();
    console.log(`Base par défaut: ${defaultDb}`);

    // 2. Récupérer quelques clients de la base par défaut
    console.log('\n2️⃣ Récupération des clients de la base par défaut...');
    const clientsDefault = await clientModel.getAllClients();
    console.log(`Nombre de clients trouvés: ${clientsDefault.length}`);
    if (clientsDefault.length > 0) {
      console.log(`Premier client: ${clientsDefault[0].nom || 'N/A'}`);
    }

    // 3. Changer vers une autre base
    console.log('\n3️⃣ Changement vers CactusErp_SNMR_Test01...');
    const switchResult = await databaseSwitchService.switchDatabase('CactusErp_SNMR_Test01');
    
    if (switchResult.success) {
      console.log(`✅ Changement réussi: ${switchResult.message}`);
      
      // 4. Vérifier la nouvelle base
      const newDb = databaseSwitchService.getCurrentDatabase();
      console.log(`Nouvelle base: ${newDb}`);

      // 5. Récupérer les clients de la nouvelle base
      console.log('\n4️⃣ Récupération des clients de la nouvelle base...');
      const clientsNew = await clientModel.getAllClients();
      console.log(`Nombre de clients trouvés: ${clientsNew.length}`);
      if (clientsNew.length > 0) {
        console.log(`Premier client: ${clientsNew[0].nom || 'N/A'}`);
      }

      // 6. Comparer les résultats
      console.log('\n5️⃣ Comparaison des résultats...');
      if (clientsDefault.length !== clientsNew.length) {
        console.log('✅ Les données sont différentes entre les bases - le changement fonctionne !');
      } else {
        console.log('⚠️ Les données semblent identiques - vérifiez la configuration');
      }

      // 7. Tester les devis aussi
      console.log('\n6️⃣ Test des devis...');
      const devisNew = await devisModel.getAllDevis();
      console.log(`Nombre de devis trouvés: ${devisNew.length}`);

    } else {
      console.log(`❌ Échec du changement: ${switchResult.message}`);
    }

  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  }

  console.log('\n🏁 Test terminé');
}

// Exécuter le test
testDatabaseSwitch();


