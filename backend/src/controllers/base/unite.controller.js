const uniteService = require('../../services/base/unite.service');

class UniteController {
  /**
   * Récupérer toutes les unités avec pagination
   */
  async getUnites(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || '',
        etat: req.query.etat !== undefined ? parseInt(req.query.etat) : undefined,
        type: req.query.type || undefined,
        base: req.query.base !== undefined ? parseInt(req.query.base) : undefined,
        fact: req.query.fact !== undefined ? parseInt(req.query.fact) : undefined
      };

      const result = await uniteService.getAll(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[UniteController.getUnites] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des unités',
        data: [],
        pagination: {}
      });
    }
  }

  /**
   * Récupérer une unité par ID
   */
  async getUnite(req, res) {
    try {
      const { id } = req.params;
      const unite = await uniteService.getById(id);

      res.json({
        success: true,
        data: unite
      });
    } catch (error) {
      console.error('[UniteController.getUnite] Erreur:', error);

      const statusCode = error.message.includes('non trouvée') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Créer une nouvelle unité
   */
  async createUnite(req, res) {
    try {
      const uniteData = {
        ...req.body,
        user_id: req.user?.id || null
      };

      const result = await uniteService.create(uniteData);

      res.status(201).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('[UniteController.createUnite] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mettre à jour une unité
   */
  async updateUnite(req, res) {
    try {
      const { id } = req.params;
      const result = await uniteService.update(id, req.body);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[UniteController.updateUnite] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ? 409 :
                        error.message.includes('non trouvée') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Supprimer une unité
   */
  async deleteUnite(req, res) {
    try {
      const { id } = req.params;
      const result = await uniteService.delete(id);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[UniteController.deleteUnite] Erreur:', error);

      const statusCode = error.message.includes('non trouvée') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les unités par type
   */
  async getUnitesByType(req, res) {
    try {
      const { type } = req.params;
      const unites = await uniteService.getByType(type);

      res.json({
        success: true,
        data: unites
      });
    } catch (error) {
      console.error('[UniteController.getUnitesByType] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les unités de base
   */
  async getUnitesBase(req, res) {
    try {
      const unites = await uniteService.getUnitesBase();

      res.json({
        success: true,
        data: unites
      });
    } catch (error) {
      console.error('[UniteController.getUnitesBase] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Convertir une quantité d'une unité à une autre
   */
  async convertUnite(req, res) {
    try {
      const { quantity, fromUnitId, toUnitId } = req.body;

      if (!quantity || !fromUnitId || !toUnitId) {
        return res.status(400).json({
          success: false,
          message: 'Quantité, unité source et unité cible sont requises'
        });
      }

      const result = await uniteService.convertQuantity(quantity, fromUnitId, toUnitId);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[UniteController.convertUnite] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les statistiques des unités
   */
  async getUniteStats(req, res) {
    try {
      const stats = await uniteService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[UniteController.getUniteStats] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new UniteController();















