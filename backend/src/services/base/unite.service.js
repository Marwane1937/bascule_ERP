const uniteModel = require('../../models/base/unite.model');

class UniteService {
  /**
   * Récupérer toutes les unités
   */
  async getAll(options = {}) {
    try {
      return await uniteModel.getAllUnites(options);
    } catch (error) {
      console.error('[UniteService.getAll] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer une unité par ID
   */
  async getById(id) {
    try {
      const uniteId = parseInt(id, 10);
      if (isNaN(uniteId)) {
        throw new Error('ID d\'unité invalide');
      }

      const unite = await uniteModel.getUniteById(uniteId);
      if (!unite) {
        throw new Error('Unité non trouvée');
      }

      return unite;
    } catch (error) {
      console.error('[UniteService.getById] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle unité
   */
  async create(data) {
    try {
      // Validation des données
      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà
      const existingUnite = await this.checkCodeExists(data.code);
      if (existingUnite) {
        throw new Error('Une unité avec ce code existe déjà');
      }

      return await uniteModel.createUnite(data);
    } catch (error) {
      console.error('[UniteService.create] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une unité
   */
  async update(id, data) {
    try {
      const uniteId = parseInt(id, 10);
      if (isNaN(uniteId)) {
        throw new Error('ID d\'unité invalide');
      }

      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà pour une autre unité
      const existingUnite = await this.checkCodeExists(data.code, uniteId);
      if (existingUnite) {
        throw new Error('Une unité avec ce code existe déjà');
      }

      return await uniteModel.updateUnite(uniteId, data);
    } catch (error) {
      console.error('[UniteService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer une unité
   */
  async delete(id) {
    try {
      const uniteId = parseInt(id, 10);
      if (isNaN(uniteId)) {
        throw new Error('ID d\'unité invalide');
      }

      // TODO: Vérifier les dépendances avant suppression
      // (par exemple, si l'unité est utilisée dans des articles)

      return await uniteModel.deleteUnite(uniteId);
    } catch (error) {
      console.error('[UniteService.delete] Erreur:', error);
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

      let query = 'SELECT id FROM unite WHERE code = :code';
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
      console.error('[UniteService.checkCodeExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les unités par type
   */
  async getByType(type) {
    try {
      if (!type) {
        throw new Error('Type requis');
      }

      return await uniteModel.getUnitesByType(type);
    } catch (error) {
      console.error('[UniteService.getByType] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les unités de base
   */
  async getUnitesBase() {
    try {
      return await uniteModel.getUnitesBase();
    } catch (error) {
      console.error('[UniteService.getUnitesBase] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des unités
   */
  async getStats() {
    try {
      const result = await this.getAll();
      const unites = result.data;

      const stats = {
        total: unites.length,
        actives: unites.filter(u => u.etat === 1).length,
        inactives: unites.filter(u => u.etat === 0).length,
        de_base: unites.filter(u => u.base === 1).length,
        de_facturation: unites.filter(u => u.fact === 1).length,
        par_type: {}
      };

      // Compter par type
      unites.forEach(unite => {
        const type = unite.type || 'Non défini';
        stats.par_type[type] = (stats.par_type[type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('[UniteService.getStats] Erreur:', error);
      throw error;
    }
  }

  /**
   * Convertir une quantité d'une unité à une autre
   * (Fonction utilitaire pour les conversions futures)
   */
  async convertQuantity(quantity, fromUnitId, toUnitId) {
    try {
      // Pour l'instant, retourner la quantité telle quelle
      // TODO: Implémenter la logique de conversion selon les règles métier
      console.log(`Conversion: ${quantity} de ${fromUnitId} vers ${toUnitId}`);

      // Vérifier que les unités existent
      const fromUnit = await this.getById(fromUnitId);
      const toUnit = await this.getById(toUnitId);

      if (!fromUnit || !toUnit) {
        throw new Error('Unité(s) non trouvée(s)');
      }

      // Pour l'instant, pas de conversion réelle
      // Retourner la quantité originale
      return {
        original_quantity: quantity,
        converted_quantity: quantity,
        from_unit: fromUnit.nom,
        to_unit: toUnit.nom,
        conversion_rate: 1
      };
    } catch (error) {
      console.error('[UniteService.convertQuantity] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new UniteService();









