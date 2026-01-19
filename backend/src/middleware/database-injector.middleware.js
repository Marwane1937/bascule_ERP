const databaseSwitchService = require('../services/database-switch.service');
const Societe = require('../models/societe.model');

class DatabaseInjectorMiddleware {
  // Middleware pour injecter la connexion appropriée
  async injectConnection(req, res, next) {
    try {
      /**
       * IMPORTANT:
       * On NE fait PLUS de switch automatique via headers (x-database-name / x-societe-id).
       * Sinon une requête parallèle (ou un autre onglet/utilisateur) peut écraser la connexion globale
       * et provoquer un "switch" sans action utilisateur.
       *
       * La base active doit être définie UNIQUEMENT via /api/database/switch-database (db_id).
       */
      const requestedDb = req.headers['x-database-name'];
      const currentDb = databaseSwitchService.getCurrentDatabase();
      if (requestedDb && requestedDb !== currentDb) {
        console.warn(
          `[DatabaseInjector] ⚠️ Header x-database-name (${requestedDb}) ignoré. Base active: ${currentDb}`
        );
      }

      // Injecter la connexion active dans la requête
      req.sequelize = databaseSwitchService.getConnectionToUse();
      req.currentSociete = databaseSwitchService.getCurrentSocieteInfo();

      next();
    } catch (error) {
      console.error('❌ [DatabaseInjector] Erreur injection connexion:', error);
      // Utiliser la connexion par défaut en cas d'erreur
      req.sequelize = databaseSwitchService.getDefaultConnection();
      next();
    }
  }

  // Middleware pour forcer la reconnexion à la société spécifiée
  async forceReconnect(req, res, next) {
    try {
      const { societe_id } = req.body;

      if (societe_id) {
        const societe = await Societe.findByPk(societe_id);
        if (societe) {
          await databaseSwitchService.switchToSociete(societe);
          console.log(`🔄 Reconnexion forcée vers: ${societe.nom}`);
        }
      }

      req.sequelize = databaseSwitchService.getConnectionToUse();
      req.currentSociete = databaseSwitchService.getCurrentSocieteInfo();

      next();
    } catch (error) {
      console.error('❌ Erreur reconnexion forcée:', error);
      req.sequelize = databaseSwitchService.getDefaultConnection();
      next();
    }
  }
}

module.exports = new DatabaseInjectorMiddleware();


