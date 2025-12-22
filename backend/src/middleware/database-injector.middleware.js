const databaseSwitchService = require('../services/database-switch.service');
const Societe = require('../models/societe.model');

class DatabaseInjectorMiddleware {
  // Middleware pour injecter la connexion appropriée
  async injectConnection(req, res, next) {
    try {
      // Récupérer le nom de la base de données depuis les headers (priorité)
      const databaseName = req.headers['x-database-name'];

      // Récupérer l'ID de la société depuis les headers ou le token
      const societeId = req.headers['x-societe-id'] || req.user?.societe_id;

      // Si on a le nom de la base de données directement, l'utiliser
      if (databaseName) {
        const switchResult = await databaseSwitchService.switchDatabase(databaseName);
        if (switchResult.success) {
          console.log(`[DatabaseInjector] ✅ Connexion vers base: ${databaseName}`);
        } else {
          console.error(`[DatabaseInjector] ❌ Erreur connexion vers base: ${databaseName}`, switchResult.message);
        }
      } else if (societeId) {
        // Sinon, utiliser l'ID de la société pour trouver la base
        console.log(`[DatabaseInjector] 🔍 ID société fourni: ${societeId}`);
        const currentSocieteId = databaseSwitchService.getCurrentSocieteId();

        if (currentSocieteId !== societeId) {
          // Récupérer les informations de la société depuis la connexion par défaut (table societes)
          const defaultConnection = databaseSwitchService.getDefaultConnection();
          try {
            const [societes] = await defaultConnection.query(`
              SELECT id, nom, nom_base, actif
              FROM societes
              WHERE id = :societeId
            `, {
              replacements: { societeId },
              type: defaultConnection.QueryTypes.SELECT
            });

            if (societes && societes.length > 0) {
              const societe = Array.isArray(societes) ? societes[0] : societes;
              // Changer de connexion vers la base de la société
              await databaseSwitchService.switchToSociete(societe);
              console.log(`[DatabaseInjector] 🔄 Connexion automatique vers: ${societe.nom} (${societe.nom_base})`);
            } else {
              console.warn(`[DatabaseInjector] ⚠️ Société ${societeId} non trouvée dans la table societes`);
            }
          } catch (societeError) {
            console.error(`[DatabaseInjector] ❌ Erreur récupération société ${societeId}:`, societeError.message);
            // Continuer avec la connexion par défaut
          }
        }
      } else {
        console.warn('[DatabaseInjector] ⚠️ Aucun ID société ni nom de base fourni, utilisation de la connexion par défaut');
      }

      // Injecter la connexion dans la requête
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


