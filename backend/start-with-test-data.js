const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const sequelize = require('./src/config/database');
const Societe = require('./src/models/societe.model');
const DocumentSociete = require('./src/models/document_societe.model');
const User = require('./src/models/user.model');
const bcrypt = require('bcryptjs');

async function startWithTestData() {
  try {
    console.log('🚀 Démarrage du serveur avec données de test...');

    // Synchroniser les modèles
    await sequelize.sync({ force: true });
    console.log('✅ Base de données synchronisée');

    // Configurer les relations
    const setupRelations = require('./src/scripts/setup-relations');
    setupRelations();

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

    // Créer un utilisateur admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await User.create({
      name: 'Administrateur',
      email: 'admin@cactus.ma',
      username: 'admin',
      password_hash: hashedPassword,
      societe_id: societe.id,
      role: 'admin',
      actif: true
    });
    console.log('✅ Admin créé:', admin.username);

    // Créer un utilisateur normal
    const hashedPassword2 = await bcrypt.hash('user123', 10);
    const user = await User.create({
      name: 'Utilisateur Test',
      email: 'user@cactus.ma',
      username: 'user',
      password_hash: hashedPassword2,
      societe_id: societe.id,
      role: 'user',
      actif: true
    });
    console.log('✅ Utilisateur créé:', user.username);

    console.log('\n🎉 Données de test initialisées !');
    console.log('👤 Admin: username=admin, password=admin123');
    console.log('👤 User: username=user, password=user123');
    console.log('🏢 Société: Cactus Informatique');

    // Démarrer le serveur
    require('./src/server.js');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    process.exit(1);
  }
}

startWithTestData();

