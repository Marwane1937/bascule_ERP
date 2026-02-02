const express = require('express');
const router = express.Router();
const reglementController = require('../../controllers/finance/reglement.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD règlements
router.get('/', reglementController.getReglements);
router.get('/modes', reglementController.getModeReglements);
router.get('/next-numero', reglementController.getNextReglementNumero);
router.get('/factures/:part_id', reglementController.getFacturesForLettrage);
router.post('/:regle_id/lettrage', reglementController.saveLettrageFactures);
router.get('/:id/pdf', reglementController.genererPDF);
router.get('/:id', reglementController.getReglementById);
router.post('/', reglementController.addReglement);
router.put('/:id', reglementController.updateReglement);
router.delete('/:id', reglementController.deleteReglement);

// Routes pour le dashboard
router.get('/stats/dashboard', reglementController.getReglementStats);
router.get('/stats/by-mode', reglementController.getReglementByMode);
router.get('/stats/evolution', reglementController.getReglementEvolution);
router.get('/stats/top-clients', reglementController.getTopClients);
router.get('/alerts', reglementController.getReglementAlerts);
router.get('/recent', reglementController.getRecentReglements);

module.exports = router;

