const villeModel = require('../../models/base/ville.model');

class VilleService {
  /**
   * Récupérer toutes les villes
   */
  async getAll(options = {}) {
    try {
      return await villeModel.getAllVilles(options);
    } catch (error) {
      console.error('[VilleService.getAll] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer une ville par ID
   */
  async getById(id) {
    try {
      const villeId = parseInt(id, 10);
      if (isNaN(villeId)) {
        throw new Error('ID de ville invalide');
      }

      const ville = await villeModel.getVilleById(villeId);
      if (!ville) {
        throw new Error('Ville non trouvée');
      }

      return ville;
    } catch (error) {
      console.error('[VilleService.getById] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle ville
   */
  async create(data) {
    try {
      // Validation des données
      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà
      const existingVille = await this.checkCodeExists(data.code);
      if (existingVille) {
        throw new Error('Une ville avec ce code existe déjà');
      }

      return await villeModel.createVille(data);
    } catch (error) {
      console.error('[VilleService.create] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une ville
   */
  async update(id, data) {
    try {
      const villeId = parseInt(id, 10);
      if (isNaN(villeId)) {
        throw new Error('ID de ville invalide');
      }

      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà pour une autre ville
      const existingVille = await this.checkCodeExists(data.code, villeId);
      if (existingVille) {
        throw new Error('Une ville avec ce code existe déjà');
      }

      return await villeModel.updateVille(villeId, data);
    } catch (error) {
      console.error('[VilleService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer une ville
   */
  async delete(id) {
    try {
      const villeId = parseInt(id, 10);
      if (isNaN(villeId)) {
        throw new Error('ID de ville invalide');
      }

      // TODO: Vérifier les dépendances avant suppression
      // (par exemple, si la ville est utilisée dans d'autres tables)

      return await villeModel.deleteVille(villeId);
    } catch (error) {
      console.error('[VilleService.delete] Erreur:', error);
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

      let query = 'SELECT id FROM ville WHERE code = :code';
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
      console.error('[VilleService.checkCodeExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des villes
   */
  async getStats() {
    try {
      const result = await this.getAll();
      const villes = result.data;

      const stats = {
        total: villes.length,
        actives: villes.filter(v => v.etat === 1).length,
        inactives: villes.filter(v => v.etat === 0).length,
        avec_coordonnees: villes.filter(v => v.longitude && v.latitude).length
      };

      return stats;
    } catch (error) {
      console.error('[VilleService.getStats] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new VilleService();














