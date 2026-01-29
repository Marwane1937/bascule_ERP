const beneficiaireService = require('../../services/base/beneficiaire.service');

class BeneficiaireController {
  /**
   * Récupérer tous les bénéficiaires avec pagination
   */
  async getBeneficiaires(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || '',
        departement_id: req.query.departement_id ? parseInt(req.query.departement_id) : undefined
      };

      const result = await beneficiaireService.getAll(options);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('[BeneficiaireController.getBeneficiaires] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des bénéficiaires',
        data: [],
        pagination: {}
      });
    }
  }

  /**
   * Récupérer un bénéficiaire par ID
   */
  async getBeneficiaire(req, res) {
    try {
      const { id } = req.params;
      const beneficiaire = await beneficiaireService.getById(id);

      res.json({
        success: true,
        data: beneficiaire
      });
    } catch (error) {
      console.error('[BeneficiaireController.getBeneficiaire] Erreur:', error);

      const statusCode = error.message.includes('non trouvé') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Créer un nouveau bénéficiaire
   */
  async createBeneficiaire(req, res) {
    try {
      const beneficiaireData = req.body;
      const result = await beneficiaireService.create(beneficiaireData);

      res.status(201).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('[BeneficiaireController.createBeneficiaire] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ||
                        error.message.includes('n\'existe pas') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mettre à jour un bénéficiaire
   */
  async updateBeneficiaire(req, res) {
    try {
      const { id } = req.params;
      const result = await beneficiaireService.update(id, req.body);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[BeneficiaireController.updateBeneficiaire] Erreur:', error);

      const statusCode = error.message.includes('existe déjà') ||
                        error.message.includes('n\'existe pas') ? 409 :
                        error.message.includes('non trouvé') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Supprimer un bénéficiaire
   */
  async deleteBeneficiaire(req, res) {
    try {
      const { id } = req.params;
      const result = await beneficiaireService.delete(id);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('[BeneficiaireController.deleteBeneficiaire] Erreur:', error);

      const statusCode = error.message.includes('non trouvé') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les bénéficiaires par département
   */
  async getBeneficiairesByDepartement(req, res) {
    try {
      const { departementId } = req.params;
      const beneficiaires = await beneficiaireService.getByDepartement(departementId);

      res.json({
        success: true,
        data: beneficiaires
      });
    } catch (error) {
      console.error('[BeneficiaireController.getBeneficiairesByDepartement] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Récupérer les statistiques des bénéficiaires
   */
  async getBeneficiaireStats(req, res) {
    try {
      const stats = await beneficiaireService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[BeneficiaireController.getBeneficiaireStats] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new BeneficiaireController();















