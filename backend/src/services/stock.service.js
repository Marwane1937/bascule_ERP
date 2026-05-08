const stockModel = require('../models/stock/stock.model');
const stockDocumentModel = require('../models/stock/stock-document.model');

/**
 * Service pour la gestion du stock
 */
class StockService {
  /**
   * RÃ©cupÃ©rer les achats non encore entrÃ©s en stock
   */
  async getAchatsNonEntresStock(options = {}) {
    try {
      return await stockModel.getAchatsNonEntresStock(options);
    } catch (error) {
      console.error('[StockService.getAchatsNonEntresStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer les dÃ©tails d'un achat pour entrÃ©e en stock
   */
  async getAchatDetailsForStock(achatDocumentId) {
    try {
      return await stockModel.getAchatDetailsForStock(achatDocumentId);
    } catch (error) {
      console.error('[StockService.getAchatDetailsForStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer les ventes facturÃ©es non encore sorties du stock
   */
  async getVentesNonSortiesStock(options = {}) {
    try {
      return await stockModel.getVentesNonSortiesStock(options);
    } catch (error) {
      console.error('[StockService.getVentesNonSortiesStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer les dÃ©tails d'une vente pour sortie de stock
   */
  async getVenteDetailsForStock(venteDocumentId) {
    try {
      return await stockModel.getVenteDetailsForStock(venteDocumentId);
    } catch (error) {
      console.error('[StockService.getVenteDetailsForStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer les articles avec leur stock
   */
  async getArticlesStock(options = {}) {
    try {
      return await stockModel.getArticlesStock(options);
    } catch (error) {
      console.error('[StockService.getArticlesStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer l'Ã©tat dÃ©taillÃ© du stock
   */
  async getEtatStock(options = {}) {
    try {
      return await stockModel.getEtatStock(options);
    } catch (error) {
      console.error('[StockService.getEtatStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer la fiche de stock pour un article
   */
  async getFicheStock(articleId, options = {}) {
    try {
      return await stockModel.getFicheStock(articleId, options);
    } catch (error) {
      console.error('[StockService.getFicheStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer le chiffre d'affaires par article
   */
  async getChiffreAffairesArticles(options = {}) {
    try {
      return await stockModel.getChiffreAffairesArticles(options);
    } catch (error) {
      console.error('[StockService.getChiffreAffairesArticles] Erreur:', error);
      throw error;
    }
  }

  async getEntrepotResume() {
    try {
      return await stockModel.getEntrepotResume();
    } catch (error) {
      console.error('[StockService.getEntrepotResume] Erreur:', error);
      throw error;
    }
  }

  async getEntrepotDetails(depotId) {
    try {
      return await stockModel.getEntrepotDetails(depotId);
    } catch (error) {
      console.error('[StockService.getEntrepotDetails] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer tous les documents de stock
   */
  async getAllStockDocuments(options = {}) {
    try {
      return await stockDocumentModel.getAllStockDocuments(options);
    } catch (error) {
      console.error('[StockService.getAllStockDocuments] Erreur:', error);
      throw error;
    }
  }

  async getPreparations(options = {}, sequelizeConnection = null) {
    try {
      return await stockModel.getPreparations(options, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.getPreparations] Erreur:', error);
      throw error;
    }
  }

  async getNextPreparationNumero(sequelizeConnection = null) {
    try {
      return await stockModel.getNextPreparationNumero(sequelizeConnection);
    } catch (error) {
      console.error('[StockService.getNextPreparationNumero] Erreur:', error);
      throw error;
    }
  }

  async getPreparationById(preparationId, sequelizeConnection = null) {
    try {
      return await stockModel.getPreparationById(preparationId, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.getPreparationById] Erreur:', error);
      throw error;
    }
  }

  async searchPreparationArticles(term, sequelizeConnection = null) {
    try {
      return await stockModel.searchPreparationArticles(term, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.searchPreparationArticles] Erreur:', error);
      throw error;
    }
  }

  async updatePreparationHeader(preparationId, payload, sequelizeConnection = null) {
    try {
      return await stockModel.updatePreparationHeader(preparationId, payload, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.updatePreparationHeader] Erreur:', error);
      throw error;
    }
  }

  async savePreparationLines(preparationId, lines, utilisateurId, sequelizeConnection = null) {
    try {
      return await stockModel.savePreparationLines(preparationId, lines, utilisateurId, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.savePreparationLines] Erreur:', error);
      throw error;
    }
  }

  async getCommandesDisponiblesPourPreparation(sequelizeConnection = null) {
    try {
      return await stockModel.getCommandesDisponiblesPourPreparation(sequelizeConnection);
    } catch (error) {
      console.error('[StockService.getCommandesDisponiblesPourPreparation] Erreur:', error);
      throw error;
    }
  }

  async createPreparation(payload, utilisateurId, sequelizeConnection = null) {
    try {
      return await stockModel.createPreparation(payload, utilisateurId, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.createPreparation] Erreur:', error);
      throw error;
    }
  }

  async transfererPreparationVersLivraison(preparationId, utilisateurId, sequelizeConnection = null) {
    try {
      return await stockModel.transfererPreparationVersLivraison(preparationId, utilisateurId, sequelizeConnection);
    } catch (error) {
      console.error('[StockService.transfererPreparationVersLivraison] Erreur:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ©rer un document de stock par ID
   */
  async getStockDocumentById(id) {
    try {
      const document = await stockDocumentModel.getStockDocumentById(id);
      if (document) {
        const details = await stockDocumentModel.getStockDocumentDetails(id);
        return {
          ...document,
          details: details
        };
      }
      return null;
    } catch (error) {
      console.error('[StockService.getStockDocumentById] Erreur:', error);
      throw error;
    }
  }

  /**
   * CrÃ©er une entrÃ©e de stock depuis un achat
   */
  async createEntreeStockFromAchat(achatDocumentId, details, utilisateurId) {
    try {
      console.log('[StockService.createEntreeStockFromAchat] Appel du modÃ¨le:', { achatDocumentId, detailsLength: details?.length, utilisateurId });
      const result = await stockModel.createEntreeStockFromAchat(achatDocumentId, details, utilisateurId);
      console.log('[StockService.createEntreeStockFromAchat] RÃ©sultat du modÃ¨le:', result);
      return result;
    } catch (error) {
      console.error('[StockService.createEntreeStockFromAchat] Erreur:', error);
      console.error('[StockService.createEntreeStockFromAchat] Stack:', error.stack);
      throw error;
    }
  }

  /**
   * CrÃ©er une sortie de stock depuis une vente
   */
  async createSortieStockFromVente(venteDocumentId, details, utilisateurId) {
    try {
      console.log('[StockService.createSortieStockFromVente] Appel du modÃ¨le:', { venteDocumentId, detailsLength: details?.length, utilisateurId });
      const result = await stockModel.createSortieStockFromVente(venteDocumentId, details, utilisateurId);
      console.log('[StockService.createSortieStockFromVente] RÃ©sultat du modÃ¨le:', result);
      return result;
    } catch (error) {
      console.error('[StockService.createSortieStockFromVente] Erreur:', error);
      console.error('[StockService.createSortieStockFromVente] Stack:', error.stack);
      throw error;
    }
  }

  /**
   * CrÃ©er une sortie de stock
   */
  async createSortieStock(details, description, utilisateurId) {
    try {
      return await stockModel.createSortieStock(details, description, utilisateurId);
    } catch (error) {
      console.error('[StockService.createSortieStock] Erreur:', error);
      throw error;
    }
  }

  /**
   * CrÃ©er un inventaire
   */
  async createInventaire(inventaireData, description, utilisateurId) {
    try {
      return await stockModel.createInventaire(inventaireData, description, utilisateurId);
    } catch (error) {
      console.error('[StockService.createInventaire] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new StockService();


