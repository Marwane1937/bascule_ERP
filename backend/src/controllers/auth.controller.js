const authService = require('../services/auth.service');

class AuthController {
  // Connexion
  async login(req, res) {
    try {
      // console.log('========================================');
      // console.log('[AuthController] 🔐 Requête de connexion reçue');
      // console.log('[AuthController] Body reçu:', JSON.stringify(req.body, null, 2));
      // console.log('[AuthController] Headers:', JSON.stringify(req.headers, null, 2));

      // Accepter à la fois "username" et "login" depuis le frontend
      const { username, login, password, database_name } = req.body;
      const userLogin = login || username;

      /*  console.log('[AuthController] Username extrait:', username);
       console.log('[AuthController] Login extrait:', login);
       console.log('[AuthController] UserLogin final:', userLogin);
       console.log('[AuthController] Password présent:', !!password);
       console.log('[AuthController] Database_name:', database_name);
       console.log('[AuthController] UserLogin type:', typeof userLogin);
       console.log('[AuthController] UserLogin vide?', !userLogin || (typeof userLogin === 'string' && userLogin.trim() === ''));
       console.log('[AuthController] Password vide?', !password || (typeof password === 'string' && password.trim() === ''));
  */
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
      const result = await authService.login(userLogin, password, database_name);
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
