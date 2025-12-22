const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const sequelize = require('../config/database');

async function createAdminUser() {
  try {
    console.log('🔐 Création de l\'utilisateur admin...');
    
    // Vérifier si l'utilisateur admin existe déjà
    const existingAdmin = await sequelize.query(
      `SELECT * FROM users WHERE LOWER(LTRIM(RTRIM(login))) = LOWER(LTRIM(RTRIM(:login)))`,
      {
        replacements: { login: 'admin' },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (Array.isArray(existingAdmin) && existingAdmin.length > 0) {
      console.log('✅ L\'utilisateur admin existe déjà');
      const admin = existingAdmin[0];
      console.log('📋 Détails:', {
        id: admin.id,
        nom: admin.nom,
        login: admin.login,
        etat: admin.etat
      });
      return;
    } else if (existingAdmin && !Array.isArray(existingAdmin) && existingAdmin.login) {
      console.log('✅ L\'utilisateur admin existe déjà');
      console.log('📋 Détails:', {
        id: existingAdmin.id,
        nom: existingAdmin.nom,
        login: existingAdmin.login,
        etat: existingAdmin.etat
      });
      return;
    }

    // Hashage du mot de passe
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Récupérer le prochain ID disponible
    const maxIdResult = await sequelize.query(
      'SELECT MAX(id) as maxId FROM users',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    let newId = 1;
    if (Array.isArray(maxIdResult) && maxIdResult.length > 0) {
      const firstRow = maxIdResult[0];
      if (firstRow && firstRow.maxId) {
        newId = parseInt(firstRow.maxId) + 1;
      }
    } else if (maxIdResult && maxIdResult.maxId) {
      newId = parseInt(maxIdResult.maxId) + 1;
    }

    // Créer l'utilisateur admin
    await sequelize.query(
      `INSERT INTO users (id, nom, login, pass, group_id, contact_id, type, etat, expire, expire_dat)
       VALUES (:id, :nom, :login, :pass, :group_id, :contact_id, :type, :etat, :expire, :expire_dat)`,
      {
        replacements: {
          id: newId,
          nom: 'Administrateur',
          login: 'admin',
          pass: hashedPassword,
          group_id: 1,
          contact_id: null,
          type: 1,
          etat: 1,
          expire: 0,
          expire_dat: null
        },
        type: sequelize.QueryTypes.INSERT
      }
    );

    console.log('✅ Utilisateur admin créé avec succès!');
    console.log('📋 Détails:');
    console.log('   - Login: admin');
    console.log('   - Mot de passe: admin123');
    console.log('   - ID:', newId);
    console.log('   - Type: Administrateur (1)');
    
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'utilisateur admin:', error);
    throw error;
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  createAdminUser()
    .then(() => {
      console.log('✅ Script terminé avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur:', error);
      process.exit(1);
    });
}

module.exports = createAdminUser;

