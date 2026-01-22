const departementModel = require('../../models/base/departement.model');

class DepartementService {
  /**
   * Récupérer tous les départements
   */
  async getAll(options = {}) {
    try {
      return await departementModel.getAllDepartements(options);
    } catch (error) {
      console.error('[DepartementService.getAll] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer un département par ID
   */
  async getById(id) {
    try {
      const departementId = parseInt(id, 10);
      if (isNaN(departementId)) {
        throw new Error('ID de département invalide');
      }

      const departement = await departementModel.getDepartementById(departementId);
      if (!departement) {
        throw new Error('Département non trouvé');
      }

      return departement;
    } catch (error) {
      console.error('[DepartementService.getById] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau département
   */
  async create(data) {
    try {
      // Validation des données
      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà
      const existingDepartement = await this.checkCodeExists(data.code);
      if (existingDepartement) {
        throw new Error('Un département avec ce code existe déjà');
      }

      // Vérifier la hiérarchie si parent spécifié
      if (data.parent) {
        const parentExists = await this.checkParentExists(data.parent);
        if (!parentExists) {
          throw new Error('Département parent spécifié n\'existe pas');
        }

        // Éviter les références circulaires
        if (await this.wouldCreateCircularReference(data.parent, null)) {
          throw new Error('Impossible de créer une référence circulaire dans la hiérarchie');
        }
      }

      return await departementModel.createDepartement(data);
    } catch (error) {
      console.error('[DepartementService.create] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un département
   */
  async update(id, data) {
    try {
      const departementId = parseInt(id, 10);
      if (isNaN(departementId)) {
        throw new Error('ID de département invalide');
      }

      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà pour un autre département
      const existingDepartement = await this.checkCodeExists(data.code, departementId);
      if (existingDepartement) {
        throw new Error('Un département avec ce code existe déjà');
      }

      // Vérifier la hiérarchie si parent spécifié
      if (data.parent) {
        const parentExists = await this.checkParentExists(data.parent);
        if (!parentExists) {
          throw new Error('Département parent spécifié n\'existe pas');
        }

        // Éviter les références circulaires
        if (await this.wouldCreateCircularReference(data.parent, departementId)) {
          throw new Error('Impossible de créer une référence circulaire dans la hiérarchie');
        }
      }

      return await departementModel.updateDepartement(departementId, data);
    } catch (error) {
      console.error('[DepartementService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer un département
   */
  async delete(id) {
    try {
      const departementId = parseInt(id, 10);
      if (isNaN(departementId)) {
        throw new Error('ID de département invalide');
      }

      // Vérifier s'il a des enfants
      const hasChildren = await this.hasChildren(departementId);
      if (hasChildren) {
        throw new Error('Impossible de supprimer un département qui a des sous-départements');
      }

      // Vérifier s'il a des bénéficiaires
      const hasBeneficiaires = await this.hasBeneficiaires(departementId);
      if (hasBeneficiaires) {
        throw new Error('Impossible de supprimer un département qui contient des bénéficiaires');
      }

      return await departementModel.deleteDepartement(departementId);
    } catch (error) {
      console.error('[DepartementService.delete] Erreur:', error);
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

      let query = 'SELECT id FROM departement WHERE code = :code';
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
      console.error('[DepartementService.checkCodeExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Vérifier si un parent existe
   */
  async checkParentExists(parentId) {
    try {
      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      const query = 'SELECT id FROM departement WHERE id = :id AND etat = 1';
      const results = await sequelize.query(query, {
        replacements: { id: parentId },
        type: sequelize.QueryTypes.SELECT
      });

      return results.length > 0;
    } catch (error) {
      console.error('[DepartementService.checkParentExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Vérifier si cela créerait une référence circulaire
   */
  async wouldCreateCircularReference(parentId, currentId) {
    try {
      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      // Remonter la hiérarchie pour vérifier les références circulaires
      let checkId = parentId;
      const visited = new Set();

      while (checkId && !visited.has(checkId)) {
        if (checkId === currentId) {
          return true; // Référence circulaire détectée
        }

        visited.add(checkId);

        const query = 'SELECT parent FROM departement WHERE id = :id';
        const results = await sequelize.query(query, {
          replacements: { id: checkId },
          type: sequelize.QueryTypes.SELECT
        });

        checkId = results.length > 0 ? results[0].parent : null;
      }

      return false;
    } catch (error) {
      console.error('[DepartementService.wouldCreateCircularReference] Erreur:', error);
      throw error;
    }
  }

  /**
   * Vérifier si le département a des enfants
   */
  async hasChildren(departementId) {
    try {
      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      const query = 'SELECT COUNT(*) as count FROM departement WHERE parent = :id';
      const results = await sequelize.query(query, {
        replacements: { id: departementId },
        type: sequelize.QueryTypes.SELECT
      });

      return results[0].count > 0;
    } catch (error) {
      console.error('[DepartementService.hasChildren] Erreur:', error);
      throw error;
    }
  }

  /**
   * Vérifier si le département a des bénéficiaires
   */
  async hasBeneficiaires(departementId) {
    try {
      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      const query = 'SELECT COUNT(*) as count FROM beneficiaire WHERE departement_id = :id';
      const results = await sequelize.query(query, {
        replacements: { id: departementId },
        type: sequelize.QueryTypes.SELECT
      });

      return results[0].count > 0;
    } catch (error) {
      console.error('[DepartementService.hasBeneficiaires] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer la hiérarchie des départements
   */
  async getHierarchy() {
    try {
      return await departementModel.getDepartementHierarchy();
    } catch (error) {
      console.error('[DepartementService.getHierarchy] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des départements
   */
  async getStats() {
    try {
      const result = await this.getAll();
      const departements = result.data;

      const stats = {
        total: departements.length,
        actives: departements.filter(d => d.etat === 1).length,
        inactives: departements.filter(d => d.etat === 0).length,
        avec_manager: departements.filter(d => d.manager).length,
        avec_compte: departements.filter(d => d.compte).length,
        racines: departements.filter(d => !d.parent).length,
        feuilles: departements.filter(d => d.children_count === 0).length
      };

      return stats;
    } catch (error) {
      console.error('[DepartementService.getStats] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new DepartementService();













