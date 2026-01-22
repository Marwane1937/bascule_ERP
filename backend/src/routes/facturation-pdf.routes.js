const express = require('express');
const router = express.Router();
const facturationPdfService = require('../services/facturation-pdf.service');
const { getFactureReportById, getFactureContratById } = require('../models/ventes/facturation.model');
const pdfConfigService = require('../services/pdf-config.service');
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

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    const pdfPath = await facturationPdfService.genererPDF(factureData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete,
      sequelize: req.sequelize
    });
    
    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/facturation-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`factures/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`factures/${fileName}`);
      }
    }, 5 * 60 * 1000);

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

// Générer un PDF de facture contrat
router.post('/generate-contrat', async (req, res) => {
  try {
    const { facture_id, withStamp } = req.body;
    
    if (!facture_id) {
      return res.status(400).json({ success: false, message: 'facture_id est requis' });
    }

    // Récupérer les données de la facture depuis v_facture_contrat
    const factureData = await getFactureContratById(facture_id, req.sequelize);

    if (!factureData || (Array.isArray(factureData) && factureData.length === 0)) {
      console.error('[facturation-pdf/generate-contrat] ❌ Aucune donnée trouvée pour facture_id:', facture_id);
      return res.status(404).json({ 
        success: false, 
        message: 'Facture contrat introuvable ou aucune ligne de détail trouvée',
        facture_id: facture_id
      });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    const pdfPath = await facturationPdfService.genererPDFContrat(factureData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete,
      sequelize: req.sequelize
    });
    
    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/facturation-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`factures/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`factures/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF facture contrat :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF facture contrat',
      error: error.message
    });
  }
});

module.exports = router;

