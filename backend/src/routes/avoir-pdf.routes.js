const express = require('express');
const router = express.Router();
const avoirPdfService = require('../services/avoir-pdf.service');
const { getAvoirReportById } = require('../models/ventes/avoir.model');
const pdfConfigService = require('../services/pdf-config.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../middleware/pdf-permissions.middleware');
const path = require('path');

/**
 * Routes pour la génération de PDF des AVOIRS
 */

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Générer un PDF d'avoir
router.post('/generate', checkPdfPermission('avoir'), async (req, res) => {
    try {
        const { document_id, withStamp } = req.body;

        if (!document_id) {
            return res.status(400).json({ success: false, message: 'document_id est requis' });
        }

        // Récupérer les données de l'avoir
        const avoirData = await getAvoirReportById(document_id, req.sequelize);

        if (!avoirData || (Array.isArray(avoirData) && avoirData.length === 0)) {
            console.error('[avoir-pdf/generate] ❌ Aucune donnée trouvée pour document_id:', document_id);
            return res.status(404).json({
                success: false,
                message: 'Avoir introuvable ou aucune ligne de détail trouvée',
                document_id: document_id
            });
        }

        // Récupérer les informations depuis le fichier JSON de configuration
        const documentSociete = pdfConfigService.getDocumentSociete();

        const pdfPath = await avoirPdfService.genererPDF(avoirData, {
            withStamp: !!withStamp,
            documentSociete: documentSociete
        });

        // Lire le PDF en mémoire et le supprimer immédiatement
        const pdfBuffer = require('fs').readFileSync(pdfPath);
        require('fs').unlinkSync(pdfPath);

        const fileName = path.basename(pdfPath);
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost';
        const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
        const pdfUrl = `${baseUrl}/api/avoir-pdf/${fileName}`;

        if (!global.pdfCache) {
          global.pdfCache = new Map();
        }
        global.pdfCache.set(`avoirs/${fileName}`, {
          buffer: pdfBuffer,
          timestamp: Date.now()
        });
        setTimeout(() => {
          if (global.pdfCache) {
            global.pdfCache.delete(`avoirs/${fileName}`);
          }
        }, 5 * 60 * 1000);

        return res.json({ success: true, pdfUrl });
    } catch (error) {
        console.error('Erreur génération PDF avoir :', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur génération PDF avoir',
            error: error.message
        });
    }
});

// Route GET pour servir les PDFs depuis le cache mémoire
router.get('/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const fs = require('fs');
    
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }
    
    const cacheKey = `avoirs/${filename}`;
    
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        return res.send(cached.buffer);
      } else {
        global.pdfCache.delete(cacheKey);
      }
    }
    
    const publicPath = path.join(__dirname, '..', 'public', 'avoirs', filename);
    if (fs.existsSync(publicPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.sendFile(publicPath);
    }
    
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('Erreur service PDF avoir :', error);
    return res.status(500).json({ success: false, message: 'Erreur service PDF', error: error.message });
  }
});

module.exports = router;
