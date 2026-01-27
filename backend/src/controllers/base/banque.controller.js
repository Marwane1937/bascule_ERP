const banqueService = require('../../services/base/banque.service');

class BanqueController {
  /**
   * Récupérer toutes les banques avec pagination
   */
  async getBanques(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || '',
        etat: req.query.etat !== undefined ? parseInt(req.query.etat) : undefined,
        type: req.query.type || undefined
      };

      const result = await banqueService.getAll(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[BanqueController.getBanques] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des banques',
        data: [],
        pagination: {}
      });
    }
  }

  /**
   * Récupérer une banque par ID
   */
  async getBanque(req, res) {
    try {
      const { id } = req.params;
      const banque = await banqueService.getById(id);

      res.json({
        success: true,
        data: banque
      });
    } catch (error) {
      console.error('[BanqueController.getBanque] Erreur:', error);

      const statusCode = error.message.includes('non trouvée') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Créer une nouvelle banque
   */
  async createBanque(req, res) {
    try {
      const banqueData = {
        ...req.body,
        user_id: req.user?.id || null
      };

      const result = await banqueService.create(banqueData);

      res.status(201).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('[BanqueController.createBanque] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ||
                        error.message.includes('invalide') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mettre à jour une banque
   */
  async updateBanque(req, res) {
    try {
      const { id } = req.params;
      const result = await banqueService.update(id, req.body);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[BanqueController.updateBanque] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ||
                        error.message.includes('invalide') ? 409 :
                        error.message.includes('non trouvée') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Supprimer une banque
   */
  async deleteBanque(req, res) {
    try {
      const { id } = req.params;
      const result = await banqueService.delete(id);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[BanqueController.deleteBanque] Erreur:', error);

      const statusCode = error.message.includes('non trouvée') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les statistiques des banques
   */
  async getBanqueStats(req, res) {
    try {
      const stats = await banqueService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[BanqueController.getBanqueStats] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Rechercher une banque par SWIFT
   */
  async getBanqueBySwift(req, res) {
    try {
      const { swift } = req.params;

      if (!swift) {
        return res.status(400).json({
          success: false,
          message: 'Code SWIFT requis'
        });
      }

      const banque = await banqueService.getBySwift(swift);

      if (!banque) {
        return res.status(404).json({
          success: false,
          message: 'Banque non trouvée pour ce code SWIFT'
        });
      }

      res.json({
        success: true,
        data: banque
      });
    } catch (error) {
      console.error('[BanqueController.getBanqueBySwift] Erreur:', error);

      const statusCode = error.message.includes('invalide') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new BanqueController();














