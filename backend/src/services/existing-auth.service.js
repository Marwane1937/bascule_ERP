const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');

class ExistingAuthService {
  constructor() {
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
  async login(username, password) {
    try {
      // Récupérer l'utilisateur depuis la table users existante
      const [users] = await sequelize.query(`
        SELECT id, nom, login, pass, type, etat 
        FROM users 
        WHERE login = :username AND etat = 1
      `, {
        replacements: { username },
        type: sequelize.QueryTypes.SELECT
      });

      console.log('🔍 Debug - Users trouvés:', users);
      console.log('🔍 Debug - Username recherché:', username);

      if (!users || users.length === 0) {
        throw new Error('Utilisateur non trouvé');
      }

      const user = users[0];
      console.log('🔍 Debug - User sélectionné:', user);

      // Vérifier le mot de passe
      const isPasswordValid = await this.verifyPassword(password, user.pass);
      if (!isPasswordValid) {
        throw new Error('Mot de passe incorrect');
      }

      // Générer le token
      const token = this.generateToken(user);

      // Récupérer les bases de données disponibles
      const availableDatabases = await this.getAvailableDatabases();

      return {
        user: {
          id: user.id,
          name: user.nom,
          username: user.login,
          role: user.type === 1 ? 'admin' : 'user',
          allowed_databases: availableDatabases
        },
        token
      };
    } catch (error) {
      throw new Error(`Erreur d'authentification: ${error.message}`);
    }
  }

  // Récupérer les bases de données disponibles
  async getAvailableDatabases() {
    try {
      // Utiliser les vraies bases de données de votre système
      return [
        'CactusErp_SNMR',
        'CactusErp_SNMR_Test01'
      ];
    } catch (error) {
      console.error('Erreur récupération bases:', error);
      return [];
    }
  }

  // Récupérer les informations de l'utilisateur connecté
  async getUserInfo(userId) {
    try {
      const [users] = await sequelize.query(`
        SELECT id, nom, login, type, etat 
        FROM users 
        WHERE id = :userId AND etat = 1
      `, {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT
      });

      if (users.length === 0) {
        throw new Error('Utilisateur non trouvé');
      }

      const user = users[0];
      const availableDatabases = await this.getAvailableDatabases();

      return {
        id: user.id,
        name: user.nom,
        username: user.login,
        role: user.type === 1 ? 'admin' : 'user',
        allowed_databases: availableDatabases
      };
    } catch (error) {
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

module.exports = new ExistingAuthService();
