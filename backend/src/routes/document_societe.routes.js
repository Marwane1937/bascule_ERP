const express = require('express');
const router = express.Router();
const documentSocieteController = require('../controllers/document_societe.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Routes pour les documents de société
router.get('/', documentSocieteController.getDocumentSociete.bind(documentSocieteController));
router.post('/', documentSocieteController.saveDocumentSociete.bind(documentSocieteController));
router.delete('/', documentSocieteController.deleteDocumentSociete.bind(documentSocieteController));

// Routes pour récupérer des éléments spécifiques
router.get('/logo', documentSocieteController.getLogo.bind(documentSocieteController));
router.get('/entete', documentSocieteController.getEntete.bind(documentSocieteController));
router.get('/pied-page', documentSocieteController.getPiedPage.bind(documentSocieteController));

module.exports = router;
