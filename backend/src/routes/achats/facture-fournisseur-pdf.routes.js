const express = require('express');
const router = express.Router();
const factureFournisseurPdfService = require('../../services/achats/facture-fournisseur-pdf.service');
const { getFactureFournisseurReportById } = require('../../models/achats/facture-fournisseur.model');
const documentSocieteService = require('../../services/document_societe.service');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');
const path = require('path');

/**
 * Routes pour la génération de PDF des FACTURES FOURNISSEUR
 */

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Générer un PDF de facture fournisseur
router.get('/:facture_id', async (req, res) => {
  try {
    const facture_id = parseInt(req.params.facture_id, 10);
    
    if (!facture_id || isNaN(facture_id)) {
      return res.status(400).json({ success: false, message: 'facture_id est requis et doit être un nombre' });
    }

    // Récupérer les données de la facture fournisseur
    const factureData = await getFactureFournisseurReportById(facture_id, req.sequelize);

    if (!factureData || (Array.isArray(factureData) && factureData.length === 0)) {
      console.error('[facture-fournisseur-pdf] ❌ Aucune donnée trouvée pour facture_id:', facture_id);
      return res.status(404).json({ 
        success: false, 
        message: 'Facture fournisseur introuvable ou aucune ligne de détail trouvée',
        facture_id: facture_id
      });
    }

    // Récupérer les informations du document_societe si disponibles
    let documentSociete = null;
    try {
      const societeId = req.user?.societe_id || 1;
      documentSociete = await documentSocieteService.getDocumentSociete(societeId);
    } catch (error) {
      console.warn('Impossible de récupérer documentSociete:', error.message);
    }

    const pdfPath = await factureFournisseurPdfService.genererPDF(factureData, {
      withStamp: false,
      documentSociete: documentSociete,
      sequelize: req.sequelize
    });
    
    // Envoyer le fichier PDF
    res.download(pdfPath, (err) => {
      if (err) {
        console.error('Erreur lors de l\'envoi du PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'envoi du PDF',
            error: err.message
          });
        }
      }
    });
  } catch (error) {
    console.error('Erreur génération PDF facture fournisseur :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF facture fournisseur',
      error: error.message
    });
  }
});

module.exports = router;









