const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const Societe = require('../models/societe.model');

async function testSocieteRetrieval() {
  try {
    console.log('🧪 Test de récupération des sociétés...');

    // Test de connexion
    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie');

    // Test de récupération des sociétés
    const societes = await Societe.findAll({
      attributes: ['id', 'nom', 'nom_base', 'actif'],
      where: { actif: 1 },
      order: [['nom', 'ASC']]
    });

    console.log(`✅ ${societes.length} sociétés trouvées:`);
    societes.forEach(societe => {
      console.log(`   - ${societe.nom} (${societe.nom_base})`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await sequelize.close();
  }
}

testSocieteRetrieval();

