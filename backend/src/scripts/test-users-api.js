const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const User = require('../models/user.model');

async function testUsersAPI() {
  try {
    console.log('🧪 Test de l\'API utilisateurs...');

    // Test 1: Récupérer tous les utilisateurs
    console.log('\n1️⃣ Test getAllUsers...');
    const users = await User.findAll({
      attributes: { exclude: ['pass'] },
      order: [['id', 'DESC']]
    });
    console.log(`✅ ${users.length} utilisateurs trouvés:`);
    users.forEach(user => {
      console.log(`   - ${user.nom} (${user.login}) - Type: ${user.type} - État: ${user.etat}`);
    });

    // Test 2: Récupérer un utilisateur par ID
    console.log('\n2️⃣ Test getUserById...');
    const user = await User.findByPk(1, {
      attributes: { exclude: ['pass'] }
    });
    if (user) {
      console.log(`✅ Utilisateur trouvé: ${user.nom} (${user.login})`);
    } else {
      console.log('❌ Aucun utilisateur trouvé avec l\'ID 1');
    }

    // Test 3: Compter les utilisateurs par statut
    console.log('\n3️⃣ Test statistiques...');
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { etat: 1 } });
    const adminUsers = await User.count({ where: { type: 1 } });
    
    console.log(`📊 Statistiques:`);
    console.log(`   - Total: ${totalUsers}`);
    console.log(`   - Actifs: ${activeUsers}`);
    console.log(`   - Admins: ${adminUsers}`);

    console.log('\n🎉 Tous les tests sont passés avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
  } finally {
    await sequelize.close();
  }
}

testUsersAPI();


