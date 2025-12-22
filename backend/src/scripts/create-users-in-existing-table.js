const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

async function createUsersInExistingTable() {
  try {
    console.log('🔄 Création d\'utilisateurs dans la table users existante...');

    // Vérifier d'abord si des utilisateurs existent
    const [existingUsers] = await sequelize.query('SELECT COUNT(*) as count FROM users');
    console.log(`📊 Utilisateurs existants: ${existingUsers[0].count}`);

    if (existingUsers[0].count === 0) {
      console.log('📝 Création d\'utilisateurs de test...');
      
      // Créer un utilisateur admin
      const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
      await sequelize.query(`
        INSERT INTO users (id, nom, login, pass, group_id, contact_id, type, etat, expire, expire_dat)
        VALUES (1, 'Administrateur', 'admin', :password, 1, 1, 1, 1, 0, NULL)
      `, {
        replacements: { password: hashedPasswordAdmin }
      });
      console.log('✅ Admin créé: admin');

      // Créer un utilisateur normal
      const hashedPasswordUser = await bcrypt.hash('user123', 10);
      await sequelize.query(`
        INSERT INTO users (id, nom, login, pass, group_id, contact_id, type, etat, expire, expire_dat)
        VALUES (2, 'Utilisateur Test', 'user', :password, 2, 2, 2, 1, 0, NULL)
      `, {
        replacements: { password: hashedPasswordUser }
      });
      console.log('✅ Utilisateur créé: user');

      console.log('\n🎉 Utilisateurs créés avec succès !');
      console.log('👤 Comptes créés:');
      console.log('  - admin / admin123');
      console.log('  - user / user123');
    } else {
      console.log('👤 Utilisateurs déjà existants dans la table');
      
      // Lister les utilisateurs existants
      const [users] = await sequelize.query('SELECT nom, login, type FROM users');
      console.log('Utilisateurs trouvés:');
      users.forEach(user => {
        console.log(`  - ${user.login} (${user.nom}) - ${user.type}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
  } finally {
    await sequelize.close();
  }
}

createUsersInExistingTable();
