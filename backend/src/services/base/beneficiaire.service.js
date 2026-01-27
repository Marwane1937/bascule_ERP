const beneficiaireModel = require('../../models/base/beneficiaire.model');

class BeneficiaireService {
  /**
   * Récupérer tous les bénéficiaires
   */
  async getAll(options = {}) {
    try {
      return await beneficiaireModel.getAllBeneficiaires(options);
    } catch (error) {
      console.error('[BeneficiaireService.getAll] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer un bénéficiaire par ID
   */
  async getById(id) {
    try {
      const beneficiaireId = parseInt(id, 10);
      if (isNaN(beneficiaireId)) {
        throw new Error('ID de bénéficiaire invalide');
      }

      const beneficiaire = await beneficiaireModel.getBeneficiaireById(beneficiaireId);
      if (!beneficiaire) {
        throw new Error('Bénéficiaire non trouvé');
      }

      return beneficiaire;
    } catch (error) {
      console.error('[BeneficiaireService.getById] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau bénéficiaire
   */
  async create(data) {
    try {
      // Validation des données
      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà
      const existingBeneficiaire = await this.checkCodeExists(data.code);
      if (existingBeneficiaire) {
        throw new Error('Un bénéficiaire avec ce code existe déjà');
      }

      // Vérifier si le département existe (si fourni)
      if (data.departement_id) {
        const departementExists = await this.checkDepartementExists(data.departement_id);
        if (!departementExists) {
          throw new Error('Département spécifié n\'existe pas');
        }
      }

      return await beneficiaireModel.createBeneficiaire(data);
    } catch (error) {
      console.error('[BeneficiaireService.create] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un bénéficiaire
   */
  async update(id, data) {
    try {
      const beneficiaireId = parseInt(id, 10);
      if (isNaN(beneficiaireId)) {
        throw new Error('ID de bénéficiaire invalide');
      }

      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà pour un autre bénéficiaire
      const existingBeneficiaire = await this.checkCodeExists(data.code, beneficiaireId);
      if (existingBeneficiaire) {
        throw new Error('Un bénéficiaire avec ce code existe déjà');
      }

      // Vérifier si le département existe (si fourni)
      if (data.departement_id) {
        const departementExists = await this.checkDepartementExists(data.departement_id);
        if (!departementExists) {
          throw new Error('Département spécifié n\'existe pas');
        }
      }

      return await beneficiaireModel.updateBeneficiaire(beneficiaireId, data);
    } catch (error) {
      console.error('[BeneficiaireService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer un bénéficiaire
   */
  async delete(id) {
    try {
      const beneficiaireId = parseInt(id, 10);
      if (isNaN(beneficiaireId)) {
        throw new Error('ID de bénéficiaire invalide');
      }

      // TODO: Vérifier les dépendances avant suppression
      // (par exemple, si le bénéficiaire est utilisé dans des règlements)

      return await beneficiaireModel.deleteBeneficiaire(beneficiaireId);
    } catch (error) {
      console.error('[BeneficiaireService.delete] Erreur:', error);
      throw error;
    }
  }

  /**
   * Vérifier si un code existe déjà
   */
  async checkCodeExists(code, excludeId = null) {
    try {
      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      let query = 'SELECT id FROM beneficiaire WHERE code = :code';
      const replacements = { code };

      if (excludeId) {
        query += ' AND id != :excludeId';
        replacements.excludeId = excludeId;
      }

      const results = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      return results.length > 0;
    } catch (error) {
      console.error('[BeneficiaireService.checkCodeExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Vérifier si un département existe
   */
  async checkDepartementExists(departementId) {
    try {
      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      const query = 'SELECT id FROM departement WHERE id = :id AND etat = 1';
      const results = await sequelize.query(query, {
        replacements: { id: departementId },
        type: sequelize.QueryTypes.SELECT
      });

      return results.length > 0;
    } catch (error) {
      console.error('[BeneficiaireService.checkDepartementExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les bénéficiaires par département
   */
  async getByDepartement(departementId) {
    try {
      const departementIdNum = parseInt(departementId, 10);
      if (isNaN(departementIdNum)) {
        throw new Error('ID de département invalide');
      }

      return await beneficiaireModel.getBeneficiairesByDepartement(departementIdNum);
    } catch (error) {
      console.error('[BeneficiaireService.getByDepartement] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des bénéficiaires
   */
  async getStats() {
    try {
      const result = await this.getAll();
      const beneficiaires = result.data;

      const stats = {
        total: beneficiaires.length,
        par_departement: {}
      };

      // Compter par département
      beneficiaires.forEach(beneficiaire => {
        const dept = beneficiaire.departement_nom || 'Non assigné';
        stats.par_departement[dept] = (stats.par_departement[dept] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('[BeneficiaireService.getStats] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new BeneficiaireService();














