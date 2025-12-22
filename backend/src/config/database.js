const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

// Créer la connexion par défaut
const defaultConnection = new Sequelize(
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
    logging: false,
  }
);

// Fonction pour obtenir la connexion dynamique
const getConnection = () => {
  try {
    // Vérifier si on a une connexion active depuis le service de changement de base
    const databaseSwitchService = require('../services/database-switch.service');
    const activeConnection = databaseSwitchService.getConnectionToUse();
    
    if (activeConnection) {
      console.log(`🔄 Utilisation de la connexion active: ${databaseSwitchService.getCurrentDatabase()}`);
      return activeConnection;
    }
  } catch (error) {
    console.log('🔄 Service de changement de base non disponible, utilisation de la connexion par défaut');
  }
  
  // Sinon, utiliser la connexion par défaut
  console.log(`🔄 Utilisation de la connexion par défaut: ${process.env.DB_NAME}`);
  return defaultConnection;
};

// Exporter la connexion par défaut pour les modèles
module.exports = defaultConnection;

// Exporter aussi la fonction pour les services
module.exports.getConnection = getConnection;
