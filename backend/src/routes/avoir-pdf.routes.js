const express = require('express');
const router = express.Router();
const avoirPdfService = require('../services/avoir-pdf.service');
const { getAvoirReportById } = require('../models/ventes/avoir.model');
const documentSocieteService = require('../services/document_societe.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const path = require('path');

/**
 * Routes pour la génération de PDF des AVOIRS
 */

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Générer un PDF d'avoir
router.post('/generate', async (req, res) => {
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

        // Récupérer les informations du document_societe si disponibles
        let documentSociete = null;
        try {
            const societeId = req.user?.societe_id || 1;
            documentSociete = await documentSocieteService.getDocumentSociete(societeId);
        } catch (error) {
            console.warn('Impossible de récupérer documentSociete:', error.message);
        }

        const pdfPath = await avoirPdfService.genererPDF(avoirData, {
            withStamp: !!withStamp,
            documentSociete: documentSociete
        });

        const pdfUrl = `http://localhost:3500/avoirs/${path.basename(pdfPath)}`;

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

module.exports = router;
