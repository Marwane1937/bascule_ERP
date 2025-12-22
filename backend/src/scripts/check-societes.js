const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const Societe = require('../models/societe.model');

async function checkSocietes() {
  try {
    console.log('🔍 Vérification des sociétés...');

    // Récupérer toutes les sociétés
    const societes = await Societe.findAll({
      attributes: ['id', 'nom', 'nom_base', 'actif']
    });

    console.log(`📊 ${societes.length} sociétés trouvées:`);
    
    if (societes.length === 0) {
      console.log('❌ Aucune société trouvée. Création de sociétés de test...');
      
      // Créer des sociétés de test
      const testSocietes = [
        {
          nom: 'Société Test 1',
          nom_base: 'CactusErp_SNMR',
          actif: 1
        },
        {
          nom: 'Société Test 2', 
          nom_base: 'CactusErp_TEST',
          actif: 1
        }
      ];

      for (const societeData of testSocietes) {
        const societe = await Societe.create(societeData);
        console.log(`✅ Société créée: ${societe.nom} (${societe.nom_base})`);
      }
    } else {
      societes.forEach(societe => {
        console.log(`   - ${societe.nom} (${societe.nom_base}) - ${societe.actif ? 'Actif' : 'Inactif'}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await sequelize.close();
  }
}

checkSocietes();

