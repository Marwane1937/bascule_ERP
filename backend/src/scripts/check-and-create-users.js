const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

async function checkAndCreateUsers() {
  try {
    console.log('🔄 Vérification de la table users...');

    // Vérifier si la table existe et a des données
    const users = await User.findAll();
    console.log(`✅ Table users trouvée avec ${users.length} utilisateurs`);

    if (users.length === 0) {
      console.log('📝 Aucun utilisateur trouvé, création d\'utilisateurs de test...');
      
      // Créer un utilisateur admin
      const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
      const admin = await User.create({
        name: 'Administrateur',
        email: 'admin@system.com',
        username: 'admin',
        password_hash: hashedPasswordAdmin,
        societe_id: 1, // Utiliser la première société
        role: 'admin',
        actif: true
      });
      console.log('✅ Admin créé:', admin.username);

      // Créer un utilisateur normal
      const hashedPasswordUser = await bcrypt.hash('user123', 10);
      const user = await User.create({
        name: 'Utilisateur Test',
        email: 'user@system.com',
        username: 'user',
        password_hash: hashedPasswordUser,
        societe_id: 1,
        role: 'user',
        actif: true
      });
      console.log('✅ Utilisateur créé:', user.username);

      console.log('\n🎉 Utilisateurs créés avec succès !');
      console.log('👤 Comptes créés:');
      console.log('  - admin / admin123');
      console.log('  - user / user123');
    } else {
      console.log('👤 Utilisateurs existants:');
      users.forEach(user => {
        console.log(`  - ${user.username} (${user.name}) - ${user.role}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await sequelize.close();
  }
}

checkAndCreateUsers();


