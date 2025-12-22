const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const Societe = require('../models/societe.model');
const DocumentSociete = require('../models/document_societe.model');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

async function initDocuments() {
  try {
    console.log('🔄 Initialisation des documents de société...');

    // Configurer les relations
    const setupRelations = require('./setup-relations');
    setupRelations();

    // Vérifier si des sociétés existent
    const societes = await Societe.findAll();
    console.log(`✅ ${societes.length} société(s) trouvée(s)`);

    for (const societe of societes) {
      console.log(`\n📋 Société: ${societe.nom}`);
      
      // Vérifier si des documents existent déjà
      const existingDoc = await DocumentSociete.findOne({
        where: { societe_id: societe.id }
      });

      if (existingDoc) {
        console.log(`   ✅ Documents déjà configurés`);
        console.log(`   📄 En-tête: ${existingDoc.entete ? 'Oui' : 'Non'}`);
        console.log(`   📄 Pied de page: ${existingDoc.pied_page ? 'Oui' : 'Non'}`);
        console.log(`   🖼️  Logo: ${existingDoc.logo ? 'Oui' : 'Non'}`);
      } else {
        console.log(`   ⚠️  Aucun document configuré`);
        console.log(`   💡 Utilisez l'interface web pour configurer les documents`);
      }
    }

    console.log('\n🎉 Vérification terminée !');
    console.log('\n📝 Pour configurer les documents :');
    console.log('1. Démarrer l\'application (npm start)');
    console.log('2. Se connecter avec admin/admin123');
    console.log('3. Aller sur /document-settings');
    console.log('4. Configurer logo, en-tête et pied de page');

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await sequelize.close();
  }
}

initDocuments();

