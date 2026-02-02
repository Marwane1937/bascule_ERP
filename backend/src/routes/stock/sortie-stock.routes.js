const express = require('express');
const router = express.Router();
const sortieStockController = require('../../controllers/stock/sortie-stock.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Créer un router séparé pour les routes publiques (sans authentification)
const publicRouter = express.Router();

// Servir un PDF de sortie de stock directement via GET (route publique)
publicRouter.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const path = require('path');
    const fs = require('fs');

    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const sortiesStockDir = path.join(__dirname, '..', '..', 'public', 'sorties-stock');
    const pdfPath = path.join(sortiesStockDir, filename);

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
    console.error('Erreur lors de la récupération du PDF sortie de stock :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur récupération PDF sortie de stock',
      error: error.message
    });
  }
});

// Toutes les autres routes nécessitent une authentification
router.use(authenticateToken);

// Routes pour CRUD sortie de stock
router.get('/sorties-stock', sortieStockController.getSortiesStock);
router.get('/next-sortie-stock-numero', sortieStockController.getNextSortieStockNumero);
router.get('/sortie-stock/:id', sortieStockController.getSortieStock);
router.post('/sortie-stock', sortieStockController.createSortieStock);
router.put('/sortie-stock/:id', sortieStockController.updateSortieStock);
router.post('/sortie-stock/save', sortieStockController.saveDetail);
router.post('/sortie-stock/info', sortieStockController.saveInfo);
router.post('/sortie-stock/delete-lignes', sortieStockController.deleteLignesParIds);

// Générer un PDF de sortie de stock
router.post('/sortie-stock/generate-pdf', authenticateToken, async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    const sequelize = req.sequelize || require('../../config/database').getConnection();

    const sortieStockData = await sortieStockController.getSortieStockDataForPdf(document_id, sequelize);

    if (!sortieStockData || sortieStockData.length === 0) {
      return res.status(404).json({ success: false, message: 'Sortie de stock introuvable' });
    }

    // Récupérer les informations du document_societe si disponibles
    const documentSociete = req.body.documentSociete || null;

    const sortieStockPdfService = require('../../services/stock/sortie-stock-pdf.service');
    const pdfPath = await sortieStockPdfService.genererPDF(sortieStockData, {
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
    const pdfUrl = `${baseUrl}/api/stock/sortie-stock/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`sorties-stock/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`sorties-stock/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF sortie de stock :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF sortie de stock',
      error: error.message
    });
  }
});

// Exporter les deux routers : router (protégé) et publicRouter (public)
module.exports = {
  router, // Routes avec authentification (/api/stock/*)
  publicRouter // Routes publiques (/sorties-stock/*)
};

