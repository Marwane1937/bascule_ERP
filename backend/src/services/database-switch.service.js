const { Sequelize, QueryTypes } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

class DatabaseSwitchService {
  constructor() {
    this.currentConnection = null;
    this.currentSocieteId = null;
  }

  // Créer une nouvelle connexion à une base de données spécifique
  createConnection(databaseName) {
    // Mettre à jour la variable d'environnement pour la base courante
    process.env.DB_NAME = databaseName;
    //console.log(`🔄 Configuration mise à jour vers: ${databaseName}`);

    return new Sequelize(
      databaseName,
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
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      }
    );
  }

  // Tester la connexion à une base de données
  async testConnection(databaseName) {
    const connection = this.createConnection(databaseName);

    try {
      await connection.authenticate();
      //console.log(`✅ Connexion à la base ${databaseName} réussie`);
      await connection.close();
      return { success: true, message: `Connexion à ${databaseName} réussie` };
    } catch (error) {
      //console.error(`❌ Erreur connexion à ${databaseName}:`, error);
      return { success: false, message: `Erreur connexion à ${databaseName}: ${error.message}` };
    }
  }

  // Changer de base de données
  async switchDatabase(databaseName) {
    try {
      // Tester d'abord la connexion
      const testResult = await this.testConnection(databaseName);
      if (!testResult.success) {
        return testResult;
      }

      // Créer une nouvelle connexion à la base spécifiée
      this.currentConnection = this.createConnection(databaseName);

      // Tester la nouvelle connexion
      await this.currentConnection.authenticate();
      console.log(`✅ Connexion active vers: ${databaseName}`);

      // Synchroniser les modèles avec la nouvelle connexion
      const dynamicModelService = require('./dynamic-model.service');
      await dynamicModelService.syncAllModels();

      return {
        success: true,
        message: `Connexion à ${databaseName} réussie`,
        database: databaseName
      };
    } catch (error) {
      console.error('❌ Erreur lors du changement de base:', error);
      return {
        success: false,
        message: `Erreur lors du changement: ${error.message}`
      };
    }
  }

  // Obtenir la base de données actuelle
  getCurrentDatabase() {
    if (this.currentConnection) {
      return this.currentConnection.config.database;
    }
    return process.env.DB_NAME;
  }

  // Obtenir le statut de connexion
  getConnectionStatus() {
    return {
      connected: !!this.currentConnection,
      database: this.getCurrentDatabase(),
      timestamp: new Date().toISOString()
    };
  }

  // Obtenir l'ID de la société actuelle
  getCurrentSocieteId() {
    return this.currentSocieteId;
  }

  // Définir l'ID de la société actuelle
  setCurrentSocieteId(societeId) {
    this.currentSocieteId = societeId;
  }

  // Obtenir la connexion à utiliser
  getConnectionToUse() {
    return this.currentConnection || this.getDefaultConnection();
  }

  // Obtenir la connexion par défaut
  getDefaultConnection() {
    return require('../config/database');
  }

  // Obtenir les informations de la société actuelle
  getCurrentSocieteInfo() {
    return {
      id: this.currentSocieteId,
      database: this.getCurrentDatabase()
    };
  }

  // Changer vers une société spécifique
  async switchToSociete(societe) {
    try {
      const result = await this.switchDatabase(societe.nom_base);
      if (result.success) {
        this.setCurrentSocieteId(societe.id);
        return result;
      }
      return result;
    } catch (error) {
      console.error('❌ Erreur switchToSociete:', error);
      return { success: false, message: error.message };
    }
  }

  // Lister toutes les bases de données disponibles
  async listAvailableDatabases() {
    try {

      // Se connecter à la base master pour récupérer toutes les bases de l'instance
      const masterConnection = new Sequelize(
        'master',
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
          logging: false
        }
      );

      // console.log('[DatabaseSwitchService] 🔍 Connexion à master créée, test de connexion...');
      await masterConnection.authenticate();
      //console.log('[DatabaseSwitchService] ✅ Connexion à master réussie');

      // Récupérer toutes les bases de données de l'instance
      const result = await masterConnection.query(`
        SELECT name 
        FROM sys.databases 
        WHERE state_desc = 'ONLINE'
        ORDER BY name
      `, {
        type: QueryTypes.SELECT
      });

      await masterConnection.close();

      // Sequelize QueryTypes.SELECT peut retourner différemment selon la version
      // Normalement c'est un tableau, mais vérifions
      let databases = result;

      // Si c'est un tableau avec 2 éléments [results, metadata], prendre le premier
      if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
        databases = result[0];
      }
      // Si c'est directement un tableau de résultats
      else if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
        databases = result;
      }
      // Si c'est un objet unique (cas observé dans les logs)
      else if (!Array.isArray(result) && typeof result === 'object' && result.name) {
        databases = [result];
      }


      // Extraire les noms des bases de données
      let databaseNames = [];
      if (Array.isArray(databases)) {
        databaseNames = databases.map(db => {
          if (typeof db === 'object' && db.name) {
            return db.name;
          }
          return db;
        });
      } else if (databases && typeof databases === 'object' && databases.name) {
        // Si c'est un objet unique avec une propriété name
        databaseNames = [databases.name];
      }


      return {
        success: true,
        databases: databaseNames
      };
    } catch (error) {
      console.error('[DatabaseSwitchService] ❌ Erreur lors de la récupération des bases:', error);
      console.error('[DatabaseSwitchService] Message:', error.message);
      console.error('[DatabaseSwitchService] Stack:', error.stack);
      // En cas d'erreur, retourner une liste vide plutôt qu'échouer
      return {
        success: true,
        databases: []
      };
    }
  }
}

module.exports = new DatabaseSwitchService();
