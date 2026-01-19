const { Sequelize, QueryTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

class DatabaseSwitchService {
  constructor() {
    this.currentConnection = null;
    this.currentSocieteId = null;
    // Garder une copie des credentials initiaux (base "mère") pour lire la table db,
    // même après avoir remplacé DB_USER/DB_PASSWORD/DB_NAME dans process.env.
    this.configDb = {
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      instance: process.env.DB_INSTANCE,
    };
  }

  // Créer une connexion temporaire vers la base "config" (base mère) pour lire la table db
  createConfigConnection() {
    return new Sequelize(
      this.configDb.name,
      this.configDb.user,
      this.configDb.password,
      {
        host: this.configDb.host,
        dialect: 'mssql',
        dialectOptions: {
          options: {
            encrypt: false,
            trustServerCertificate: true,
            instanceName: this.configDb.instance,
          }
        },
        logging: false,
        pool: {
          max: 2,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      }
    );
  }

  // Créer une nouvelle connexion à une base de données spécifique
  createConnection(databaseName) {
    // Mettre à jour la variable d'environnement pour la base courante
    process.env.DB_NAME = databaseName;
    console.log(`[DatabaseSwitchService] 🔄 Configuration mise à jour vers: ${databaseName}`);

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
    // Toujours retourner la connexion courante si elle existe et est valide
    if (this.currentConnection) {
      return this.currentConnection;
    }

    // IMPORTANT: ne pas "refresh" la connexion par défaut ici (ça peut fermer une connexion utilisée ailleurs).
    // On retourne simplement la connexion par défaut.
    const defaultConn = this.getDefaultConnection();
    return defaultConn;
  }

  // Obtenir la connexion par défaut (recréée avec les valeurs actuelles du .env)
  getDefaultConnection() {
    // IMPORTANT: ne pas recréer/fermer automatiquement ici.
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

  // Lister toutes les bases de données disponibles depuis la table db
  async listDatabasesFromTable() {
    let configConnection = null;
    try {
      // Toujours lire la table db depuis la base "mère" avec une connexion temporaire
      // pour éviter "ConnectionManager.getConnection was called after ... closed".
      configConnection = this.createConfigConnection();
      await configConnection.authenticate();

      console.log(`[DatabaseSwitchService] 🔍 Lecture table db depuis base config: ${configConnection.config?.database || 'default'}`);

      const result = await configConnection.query(`
        SELECT id, name, dbuser, dbpass, dbname, dbtype 
        FROM db
        ORDER BY name
      `, {
        type: QueryTypes.SELECT
      });

      // Normaliser le résultat (peut être un tableau ou un objet)
      let databases = result;
      if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
        databases = result[0];
      } else if (!Array.isArray(result) && typeof result === 'object' && result.id) {
        databases = [result];
      }

      return {
        success: true,
        databases: databases
      };
    } catch (error) {
      console.error('[DatabaseSwitchService] ❌ Erreur récupération table db:', error);
      return {
        success: false,
        message: error.message,
        databases: []
      };
    } finally {
      if (configConnection) {
        try { await configConnection.close(); } catch { }
      }
    }
  }

  // Méthode pour mettre à jour le fichier .env
  updateEnvFile(dbConfig) {
    try {
      // Le fichier .env est dans backend/src/.env
      const envPath = path.join(__dirname, '../.env');
      
      // Vérifier si le fichier existe
      if (!fs.existsSync(envPath)) {
        // Essayer aussi le chemin alternatif backend/.env
        const altEnvPath = path.join(__dirname, '../../.env');
        if (fs.existsSync(altEnvPath)) {
          return this.updateEnvFileContent(altEnvPath, dbConfig);
        }
        return { success: false, message: `Fichier .env non trouvé à ${envPath} ou ${altEnvPath}` };
      }
      
      return this.updateEnvFileContent(envPath, dbConfig);
    } catch (error) {
      console.error('❌ Erreur mise à jour .env:', error);
      return { success: false, message: error.message };
    }
  }

  // Méthode helper pour mettre à jour le contenu du fichier .env
  updateEnvFileContent(envPath, dbConfig) {
    try {

      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Mettre à jour ou ajouter les variables
      const updates = {
        DB_USER: dbConfig.dbuser,
        DB_NAME: dbConfig.dbname,
        DB_PASSWORD: dbConfig.dbpass
      };
      
      Object.keys(updates).forEach(key => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${updates[key]}`;
        
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, newLine);
        } else {
          envContent += `\n${newLine}`;
        }
      });
      
      fs.writeFileSync(envPath, envContent, 'utf8');
      
      // Mettre à jour process.env pour la session courante
      process.env.DB_USER = dbConfig.dbuser;
      process.env.DB_NAME = dbConfig.dbname;
      process.env.DB_PASSWORD = dbConfig.dbpass;
      
      console.log(`✅ Fichier .env mis à jour avec succès: ${envPath}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour contenu .env:', error);
      return { success: false, message: error.message };
    }
  }

  // Nouvelle méthode switchDatabase qui utilise la table db
  async switchDatabaseByDbId(dbId) {
    try {
      console.log(`[DatabaseSwitchService] 🔍 Recherche configuration db avec id: ${dbId}`);
      
      // Récupérer la configuration depuis la table db
      // IMPORTANT: lire la table db depuis la base "mère" (config) avec une connexion temporaire
      const configConnection = this.createConfigConnection();
      await configConnection.authenticate();
      const dbName = configConnection.config?.database || 'unknown';
      console.log(`[DatabaseSwitchService] 🔍 Connexion config utilisée: ${dbName}`);
      
      // Vérifier d'abord si la table db existe
      try {
        const tableCheck = await configConnection.query(`
          SELECT COUNT(*) as count 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_NAME = 'db'
        `, {
          type: QueryTypes.SELECT
        });
        
        const tableExists = Array.isArray(tableCheck) && tableCheck.length > 0 && 
                           (tableCheck[0]?.count > 0 || (Array.isArray(tableCheck[0]) && tableCheck[0][0]?.count > 0));
        
        if (!tableExists) {
          console.error(`[DatabaseSwitchService] ❌ La table 'db' n'existe pas dans la base ${dbName}`);
          return {
            success: false,
            message: `La table 'db' n'existe pas dans la base de données actuelle (${dbName})`
          };
        }
      } catch (checkError) {
        console.error(`[DatabaseSwitchService] ❌ Erreur vérification table db:`, checkError.message);
        // Continuer quand même, peut-être que la table existe mais la vérification a échoué
      }
      
      const result = await configConnection.query(`
        SELECT id, name, dbuser, dbpass, dbname, dbtype 
        FROM db 
        WHERE id = :dbId
      `, {
        replacements: { dbId },
        type: QueryTypes.SELECT
      });

      try { await configConnection.close(); } catch { }

      console.log(`[DatabaseSwitchService] 🔍 Résultat brut de la requête:`, JSON.stringify(result, null, 2));
      console.log(`[DatabaseSwitchService] 🔍 Type du résultat:`, typeof result, Array.isArray(result) ? `(array, length: ${result.length})` : '');

      // Normaliser le résultat (Sequelize peut retourner différents formats)
      let dbConfig = null;
      
      // Cas 1: Tableau avec metadata [results, metadata] - format Sequelize standard
      if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
        console.log(`[DatabaseSwitchService] 🔍 Format détecté: Tableau avec metadata`);
        dbConfig = result[0].length > 0 ? result[0][0] : null;
      }
      // Cas 2: Tableau direct de résultats
      else if (Array.isArray(result) && result.length > 0) {
        console.log(`[DatabaseSwitchService] 🔍 Format détecté: Tableau direct (${result.length} éléments)`);
        // Prendre le premier élément du tableau
        dbConfig = result[0];
        // Si c'est un tableau imbriqué, prendre le premier élément
        if (Array.isArray(dbConfig) && dbConfig.length > 0) {
          dbConfig = dbConfig[0];
        }
      }
      // Cas 3: Objet unique avec propriété id
      else if (!Array.isArray(result) && typeof result === 'object' && result !== null && result.id) {
        console.log(`[DatabaseSwitchService] 🔍 Format détecté: Objet unique`);
        dbConfig = result;
      }
      // Cas 4: Résultat vide ou invalide
      else {
        console.log(`[DatabaseSwitchService] ⚠️ Format non reconnu ou résultat vide`);
        console.log(`[DatabaseSwitchService] ⚠️ Détails:`, {
          isArray: Array.isArray(result),
          length: Array.isArray(result) ? result.length : 'N/A',
          type: typeof result,
          hasId: result && typeof result === 'object' ? !!result.id : false
        });
        dbConfig = null;
      }

      console.log(`[DatabaseSwitchService] 🔍 Configuration normalisée:`, dbConfig ? JSON.stringify(dbConfig, null, 2) : 'null');

      if (!dbConfig || !dbConfig.id || !dbConfig.dbname || !dbConfig.dbuser) {
        const missingFields = [];
        if (!dbConfig) missingFields.push('dbConfig est null');
        if (!dbConfig?.id) missingFields.push('id manquant');
        if (!dbConfig?.dbname) missingFields.push('dbname manquant');
        if (!dbConfig?.dbuser) missingFields.push('dbuser manquant');
        
        return {
          success: false,
          message: `Configuration de base de données non trouvée ou incomplète. ${missingFields.join(', ')}`
        };
      }

      // Mettre à jour le fichier .env
      const envUpdate = this.updateEnvFile(dbConfig);
      if (!envUpdate.success) {
        return envUpdate;
      }

      // Recharger le fichier .env pour que les nouvelles valeurs soient disponibles
      delete require.cache[require.resolve('dotenv')];
      const dotenv = require('dotenv');
      const envPath = path.join(__dirname, '../.env');
      dotenv.config({ path: envPath, override: true });

      // Créer d'abord la nouvelle connexion AVANT de fermer l'ancienne
      // pour éviter que les modèles utilisent une connexion fermée
      const newConnection = new Sequelize(
        dbConfig.dbname,
        dbConfig.dbuser,
        dbConfig.dbpass,
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

      // Tester la nouvelle connexion
      await newConnection.authenticate();
      
      // Maintenant, fermer l'ancienne connexion si elle existe
      const oldConnection = this.currentConnection;
      if (oldConnection) {
        try {
          await oldConnection.close();
          console.log('✅ Ancienne connexion fermée');
        } catch (error) {
          console.warn('⚠️ Erreur fermeture ancienne connexion:', error.message);
        }
      }
      
      // Assigner la nouvelle connexion
      this.currentConnection = newConnection;
      console.log(`✅ Connexion active vers: ${dbConfig.dbname} (${dbConfig.name})`);
      console.log(`✅ currentConnection config:`, {
        database: this.currentConnection.config.database,
        username: this.currentConnection.config.username,
        host: this.currentConnection.config.host
      });
      console.log(`✅ this.currentConnection est définie:`, !!this.currentConnection);

      // Mettre à jour la connexion par défaut dans database.js
      // En supprimant le cache du module pour forcer sa relecture
      const databaseModulePath = require.resolve('../config/database');
      delete require.cache[databaseModulePath];

      // Réinitialiser les modèles Sequelize avec la nouvelle connexion
      // Supprimer le cache des modules de modèles pour forcer leur relecture
      const modelModules = [
        '../models/societe.model',
        '../models/user.model',
        '../models/unified-user.model',
        '../models/document_societe.model',
        '../models/user_permissions.model',
        '../models/email.model'
      ];
      
      modelModules.forEach(modelPath => {
        try {
          const resolvedPath = require.resolve(modelPath);
          delete require.cache[resolvedPath];
          console.log(`✅ Cache supprimé pour: ${modelPath}`);
          
          // Forcer la mise à jour de la connexion dans les modèles déjà chargés
          try {
            const ModelModule = require(modelPath);
            if (ModelModule && ModelModule.sequelize) {
              // Mettre à jour directement la connexion du modèle
              ModelModule.sequelize = this.currentConnection;
              console.log(`✅ Connexion mise à jour pour modèle: ${modelPath}`);
            }
          } catch (updateError) {
            // Ignorer les erreurs de mise à jour
          }
        } catch (error) {
          console.warn(`⚠️ Impossible de supprimer le cache pour ${modelPath}:`, error.message);
        }
      });

      // Synchroniser les modèles
      const dynamicModelService = require('./dynamic-model.service');
      if (dynamicModelService && dynamicModelService.syncAllModels) {
        await dynamicModelService.syncAllModels();
      }
      
      // Vérifier que getConnectionToUse() retourne bien la nouvelle connexion
      const testConnection = this.getConnectionToUse();
      console.log(`✅ Vérification getConnectionToUse():`, {
        isCurrentConnection: testConnection === this.currentConnection,
        database: testConnection.config?.database,
        sameInstance: testConnection === this.currentConnection ? 'OUI' : 'NON',
        currentConnectionDb: this.currentConnection?.config?.database,
        testConnectionDb: testConnection?.config?.database
      });

      return {
        success: true,
        message: `Connexion à ${dbConfig.name} (${dbConfig.dbname}) réussie`,
        database: dbConfig.dbname,
        dbConfig: {
          id: dbConfig.id,
          name: dbConfig.name,
          dbname: dbConfig.dbname
        }
      };
    } catch (error) {
      console.error('❌ Erreur lors du changement de base:', error);
      return {
        success: false,
        message: `Erreur lors du changement: ${error.message}`
      };
    }
  }

  // Lister toutes les bases de données disponibles (ancienne méthode - gardée pour compatibilité)
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
