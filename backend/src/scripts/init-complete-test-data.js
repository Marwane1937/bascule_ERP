const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const Societe = require('../models/societe.model');
const DocumentSociete = require('../models/document_societe.model');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

async function initCompleteTestData() {
  try {
    console.log('🔄 Initialisation complète des données de test...');

    // Synchroniser les modèles avec la base de données
    await sequelize.sync({ force: true });
    console.log('✅ Tables créées avec succès');

    // Configurer les relations
    const setupRelations = require('./setup-relations');
    setupRelations();

    // Sociétés de test
    const societes = [
      {
        nom: 'Cactus Informatique',
        nom_base: 'cactus_informatique',
        actif: true
      },
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

      // Créer des utilisateurs pour chaque société
      const hashedPassword = await bcrypt.hash('user123', 10);
      const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
      
      // Utilisateur admin pour Cactus Informatique
      if (societe.nom === 'Cactus Informatique') {
        const admin = await User.create({
          name: 'Administrateur',
          email: 'admin@cactus.ma',
          username: 'admin',
          password_hash: hashedPasswordAdmin,
          societe_id: societe.id,
          role: 'admin',
          actif: true
        });
        console.log(`✅ Admin créé: ${admin.username}`);
      }

      // Utilisateur normal pour chaque société
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

    console.log('\n🎉 Données de test initialisées avec succès !');
    console.log('\n👤 Comptes créés:');
    console.log('  - admin / admin123 (Cactus Informatique - Admin)');
    console.log('  - cactus_informatique_user / user123 (Cactus Informatique)');
    console.log('  - alpha_solutions_user / user123 (Alpha Solutions)');
    console.log('  - beta_technologies_user / user123 (Beta Technologies)');
    console.log('  - gamma_services_user / user123 (Gamma Services)');
    
    console.log('\n🏢 Sociétés créées:');
    societes.forEach(societe => {
      console.log(`  - ${societe.nom} (Base: ${societe.nom_base})`);
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
  } finally {
    await sequelize.close();
  }
}

initCompleteTestData();


