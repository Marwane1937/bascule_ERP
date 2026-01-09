const departementService = require('../../services/base/departement.service');

class DepartementController {
  /**
   * Récupérer tous les départements avec pagination
   */
  async getDepartements(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || '',
        etat: req.query.etat !== undefined ? parseInt(req.query.etat) : undefined,
        typ: req.query.typ || undefined
      };

      const result = await departementService.getAll(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[DepartementController.getDepartements] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des départements',
        data: [],
        pagination: {}
      });
    }
  }

  /**
   * Récupérer un département par ID
   */
  async getDepartement(req, res) {
    try {
      const { id } = req.params;
      const departement = await departementService.getById(id);

      res.json({
        success: true,
        data: departement
      });
    } catch (error) {
      console.error('[DepartementController.getDepartement] Erreur:', error);

      const statusCode = error.message.includes('non trouvé') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Créer un nouveau département
   */
  async createDepartement(req, res) {
    try {
      const departementData = {
        ...req.body,
        user_id: req.user?.id || null
      };

      const result = await departementService.create(departementData);

      res.status(201).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('[DepartementController.createDepartement] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ||
                        error.message.includes('circulaire') ||
                        error.message.includes('n\'existe pas') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mettre à jour un département
   */
  async updateDepartement(req, res) {
    try {
      const { id } = req.params;
      const result = await departementService.update(id, req.body);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[DepartementController.updateDepartement] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ||
                        error.message.includes('circulaire') ||
                        error.message.includes('n\'existe pas') ? 409 :
                        error.message.includes('non trouvé') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Supprimer un département
   */
  async deleteDepartement(req, res) {
    try {
      const { id } = req.params;
      const result = await departementService.delete(id);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[DepartementController.deleteDepartement] Erreur:', error);

      const statusCode = error.message.includes('non trouvé') ? 404 :
                        error.message.includes('Impossible') ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer la hiérarchie des départements
   */
  async getDepartementHierarchy(req, res) {
    try {
      const hierarchy = await departementService.getHierarchy();

      res.json({
        success: true,
        data: hierarchy
      });
    } catch (error) {
      console.error('[DepartementController.getDepartementHierarchy] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les statistiques des départements
   */
  async getDepartementStats(req, res) {
    try {
      const stats = await departementService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[DepartementController.getDepartementStats] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new DepartementController();





