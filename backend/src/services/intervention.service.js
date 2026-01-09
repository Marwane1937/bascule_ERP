const interventionModel = require('../models/intervention/intervention.model');
const interventionDetailModel = require('../models/intervention/intervention-detail.model');
const PDFExtractionService = require('./pdf-extraction.service');

class InterventionService {
  /**
   * Récupérer toutes les interventions
   */
  async getAll(options = {}) {
    try {
      return await interventionModel.getAllInterventions(options);
    } catch (error) {
      console.error('[InterventionService.getAll] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer une intervention par ID
   */
  async getById(id) {
    try {
      const intervention = await interventionModel.getInterventionById(id);
      if (intervention) {
      }
      return intervention;
    } catch (error) {
      console.error('[InterventionService.getById] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle intervention
   */
  async create(data) {
    try {
      // Adapter les données pour correspondre à la structure existante
      const adaptedData = {
        numero: data.numero,
        date: data.date,
        employe_id: data.employe_id || data.technicien_id,
        part_id: data.part_id || data.client_id,
        description: data.description,
        etat: data.etat || data.statut,
        type: data.type || 'MAINTENANCE',
        details: data.details || []
      };

      return await interventionModel.createIntervention(adaptedData);
    } catch (error) {
      console.error('[InterventionService.create] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer une intervention depuis un PDF Telegram
   */
  async createFromTelegramPDF(telegramUserId, pdfBuffer) {
    try {
      console.log('[InterventionService.createFromTelegramPDF] Début traitement');

      // Extraire le texte du PDF
      const pdfText = await PDFExtractionService.extractTextFromPDF(pdfBuffer);
      console.log('[InterventionService.createFromTelegramPDF] Texte extrait:', pdfText.substring(0, 200) + '...');

      // Parser les données
      const parsedData = PDFExtractionService.parseInterventionData(pdfText);
      console.log('[InterventionService.createFromTelegramPDF] Données parsées:', parsedData);

      // Valider les données
      const validation = PDFExtractionService.validateExtractedData(parsedData);
      if (!validation.isValid) {
        throw new Error(`Données invalides: ${validation.errors.join(', ')}`);
      }

      // Créer l'intervention
      const result = await interventionModel.createInterventionFromTelegram(telegramUserId, pdfText);
      console.log('[InterventionService.createFromTelegramPDF] Intervention créée:', result);

      return result;

    } catch (error) {
      console.error('[InterventionService.createFromTelegramPDF] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une intervention
   */
  async update(id, data) {
    try {
      return await interventionModel.updateIntervention(id, data);
    } catch (error) {
      console.error('[InterventionService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer une intervention
   */
  async delete(id) {
    try {
      return await interventionModel.deleteIntervention(id);
    } catch (error) {
      console.error('[InterventionService.delete] Erreur:', error);
      throw error;
    }
  }

  /**
   * Ajouter un détail à une intervention
   */
  async addDetail(interventionId, detailData) {
    try {
      return await interventionDetailModel.addInterventionDetail(interventionId, detailData);
    } catch (error) {
      console.error('[InterventionService.addDetail] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un détail d'intervention
   */
  async updateDetail(id, detailData) {
    try {
      return await interventionDetailModel.updateInterventionDetail(id, detailData);
    } catch (error) {
      console.error('[InterventionService.updateDetail] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer un détail d'intervention
   */
  async deleteDetail(id) {
    try {
      return await interventionDetailModel.deleteInterventionDetail(id);
    } catch (error) {
      console.error('[InterventionService.deleteDetail] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des interventions
   */
  async getStats(options = {}) {
    try {
      const interventions = await this.getAll(options);

      const stats = {
        total_interventions: interventions.pagination.total,
        interventions_terminees: 0,
        interventions_en_cours: 0,
        total_revenus: 0,
        reparations_moyennes: 0
      };

      interventions.data.forEach(intervention => {
        if (intervention.statut === 'TERMINEE') {
          stats.interventions_terminees++;
        } else if (intervention.statut === 'EN_COURS') {
          stats.interventions_en_cours++;
        }

        stats.total_revenus += parseFloat(intervention.total_cout) || 0;
      });

      if (stats.total_interventions > 0) {
        stats.reparations_moyennes = stats.total_revenus / stats.total_interventions;
      }

      return stats;
    } catch (error) {
      console.error('[InterventionService.getStats] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new InterventionService();
