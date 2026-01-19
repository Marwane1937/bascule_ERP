const villeService = require('../../services/base/ville.service');

class VilleController {
  /**
   * Récupérer toutes les villes avec pagination
   */
  async getVilles(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || '',
        etat: req.query.etat !== undefined ? parseInt(req.query.etat) : undefined
      };

      const result = await villeService.getAll(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[VilleController.getVilles] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des villes',
        data: [],
        pagination: {}
      });
    }
  }

  /**
   * Récupérer une ville par ID
   */
  async getVille(req, res) {
    try {
      const { id } = req.params;
      const ville = await villeService.getById(id);

      res.json({
        success: true,
        data: ville
      });
    } catch (error) {
      console.error('[VilleController.getVille] Erreur:', error);

      const statusCode = error.message.includes('non trouvée') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Créer une nouvelle ville
   */
  async createVille(req, res) {
    try {
      const villeData = {
        ...req.body,
        user_id: req.user?.id || null
      };

      const result = await villeService.create(villeData);

      res.status(201).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('[VilleController.createVille] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mettre à jour une ville
   */
  async updateVille(req, res) {
    try {
      const { id } = req.params;
      const result = await villeService.update(id, req.body);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[VilleController.updateVille] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ? 409 :
                        error.message.includes('non trouvée') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Supprimer une ville
   */
  async deleteVille(req, res) {
    try {
      const { id } = req.params;
      const result = await villeService.delete(id);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[VilleController.deleteVille] Erreur:', error);

      const statusCode = error.message.includes('non trouvée') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les statistiques des villes
   */
  async getVilleStats(req, res) {
    try {
      const stats = await villeService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[VilleController.getVilleStats] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new VilleController();









