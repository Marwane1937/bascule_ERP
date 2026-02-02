const express = require('express');
const router = express.Router();
const entreeStockController = require('../../controllers/stock/entree-stock.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');
const path = require('path');
const fs = require('fs');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Créer un router séparé pour les routes publiques (sans authentification)
const publicRouter = express.Router();

// Servir un PDF d'entrée de stock directement via GET (route publique)
publicRouter.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const entreesStockDir = path.join(__dirname, '..', '..', 'public', 'entrees-stock');
    const pdfPath = path.join(entreesStockDir, filename);

    // Vérifier si le fichier existe
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ success: false, message: 'PDF introuvable' });
    }

    // Servir le fichier PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Erreur lors de la récupération du PDF entrée de stock :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur récupération PDF entrée de stock',
      error: error.message
    });
  }
});

// Toutes les autres routes nécessitent une authentification
router.use(authenticateToken);

// Routes pour CRUD entrée de stock
router.get('/entrees-stock', entreeStockController.getEntreesStock);
router.get('/next-entree-stock-numero', entreeStockController.getNextEntreeStockNumero);
router.get('/entree-stock/:id', entreeStockController.getEntreeStock);
router.post('/entree-stock', entreeStockController.createEntreeStock);
router.put('/entree-stock/:id', entreeStockController.updateEntreeStock);
router.post('/entree-stock/save', entreeStockController.saveDetail);
router.post('/entree-stock/info', entreeStockController.saveInfo);
router.post('/entree-stock/delete-lignes', entreeStockController.deleteLignesParIds);

// Générer un PDF d'entrée de stock
router.post('/entree-stock/generate-pdf', authenticateToken, async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    const sequelize = req.sequelize || require('../config/database').getConnection();

    const entreeStockData = await entreeStockController.getEntreeStockDataForPdf(document_id, sequelize);

    if (!entreeStockData || entreeStockData.length === 0) {
      return res.status(404).json({ success: false, message: 'Entrée de stock introuvable' });
    }

    // Récupérer les informations du document_societe si disponibles
    const documentSociete = req.body.documentSociete || null;

    const entreeStockPdfService = require('../../services/stock/entree-stock-pdf.service');
    const pdfPath = await entreeStockPdfService.genererPDF(entreeStockData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete
    });

    const path = require('path');
    const fs = require('fs');
    
    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/stock/entree-stock/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`entrees-stock/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`entrees-stock/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF entrée de stock :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF entrée de stock',
      error: error.message
    });
  }
});

// Exporter les deux routers : router (protégé) et publicRouter (public)
module.exports = {
  router, // Routes avec authentification (/api/stock/*)
  publicRouter // Routes publiques (/entrees-stock/*)
};

