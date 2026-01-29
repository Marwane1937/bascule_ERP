const banqueModel = require('../../models/base/banque.model');

class BanqueService {
  /**
   * Récupérer toutes les banques
   */
  async getAll(options = {}) {
    try {
      return await banqueModel.getAllBanques(options);
    } catch (error) {
      console.error('[BanqueService.getAll] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer une banque par ID
   */
  async getById(id) {
    try {
      const banqueId = parseInt(id, 10);
      if (isNaN(banqueId)) {
        throw new Error('ID de banque invalide');
      }

      const banque = await banqueModel.getBanqueById(banqueId);
      if (!banque) {
        throw new Error('Banque non trouvée');
      }

      return banque;
    } catch (error) {
      console.error('[BanqueService.getById] Erreur:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle banque
   */
  async create(data) {
    try {
      // Validation des données
      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà
      const existingBanque = await this.checkCodeExists(data.code);
      if (existingBanque) {
        throw new Error('Une banque avec ce code existe déjà');
      }

      // Validation du SWIFT si fourni
      if (data.swift && !this.isValidSwift(data.swift)) {
        throw new Error('Format SWIFT invalide');
      }

      return await banqueModel.createBanque(data);
    } catch (error) {
      console.error('[BanqueService.create] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une banque
   */
  async update(id, data) {
    try {
      const banqueId = parseInt(id, 10);
      if (isNaN(banqueId)) {
        throw new Error('ID de banque invalide');
      }

      if (!data.code || !data.nom) {
        throw new Error('Code et nom sont requis');
      }

      // Vérifier si le code existe déjà pour une autre banque
      const existingBanque = await this.checkCodeExists(data.code, banqueId);
      if (existingBanque) {
        throw new Error('Une banque avec ce code existe déjà');
      }

      // Validation du SWIFT si fourni
      if (data.swift && !this.isValidSwift(data.swift)) {
        throw new Error('Format SWIFT invalide');
      }

      return await banqueModel.updateBanque(banqueId, data);
    } catch (error) {
      console.error('[BanqueService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Supprimer une banque
   */
  async delete(id) {
    try {
      const banqueId = parseInt(id, 10);
      if (isNaN(banqueId)) {
        throw new Error('ID de banque invalide');
      }

      // TODO: Vérifier les dépendances avant suppression
      // (par exemple, si la banque est utilisée dans des comptes bancaires)

      return await banqueModel.deleteBanque(banqueId);
    } catch (error) {
      console.error('[BanqueService.delete] Erreur:', error);
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

      let query = 'SELECT id FROM banque WHERE code = :code';
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
      console.error('[BanqueService.checkCodeExists] Erreur:', error);
      throw error;
    }
  }

  /**
   * Valider un code SWIFT
   */
  isValidSwift(swift) {
    // Format SWIFT: 8 ou 11 caractères (4 lettres + 2 chiffres + 2 lettres optionnels + 3 caractères optionnels)
    const swiftRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
    return swiftRegex.test(swift.toUpperCase());
  }

  /**
   * Récupérer les statistiques des banques
   */
  async getStats() {
    try {
      const result = await this.getAll();
      const banques = result.data;

      const stats = {
        total: banques.length,
        actives: banques.filter(b => b.etat === 1).length,
        inactives: banques.filter(b => b.etat === 0).length,
        avec_swift: banques.filter(b => b.swift).length,
        par_type: {}
      };

      // Compter par type
      banques.forEach(banque => {
        const type = banque.type || 'Non défini';
        stats.par_type[type] = (stats.par_type[type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('[BanqueService.getStats] Erreur:', error);
      throw error;
    }
  }

  /**
   * Rechercher une banque par SWIFT
   */
  async getBySwift(swift) {
    try {
      if (!swift || !this.isValidSwift(swift)) {
        throw new Error('Code SWIFT invalide');
      }

      const { getConnection } = require('../../config/database');
      const sequelize = getConnection();

      const query = `
        SELECT id, code, nom, nom_court, swift, type, etat
        FROM banque
        WHERE swift = :swift AND etat = 1
      `;

      const results = await sequelize.query(query, {
        replacements: { swift: swift.toUpperCase() },
        type: sequelize.QueryTypes.SELECT
      });

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('[BanqueService.getBySwift] Erreur:', error);
      throw error;
    }
  }
}

module.exports = new BanqueService();















