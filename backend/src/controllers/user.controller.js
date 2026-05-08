const userService = require('../services/user.service');
const databaseSwitchService = require('../services/database-switch.service');

exports.getAll = async (req, res) => {
  try {
    // Utiliser la connexion injectée par le middleware ou la connexion par défaut
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const users = await userService.getAllUsers(sequelize);
    res.json({
      success: true,
      data: users
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur récupération utilisateurs:', err);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      message: err.message
    });
  }
};

exports.create = async (req, res) => {
  try {
    // Utiliser la connexion injectée par le middleware ou la connexion par défaut
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const user = await userService.createUser(req.body, sequelize);
    res.status(201).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur création utilisateur:', err);
    res.status(400).json({
      success: false,
      error: 'Erreur de création',
      message: err.message
    });
  }
};

exports.update = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const user = await userService.updateUser(req.params.id, req.body, sequelize);
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur modification utilisateur:', err);
    res.status(400).json({
      success: false,
      error: 'Erreur de modification',
      message: err.message
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    await userService.deleteUser(req.params.id, sequelize);
    res.json({
      success: true,
      message: 'Utilisateur supprimé'
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur suppression utilisateur:', err);
    res.status(400).json({
      success: false,
      error: 'Erreur de suppression',
      message: err.message
    });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await userService.toggleUserStatus(req.params.id, sequelize);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur changement statut utilisateur:', err);
    res.status(400).json({
      success: false,
      error: 'Erreur de changement de statut',
      message: err.message
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    await userService.resetPassword(req.params.id, req.body.password, sequelize);
    res.json({
      success: true,
      message: 'Mot de passe réinitialisé'
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur réinitialisation mot de passe:', err);
    res.status(400).json({
      success: false,
      error: 'Erreur de réinitialisation',
      message: err.message
    });
  }
};

exports.changePassword = async (req, res) => {
  let fallbackConnection = null;
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const userId = Number(req.user?.id || 0);
    const { currentPassword, newPassword } = req.body || {};
    const requestedDatabase = String(req.headers['x-database-name'] || '').trim();

    try {
      await userService.changePassword(userId, currentPassword, newPassword, sequelize);
    } catch (err) {
      const currentDatabase = sequelize?.config?.database || '';
      const canRetryOnRequestedDb = requestedDatabase
        && requestedDatabase !== currentDatabase
        && String(err?.message || '').includes('Mot de passe actuel incorrect');

      if (!canRetryOnRequestedDb) {
        throw err;
      }

      fallbackConnection = databaseSwitchService.createConnection(requestedDatabase);
      await userService.changePassword(userId, currentPassword, newPassword, fallbackConnection);
    }

    res.json({
      success: true,
      message: 'Mot de passe modifie'
    });
  } catch (err) {
    console.error('❌ [UserController] Erreur changement mot de passe:', err);
    res.status(400).json({
      success: false,
      error: 'Erreur de changement de mot de passe',
      message: err.message
    });
  } finally {
    if (fallbackConnection) {
      try {
        await fallbackConnection.close();
      } catch (closeError) {
        console.error('❌ [UserController] Erreur fermeture connexion fallback:', closeError);
      }
    }
  }
};
