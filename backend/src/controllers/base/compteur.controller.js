const compteurService = require('../../services/base/compteur.service');

class CompteurController {
  /**
   * Récupérer tous les compteurs avec pagination
   */
  async getCompteurs(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || '',
        etat: req.query.etat !== undefined ? parseInt(req.query.etat) : undefined
      };

      const result = await compteurService.getAll(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[CompteurController.getCompteurs] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des compteurs',
        data: [],
        pagination: {}
      });
    }
  }

  /**
   * Récupérer un compteur par code
   */
  async getCompteur(req, res) {
    try {
      const { code } = req.params;
      const compteur = await compteurService.getByCode(code);

      res.json({
        success: true,
        data: compteur
      });
    } catch (error) {
      console.error('[CompteurController.getCompteur] Erreur:', error);

      const statusCode = error.message.includes('non trouvé') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mettre à jour un compteur
   */
  async updateCompteur(req, res) {
    try {
      const { code } = req.params;
      const result = await compteurService.update(code, req.body);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[CompteurController.updateCompteur] Erreur:', error);

      const statusCode = error.message.includes('non trouvé') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les statistiques des compteurs
   */
  async getCompteurStats(req, res) {
    try {
      const stats = await compteurService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[CompteurController.getCompteurStats] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new CompteurController();















