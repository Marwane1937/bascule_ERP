const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

// Fonction pour créer/recréer la connexion par défaut
const createDefaultConnection = () => {
  // Recharger le .env pour avoir les dernières valeurs
  delete require.cache[require.resolve('dotenv')];
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
  
  return new Sequelize(
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
};

// Créer la connexion par défaut
let defaultConnection = createDefaultConnection();

// Fonction pour obtenir la connexion dynamique
const getConnection = () => {
  try {
    // Vérifier si on a une connexion active depuis le service de changement de base
    const databaseSwitchService = require('../services/database-switch.service');
    const activeConnection = databaseSwitchService.getConnectionToUse();
    
    if (activeConnection && activeConnection !== defaultConnection) {
      return activeConnection;
    }
  } catch (error) {
    // ignorer: on retombe sur la connexion par défaut
  }
  
  // Sinon, recréer la connexion par défaut avec les valeurs actuelles du .env
  defaultConnection = createDefaultConnection();
  return defaultConnection;
};

// Fonction pour recréer la connexion par défaut (appelée après mise à jour du .env)
const refreshDefaultConnection = () => {
  try {
    if (defaultConnection) {
      defaultConnection.close();
    }
  } catch (error) {
    // Ignorer les erreurs de fermeture
  }
  defaultConnection = createDefaultConnection();
  return defaultConnection;
};

// Exporter la connexion par défaut pour les modèles
module.exports = defaultConnection;

// Exporter aussi les fonctions pour les services
module.exports.getConnection = getConnection;
module.exports.createDefaultConnection = createDefaultConnection;
module.exports.refreshDefaultConnection = refreshDefaultConnection;
