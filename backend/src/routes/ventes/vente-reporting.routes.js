const express = require('express');
const router = express.Router();
const venteReportingController = require('../../controllers/ventes/vente-reporting.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes de reporting vente
router.get('/grand-livre', venteReportingController.getGrandLivre);
router.get('/factures-client', venteReportingController.getFacturesByClient);
router.get('/ca-articles', venteReportingController.getChiffreAffairesArticles);
router.get('/ca-clients', venteReportingController.getChiffreAffairesClients);

module.exports = router;









