const Societe = require('../models/societe.model');
const DocumentSociete = require('../models/document_societe.model');
const databaseSwitchService = require('../services/database-switch.service');
const databaseInjector = require('../middleware/database-injector.middleware');

class SocieteController {
  // Récupérer toutes les sociétés avec leurs documents
  async getAllSocietes(req, res) {
    try {
      // Utiliser la connexion dynamique
      const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();

      // Récupérer les sociétés avec une requête SQL directe
      const [societes] = await sequelize.query(`
        SELECT id, nom, nom_base, actif
        FROM societes
        WHERE actif = 1
        ORDER BY nom ASC
      `, {
        type: sequelize.QueryTypes.SELECT
      });

      // Pour chaque société, récupérer son document si disponible
      const societesWithDocs = await Promise.all(
        (Array.isArray(societes) ? societes : [societes]).map(async (societe) => {
          const [documents] = await sequelize.query(`
            SELECT id, logo, entete, pied_page
            FROM document_societe
            WHERE societe_id = :societeId
          `, {
            replacements: { societeId: societe.id },
            type: sequelize.QueryTypes.SELECT
          });

          const documentSociete = documents && documents.length > 0 ? documents[0] : null;

          return {
            id: societe.id,
            nom: societe.nom,
            nom_base: societe.nom_base,
            actif: societe.actif,
            documentSociete: documentSociete ? {
              id: documentSociete.id,
              logo: documentSociete.logo ? documentSociete.logo.toString('base64') : null,
              entete: documentSociete.entete,
              pied_page: documentSociete.pied_page
            } : null
          };
        })
      );

      res.json({
        success: true,
        data: societesWithDocs,
        currentDatabase: req.currentSociete?.nom_base || 'Base par défaut'
      });
    } catch (error) {
      console.error('Erreur récupération sociétés:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer une société par ID
  async getSocieteById(req, res) {
    try {
      const { id } = req.params;
      const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();

      const [societes] = await sequelize.query(`
        SELECT id, nom, nom_base, actif
        FROM societes
        WHERE id = :id
      `, {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      if (!societes || societes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Société non trouvée'
        });
      }

      const societe = societes[0];

      // Récupérer le document de la société
      const [documents] = await sequelize.query(`
        SELECT id, logo, entete, pied_page
        FROM document_societe
        WHERE societe_id = :societeId
      `, {
        replacements: { societeId: societe.id },
        type: sequelize.QueryTypes.SELECT
      });

      const documentSociete = documents && documents.length > 0 ? documents[0] : null;

      res.json({
        success: true,
        data: {
          id: societe.id,
          nom: societe.nom,
          nom_base: societe.nom_base,
          actif: societe.actif,
          documentSociete: documentSociete ? {
            id: documentSociete.id,
            logo: documentSociete.logo ? documentSociete.logo.toString('base64') : null,
            entete: documentSociete.entete,
            pied_page: documentSociete.pied_page
          } : null
        }
      });
    } catch (error) {
      console.error('Erreur récupération société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Créer une nouvelle société
  async createSociete(req, res) {
    try {
      const { nom, nom_base } = req.body;

      if (!nom || !nom_base) {
        return res.status(400).json({
          success: false,
          message: 'Nom et nom_base sont requis'
        });
      }

      const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();

      const [result] = await sequelize.query(`
        INSERT INTO societes (nom, nom_base, actif, created_at, updated_at)
        OUTPUT INSERTED.*
        VALUES (:nom, :nom_base, 1, GETDATE(), GETDATE())
      `, {
        replacements: { nom, nom_base },
        type: sequelize.QueryTypes.INSERT
      });

      res.status(201).json({
        success: true,
        message: 'Société créée avec succès',
        data: result
      });
    } catch (error) {
      console.error('Erreur création société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Mettre à jour une société
  async updateSociete(req, res) {
    try {
      const { id } = req.params;
      const { nom, nom_base, actif } = req.body;

      const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();

      // Vérifier que la société existe
      const [existingRows] = await sequelize.query(`
        SELECT id, nom, nom_base, actif
        FROM societes
        WHERE id = :id
      `, {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Société non trouvée'
        });
      }

      await sequelize.query(`
        UPDATE societes
        SET nom = :nom, nom_base = :nom_base, actif = :actif, updated_at = GETDATE()
        WHERE id = :id
      `, {
        replacements: {
          id,
          nom: nom || existing.nom,
          nom_base: nom_base || existing.nom_base,
          actif: actif !== undefined ? actif : existing.actif
        }
      });

      res.json({
        success: true,
        message: 'Société mise à jour avec succès'
      });
    } catch (error) {
      console.error('Erreur mise à jour société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Supprimer une société
  async deleteSociete(req, res) {
    try {
      const { id } = req.params;

      const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();

      // Vérifier que la société existe
      const [existingRows] = await sequelize.query(`
        SELECT id FROM societes WHERE id = :id
      `, {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Société non trouvée'
        });
      }

      await sequelize.query(`
        DELETE FROM societes WHERE id = :id
      `, {
        replacements: { id }
      });

      res.json({
        success: true,
        message: 'Société supprimée avec succès'
      });
    } catch (error) {
      console.error('Erreur suppression société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer toutes les bases de données disponibles
  async getAvailableDatabases(req, res) {
    try {
      const { Sequelize, QueryTypes } = require('sequelize');
      const path = require('path');
      require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

      // Se connecter à la base master pour récupérer toutes les bases de l'instance
      const masterConnection = new Sequelize(
        'master',
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
          host: process.env.DB_HOST,
          dialect: 'mssql',
          dialectOptions: {
            options: {
              encrypt: false,
              trustServerCertificate: true,
              instanceName: process.env.DB_INSTANCE,
            }
          },
          logging: false
        }
      );

      // Récupérer toutes les bases de données de l'instance
      const result = await masterConnection.query(`
        SELECT name
        FROM sys.databases
        WHERE state_desc = 'ONLINE'
        ORDER BY name
      `, {
        type: QueryTypes.SELECT
      });

      await masterConnection.close();

      //console.log('[SocieteController] 🔍 Résultat brut de la requête:', result);
      //console.log('[SocieteController] Type:', typeof result);
      //console.log('[SocieteController] Is Array:', Array.isArray(result));

      // Gérer les différents formats de retour
      let databases = result;

      // Si c'est un tableau avec 2 éléments [results, metadata], prendre le premier
      if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
        databases = result[0];
      }
      // Si c'est directement un tableau de résultats
      else if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
        databases = result;
      }
      // Si c'est un objet unique
      else if (!Array.isArray(result) && typeof result === 'object' && result.name) {
        databases = [result];
      }

      // Extraire les noms des bases de données
      let databaseNames = [];
      if (Array.isArray(databases)) {
        databaseNames = databases.map(db => {
          if (typeof db === 'object' && db.name) {
            return db.name;
          }
          return db;
        });
      } else if (databases && typeof databases === 'object' && databases.name) {
        databaseNames = [databases.name];
      }

      // console.log(`[SocieteController] ✅ ${databaseNames.length} bases de données trouvées`);
      // console.log('[SocieteController] Bases:', databaseNames);

      // Convertir les noms de bases en format Societe pour le frontend
      const societes = databaseNames.map((dbName, index) => ({
        id: index + 1, // ID temporaire basé sur l'index
        nom: dbName,   // Nom de la base comme nom de société
        nom_base: dbName, // Nom de la base
        actif: true    // Toutes les bases sont actives
      }));

      res.json({
        success: true,
        data: societes
      });
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des bases:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Changer de base de données
  async switchDatabase(req, res) {
    try {
      // console.log('[SocieteController] 🔄 Requête switchDatabase reçue');
      // console.log('[SocieteController] Body:', JSON.stringify(req.body, null, 2));

      const { societe_id, database_name } = req.body;

      // Accepter soit societe_id soit database_name
      let databaseName = null;

      if (database_name) {
        // Si database_name est fourni directement, l'utiliser
        databaseName = database_name;
        //console.log('[SocieteController] Utilisation de database_name:', databaseName);
      } else if (societe_id) {
        // Si societe_id est fourni, récupérer la société depuis la base
        const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();

        const [societes] = await sequelize.query(`
          SELECT id, nom, nom_base, actif
          FROM societes
          WHERE id = :societe_id
        `, {
          replacements: { societe_id },
          type: sequelize.QueryTypes.SELECT
        });

        if (!societes || societes.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Société non trouvée'
          });
        }

        const societe = societes[0];
        databaseName = societe.nom_base;
        //  console.log('[SocieteController] Nom de base récupéré depuis société:', databaseName);
      } else {
        return res.status(400).json({
          success: false,
          message: 'ID de société ou nom de base de données requis'
        });
      }

      if (!databaseName) {
        return res.status(400).json({
          success: false,
          message: 'Nom de base de données requis'
        });
      }

      // Vérifier que la base de données est accessible
      //  console.log('[SocieteController] Test de connexion à:', databaseName);
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
          societe: {
            id: societe_id || null,
            nom: databaseName,
            nom_base: databaseName
          },
          requiresReauth: true,
          redirectToLogin: true
        }
      });
    } catch (error) {
      console.error('[SocieteController] ❌ Erreur changement de base de données:', error);
      res.status(500).json({
        success: false,
        message: `Erreur lors du changement de base de données: ${error.message}`
      });
    }
  }
}

module.exports = new SocieteController();


