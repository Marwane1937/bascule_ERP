const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getConnection } = require('../config/database');
const sequelize = require('../config/database'); // Garder pour compatibilité
const databaseSwitchService = require('./database-switch.service');

class AuthService {
  constructor() {
    // Validation du JWT_SECRET en production
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key') {
        throw new Error('❌ [SECURITY] JWT_SECRET doit être configuré en production et ne peut pas être la valeur par défaut');
      }
      if (process.env.JWT_SECRET.length < 32) {
        console.warn('⚠️ [SECURITY] JWT_SECRET est trop court (minimum 32 caractères recommandé)');
      }
    }
    
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  // Hashage du mot de passe
  async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  // Vérification du mot de passe
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Génération du token JWT
  generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.login,
        role: user.type === 1 ? 'admin' : 'user'
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  // Vérification du token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Token invalide');
    }
  }

  // Authentification utilisateur
  async login(username, password, databaseName = null) {
    // Variable pour suivre si on a créé une connexion temporaire
    let connectionToUse = null;
    let temporaryConnection = false;
    
    try {
      console.log('[AuthService] 🔍 Recherche utilisateur avec login:', username);
      console.log('[AuthService] Database name fourni:', databaseName);
      
      // Recharger le .env pour avoir les dernières valeurs
      const path = require('path');
      delete require.cache[require.resolve('dotenv')];
      const dotenv = require('dotenv');
      dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });
      
      const defaultDbName = process.env.DB_NAME?.trim();
      console.log('[AuthService] 🔍 Base par défaut du .env:', defaultDbName);
      
      // Si aucun databaseName n'est fourni, utiliser la base du .env
      if (!databaseName) {
        console.log('[AuthService] 🔄 Utilisation de la base par défaut du .env');
        connectionToUse = getConnection();
        console.log('[AuthService] ✅ Connexion à la base par défaut:', defaultDbName);
      } 
      // Si databaseName est fourni et différent de la base du .env, chercher dans la table db
      else if (databaseName.trim() !== defaultDbName) {
        console.log('[AuthService] 🔄 Base différente fournie, recherche dans la table db:', databaseName);
        const databaseSwitchService = require('./database-switch.service');
        const { Sequelize, QueryTypes } = require('sequelize');
        
        // Essayer de récupérer les credentials depuis la table db
        let dbUser = process.env.DB_USER;
        let dbPassword = process.env.DB_PASSWORD;
        let dbHost = process.env.DB_HOST;
        let dbInstance = process.env.DB_INSTANCE;
        
        try {
          // Créer une connexion temporaire vers la base config pour lire la table db
          const configConnection = databaseSwitchService.createConfigConnection();
          await configConnection.authenticate();
          
          // Chercher les credentials dans la table db pour cette base
          const dbResult = await configConnection.query(`
            SELECT dbuser, dbpass, dbname, name 
            FROM db 
            WHERE dbname = :databaseName OR name = :databaseName
          `, {
            replacements: { databaseName: databaseName.trim() },
            type: QueryTypes.SELECT
          });
          
          await configConnection.close();
          
          // Normaliser le résultat
          let dbConfig = null;
          if (Array.isArray(dbResult) && dbResult.length === 2 && Array.isArray(dbResult[0])) {
            dbConfig = dbResult[0].length > 0 ? dbResult[0][0] : null;
          } else if (Array.isArray(dbResult) && dbResult.length > 0) {
            dbConfig = dbResult[0];
            if (Array.isArray(dbConfig) && dbConfig.length > 0) {
              dbConfig = dbConfig[0];
            }
          } else if (!Array.isArray(dbResult) && typeof dbResult === 'object' && dbResult !== null && dbResult.dbuser) {
            dbConfig = dbResult;
          }
          
          if (dbConfig && dbConfig.dbuser && dbConfig.dbpass) {
            console.log('[AuthService] ✅ Credentials trouvés dans la table db pour', databaseName);
            dbUser = dbConfig.dbuser;
            dbPassword = dbConfig.dbpass;
          } else {
            console.log('[AuthService] ⚠️ Aucune config trouvée dans la table db pour', databaseName);
            console.log('[AuthService] ⚠️ Utilisation des credentials du .env (peut échouer si les permissions diffèrent)');
          }
        } catch (dbTableError) {
          console.log('[AuthService] ⚠️ Erreur lecture table db, utilisation des credentials du .env:', dbTableError.message);
        }
        
        console.log('[AuthService] 🔍 DB_USER:', dbUser);
        console.log('[AuthService] 🔍 DB_HOST:', dbHost);
        console.log('[AuthService] 🔍 DB_INSTANCE:', dbInstance);
        
        connectionToUse = new Sequelize(
          databaseName.trim(),
          dbUser,
          dbPassword,
          {
            host: dbHost,
            dialect: 'mssql',
            dialectOptions: {
              options: {
                encrypt: false,
                trustServerCertificate: true,
                instanceName: dbInstance,
              }
            },
            logging: false
          }
        );
        
        temporaryConnection = true;
        
        // Tester la connexion
        await connectionToUse.authenticate();
        console.log('[AuthService] ✅ Connexion à', databaseName, 'réussie');
      }
      // Si databaseName est fourni mais identique à la base du .env, utiliser la connexion par défaut
      else {
        console.log('[AuthService] 🔄 Base fournie identique à la base du .env, utilisation de la connexion par défaut');
        connectionToUse = getConnection();
        console.log('[AuthService] ✅ Connexion à la base par défaut:', defaultDbName);
      }
      
      // Récupérer l'utilisateur depuis la table users existante
      console.log('[AuthService] 🔍 Exécution requête SQL...');
      console.log('[AuthService] Username:', username);
      console.log('[AuthService] Database utilisée:', databaseName || 'base par défaut');
      
      let users;
      try {
        const queryResult = await connectionToUse.query(`
          SELECT id, nom, login, pass, type, etat 
          FROM users 
          WHERE login = :username AND etat = 1
        `, {
          replacements: { username },
          type: connectionToUse.QueryTypes.SELECT
        });
        
        console.log('[AuthService] 🔍 Résultat brut de la requête:', queryResult);
        console.log('[AuthService] Type de queryResult:', typeof queryResult);
        console.log('[AuthService] Is Array:', Array.isArray(queryResult));
        
        // Sequelize.query avec SELECT retourne directement un tableau
        users = queryResult;
        
        console.log('[AuthService] 🔍 Résultat extrait (users):', users);
        console.log('[AuthService] Type de users:', typeof users);
        console.log('[AuthService] Is Array:', Array.isArray(users));
        console.log('[AuthService] Length:', Array.isArray(users) ? users.length : 'N/A');
      } catch (queryError) {
        console.error('[AuthService] ❌ Erreur lors de la requête SQL:', queryError);
        console.error('[AuthService] Message:', queryError.message);
        console.error('[AuthService] Stack:', queryError.stack);
        
        throw new Error(`Erreur lors de la recherche de l'utilisateur: ${queryError.message}`);
      }
      
      if (!users || (Array.isArray(users) && users.length === 0)) {
        console.log('[AuthService] ❌ Utilisateur non trouvé');
        throw new Error('Utilisateur non trouvé');
      }

      const user = Array.isArray(users) ? users[0] : users;
      
      if (!user) {
        console.log('[AuthService] ❌ User est undefined après extraction');
        throw new Error('Utilisateur non trouvé');
      }
      
      console.log('[AuthService] ✅ Utilisateur trouvé:', { id: user.id, nom: user.nom, login: user.login, type: user.type });
      console.log('[AuthService] 🔐 Vérification du mot de passe...');
      console.log('[AuthService] Hash stocké présent:', !!user.pass);
      console.log('[AuthService] User object keys:', Object.keys(user));

      // Vérifier le mot de passe
      if (!user.pass) {
        console.log('[AuthService] ❌ Mot de passe hash manquant dans la base de données');
        console.log('[AuthService] User object:', JSON.stringify(user, null, 2));
        throw new Error('Mot de passe hash manquant dans la base de données');
      }
      
      const isPasswordValid = await this.verifyPassword(password, user.pass);
      console.log('[AuthService] 🔐 Résultat vérification mot de passe:', isPasswordValid);
      
      if (!isPasswordValid) {
        console.log('[AuthService] ❌ Mot de passe incorrect');
        throw new Error('Mot de passe incorrect');
      }

      // Générer le token
      const token = this.generateToken(user);
      console.log('[AuthService] ✅ Token généré');

      // Récupérer les permissions de l'utilisateur AVANT de fermer la connexion
      console.log('[AuthService] 🔍 Récupération des permissions...');
      console.log('[AuthService] 🔍 User ID:', user.id);
      console.log('[AuthService] 🔍 User Type:', user.type);
      console.log('[AuthService] 🔍 Is Admin:', user.type === 1);
      console.log('[AuthService] 🔍 Connexion utilisée:', connectionToUse ? 'Fournie' : 'Par défaut');
      console.log('[AuthService] 🔍 Database name:', connectionToUse?.config?.database || 'Non spécifiée');
      
      let permissions = [];
      
      // TOUJOURS récupérer les permissions depuis la table user_permissions
      // Même pour les admins, on vérifie d'abord s'il y a des permissions dans la table
      try {
        const userPermissionsService = require('./user-permissions.service');
        console.log('[AuthService] 🔍 Appel getUserPermissions avec userId:', user.id);
        console.log('[AuthService] 🔍 Connexion passée:', !!connectionToUse);
        
        // Récupérer les permissions depuis la base de données
        permissions = await userPermissionsService.getUserPermissions(user.id, connectionToUse);
        
        console.log('[AuthService] ✅ Permissions récupérées depuis la table:', permissions.length);
        if (permissions.length > 0) {
          console.log('[AuthService] 📋 Permissions:', JSON.stringify(permissions, null, 2));
        } else {
          console.warn('[AuthService] ⚠️ Aucune permission trouvée dans la table user_permissions pour userId:', user.id);
          
          // Si l'utilisateur est admin et n'a pas de permissions dans la table, générer toutes les permissions
          if (user.type === 1) {
            console.log('[AuthService] 👑 Utilisateur admin sans permissions dans la table, génération de toutes les permissions...');
            try {
              const availableMenuItems = await userPermissionsService.getAvailableMenuItems();
              
              // Créer des permissions pour tous les menu items avec access = 1
              permissions = [];
              availableMenuItems.forEach(category => {
                category.items.forEach(item => {
                  permissions.push({
                    user_id: user.id,
                    menu_item: item.name,
                    access: 1
                  });
                });
              });
              
              console.log('[AuthService] ✅ Permissions admin générées:', permissions.length);
              console.log('[AuthService] 📋 Permissions admin:', JSON.stringify(permissions.map(p => p.menu_item), null, 2));
            } catch (adminPermError) {
              console.error('[AuthService] ⚠️ Erreur génération permissions admin:', adminPermError);
              console.error('[AuthService] ⚠️ Message:', adminPermError.message);
              console.error('[AuthService] ⚠️ Stack:', adminPermError.stack);
              // On continue avec un tableau vide, le frontend gérera l'admin
            }
          } else {
            console.warn('[AuthService] ⚠️ Utilisateur non-admin sans permissions dans la table');
            console.warn('[AuthService] ⚠️ L\'utilisateur n\'aura accès à aucune interface');
            console.warn('[AuthService] ⚠️ Veuillez créer des permissions pour cet utilisateur dans la table user_permissions');
          }
        }
      } catch (permError) {
        console.error('[AuthService] ❌ Erreur récupération permissions:', permError);
        console.error('[AuthService] ❌ Message:', permError.message);
        console.error('[AuthService] ❌ Stack:', permError.stack);
        console.error('[AuthService] ❌ Code:', permError.code);
        console.error('[AuthService] ❌ Nom:', permError.name);
        
        // Si c'est une erreur de table inexistante
        if (permError.message && (
          permError.message.includes('Invalid object name') ||
          permError.message.includes('Table') && permError.message.includes("doesn't exist") ||
          permError.message.includes('relation') && permError.message.includes('does not exist')
        )) {
          console.error('[AuthService] ⚠️ La table user_permissions n\'existe pas dans cette base de données');
          console.error('[AuthService] ⚠️ Base de données:', connectionToUse?.config?.database || 'Non spécifiée');
          
          // Si l'utilisateur est admin, générer les permissions quand même
          if (user.type === 1) {
            console.log('[AuthService] 👑 Utilisateur admin, génération de toutes les permissions...');
            try {
              const userPermissionsService = require('./user-permissions.service');
              const availableMenuItems = await userPermissionsService.getAvailableMenuItems();
              
              permissions = [];
              availableMenuItems.forEach(category => {
                category.items.forEach(item => {
                  permissions.push({
                    user_id: user.id,
                    menu_item: item.name,
                    access: 1
                  });
                });
              });
              
              console.log('[AuthService] ✅ Permissions admin générées:', permissions.length);
            } catch (adminPermError) {
              console.error('[AuthService] ⚠️ Erreur génération permissions admin:', adminPermError);
            }
          } else {
            console.error('[AuthService] ⚠️ Continuons sans permissions...');
          }
        } else {
          // Pour les autres erreurs, on les propage
          throw new Error(`Erreur récupération permissions: ${permError.message}`);
        }
      }

      // Récupérer les bases de données disponibles
      const availableDatabases = await this.getAvailableDatabases();
      console.log('[AuthService] Bases de données disponibles:', availableDatabases.length);

      return {
        user: {
          id: user.id,
          nom: user.nom,
          login: user.login,
          type: user.type,
          etat: user.etat || 1,
          role: user.type === 1 ? 'admin' : 'user', // Garder pour compatibilité
          allowed_databases: availableDatabases
        },
        token,
        permissions: permissions || []
      };
    } catch (error) {
      console.error('[AuthService] ❌ Erreur dans login:', error);
      throw new Error(`Erreur d'authentification: ${error.message}`);
    } finally {
      // Fermer la connexion temporaire si elle a été créée (dans tous les cas)
      if (temporaryConnection && connectionToUse !== sequelize) {
        console.log('[AuthService] 🔄 Fermeture connexion temporaire...');
        try {
          await connectionToUse.close();
          console.log('[AuthService] ✅ Connexion fermée');
        } catch (closeError) {
          console.error('[AuthService] Erreur fermeture connexion:', closeError);
        }
      }
    }
  }

  // Récupérer les bases de données disponibles
  async getAvailableDatabases() {
    try {
      const result = await databaseSwitchService.listAvailableDatabases();
      if (result.success) {
        return result.databases;
      }
      return [];
    } catch (error) {
      console.error('Erreur récupération bases:', error);
      return [];
    }
  }

  // Récupérer les informations de l'utilisateur connecté
  async getUserInfo(userId) {
    try {
      console.log('[AuthService] 🔍 Récupération info utilisateur ID:', userId);
      
      // Utiliser getConnection() pour avoir la connexion active
      const connectionToUse = getConnection();
      const [users] = await connectionToUse.query(`
        SELECT id, nom, login, type, etat 
        FROM users 
        WHERE id = :userId AND etat = 1
      `, {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT
      });

      console.log('[AuthService] 🔍 Résultat requête getUserInfo:', users);
      console.log('[AuthService] Type de users:', typeof users);
      console.log('[AuthService] Is Array:', Array.isArray(users));
      console.log('[AuthService] Length:', Array.isArray(users) ? users.length : 'N/A');

      if (!users || (Array.isArray(users) && users.length === 0)) {
        console.log('[AuthService] ❌ Utilisateur non trouvé pour ID:', userId);
        throw new Error('Utilisateur non trouvé');
      }

      const user = Array.isArray(users) ? users[0] : users;
      
      if (!user) {
        console.log('[AuthService] ❌ User est undefined après extraction');
        throw new Error('Utilisateur non trouvé');
      }
      
      console.log('[AuthService] ✅ Utilisateur trouvé:', { id: user.id, nom: user.nom, login: user.login });
      
      const availableDatabases = await this.getAvailableDatabases();
      console.log('[AuthService] Bases de données disponibles:', availableDatabases.length);

      return {
        id: user.id,
        name: user.nom,
        username: user.login,
        role: user.type === 1 ? 'admin' : 'user',
        allowed_databases: availableDatabases
      };
    } catch (error) {
      console.error('[AuthService] ❌ Erreur récupération utilisateur:', error);
      throw new Error(`Erreur récupération utilisateur: ${error.message}`);
    }
  }

  // Changer de base de données
  async switchDatabase(userId, databaseName) {
    try {
      // Vérifier que l'utilisateur existe
      const user = await this.getUserInfo(userId);
      
      // Vérifier si l'utilisateur a accès à cette base
      if (!user.allowed_databases.includes(databaseName)) {
        throw new Error('Accès non autorisé à cette base de données');
      }

      // Pour l'instant, on retourne juste un succès
      // Dans un vrai système, on devrait changer la connexion
      return {
        success: true,
        message: `Connexion à ${databaseName} réussie`,
        database: databaseName
      };
    } catch (error) {
      throw new Error(`Erreur changement de base: ${error.message}`);
    }
  }
}

module.exports = new AuthService();
