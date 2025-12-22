const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const Societe = require('../models/societe.model');
const DocumentSociete = require('../models/document_societe.model');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

async function initTestData() {
  try {
    console.log('🔄 Initialisation des données de test...');

    // Synchroniser les modèles avec la base de données
    await sequelize.sync({ force: true });
    console.log('✅ Modèles synchronisés');

    // Créer une société de test
    const societe = await Societe.create({
      nom: 'Cactus Informatique',
      nom_base: 'cactus_informatique',
      actif: true
    });
    console.log('✅ Société créée:', societe.nom);

    // Créer des documents pour la société
    const documentSociete = await DocumentSociete.create({
      societe_id: societe.id,
      entete: `
        <div>
          <h2>CACTUS INFORMATIQUE</h2>
          <p>LOTISSEMENT HLIWA RUE 8 N°69</p>
          <p>AIN SEBAA 20250 CASABLANCA</p>
          <p>TEL : 05 22 34 35 45 | FAX : 05 22 67 38 09</p>
        </div>
      `,
      pied_page: 'RC Casablanca 147263 - IF 1680876 - Patente 37964603 - CNSS 7155915 - ICE 000210663000082'
    });
    console.log('✅ Documents société créés');

    // Créer un utilisateur de test
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await User.create({
      name: 'Admin Test',
      email: 'admin@cactus.ma',
      username: 'admin',
      password_hash: hashedPassword,
      societe_id: societe.id,
      role: 'admin',
      actif: true
    });
    console.log('✅ Utilisateur créé:', user.username);

    // Créer un utilisateur normal
    const hashedPassword2 = await bcrypt.hash('user123', 10);
    const user2 = await User.create({
      name: 'User Test',
      email: 'user@cactus.ma',
      username: 'user',
      password_hash: hashedPassword2,
      societe_id: societe.id,
      role: 'user',
      actif: true
    });
    console.log('✅ Utilisateur créé:', user2.username);

    console.log('\n🎉 Données de test initialisées avec succès !');
    console.log('\n📋 Comptes de test :');
    console.log('👤 Admin: username=admin, password=password123');
    console.log('👤 User: username=user, password=user123');
    console.log('\n🏢 Société: Cactus Informatique');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
  } finally {
    await sequelize.close();
  }
}

// Exécuter le script
initTestData();
