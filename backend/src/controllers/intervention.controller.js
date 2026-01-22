const interventionService = require('../services/intervention.service');
const PDFExtractionService = require('../services/pdf-extraction.service');
const listesModel = require('../models/listes.model');
const employeModel = require('../models/base/employe.model');
const { getConnection } = require('../config/database');
const { genererInterventionPDF } = require('../services/caisse-pdf.service');
const documentSocieteModel = require('../models/document_societe.model');
const telegramService = require('../services/telegram.service'); // Import du service Telegram

class InterventionController {
  /**
   * Récupérer toutes les interventions
   */
  async getInterventions(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'date_intervention',
        orderDirection: req.query.orderDirection || 'DESC',
        search: req.query.search || '',
        statut: req.query.statut || null,
        technicien_id: req.query.technicien_id || null,
        client_id: req.query.client_id || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null
      };

      const result = await interventionService.getAll(options);
      res.json(result);
    } catch (error) {
      console.error('[getInterventions] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Récupérer une intervention par ID
   */
  async getIntervention(req, res) {
    try {
      const { id } = req.params;
      const interventionId = parseInt(id, 10);

      if (isNaN(interventionId)) {
        return res.status(400).json({ message: 'ID d\'intervention invalide' });
      }

      const intervention = await interventionService.getById(interventionId);
      if (!intervention) {
        return res.status(404).json({ message: 'Intervention non trouvée' });
      }

      res.json(intervention);
    } catch (error) {
      console.error('[getIntervention] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Créer une nouvelle intervention
   */
  async createIntervention(req, res) {
    try {
      const interventionData = req.body;

      // Validation des données requises
      if (!interventionData.employe_id && !interventionData.technicien_id) {
        return res.status(400).json({
          message: 'Employé (technicien) est requis'
        });
      }

      if (!interventionData.part_id && !interventionData.client_id) {
        return res.status(400).json({
          message: 'Partenaire (client) est requis'
        });
      }

      const result = await interventionService.create(interventionData);
      res.status(201).json(result);
    } catch (error) {
      console.error('[createIntervention] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Mettre à jour une intervention
   */
  async updateIntervention(req, res) {
    try {
      const { id } = req.params;
      const interventionId = parseInt(id, 10);
      const updateData = req.body;

      if (isNaN(interventionId)) {
        return res.status(400).json({ message: 'ID d\'intervention invalide' });
      }

      const result = await interventionService.update(interventionId, updateData);
      res.json(result);
    } catch (error) {
      console.error('[updateIntervention] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Supprimer une intervention
   */
  async deleteIntervention(req, res) {
    try {
      const { id } = req.params;
      const interventionId = parseInt(id, 10);

      if (isNaN(interventionId)) {
        return res.status(400).json({ message: 'ID d\'intervention invalide' });
      }

      const result = await interventionService.delete(interventionId);
      res.json(result);
    } catch (error) {
      console.error('[deleteIntervention] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Ajouter un détail à une intervention
   */
  async addInterventionDetail(req, res) {
    try {
      const { id } = req.params;
      const interventionId = parseInt(id, 10);
      const detailData = req.body;

      if (isNaN(interventionId)) {
        return res.status(400).json({ message: 'ID d\'intervention invalide' });
      }

      if (!detailData.description_reparation) {
        return res.status(400).json({ message: 'Description de réparation requise' });
      }

      const result = await interventionService.addDetail(interventionId, detailData);
      res.status(201).json(result);
    } catch (error) {
      console.error('[addInterventionDetail] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Mettre à jour un détail d'intervention
   */
  async updateInterventionDetail(req, res) {
    try {
      const { detailId } = req.params;
      const detailIdNum = parseInt(detailId, 10);
      const detailData = req.body;

      if (isNaN(detailIdNum)) {
        return res.status(400).json({ message: 'ID de détail invalide' });
      }

      const result = await interventionService.updateDetail(detailIdNum, detailData);
      res.json(result);
    } catch (error) {
      console.error('[updateInterventionDetail] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Supprimer un détail d'intervention
   */
  async deleteInterventionDetail(req, res) {
    try {
      const { detailId } = req.params;
      const detailIdNum = parseInt(detailId, 10);

      if (isNaN(detailIdNum)) {
        return res.status(400).json({ message: 'ID de détail invalide' });
      }

      const result = await interventionService.deleteDetail(detailIdNum);
      res.json(result);
    } catch (error) {
      console.error('[deleteInterventionDetail] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Récupérer la liste des clients pour autocomplete
   */
  async getClients(req, res) {
    try {
      const sequelize = getConnection();
      const query = `
        SELECT part_id, nom
        FROM partenaire
        WHERE type = 1 AND etat = 1
        ORDER BY nom ASC
      `;

      const clients = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT
      });

      res.json(Array.isArray(clients) ? clients : []);
    } catch (error) {
      console.error('[getClients] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Récupérer la liste des employés (techniciens) pour autocomplete
   */
  async getEmployes(req, res) {
    try {
      const employes = await employeModel.getAllEmployes();
      const formattedEmployes = employes.map(emp => ({
        id: emp.id,
        nom: `${emp.prenom} ${emp.nom}`.trim()
      }));
      res.json(formattedEmployes);
    } catch (error) {
      console.error('[getEmployes] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Récupérer la liste des rubriques pour les interventions
   */
  async getRubriques(req, res) {
    try {
      const rubriques = await listesModel.getListesByGroupId(5000);
      res.json(rubriques);
    } catch (error) {
      console.error('[getRubriques] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Créer une intervention avec ses détails en une seule requête
   */
  async createInterventionWithDetails(req, res) {
    try {
      const { date, part_id, employe_id, rubriques } = req.body;

      // Validation des données requises
      if (!date) {
        return res.status(400).json({ message: 'La date est requise' });
      }

      if (!part_id) {
        return res.status(400).json({ message: 'Le client est requis' });
      }

      if (!employe_id) {
        return res.status(400).json({ message: 'Le technicien est requis' });
      }

      if (!rubriques || !Array.isArray(rubriques) || rubriques.length === 0) {
        return res.status(400).json({ message: 'Au moins une rubrique est requise' });
      }

      // Créer l'intervention avec les détails
      const interventionData = {
        date: date,
        employe_id: employe_id,
        part_id: part_id,
        description: 'Intervention créée via formulaire technicien',
        etat: 1, // EN_COURS = 1 (int)
        type: 1, // MAINTENANCE = 1 (int)
        details: rubriques.map(rubrique => ({
          rubrique_id: rubrique.rubrique_id,
          quantite: rubrique.quantite,
          prix: rubrique.prix,
          description: rubrique.description || `Rubrique: ${rubrique.nom || ''}`,
          taux_tva: 20,
          remise: 0,
          ligne: rubriques.indexOf(rubrique) + 1
        }))
      };

      const result = await interventionService.create(interventionData);
      res.status(201).json(result);
    } catch (error) {
      console.error('[createInterventionWithDetails] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Webhook pour recevoir les PDFs depuis Telegram
   */
  async handleTelegramWebhook(req, res) {
    try {
      console.log('[handleTelegramWebhook] Requête reçue:', req.body);

      const { message } = req.body;

      if (!message || !message.document) {
        console.log('[handleTelegramWebhook] Message invalide - pas de document');
        return res.status(400).json({
          success: false,
          message: 'Message Telegram invalide ou pas de document'
        });
      }

      // Vérifier que c'est un PDF
      if (message.document.mime_type !== 'application/pdf') {
        console.log('[handleTelegramWebhook] Document pas PDF:', message.document.mime_type);
        await this.sendTelegramMessage(message.chat.id, '❌ Veuillez envoyer un fichier PDF uniquement.');
        return res.json({ success: false, message: 'Document pas PDF' });
      }

      console.log('[handleTelegramWebhook] Traitement du PDF...');

      // Télécharger le PDF depuis Telegram
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${message.document.file_path}`;

      try {
        const axios = require('axios');
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

        console.log('[handleTelegramWebhook] PDF téléchargé, taille:', response.data.length);
        // Traiter le PDF
        const result = await interventionService.createFromTelegramPDF(
          message.from.id,
          response.data
        );

        console.log('[handleTelegramWebhook] Intervention créée:', result);

        // Envoyer confirmation au technicien
        const successMessage = `✅ Intervention ${result.numero} créée avec succès!\n\n` +
                              `📅 Date: ${new Date().toLocaleDateString('fr-FR')}\n` +
                              `🔧 ${result.details ? result.details.length : 0} réparation(s) enregistrée(s)`;

        await this.sendTelegramMessage(message.chat.id, successMessage);

        res.json({
          success: true,
          message: 'Intervention créée avec succès',
          intervention: result
        });

      } catch (pdfError) {
        console.error('[handleTelegramWebhook] Erreur traitement PDF:', pdfError);

        let errorMessage = '❌ Erreur lors du traitement du PDF.';
        if (pdfError.message.includes('Technicien non trouvé')) {
          errorMessage += '\n\n💡 Vérifiez que votre compte Telegram est lié à votre profil employé.';
        } else if (pdfError.message.includes('Client')) {
          errorMessage += '\n\n💡 Vérifiez que le nom du client dans le PDF est correct.';
        }

        await this.sendTelegramMessage(message.chat.id, errorMessage);
        res.status(400).json({ success: false, message: pdfError.message });
      }

    } catch (error) {
      console.error('[handleTelegramWebhook] Erreur générale:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Envoyer un message via Telegram
   */
  async sendTelegramMessage(chatId, text) {
    try {
      const axios = require('axios');
      const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

      await axios.post(telegramUrl, {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      });

      console.log('[sendTelegramMessage] Message envoyé à chat:', chatId);
    } catch (error) {
      console.error('[sendTelegramMessage] Erreur envoi message:', error);
    }
  }

  /**
   * Imprimer le PDF de fiche de déplacement
   */
  async printInterventionPDF(req, res) {
    try {
      const { id } = req.params;
      const interventionId = parseInt(id, 10);

      if (isNaN(interventionId)) {
        return res.status(400).json({ message: 'ID d\'intervention invalide' });
      }

      console.log(`[printInterventionPDF] Attempting to fetch intervention details for ID: ${interventionId}`);
      const interventionDetails = await interventionService.getById(interventionId);
      if (!interventionDetails) {
        console.error(`[printInterventionPDF] Intervention with ID ${interventionId} not found.`);
        return res.status(404).json({ message: 'Intervention non trouvée' });
      }
      console.log(`[printInterventionPDF] Intervention details fetched: ${JSON.stringify(interventionDetails)}`);

      let employeTelegramId = null;
      if (interventionDetails.employe_id) {
        console.log(`[printInterventionPDF] Attempting to fetch technician details for employe_id: ${interventionDetails.employe_id}`);
        const technician = await employeModel.getEmployeById(interventionDetails.employe_id);
        if (technician && technician.telegram_id) {
          employeTelegramId = technician.telegram_id;
          console.log(`[printInterventionPDF] Technician Telegram ID found: ${employeTelegramId}`);
        } else {
          console.warn(`[printInterventionPDF] Technician Telegram ID not found for employe_id: ${interventionDetails.employe_id}`);
        }
      } else {
        console.warn('[printInterventionPDF] No employe_id found in intervention details.');
      }

      // Récupérer les informations depuis le fichier JSON de configuration
      const pdfConfigService = require('../services/pdf-config.service');
      const documentSociete = pdfConfigService.getDocumentSociete();
      console.log('[printInterventionPDF] Document societe details fetched from config.');

      console.log(`[printInterventionPDF] Attempting to generate PDF for intervention ID: ${interventionId}, Telegram: ${!!employeTelegramId}`);
      const pdfBuffer = await genererInterventionPDF(interventionId, {
        documentSociete,
        sendToTelegram: !!employeTelegramId,
        employe_telegram_id: employeTelegramId
      });
      console.log('[printInterventionPDF] PDF generated successfully.');

      // Envoyer le PDF avec les bons headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=fiche-deplacement-intervention-${interventionId}.pdf`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Envoyer le buffer directement
      res.send(pdfBuffer);

    } catch (error) {
      console.error('[printInterventionPDF] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Test de génération PDF (pour debug)
   */
  async testPDF(req, res) {
    try {
      // Créer une intervention de test temporaire
      const { getConnection } = require('../config/database');
      const sequelize = getConnection();

      // Insérer une intervention temporaire
      const insertIntervention = `
        INSERT INTO intervention (date, employe_id, part_id, etat, cr_date)
        OUTPUT INSERTED.id
        VALUES (GETDATE(), 1, 1, 1, GETDATE())
      `;

      const [interventionResult] = await sequelize.query(insertIntervention, {
        type: sequelize.QueryTypes.SELECT,
        transaction: await sequelize.transaction()
      });

      const testInterventionId = interventionResult.id;

      // Insérer des détails de test
      const insertDetails = `
        INSERT INTO intervention_detail (intervention_id, rubrique_id, quantite, prix, ligne, cr_date)
        VALUES
        (${testInterventionId}, 1, 1, 150.00, 1, GETDATE()),
        (${testInterventionId}, 2, 2, 25.50, 2, GETDATE())
      `;

      await sequelize.query(insertDetails, { type: sequelize.QueryTypes.INSERT });

      // Récupérer les informations depuis le fichier JSON de configuration
      const pdfConfigService = require('../services/pdf-config.service');
      const documentSociete = pdfConfigService.getDocumentSociete();

      const { genererInterventionPDF } = require('../services/caisse-pdf.service');
      const pdfPath = await genererInterventionPDF(testInterventionId, { documentSociete });

      // Supprimer l'intervention de test
      await sequelize.query('DELETE FROM intervention_detail WHERE intervention_id = :id', {
        replacements: { id: testInterventionId }
      });
      await sequelize.query('DELETE FROM intervention WHERE id = :id', {
        replacements: { id: testInterventionId }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=test-intervention.pdf');

      const fs = require('fs');
      const pdfBuffer = fs.readFileSync(pdfPath);
      fs.unlinkSync(pdfPath);

      res.send(pdfBuffer);

    } catch (error) {
      console.error('[testPDF] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Récupérer les statistiques des interventions
   */
  async getInterventionStats(req, res) {
    try {
      const options = {
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null
      };

      const stats = await interventionService.getStats(options);
      res.json(stats);
    } catch (error) {
      console.error('[getInterventionStats] Erreur:', error);
      res.status(500).json({ message: error.message });
    }
  }
}

module.exports = new InterventionController();
