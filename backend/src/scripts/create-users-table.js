const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const User = require('../models/user.model');
const Societe = require('../models/societe.model');
const bcrypt = require('bcryptjs');

async function createUsersTable() {
  try {
    console.log('🔄 Création de la table users...');

    // Synchroniser uniquement le modèle User (sans forcer la suppression)
    await User.sync({ alter: true });
    console.log('✅ Table users créée/mise à jour avec succès');

    // Vérifier s'il y a déjà des utilisateurs
    const existingUsers = await User.count();
    console.log(`📊 Nombre d'utilisateurs existants: ${existingUsers}`);

    if (existingUsers === 0) {
      console.log('🔄 Création d\'utilisateurs par défaut...');
      
      // Récupérer la première société ou en créer une
      let societe = await Societe.findOne();
      if (!societe) {
        societe = await Societe.create({
          nom: 'Cactus Informatique',
          nom_base: 'cactus_informatique',
          actif: true
        });
        console.log('✅ Société par défaut créée');
      }

      // Créer un utilisateur admin
      const hashedPassword = await bcrypt.hash('admin123', 12);
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
      const hashedPassword2 = await bcrypt.hash('user123', 12);
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

      console.log('\n🎉 Utilisateurs par défaut créés !');
      console.log('👤 Admin: username=admin, password=admin123');
      console.log('👤 User: username=user, password=user123');
    } else {
      console.log('✅ Des utilisateurs existent déjà, aucun utilisateur par défaut créé');
    }

  } catch (error) {
    console.error('❌ Erreur lors de la création de la table users:', error);
  } finally {
    await sequelize.close();
  }
}

createUsersTable();


