const compteurModel = require('../../models/base/compteur.model');

class CompteurService {
  /**
   * Récupérer tous les compteurs avec pagination
   */
  async getAll(options = {}) {
    try {
      return await compteurModel.getAll(options);
    } catch (error) {
      console.error('[CompteurService.getAll] Erreur:', error);
      throw new Error('Erreur lors de la récupération des compteurs');
    }
  }

  /**
   * Récupérer un compteur par code
   */
  async getByCode(code) {
    try {
      const compteur = await compteurModel.getByCode(code);
      if (!compteur) {
        throw new Error('Compteur non trouvé');
      }
      return compteur;
    } catch (error) {
      console.error('[CompteurService.getByCode] Erreur:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un compteur
   */
  async update(code, updateData) {
    try {
      // Validation des données
      if (!updateData.nom || updateData.nom.trim() === '') {
        throw new Error('Le nom est requis');
      }

      if (updateData.compteur === undefined || updateData.compteur === null) {
        throw new Error('La valeur du compteur est requise');
      }

      if (isNaN(updateData.compteur) || updateData.compteur < 0) {
        throw new Error('La valeur du compteur doit être un nombre positif');
      }

      const result = await compteurModel.update(code, updateData);
      return {
        ...result,
        message: 'Compteur modifié avec succès'
      };
    } catch (error) {
      console.error('[CompteurService.update] Erreur:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques des compteurs
   */
  async getStats() {
    try {
      return await compteurModel.getStats();
    } catch (error) {
      console.error('[CompteurService.getStats] Erreur:', error);
      throw new Error('Erreur lors de la récupération des statistiques');
    }
  }
}

module.exports = new CompteurService();









