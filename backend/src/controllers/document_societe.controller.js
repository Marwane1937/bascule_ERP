const documentSocieteService = require('../services/document_societe.service');

class DocumentSocieteController {
  // Récupérer les documents de la société de l'utilisateur connecté
  async getDocumentSociete(req, res) {
    try {
      const societeId = req.user.societe_id;
      const documentSociete = await documentSocieteService.getDocumentSociete(societeId);

      res.json({
        success: true,
        data: documentSociete
      });
    } catch (error) {
      console.error('Erreur récupération documents société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Sauvegarder les documents de la société
  async saveDocumentSociete(req, res) {
    try {
      const societeId = req.user.societe_id;
      const { logo, entete, pied_page } = req.body;

      const documentSociete = await documentSocieteService.saveDocumentSociete(societeId, {
        logo,
        entete,
        pied_page
      });

      res.json({
        success: true,
        message: 'Documents sauvegardés avec succès',
        data: documentSociete
      });
    } catch (error) {
      console.error('Erreur sauvegarde documents société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Supprimer les documents de la société
  async deleteDocumentSociete(req, res) {
    try {
      const societeId = req.user.societe_id;
      const deleted = await documentSocieteService.deleteDocumentSociete(societeId);

      if (deleted) {
        res.json({
          success: true,
          message: 'Documents supprimés avec succès'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Aucun document trouvé pour cette société'
        });
      }
    } catch (error) {
      console.error('Erreur suppression documents société:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer uniquement le logo
  async getLogo(req, res) {
    try {
      const societeId = req.user.societe_id;
      const logo = await documentSocieteService.getLogo(societeId);

      if (logo) {
        res.set('Content-Type', 'image/png');
        res.send(logo);
      } else {
        res.status(404).json({
          success: false,
          message: 'Logo non trouvé'
        });
      }
    } catch (error) {
      console.error('Erreur récupération logo:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer uniquement l'en-tête
  async getEntete(req, res) {
    try {
      const societeId = req.user.societe_id;
      const entete = await documentSocieteService.getEntete(societeId);

      res.json({
        success: true,
        data: { entete }
      });
    } catch (error) {
      console.error('Erreur récupération en-tête:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer uniquement le pied de page
  async getPiedPage(req, res) {
    try {
      const societeId = req.user.societe_id;
      const pied_page = await documentSocieteService.getPiedPage(societeId);

      res.json({
        success: true,
        data: { pied_page }
      });
    } catch (error) {
      console.error('Erreur récupération pied de page:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new DocumentSocieteController();
