const express = require('express');
const router = express.Router();
const facturationPdfService = require('../services/facturation-pdf.service');
const { getFactureReportById } = require('../models/ventes/facturation.model');
const documentSocieteService = require('../services/document_societe.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const path = require('path');

/**
 * Routes pour la génération de PDF des FACTURES
 * Utilise la vue v_facture_report
 */

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Générer un PDF de facture
router.post('/generate', async (req, res) => {
  try {
    const { facture_id, withStamp } = req.body;
    
    if (!facture_id) {
      return res.status(400).json({ success: false, message: 'facture_id est requis' });
    }

    // Récupérer les données de la facture depuis v_facture_report
    const factureData = await getFactureReportById(facture_id);

    if (!factureData || (Array.isArray(factureData) && factureData.length === 0)) {
      console.error('[facturation-pdf/generate] ❌ Aucune donnée trouvée pour facture_id:', facture_id);
      return res.status(404).json({ 
        success: false, 
        message: 'Facture introuvable ou aucune ligne de détail trouvée',
        facture_id: facture_id
      });
    }

    // Récupérer les informations du document_societe si disponibles
    let documentSociete = null;
    try {
      // Récupérer la société actuelle (vous devrez peut-être adapter cela selon votre logique)
      const societeId = req.user?.societe_id || 1; // Par défaut 1, à adapter selon votre logique
      documentSociete = await documentSocieteService.getDocumentSociete(societeId);
    } catch (error) {
      console.warn('Impossible de récupérer documentSociete:', error.message);
    }

    const pdfPath = await facturationPdfService.genererPDF(factureData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete,
      sequelize: req.sequelize
    });
    
    const pdfUrl = `http://localhost:3500/factures/${path.basename(pdfPath)}`;

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF facture :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF facture',
      error: error.message
    });
  }
});

module.exports = router;

