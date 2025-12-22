const existingAuthService = require('../services/existing-auth.service');

class ExistingAuthController {
  // Connexion
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username et password requis'
        });
      }

      const result = await existingAuthService.login(username, password);
      
      res.json({
        success: true,
        message: 'Connexion réussie',
        data: result
      });
    } catch (error) {
      console.error('❌ Erreur login:', error);
      res.status(401).json({
        success: false,
        message: error.message
      });
    }
  }

  // Informations utilisateur
  async getMe(req, res) {
    try {
      const userId = req.user.id;
      const userInfo = await existingAuthService.getUserInfo(userId);
      
      res.json({
        success: true,
        data: userInfo
      });
    } catch (error) {
      console.error('❌ Erreur getMe:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Lister les bases de données disponibles
  async getAvailableDatabases(req, res) {
    try {
      const userId = req.user.id;
      const userInfo = await existingAuthService.getUserInfo(userId);
      
      res.json({
        success: true,
        data: {
          databases: userInfo.allowed_databases
        }
      });
    } catch (error) {
      console.error('❌ Erreur getAvailableDatabases:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Changer de base de données
  async switchDatabase(req, res) {
    try {
      const userId = req.user.id;
      const { database_name } = req.body;

      if (!database_name) {
        return res.status(400).json({
          success: false,
          message: 'Nom de base de données requis'
        });
      }

      const result = await existingAuthService.switchDatabase(userId, database_name);
      
      res.json({
        success: true,
        message: result.message,
        data: {
          database: result.database
        }
      });
    } catch (error) {
      console.error('❌ Erreur switchDatabase:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Déconnexion
  async logout(req, res) {
    try {
      res.json({
        success: true,
        message: 'Déconnexion réussie'
      });
    } catch (error) {
      console.error('❌ Erreur logout:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la déconnexion'
      });
    }
  }
}

module.exports = new ExistingAuthController();


