const databaseSwitchService = require('../services/database-switch.service');
const Societe = require('../models/societe.model');

class DatabaseSwitchController {
  // Changer de base de données
  async switchDatabase(req, res) {
    try {
      const { societe_id } = req.body;
      
      if (!societe_id) {
        return res.status(400).json({
          success: false,
          message: 'ID de société requis'
        });
      }

      // Récupérer les informations de la société
      const societe = await Societe.findByPk(societe_id);
      if (!societe) {
        return res.status(404).json({
          success: false,
          message: 'Société non trouvée'
        });
      }

      // Changer de base de données
      const result = await databaseSwitchService.switchDatabase(societe.nom_base);
      
      if (result.success) {
        // Définir l'ID de la société actuelle
        databaseSwitchService.setCurrentSocieteId(societe.id);
        
        res.json({
          success: true,
          message: result.message,
          data: {
            societe: {
              id: societe.id,
              nom: societe.nom,
              nom_base: societe.nom_base
            },
            database: result.database
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('❌ Erreur switchDatabase:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }

  // Tester la connexion à une base de données
  async testConnection(req, res) {
    try {
      const { database_name } = req.body;
      
      if (!database_name) {
        return res.status(400).json({
          success: false,
          message: 'Nom de base de données requis'
        });
      }

      const result = await databaseSwitchService.testConnection(database_name);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('❌ Erreur testConnection:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }

  // Lister les bases de données disponibles
  async listDatabases(req, res) {
    try {
      const result = await databaseSwitchService.listAvailableDatabases();
      
      if (result.success) {
        res.json({
          success: true,
          data: result.databases
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('❌ Erreur listDatabases:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }

  // Obtenir la base de données actuelle
  async getCurrentDatabase(req, res) {
    try {
      const currentDb = databaseSwitchService.getCurrentDatabase();
      const currentSocieteId = databaseSwitchService.getCurrentSocieteId();
      
      res.json({
        success: true,
        data: {
          database: currentDb,
          societe_id: currentSocieteId
        }
      });
    } catch (error) {
      console.error('❌ Erreur getCurrentDatabase:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }

  // Obtenir le statut de connexion
  async getConnectionStatus(req, res) {
    try {
      const status = databaseSwitchService.getConnectionStatus();
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('❌ Erreur getConnectionStatus:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
}

module.exports = new DatabaseSwitchController();
