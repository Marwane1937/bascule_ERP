const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');

async function checkUsersTable() {
  try {
    console.log('🔍 Vérification de la structure de la table users...');

    // Vérifier si la table existe
    const [results] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'users'
    `);
    
    if (results.length === 0) {
      console.log('❌ La table "users" n\'existe pas');
      return;
    }

    console.log('✅ La table "users" existe');

    // Obtenir la structure de la table
    const [columns] = await sequelize.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION
    `);

    console.log('\n📋 Structure de la table users:');
    console.log('================================');
    columns.forEach(col => {
      console.log(`${col.COLUMN_NAME}: ${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''} ${col.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });

    // Compter les utilisateurs
    const [countResult] = await sequelize.query('SELECT COUNT(*) as count FROM users');
    console.log(`\n📊 Nombre d'utilisateurs: ${countResult[0].count}`);

    // Afficher quelques utilisateurs (sans mot de passe)
    const [users] = await sequelize.query(`
      SELECT TOP 5 * FROM users
    `);
    
    if (users.length > 0) {
      console.log('\n👥 Exemples d\'utilisateurs:');
      console.log('============================');
      users.forEach(user => {
        const userInfo = { ...user };
        // Masquer le mot de passe
        if (userInfo.password_hash) userInfo.password_hash = '***';
        if (userInfo.password) userInfo.password = '***';
        console.log(userInfo);
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await sequelize.close();
  }
}

checkUsersTable();


