const authService = require('../services/auth.service');

class AuthController {
  // Connexion
  async login(req, res) {
    try {
     const { username, login, password, database_name } = req.body;
      const userLogin = login || username;

      // Log pour déboguer
      console.log('[AuthController] 🔍 database_name reçu:', database_name);
   
      if (!userLogin || !password) {
      /*   console.log('[AuthController] ❌ Validation échouée - Username/Login ou password manquant');
        console.log('[AuthController] Username:', username);
        console.log('[AuthController] Login:', login);
        console.log('[AuthController] UserLogin:', userLogin);
        console.log('[AuthController] Password:', password ? '***' : 'undefined');
      */   return res.status(400).json({
        success: false,
        message: 'Nom d\'utilisateur et mot de passe requis'
      });
      }

      //console.log('[AuthController] ✅ Validation OK - Appel authService.login...');
      // Ne pas passer database_name si c'est vide, null, ou undefined
      const databaseNameToUse = database_name && database_name.trim() ? database_name.trim() : null;
      console.log('[AuthController] 🔍 database_name à utiliser:', databaseNameToUse);
      
      const result = await authService.login(userLogin, password, databaseNameToUse);
      // console.log('[AuthController] ✅ Résultat authService:', result ? 'Succès' : 'Échec');
      /*  console.log('[AuthController] 📋 Structure résultat:', JSON.stringify({
         hasUser: !!result.user,
         hasToken: !!result.token,
         hasPermissions: !!result.permissions,
         permissionsCount: result.permissions ? result.permissions.length : 0
       }, null, 2)); */
      if (result.permissions) {
        //console.log('[AuthController] 📋 Permissions:', JSON.stringify(result.permissions, null, 2));
      }

      //  console.log('[AuthController] ✅ Envoi réponse succès');
      res.json({
        success: true,
        message: 'Connexion réussie',
        data: result
      });
      console.log('[AuthController] ========================================');
    } catch (error) {
      console.error('[AuthController] ❌ Erreur de connexion:', error);
      console.error('[AuthController] Message:', error.message);
      console.error('[AuthController] Stack:', error.stack);
      res.status(401).json({
        success: false,
        message: error.message
      });
      console.log('[AuthController] ========================================');
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
      console.error('Erreur de déconnexion:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la déconnexion'
      });
    }
  }

  // Informations de l'utilisateur connecté
  async getMe(req, res) {
    try {
      const userInfo = await authService.getUserInfo(req.user.id);

      res.json({
        success: true,
        data: userInfo
      });
    } catch (error) {
      console.error('Erreur récupération utilisateur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Changer de base de données
  async switchDatabase(req, res) {
    try {
      const { databaseName } = req.body;

      if (!databaseName) {
        return res.status(400).json({
          success: false,
          message: 'Nom de la base de données requis'
        });
      }

      // Vérifier que la base de données existe et est accessible
      const databaseSwitchService = require('../services/database-switch.service');
      const testResult = await databaseSwitchService.testConnection(databaseName);

      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          message: testResult.message
        });
      }

      // Retourner une indication que l'utilisateur doit se reconnecter
      res.json({
        success: true,
        message: `Veuillez vous reconnecter pour accéder à la base ${databaseName}`,
        data: {
          database: databaseName,
          requiresReauth: true,
          redirectToLogin: true
        }
      });
    } catch (error) {
      console.error('Erreur changement de base:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new AuthController();
