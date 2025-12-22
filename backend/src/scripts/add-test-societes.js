const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const Societe = require('../models/societe.model');
const DocumentSociete = require('../models/document_societe.model');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

async function addTestSocietes() {
  try {
    console.log('🔄 Ajout des sociétés de test...');

    // Sociétés de test
    const societes = [
      {
        nom: 'Alpha Solutions',
        nom_base: 'alpha_solutions',
        actif: true
      },
      {
        nom: 'Beta Technologies',
        nom_base: 'beta_technologies',
        actif: true
      },
      {
        nom: 'Gamma Services',
        nom_base: 'gamma_services',
        actif: true
      }
    ];

    for (const societeData of societes) {
      // Créer la société
      const societe = await Societe.create(societeData);
      console.log(`✅ Société créée: ${societe.nom}`);

      // Créer les documents pour la société
      const documentSociete = await DocumentSociete.create({
        societe_id: societe.id,
        entete: `
          <div>
            <h2>${societe.nom.toUpperCase()}</h2>
            <p>Adresse de ${societe.nom}</p>
            <p>Ville, Code Postal</p>
            <p>TEL : 05 XX XX XX XX | EMAIL : contact@${societe.nom_base}.com</p>
          </div>
        `,
        pied_page: `RC ${societe.nom} - IF XXXXXX - Patente XXXXXX`
      });
      console.log(`✅ Documents créés pour ${societe.nom}`);

      // Créer un utilisateur pour chaque société
      const hashedPassword = await bcrypt.hash('user123', 10);
      const user = await User.create({
        name: `Utilisateur ${societe.nom}`,
        email: `user@${societe.nom_base}.com`,
        username: `${societe.nom_base}_user`,
        password_hash: hashedPassword,
        societe_id: societe.id,
        role: 'user',
        actif: true
      });
      console.log(`✅ Utilisateur créé: ${user.username}`);
    }

    console.log('\n🎉 Sociétés de test ajoutées avec succès !');
    console.log('👤 Comptes créés:');
    console.log('  - alpha_solutions_user / user123');
    console.log('  - beta_technologies_user / user123');
    console.log('  - gamma_services_user / user123');

  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout des sociétés:', error);
  } finally {
    await sequelize.close();
  }
}

addTestSocietes();