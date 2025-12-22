const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');
const UnifiedUser = require('../models/unified-user.model');
const bcrypt = require('bcryptjs');

async function initUnifiedUsers() {
  try {
    console.log('🔄 Initialisation des utilisateurs unifiés...');

    // Synchroniser le modèle
    await sequelize.sync({ force: true });
    console.log('✅ Table unified_users créée');

    // Créer un utilisateur admin avec accès à toutes les bases
    const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
    const admin = await UnifiedUser.create({
      name: 'Administrateur Système',
      email: 'admin@system.com',
      username: 'admin',
      password_hash: hashedPasswordAdmin,
      role: 'admin',
      actif: true,
      allowed_databases: JSON.stringify([
        'CactusErp_SNMR',
        'CactusErp_SNMR_Test01'
      ])
    });
    console.log('✅ Admin créé:', admin.username);

    // Créer un utilisateur normal avec accès limité
    const hashedPasswordUser = await bcrypt.hash('user123', 10);
    const user = await UnifiedUser.create({
      name: 'Utilisateur Standard',
      email: 'user@system.com',
      username: 'user',
      password_hash: hashedPasswordUser,
      role: 'user',
      actif: true,
      allowed_databases: JSON.stringify([
        'CactusErp_SNMR'
      ])
    });
    console.log('✅ Utilisateur créé:', user.username);

    // Créer un utilisateur manager
    const hashedPasswordManager = await bcrypt.hash('manager123', 10);
    const manager = await UnifiedUser.create({
      name: 'Manager Multi-Société',
      email: 'manager@system.com',
      username: 'manager',
      password_hash: hashedPasswordManager,
      role: 'manager',
      actif: true,
      allowed_databases: JSON.stringify([
        'CactusErp_SNMR',
        'CactusErp_SNMR_Test01'
      ])
    });
    console.log('✅ Manager créé:', manager.username);

    console.log('\n🎉 Utilisateurs unifiés initialisés avec succès !');
    console.log('\n👤 Comptes créés:');
    console.log('  - admin / admin123 (Accès à toutes les bases)');
    console.log('  - user / user123 (Accès limité)');
    console.log('  - manager / manager123 (Accès partiel)');
    
    console.log('\n🏢 Bases de données disponibles:');
    console.log('  - CactusErp_SNMR');
    console.log('  - CactusErp_SNMR_Test01');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
  } finally {
    await sequelize.close();
  }
}

initUnifiedUsers();
