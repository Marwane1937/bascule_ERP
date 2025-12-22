const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UnifiedUser = require('../models/unified-user.model');
const databaseSwitchService = require('./database-switch.service');

class UnifiedAuthService {
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
        username: user.username,
        role: user.role 
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
      // Récupérer l'utilisateur
      const user = await UnifiedUser.findOne({
        where: { username, actif: true }
      });

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier le mot de passe
      const isPasswordValid = await this.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Mot de passe incorrect');
      }

      // Générer le token
      const token = this.generateToken(user);

      // Récupérer les bases de données autorisées
      const allowedDatabases = user.allowed_databases ? 
        JSON.parse(user.allowed_databases) : 
        await this.getAvailableDatabases();

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          allowed_databases: allowedDatabases
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
      const user = await UnifiedUser.findByPk(userId);
      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      const allowedDatabases = user.allowed_databases ? 
        JSON.parse(user.allowed_databases) : 
        await this.getAvailableDatabases();

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        allowed_databases: allowedDatabases
      };
    } catch (error) {
      throw new Error(`Erreur récupération utilisateur: ${error.message}`);
    }
  }

  // Changer de base de données
  async switchDatabase(userId, databaseName) {
    try {
      const user = await UnifiedUser.findByPk(userId);
      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier si l'utilisateur a accès à cette base
      const allowedDatabases = user.allowed_databases ? 
        JSON.parse(user.allowed_databases) : 
        await this.getAvailableDatabases();

      if (!allowedDatabases.includes(databaseName)) {
        throw new Error('Accès non autorisé à cette base de données');
      }

      // Tester la connexion à la nouvelle base
      const testResult = await databaseSwitchService.testConnection(databaseName);
      if (!testResult.success) {
        throw new Error(`Impossible de se connecter à ${databaseName}: ${testResult.message}`);
      }

      // Changer de base
      const switchResult = await databaseSwitchService.switchDatabase(databaseName);
      if (!switchResult.success) {
        throw new Error(`Erreur changement de base: ${switchResult.message}`);
      }

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

module.exports = new UnifiedAuthService();


