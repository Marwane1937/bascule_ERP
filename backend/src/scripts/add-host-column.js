const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: false,
        trustServerCertificate: true,
        instanceName: process.env.DB_INSTANCE,
      }
    },
    logging: console.log,
  }
);

async function addHostColumn() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à SQL Server réussie');

    // Vérifier si la colonne existe déjà
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'societes' AND COLUMN_NAME = 'host'
    `);
    
    if (results.length === 0) {
      // Ajouter la colonne host à la table societes
      await sequelize.query(`
        ALTER TABLE societes 
        ADD host VARCHAR(255) NULL
      `);
      
      console.log('✅ Colonne host ajoutée à la table societes');

      // Mettre à jour les sociétés existantes avec le nom de base par défaut
      await sequelize.query(`
        UPDATE societes 
        SET host = nom_base 
        WHERE host IS NULL
      `);
      
      console.log('✅ Valeurs par défaut mises à jour pour les sociétés existantes');
    } else {
      console.log('✅ La colonne host existe déjà');
    }

  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout de la colonne host:', error);
  } finally {
    await sequelize.close();
  }
}

addHostColumn();




