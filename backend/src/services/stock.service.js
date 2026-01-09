const stockModel = require('../models/stock/stock.model');
const stockDocumentModel = require('../models/stock/stock-document.model');

/**
 * Service pour la gestion du stock
 */
class StockService {
  /**
   * Récupérer les achats non encore entrés en stock
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
   * Récupérer les détails d'un achat pour entrée en stock
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
   * Récupérer les ventes facturées non encore sorties du stock
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
   * Récupérer les détails d'une vente pour sortie de stock
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
   * Récupérer les articles avec leur stock
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
   * Récupérer l'état détaillé du stock
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
   * Récupérer la fiche de stock pour un article
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
   * Récupérer le chiffre d'affaires par article
   */
  async getChiffreAffairesArticles(options = {}) {
    try {
      return await stockModel.getChiffreAffairesArticles(options);
    } catch (error) {
      console.error('[StockService.getChiffreAffairesArticles] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer tous les documents de stock
   */
  async getAllStockDocuments(options = {}) {
    try {
      return await stockDocumentModel.getAllStockDocuments(options);
    } catch (error) {
      console.error('[StockService.getAllStockDocuments] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer un document de stock par ID
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
   * Créer une entrée de stock depuis un achat
   */
  async createEntreeStockFromAchat(achatDocumentId, details, utilisateurId) {
    try {
      console.log('[StockService.createEntreeStockFromAchat] Appel du modèle:', { achatDocumentId, detailsLength: details?.length, utilisateurId });
      const result = await stockModel.createEntreeStockFromAchat(achatDocumentId, details, utilisateurId);
      console.log('[StockService.createEntreeStockFromAchat] Résultat du modèle:', result);
      return result;
    } catch (error) {
      console.error('[StockService.createEntreeStockFromAchat] Erreur:', error);
      console.error('[StockService.createEntreeStockFromAchat] Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Créer une sortie de stock depuis une vente
   */
  async createSortieStockFromVente(venteDocumentId, details, utilisateurId) {
    try {
      console.log('[StockService.createSortieStockFromVente] Appel du modèle:', { venteDocumentId, detailsLength: details?.length, utilisateurId });
      const result = await stockModel.createSortieStockFromVente(venteDocumentId, details, utilisateurId);
      console.log('[StockService.createSortieStockFromVente] Résultat du modèle:', result);
      return result;
    } catch (error) {
      console.error('[StockService.createSortieStockFromVente] Erreur:', error);
      console.error('[StockService.createSortieStockFromVente] Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Créer une sortie de stock
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
   * Créer un inventaire
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

