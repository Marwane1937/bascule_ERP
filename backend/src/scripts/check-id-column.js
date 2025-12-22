const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('../config/database');

async function checkIdColumn() {
  try {
    console.log('🔍 Vérification de la colonne ID...');

    // Vérifier si la colonne id est IDENTITY
    const [results] = await sequelize.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH,
        IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'id'
    `);

    console.log('\n📋 Détails de la colonne ID:');
    console.log('================================');
    results.forEach(col => {
      console.log(`${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'} ${col.IS_IDENTITY ? 'IDENTITY' : 'NOT IDENTITY'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });

    // Vérifier les contraintes
    const [constraints] = await sequelize.query(`
      SELECT 
        CONSTRAINT_NAME,
        CONSTRAINT_TYPE
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_NAME = 'users'
    `);

    console.log('\n🔒 Contraintes de la table:');
    console.log('============================');
    constraints.forEach(constraint => {
      console.log(`${constraint.CONSTRAINT_NAME}: ${constraint.CONSTRAINT_TYPE}`);
    });

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await sequelize.close();
  }
}

checkIdColumn();

